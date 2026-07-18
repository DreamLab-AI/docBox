// Pure helpers and metadata for the Clinician query surface. No React, no side
// effects — date and confidence formatting, the standing/specialist/category
// vocabularies, question routing, and the record-derived reading session. All of
// it reads only the frozen contract types (DDD-004), so a citation stays checkable.
import type {
  Claim,
  ClaimCategory,
  ClaimStanding,
  CitedSentence,
  Confidence,
  Contradiction,
  LongitudinalRecord,
  ReadingSession,
  SourceDocument,
  SpecialistFinding,
  SpecialistId,
  ValidityInterval,
} from '../../domain/types';
import { SPECIALISTS } from '../../domain/types';

/** A document date as day-month-year, e.g. "5 Jun 2023". */
export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A validity window as "from – to", or "from – ongoing" when still open. */
export function fmtValidity(v: ValidityInterval): string {
  const from = fmtDate(v.from);
  return typeof v.to === 'number' ? `${from} – ${fmtDate(v.to)}` : `${from} – ongoing`;
}

/** Confidence 0..1 as a whole percent. */
export function formatPct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/** How a Claim's standing reads. Paired with a colour, never colour alone. */
export const STANDING_LABEL: Record<ClaimStanding, string> = {
  active: 'Active',
  superseded: 'Superseded',
  refuted: 'Refuted',
};

export const STANDING_COLOUR: Record<ClaimStanding, string> = {
  active: 'var(--green)',
  superseded: 'var(--fg-2)',
  refuted: 'var(--rose)',
};

export const STANDING_HELP: Record<ClaimStanding, string> = {
  active: 'Current — nothing later has replaced or contradicted it.',
  superseded: 'A later document replaced this value; kept for the audit trail.',
  refuted: 'Later evidence disproved this; kept, but marked as not standing.',
};

/** Display names for the five reading-mesh Specialists (PRD-011). */
export const SPECIALIST_LABEL: Record<SpecialistId, string> = {
  medications: 'Medications',
  labs: 'Labs',
  diagnoses: 'Diagnoses',
  chronology: 'Chronology',
  correspondence: 'Correspondence',
};

/** Display names for Claim categories. */
export const CATEGORY_LABEL: Record<ClaimCategory, string> = {
  medication: 'Medication',
  lab: 'Lab result',
  diagnosis: 'Diagnosis',
  allergy: 'Allergy',
  encounter: 'Encounter',
  procedure: 'Procedure',
};

/** Which Specialist owns a Claim category when deriving findings from the record. */
export const SPECIALIST_FOR_CATEGORY: Record<ClaimCategory, SpecialistId> = {
  medication: 'medications',
  lab: 'labs',
  diagnosis: 'diagnoses',
  allergy: 'correspondence',
  encounter: 'chronology',
  procedure: 'chronology',
};

/** A Claim's human label, or a readable fallback when the reference cannot resolve. */
export function claimLabel(claim: Claim | undefined): string {
  return claim ? claim.label : 'referenced claim not found';
}

/** The Contradiction a sentence surfaces, if any. Undefined id or unknown id → none. */
export function contradictionFor(record: LongitudinalRecord, id: string | undefined): Contradiction | undefined {
  if (!id) return undefined;
  return record.contradictions.find((c) => c.id === id);
}

/** Does the question ask about medication? Routes to the worked flagship session. */
export function isMedicationQuestion(question: string): boolean {
  // Leading boundary only, so plurals ("medications", "tablets", "drugs") match.
  return /\b(medication|medicine|taking|drug|dose|dosage|prescri|repeat|tablet|amlodipine|statin)/i.test(question);
}

/** Group every Claim under its Specialist, in the fixed Specialist order, dropping
 *  any Specialist with nothing to read. This is the reading mesh's fan-out. */
export function deriveFindings(claims: Claim[]): SpecialistFinding[] {
  const bySpec = new Map<SpecialistId, Claim[]>();
  for (const c of claims) {
    const spec = SPECIALIST_FOR_CATEGORY[c.category];
    const list = bySpec.get(spec) ?? [];
    list.push(c);
    bySpec.set(spec, list);
  }
  const findings: SpecialistFinding[] = [];
  for (const spec of SPECIALISTS) {
    const list = bySpec.get(spec);
    if (!list) continue;
    findings.push({
      specialist: spec,
      summary: `${list.length} ${list.length === 1 ? 'claim' : 'claims'} read across the record.`,
      claimIds: list.map((c) => c.id),
      evidence: list.map((c) => c.evidence),
    });
  }
  return findings;
}

/** Build a CitedAnswer straight from the record's active Claims: one evidenced
 *  sentence per current value, so every sentence stands on its own citation. Used
 *  for questions outside the worked medications flow. */
export function deriveSession(record: LongitudinalRecord, question: string): ReadingSession {
  const active = record.claims.filter((c) => c.standing === 'active');
  const sentences: CitedSentence[] = active.map((c) => ({
    text: `${CATEGORY_LABEL[c.category]}: ${c.label}.`,
    evidence: [c.evidence],
  }));
  return {
    id: 'rs-derived',
    question,
    askedBy: 'clinician',
    askedAt: record.builtAt,
    findings: deriveFindings(record.claims),
    answer: {
      sentences,
      gaps: ['Adherence and any doses taken at home are not evidenced by the record.'],
    },
  };
}

/** The document that backs a Claim's evidence, resolved through a lookup. */
export function claimDoc(
  claim: Claim | undefined,
  documentById: (id: string) => SourceDocument | undefined,
): SourceDocument | undefined {
  return claim ? documentById(claim.evidence.docId) : undefined;
}

/** Confidence as "94% · ocr+ner" for compact display next to a value. */
export function fmtConfidence(confidence: Confidence): string {
  return `${formatPct(confidence.score)} · ${confidence.method}`;
}
