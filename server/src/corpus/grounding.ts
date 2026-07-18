// Ingestion (DDD-004): SourceDocuments -> the reconciled LongitudinalRecord.
// Mirrors the engine seam — a deterministic mock default (returns the seeded
// CORPUS_RECORD, offline) and a live path assembled from injectable parts: the
// NER sidecar client and a schema-guided `extract` step. The live path runs each
// document through NER + extraction to raw Claims, then RECONCILES them on recency
// and validity: a later claim in the same category and value-family closes and
// supersedes an earlier one when their validity windows do not overlap; two active
// claims that DO overlap with incompatible values are a surfaced Contradiction,
// never silently merged.
import type {
  SourceDocument, Claim, Contradiction, ClaimCategory, FhirMapping,
} from '../../../app/src/domain/types.ts';
import { CORPUS_RECORD } from '../../../app/src/data/corpus.ts';
import type { GroundingService } from './contract';
import { createNerClient, type NerClient, type NerEntity } from './ner-client';

// ── Pure reconciliation (unit-tested directly) ───────────────────────────────

/** First alphanumeric token, lowercased — the subject word of a value/label. */
function headword(s: string): string {
  const m = s.toLowerCase().match(/[a-z0-9]+/);
  return m ? m[0] : s.toLowerCase().trim();
}

/** The subject a claim speaks about, ignoring its specific value: the coded
 *  concept when present, else the head word of the value. Two claims share a
 *  family when they concern the same thing (e.g. both 'amlodipine', both LOINC
 *  potassium) so their values can be compared for supersession or conflict. */
function familyKey(c: Claim): string {
  const fam = c.fhir.code ? `${c.fhir.system ?? ''}:${c.fhir.code}` : headword(c.value || c.label);
  return `${c.category}|${fam}`;
}

function normValue(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function sameValue(a: Claim, b: Claim): boolean {
  return normValue(a.value) === normValue(b.value);
}
function endOf(c: Claim): number {
  return c.validity.to ?? Number.POSITIVE_INFINITY;
}
/** Half-open validity intervals [from, to) overlap. */
function overlaps(a: Claim, b: Claim): boolean {
  return a.validity.from < endOf(b) && b.validity.from < endOf(a);
}

// Only these four claim categories have a Contradiction.kind; conflicts in other
// categories are not surfaced as Contradictions.
const CONTRADICTION_KIND: Partial<Record<ClaimCategory, Contradiction['kind']>> = {
  medication: 'medication',
  diagnosis: 'diagnosis',
  allergy: 'allergy',
  lab: 'lab',
};

export interface Reconciled {
  claims: Claim[];
  contradictions: Contradiction[];
}

/** Reconcile raw claims into a consistent set: order by recency, supersede across
 *  non-overlapping validity within a value-family, and surface overlapping
 *  incompatible actives as Contradictions. Pure: the input claims are never
 *  mutated (each is cloned before its standing/validity is touched). */
export function reconcile(input: Claim[]): Reconciled {
  const claims = input.map((c) => ({ ...c, validity: { ...c.validity } }));
  // Recency ordering; id breaks ties so the result is fully deterministic.
  claims.sort((a, b) => (a.validity.from - b.validity.from) || a.id.localeCompare(b.id));

  // Group the currently-active claims by value-family (refuted/superseded inputs
  // are settled and take no further part).
  const families = new Map<string, Claim[]>();
  for (const c of claims) {
    if (c.standing !== 'active') continue;
    const key = familyKey(c);
    let arr = families.get(key);
    if (!arr) {
      arr = [];
      families.set(key, arr);
    }
    arr.push(c);
  }

  // Supersession: each claim supersedes the latest earlier, non-overlapping,
  // different-value claim in its family. Non-overlap here means the earlier claim's
  // validity already closed before the later one began — extraction, not
  // reconciliation, bounds an interval; a still-open earlier claim would overlap
  // and so become a Contradiction below, never a silent supersession.
  for (const group of families.values()) {
    for (let j = 0; j < group.length; j += 1) {
      const later = group[j];
      let immediate: Claim | undefined;
      for (let i = 0; i < j; i += 1) {
        const earlier = group[i];
        if (sameValue(earlier, later) || overlaps(earlier, later)) continue;
        if (!immediate || earlier.validity.from >= immediate.validity.from) immediate = earlier;
      }
      if (immediate) {
        later.supersedesClaimId = immediate.id;
        immediate.standing = 'superseded';
      }
    }
  }

  // Contradictions: two still-active claims in a family, incompatible values,
  // overlapping validity. Surfaced, never resolved.
  const contradictions: Contradiction[] = [];
  for (const group of families.values()) {
    const active = group.filter((c) => c.standing === 'active');
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        const a = active[i];
        const b = active[j];
        if (sameValue(a, b) || !overlaps(a, b)) continue;
        const kind = CONTRADICTION_KIND[a.category];
        if (!kind) continue;
        contradictions.push({
          id: `ct-${a.id}-${b.id}`,
          claimIds: [a.id, b.id],
          kind,
          note: `${a.label} conflicts with ${b.label}.`,
        });
      }
    }
  }

  return { claims, contradictions };
}

