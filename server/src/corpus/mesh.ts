// Query (DDD-004): a Question over the LongitudinalRecord -> a ReadingSession.
// Mirrors the engine seam again. The mock routes the flagship medications-and-
// timeline Question (S2) to the worked CORPUS_DEMO_SESSION and otherwise assembles
// a generic CitedAnswer from the record; the live mesh convenes the five bounded
// SPECIALISTS through the injected engine seam. In both, every emitted sentence
// carries at least one EvidenceSpan drawn from the record — the engine narrates,
// the record cites (DDD-004 invariant 3), so a sentence that cannot be evidenced
// is dropped rather than asserted.
import type {
  LongitudinalRecord, ReadingSession, Claim, ClaimCategory,
  CitedSentence, CitedAnswer, SpecialistFinding, SpecialistId,
} from '../../../app/src/domain/types.ts';
import { SPECIALISTS } from '../../../app/src/domain/types.ts';
import { CORPUS_DEMO_SESSION } from '../../../app/src/data/corpus.ts';
import type { ReadingMesh, CorpusStore } from './contract';
import { getEngine, type EngineClient } from '../engine/client';

// ── Shared, deterministic helpers ────────────────────────────────────────────

/** FNV-1a: a stable string hash, used only to seed a deterministic session id
 *  (no clock, no randomness — the same Question yields the same id). */
