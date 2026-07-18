// Grounding suite: the pure reconcile() algebra (recency, supersession,
// contradiction), the default extractor, and the mock/live services + factory.
import { describe, it, expect, vi } from 'vitest';
import {
  reconcile, entitiesToClaims, createMockGrounding, createLiveGrounding,
  getGrounding, setGrounding, type ExtractFn,
} from './grounding';
import type { NerClient } from './ner-client';
import { CORPUS_RECORD } from '../../../app/src/data/corpus.ts';
import type { Claim, ClaimCategory, SourceDocument } from '../../../app/src/domain/types.ts';

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

function claim(over: Partial<Claim> & { id: string }): Claim {
  return {
    category: 'medication',
    label: over.id,
    value: 'amlodipine 5 mg',
    fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept' },
    evidence: { docId: 'd', start: 0, end: 3, quote: 'amx' },
    confidence: { score: 0.9, method: 'ocr+ner' },
    validity: { from: D(2023, 1, 1), precision: 'day' },
    standing: 'active',
    ...over,
  };
}

function srcDoc(id: string, text: string, date = D(2023, 1, 1)): SourceDocument {
  return { id, name: `${id}.pdf`, kind: 'clinic_letter', provenance: 't', date, text, ocrRoute: 'local', handwriting: false };
}

