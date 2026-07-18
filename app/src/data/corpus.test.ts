import { describe, it, expect } from 'vitest';
import {
  CORPUS_DOCUMENTS,
  CORPUS_CLAIMS,
  CORPUS_CONTRADICTIONS,
  CORPUS_RECORD,
  CORPUS_DEMO_SESSION,
} from './corpus';
import type { EvidenceSpan } from '../domain/types';

const docById = new Map(CORPUS_DOCUMENTS.map((d) => [d.id, d]));

function checkSpan(s: EvidenceSpan): void {
  const doc = docById.get(s.docId);
  expect(doc, `document ${s.docId} exists`).toBeDefined();
  expect(doc!.text.slice(s.start, s.end)).toBe(s.quote);
}

describe('synthetic corpus (PRD-009)', () => {
  it('every Claim evidence span quotes its source exactly (DDD-004 invariant 2)', () => {
    for (const c of CORPUS_CLAIMS) checkSpan(c.evidence);
  });

  it('every CitedAnswer sentence carries at least one exact span (DDD-004 invariant 3)', () => {
    for (const s of CORPUS_DEMO_SESSION.answer.sentences) {
      expect(s.evidence.length).toBeGreaterThanOrEqual(1);
      s.evidence.forEach(checkSpan);
    }
  });

  it('specialist findings evidence resolves to source', () => {
    for (const f of CORPUS_DEMO_SESSION.findings) f.evidence.forEach(checkSpan);
  });

  it('a Contradiction references exactly two real Claims (DDD-004 invariant 4)', () => {
    const ids = new Set(CORPUS_CLAIMS.map((c) => c.id));
    for (const ct of CORPUS_CONTRADICTIONS) {
      expect(ct.claimIds).toHaveLength(2);
      ct.claimIds.forEach((id) => expect(ids.has(id), id).toBe(true));
    }
  });

  it('supersession points at a real, superseded Claim (DDD-004 invariant 5)', () => {
    const byId = new Map(CORPUS_CLAIMS.map((c) => [c.id, c]));
    for (const c of CORPUS_CLAIMS) {
      if (!c.supersedesClaimId) continue;
      const prev = byId.get(c.supersedesClaimId);
      expect(prev, `${c.id} supersedes a real claim`).toBeDefined();
      expect(prev!.standing).toBe('superseded');
    }
  });

  it('surfaces the flagship S2 medication contradiction in the demo answer', () => {
    const surfaced = CORPUS_DEMO_SESSION.answer.sentences.some((s) => s.contradictionId === 'ct-amlo-dose');
    expect(surfaced).toBe(true);
  });

  it('the record aggregates every document', () => {
    expect(CORPUS_RECORD.documentIds).toHaveLength(CORPUS_DOCUMENTS.length);
    expect(CORPUS_RECORD.claims.length).toBeGreaterThan(0);
  });
});