// ── Schema-guided extraction (default seam impl) ─────────────────────────────

export type ExtractFn = (doc: SourceDocument, entities: NerEntity[]) => Claim[];

const LABEL_TO_CATEGORY: Record<string, ClaimCategory> = {
  MEDICATION: 'medication', DRUG: 'medication',
  CONDITION: 'diagnosis', DIAGNOSIS: 'diagnosis', PROBLEM: 'diagnosis',
  LAB: 'lab', TEST: 'lab', OBSERVATION: 'lab',
  ALLERGY: 'allergy',
  PROCEDURE: 'procedure',
  ENCOUNTER: 'encounter',
};
const CATEGORY_TO_RESOURCE: Record<ClaimCategory, FhirMapping['resource']> = {
  medication: 'MedicationStatement', lab: 'Observation', diagnosis: 'Condition',
  allergy: 'AllergyIntolerance', encounter: 'Encounter', procedure: 'Procedure',
};
const CATEGORY_TO_ELEMENT: Record<ClaimCategory, string> = {
  medication: 'medicationCodeableConcept', lab: 'valueQuantity', diagnosis: 'code',
  allergy: 'code', encounter: 'class', procedure: 'code',
};

/** The default schema-shaped extractor: map recognised NER labels to typed Claims,
 *  each citing the exact entity span (quote === text.slice(start, end) by
 *  construction, DDD-004 invariant 2). The live box swaps an LLM-backed
 *  schema-guided extractor in through the same ExtractFn seam; this deterministic
 *  mapper keeps the path runnable and tested without a model. */
export function entitiesToClaims(doc: SourceDocument, entities: NerEntity[]): Claim[] {
  const out: Claim[] = [];
  for (const e of entities) {
    const category = LABEL_TO_CATEGORY[e.label.toUpperCase()];
    if (!category) continue; // labels we do not map are ignored
    const quote = doc.text.slice(e.start, e.end);
    if (!quote) continue; // a bad offset yields no citable span, so no claim
    out.push({
      id: `${doc.id}:${e.start}-${e.end}`,
      category,
      label: e.text,
      value: e.text.toLowerCase(),
      fhir: { resource: CATEGORY_TO_RESOURCE[category], element: CATEGORY_TO_ELEMENT[category] },
      evidence: { docId: doc.id, start: e.start, end: e.end, quote },
      confidence: { score: e.score, method: 'ocr+ner' },
      validity: { from: doc.date, precision: 'day' },
      standing: 'active',
    });
  }
  return out;
}

// ── Grounding services ───────────────────────────────────────────────────────

/** The deterministic ingestion: return the seeded reconciled record, offline.
 *  This is the corpus twin of the engine mock — the control plane can ground and
 *  read a plausible patient with no OCR, NER, or model present. */
export function createMockGrounding(): GroundingService {
  return {
    async ground() {
      return CORPUS_RECORD;
    },
  };
}

export interface LiveGroundingDeps {
  ner: NerClient;
  extract?: ExtractFn;      // defaults to entitiesToClaims
  patientLabel?: string;    // deterministic; no clock in this path
  builtAt?: number;
}

/** The live ingestion: NER + schema-guided extraction per document, then reconcile.
 *  Every dependency is injected so the whole path runs against fakes offline. */
export function createLiveGrounding(deps: LiveGroundingDeps): GroundingService {
  const extract = deps.extract ?? entitiesToClaims;
  const patientLabel = deps.patientLabel ?? 'Grounded patient (synthetic)';
  const builtAt = deps.builtAt ?? 0;
  return {
    async ground(docs) {
      const raw: Claim[] = [];
      for (const doc of docs) {
        const entities = await deps.ner.annotate(doc.text);
        raw.push(...extract(doc, entities));
      }
      const { claims, contradictions } = reconcile(raw);
      return {
        patientLabel,
        claims,
        contradictions,
        documentIds: docs.map((d) => d.id),
        builtAt,
      };
    },
  };
}

// Module singleton chosen by env, mirroring getAuditEmitter()/getEngine().
let grounding: GroundingService | undefined;

/** Live only when explicitly enabled AND an NER url is configured; mock otherwise.
 *  Constructing live never opens a connection, so choosing it offline is safe. */
export function getGrounding(env: NodeJS.ProcessEnv = process.env): GroundingService {
  if (!grounding) {
    if (env.CORPUS_GROUNDING === 'live' && env.CORPUS_NER_URL) {
      grounding = createLiveGrounding({ ner: createNerClient(env.CORPUS_NER_URL) });
    } else {
      grounding = createMockGrounding();
    }
  }
  return grounding;
}

/** Replace the singleton (tests inject a grounding; pass undefined to reset). */
export function setGrounding(g: GroundingService | undefined): void {
  grounding = g;
}