describe('reconcile', () => {
  it('orders claims by validity.from (recency)', () => {
    const { claims } = reconcile([
      claim({ id: 'late', value: 'x', validity: { from: D(2023, 6, 1), precision: 'day' } }),
      claim({ id: 'early', value: 'y', validity: { from: D(2023, 1, 1), precision: 'day' } }),
    ]);
    expect(claims.map((c) => c.id)).toEqual(['early', 'late']);
  });

  it('supersedes an earlier, closed, different-value claim in the same family', () => {
    const { claims, contradictions } = reconcile([
      claim({ id: 'amlo5', value: 'amlodipine 5 mg', validity: { from: D(2023, 1, 15), to: D(2023, 2, 20), precision: 'day' } }),
      claim({ id: 'amlo10', value: 'amlodipine 10 mg', validity: { from: D(2023, 2, 20), precision: 'day' } }),
    ]);
    const byId = new Map(claims.map((c) => [c.id, c]));
    expect(byId.get('amlo5')!.standing).toBe('superseded');
    expect(byId.get('amlo10')!.standing).toBe('active');
    expect(byId.get('amlo10')!.supersedesClaimId).toBe('amlo5');
    expect(contradictions).toHaveLength(0);
  });

  it('chains supersession to the immediate predecessor (5 -> 10 -> 20)', () => {
    const { claims } = reconcile([
      claim({ id: 'v5', value: 'amlodipine 5 mg', validity: { from: D(2023, 1, 1), to: D(2023, 2, 1), precision: 'day' } }),
      claim({ id: 'v10', value: 'amlodipine 10 mg', validity: { from: D(2023, 2, 1), to: D(2023, 3, 1), precision: 'day' } }),
      claim({ id: 'v20', value: 'amlodipine 20 mg', validity: { from: D(2023, 3, 1), precision: 'day' } }),
    ]);
    const byId = new Map(claims.map((c) => [c.id, c]));
    expect(byId.get('v10')!.supersedesClaimId).toBe('v5');
    expect(byId.get('v20')!.supersedesClaimId).toBe('v10');
    expect(byId.get('v5')!.standing).toBe('superseded');
    expect(byId.get('v10')!.standing).toBe('superseded');
    expect(byId.get('v20')!.standing).toBe('active');
  });

  it('flags two overlapping, incompatible actives as a Contradiction', () => {
    const { contradictions } = reconcile([
      claim({ id: 'discharge10', value: 'amlodipine 10 mg', validity: { from: D(2023, 6, 5), precision: 'day' } }),
      claim({ id: 'gprepeat5', value: 'amlodipine 5 mg', validity: { from: D(2023, 9, 1), precision: 'day' } }),
    ]);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].claimIds).toEqual(['discharge10', 'gprepeat5']);
    expect(contradictions[0].kind).toBe('medication');
  });

  it('does not conflict identical values, nor supersede across the same value', () => {
    const { claims, contradictions } = reconcile([
      claim({ id: 'a', value: 'amlodipine 10 mg', validity: { from: D(2023, 2, 1), precision: 'day' } }),
      claim({ id: 'b', value: 'amlodipine 10 mg', validity: { from: D(2023, 6, 1), precision: 'day' } }),
    ]);
    expect(contradictions).toHaveLength(0);
    expect(claims.every((c) => c.standing === 'active')).toBe(true);
  });

  it('leaves other families independent and never conflicts a non-surfaced category', () => {
    const { contradictions } = reconcile([
      claim({ id: 'enc1', category: 'encounter', value: 'clinic', fhir: { resource: 'Encounter', element: 'class' }, validity: { from: D(2023, 1, 1), precision: 'day' } }),
      claim({ id: 'enc2', category: 'encounter', value: 'ward', fhir: { resource: 'Encounter', element: 'class' }, validity: { from: D(2023, 2, 1), precision: 'day' } }),
    ]);
    // Same headword family? 'clinic' vs 'ward' differ -> different families -> no pairing.
    expect(contradictions).toHaveLength(0);
  });

  it('surfaces conflicts by coded family and skips categories with no Contradiction.kind', () => {
    const labA = claim({
      id: 'kHigh', category: 'lab', value: '5.9 mmol/L',
      fhir: { resource: 'Observation', element: 'valueQuantity', system: 'LOINC', code: '2823-3' },
      validity: { from: D(2023, 3, 10), precision: 'day' },
    });
    const labB = claim({
      id: 'kNormal', category: 'lab', value: '4.2 mmol/L',
      fhir: { resource: 'Observation', element: 'valueQuantity', system: 'LOINC', code: '2823-3' },
      validity: { from: D(2023, 3, 11), precision: 'day' },
    });
    const { contradictions } = reconcile([labA, labB]);
    expect(contradictions).toHaveLength(1);
    expect(contradictions[0].kind).toBe('lab');

    // A procedure conflict shares a family (same code) but has no surfaced kind.
    const p = (id: string, v: string): Claim => claim({
      id, category: 'procedure' as ClaimCategory, value: v,
      fhir: { resource: 'Procedure', element: 'code', code: '999' },
      validity: { from: D(2023, 4, 1), precision: 'day' },
    });
    expect(reconcile([p('p1', 'stent'), p('p2', 'graft')]).contradictions).toHaveLength(0);
  });

  it('ignores refuted inputs and does not mutate the caller\'s claims', () => {
    const input = [
      claim({ id: 'active10', value: 'amlodipine 10 mg', validity: { from: D(2023, 6, 1), precision: 'day' } }),
      claim({ id: 'refuted5', value: 'amlodipine 5 mg', standing: 'refuted', validity: { from: D(2023, 9, 1), precision: 'day' } }),
    ];
    const { contradictions } = reconcile(input);
    expect(contradictions).toHaveLength(0); // refuted takes no part
    expect(input[0].standing).toBe('active'); // inputs untouched
    expect(input[1].standing).toBe('refuted');
  });
});

describe('entitiesToClaims (default extractor)', () => {
  const doc = srcDoc('d1', 'amlodipine 10mg once daily', D(2023, 2, 20));

  it('maps a recognised label to a Claim citing the exact span', () => {
    const [c] = entitiesToClaims(doc, [{ text: 'amlodipine', label: 'MEDICATION', start: 0, end: 10, score: 0.9 }]);
    expect(c.category).toBe('medication');
    expect(c.evidence).toEqual({ docId: 'd1', start: 0, end: 10, quote: 'amlodipine' });
    expect(doc.text.slice(c.evidence.start, c.evidence.end)).toBe(c.evidence.quote);
    expect(c.validity.from).toBe(D(2023, 2, 20));
    expect(c.confidence).toEqual({ score: 0.9, method: 'ocr+ner' });
  });

  it('ignores unmapped labels and zero-width (bad-offset) spans', () => {
    const out = entitiesToClaims(doc, [
      { text: 'Dr Nair', label: 'PERSON', start: 0, end: 7, score: 0.9 }, // unmapped
      { text: '', label: 'MEDICATION', start: 5, end: 5, score: 0.9 }, // no citable span
    ]);
    expect(out).toEqual([]);
  });
});