function seedFrom(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Which Specialist owns a claim's category. Allergy and procedure fold into
 *  diagnoses; encounters into chronology; correspondence carries no claim class. */
const CATEGORY_TO_SPECIALIST: Record<ClaimCategory, SpecialistId> = {
  medication: 'medications',
  lab: 'labs',
  diagnosis: 'diagnoses',
  allergy: 'diagnoses',
  procedure: 'diagnoses',
  encounter: 'chronology',
};

const STOPWORDS = new Set([
  'what', 'which', 'when', 'where', 'since', 'this', 'that', 'patient', 'does',
  'has', 'have', 'been', 'and', 'the', 'are', 'was', 'were', 'for', 'with',
  'from', 'they', 'their', 'about', 'recorded', 'currently', 'still', 'now',
]);

/** A medications-and-timeline Question — the flagship S2 the demo is built around. */
function wantsMedications(question: string): boolean {
  return /\b(medication|medicine|drug|drugs|taking|take|dose|doses|dosage)\b/i.test(question);
}

/** Significant query tokens: alphanumeric, length >= 3, not a stopword. */
function tokensOf(question: string): string[] {
  return (question.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Claims the Question bears on: current (not superseded) claims whose evidence
 *  document a lexical search surfaced, or whose label mentions a query token. */
function relevantClaims(question: string, record: LongitudinalRecord, store: CorpusStore): Claim[] {
  const tokens = tokensOf(question);
  const docHits = new Set<string>();
  for (const t of tokens) for (const h of store.search(t)) docHits.add(h.docId);
  return record.claims.filter(
    (c) =>
      c.standing !== 'superseded' &&
      (docHits.has(c.evidence.docId) || tokens.some((t) => c.label.toLowerCase().includes(t))),
  );
}

/** Surface each relevant record Contradiction, citing the conflicting claims'
 *  spans. Never merged, always flagged. `isRelevant` scopes which conflicts to
 *  raise (those touching the chosen claims for a generic answer; all of them for
 *  the full mesh). A conflict whose claims are absent from the record cannot be
 *  cited and is skipped. */
function contradictionSentences(
  record: LongitudinalRecord,
  isRelevant: (claimIds: readonly string[]) => boolean,
): CitedSentence[] {
  const out: CitedSentence[] = [];
  for (const ct of record.contradictions) {
    if (!isRelevant(ct.claimIds)) continue;
    const evidence = record.claims.filter((c) => ct.claimIds.includes(c.id)).map((c) => c.evidence);
    if (!evidence.length) continue; // a dangling contradiction cannot be cited, so skip it
    out.push({ text: ct.note, evidence, contradictionId: ct.id });
  }
  return out;
}

/** Findings grouped by Specialist over a set of claims. */
function findingsFor(claims: Claim[]): SpecialistFinding[] {
  const bySpec = new Map<SpecialistId, Claim[]>();
  for (const c of claims) {
    const s = CATEGORY_TO_SPECIALIST[c.category];
    let arr = bySpec.get(s);
    if (!arr) {
      arr = [];
      bySpec.set(s, arr);
    }
    arr.push(c);
  }
  return [...bySpec.entries()].map(([specialist, cs]) => ({
    specialist,
    summary: `${cs.length} relevant ${specialist} claim(s) in the record.`,
    claimIds: cs.map((c) => c.id),
    evidence: cs.map((c) => c.evidence),
  }));
}

/** Assemble a generic CitedAnswer + findings from the record for a non-flagship
 *  Question. One cited sentence per relevant claim, any touching Contradiction
 *  surfaced, and a gap when nothing in the record answers. */
function buildGenericSession(
  question: string,
  askedBy: string,
  record: LongitudinalRecord,
  store: CorpusStore,
): ReadingSession {
  const chosen = relevantClaims(question, record, store);
  const chosenIds = new Set(chosen.map((c) => c.id));

  const sentences: CitedSentence[] = [];
  for (const c of chosen) {
    if (!c.evidence.quote) continue; // no citable span -> not asserted
    sentences.push({ text: `${c.label}.`, evidence: [c.evidence] });
  }
  sentences.push(...contradictionSentences(record, (ids) => ids.some((id) => chosenIds.has(id))));

  const gaps: string[] = [];
  if (!chosen.length) gaps.push('No evidenced claim in the record addresses this question.');

  return {
    id: `rs-${seedFrom(`${question}|${askedBy}`)}`,
    question,
    askedBy,
    askedAt: record.builtAt,
    findings: findingsFor(chosen),
    answer: { sentences, gaps },
  };
}

// ── Mock mesh ────────────────────────────────────────────────────────────────

/** The deterministic reading mesh: the flagship S2 answer for a medications
 *  Question, a record-grounded generic answer otherwise. Offline, no engine. */
export function createMockMesh(): ReadingMesh {
  return {
    async ask(question, askedBy, record, store) {
      if (wantsMedications(question)) return CORPUS_DEMO_SESSION;
      return buildGenericSession(question, askedBy, record, store);
    },
  };
}

// ── Live mesh ────────────────────────────────────────────────────────────────

/** Prompt one Specialist with only the claims in its area (it cites nothing it
 *  cannot see). Pure string build, so the mesh stays deterministic given a
 *  deterministic engine. */
function specialistPrompt(specialist: SpecialistId, question: string, claims: Claim[]): string {
  const lines = claims.map((c) => `- ${c.label} (${c.value}) [${c.evidence.docId}]`).join('\n');
  return [
    `You are the ${specialist} specialist in a bounded reading mesh.`,
    `Question: ${question}`,
    claims.length ? `Relevant claims:\n${lines}` : 'No claims in your area.',
    'Summarise only what the claims support; cite nothing you cannot see.',
  ].join('\n');
}

/** Turn Specialist findings into a CitedAnswer: the engine's text narrates, the
 *  record's spans cite. A Specialist with no claims contributes no sentence (it
 *  has nothing to cite) and becomes a gap; every Contradiction is surfaced. */
function synthesiseAnswer(record: LongitudinalRecord, findings: SpecialistFinding[]): CitedAnswer {
  const sentences: CitedSentence[] = [];
  for (const f of findings) {
    if (!f.evidence.length) continue; // nothing to cite -> drop rather than assert
    sentences.push({ text: f.summary, evidence: f.evidence });
  }
  sentences.push(...contradictionSentences(record, () => true));

  const gaps = SPECIALISTS
    .filter((s) => !findings.some((f) => f.specialist === s && f.evidence.length > 0))
    .map((s) => `No evidenced ${s} claim in the record.`);

  return { sentences, gaps };
}

export interface LiveMeshDeps {
  engine: EngineClient;
}

/** The live reading mesh: convene all five SPECIALISTS through the injected engine
 *  seam, one bounded prompt each, then synthesise a cited answer. Every dependency
 *  is injected so the mesh is driven end-to-end against a fake engine offline. */
export function createLiveMesh(deps: LiveMeshDeps): ReadingMesh {
  return {
    async ask(question, askedBy, record, store) {
      void store; // the live mesh reads the record; the store is offered for parity
      const base = seedFrom(`${question}|${askedBy}`);
      const findings: SpecialistFinding[] = [];
      for (const specialist of SPECIALISTS) {
        const claims = record.claims.filter(
          (c) => CATEGORY_TO_SPECIALIST[c.category] === specialist && c.standing !== 'superseded',
        );
        const res = await deps.engine.submitPrompt({
          sessionId: `corpus-${base}-${specialist}`,
          prompt: specialistPrompt(specialist, question, claims),
        });
        findings.push({
          specialist,
          summary: res.text.trim() || `No ${specialist} findings.`,
          claimIds: claims.map((c) => c.id),
          evidence: claims.map((c) => c.evidence),
        });
      }
      return {
        id: `rs-${base}`,
        question,
        askedBy,
        askedAt: record.builtAt,
        findings,
        answer: synthesiseAnswer(record, findings),
      };
    },
  };
}

// Module singleton chosen by env, mirroring getGrounding()/getEngine().
let mesh: ReadingMesh | undefined;

/** Live only when CORPUS_MESH=live; the engine it convenes is itself env-selected
 *  (and constructed lazily, so this never spawns a process). Mock otherwise. */
export function getMesh(env: NodeJS.ProcessEnv = process.env): ReadingMesh {
  if (!mesh) {
    mesh = env.CORPUS_MESH === 'live'
      ? createLiveMesh({ engine: getEngine(env) })
      : createMockMesh();
  }
  return mesh;
}

/** Replace the singleton (tests inject a mesh; pass undefined to reset). */
export function setMesh(m: ReadingMesh | undefined): void {
  mesh = m;
}