describe('createMockGrounding', () => {
  it('returns the seeded CORPUS_RECORD regardless of input', async () => {
    const g = createMockGrounding();
    expect(await g.ground([])).toBe(CORPUS_RECORD);
  });
});

describe('createLiveGrounding', () => {
  const nerOf = (entities: Parameters<ExtractFn>[1]): NerClient => ({ annotate: async () => entities });

  it('runs NER + extract + reconcile into a record', async () => {
    const ner: NerClient = { annotate: vi.fn(async () => [{ text: 'amlodipine', label: 'MEDICATION', start: 0, end: 10, score: 0.9 }]) };
    // A custom extract with bounded validity so supersession is exercised end-to-end.
    const extract: ExtractFn = (doc) =>
      doc.id === 'd1'
        ? [claim({ id: 'c1', value: 'amlodipine 5 mg', validity: { from: D(2023, 1, 1), to: D(2023, 2, 1), precision: 'day' }, evidence: { docId: 'd1', start: 0, end: 10, quote: 'amlodipine' } })]
        : [claim({ id: 'c2', value: 'amlodipine 10 mg', validity: { from: D(2023, 2, 1), precision: 'day' }, evidence: { docId: 'd2', start: 0, end: 10, quote: 'amlodipine' } })];
    const g = createLiveGrounding({ ner, extract, patientLabel: 'P', builtAt: 42 });
    const record = await g.ground([srcDoc('d1', 'amlodipine 5mg'), srcDoc('d2', 'amlodipine 10mg')]);
    expect(record.patientLabel).toBe('P');
    expect(record.builtAt).toBe(42);
    expect(record.documentIds).toEqual(['d1', 'd2']);
    expect(record.claims.find((c) => c.id === 'c1')!.standing).toBe('superseded');
    expect(ner.annotate).toHaveBeenCalledTimes(2);
  });

  it('uses the default extractor and defaults when options are omitted', async () => {
    const g = createLiveGrounding({ ner: nerOf([{ text: 'amlodipine', label: 'MEDICATION', start: 0, end: 10, score: 0.9 }]) });
    const record = await g.ground([srcDoc('d1', 'amlodipine 10mg once daily')]);
    expect(record.patientLabel).toContain('synthetic');
    expect(record.builtAt).toBe(0);
    expect(record.claims).toHaveLength(1);
    expect(record.claims[0].category).toBe('medication');
  });
});

describe('getGrounding / setGrounding factory', () => {
  it('returns mock by default and memoises the singleton', async () => {
    setGrounding(undefined);
    const g = getGrounding({} as NodeJS.ProcessEnv);
    expect(getGrounding({} as NodeJS.ProcessEnv)).toBe(g); // memoised
    expect(await g.ground([])).toBe(CORPUS_RECORD);
    setGrounding(undefined);
  });

  it('returns live only when enabled AND an NER url is set (constructing nothing)', async () => {
    setGrounding(undefined);
    const live = getGrounding({ CORPUS_GROUNDING: 'live', CORPUS_NER_URL: 'http://ner' } as unknown as NodeJS.ProcessEnv);
    const record = await live.ground([]); // no docs -> no network
    expect(record.patientLabel).not.toBe(CORPUS_RECORD.patientLabel);
    expect(record.builtAt).toBe(0);
    setGrounding(undefined);
  });

  it('falls back to mock when live is requested without a url', async () => {
    setGrounding(undefined);
    const g = getGrounding({ CORPUS_GROUNDING: 'live' } as unknown as NodeJS.ProcessEnv);
    expect(await g.ground([])).toBe(CORPUS_RECORD);
    setGrounding(undefined);
  });
});
