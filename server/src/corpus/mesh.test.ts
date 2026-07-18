// ReadingMesh suite: the mock's S2 routing + generic record-grounded answer, and
// the live mesh driven over a fake engine seam. Asserts the ReadingSession shape,
// that every emitted sentence carries evidence, and that contradictions surface.
import { describe, it, expect } from 'vitest';
import { createMockMesh, createLiveMesh, getMesh, setMesh } from './mesh';
import { createInMemoryStore } from './store';
import { CORPUS_DEMO_SESSION, DEMO_QUESTION } from '../../../app/src/data/corpus.ts';
import type {
  Claim, Contradiction, LongitudinalRecord, SourceDocument, ReadingSession,
} from '../../../app/src/domain/types.ts';
import type { EngineClient, PromptResult } from '../engine/client';

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

function srcDoc(id: string, text: string): SourceDocument {
  return { id, name: `${id}.pdf`, kind: 'lab_report', provenance: 't', date: D(2023, 1, 1), text, ocrRoute: 'local', handwriting: false };
}

function claim(over: Partial<Claim> & { id: string; docId: string; quote: string; text: string }): Claim {
  const start = over.text.indexOf(over.quote);
  return {
    id: over.id,
    category: over.category ?? 'lab',
    label: over.label ?? over.quote,
    value: over.value ?? over.quote.toLowerCase(),
    fhir: over.fhir ?? { resource: 'Observation', element: 'valueQuantity' },
    evidence: over.evidence ?? { docId: over.docId, start, end: start + over.quote.length, quote: over.quote },
    confidence: { score: 0.9, method: 'ocr+ner' },
    validity: over.validity ?? { from: D(2023, 3, 10), precision: 'day' },
    standing: over.standing ?? 'active',
  };
}

/** A minimal record + store where potassium claims cite a lab document. */
function labWorld(extra: { contradictions?: Contradiction[]; claims?: Claim[] } = {}) {
  const doc = srcDoc('lab', 'Potassium 4.2 mmol/L (normal). Sodium 139 mmol/L.');
  const store = createInMemoryStore();
  store.putDocuments([doc]);
  const claims: Claim[] = extra.claims ?? [
    claim({ id: 'k', docId: 'lab', text: doc.text, quote: 'Potassium 4.2 mmol/L', label: 'Potassium 4.2 mmol/L (normal)' }),
  ];
  const record: LongitudinalRecord = {
    patientLabel: 'Test', claims, contradictions: extra.contradictions ?? [],
    documentIds: ['lab'], builtAt: D(2023, 9, 2),
  };
  store.putRecord(record);
  return { store, record, doc };
}

function checkEvidence(session: ReadingSession) {
  for (const s of session.answer.sentences) expect(s.evidence.length).toBeGreaterThanOrEqual(1);
}

describe('createMockMesh', () => {
  it('routes a medications/timeline Question to the flagship S2 session', async () => {
    const { store, record } = labWorld();
    const session = await createMockMesh().ask(DEMO_QUESTION, 'clinician', record, store);
    expect(session).toBe(CORPUS_DEMO_SESSION); // "taking" -> the worked demo answer
  });

  it('builds a generic cited answer from the record for a non-medication Question', async () => {
    const { store, record } = labWorld();
    const session = await createMockMesh().ask('Which potassium results are shown?', 'clinician', record, store);
    expect(session.askedBy).toBe('clinician');
    expect(session.askedAt).toBe(record.builtAt); // deterministic, no clock
    expect(session.id).toMatch(/^rs-\d+$/);
    expect(session.findings.map((f) => f.specialist)).toContain('labs');
    expect(session.answer.sentences[0].evidence[0].quote).toBe('Potassium 4.2 mmol/L');
    expect(session.answer.gaps).toHaveLength(0);
    checkEvidence(session);
  });

  it('surfaces a Contradiction that touches a chosen claim, with its id', async () => {
    const doc = srcDoc('lab', 'Potassium 5.9 then Potassium 4.2 mmol/L.');
    const store = createInMemoryStore();
    store.putDocuments([doc]);
    const high = claim({ id: 'kHigh', docId: 'lab', text: doc.text, quote: 'Potassium 5.9', value: '5.9', validity: { from: D(2023, 3, 10), precision: 'day' } });
    const low = claim({ id: 'kLow', docId: 'lab', text: doc.text, quote: 'Potassium 4.2', value: '4.2', validity: { from: D(2023, 3, 11), precision: 'day' } });
    const ct: Contradiction = { id: 'ct-k', claimIds: ['kHigh', 'kLow'], kind: 'lab', note: 'Potassium values disagree.' };
    const record: LongitudinalRecord = { patientLabel: 'T', claims: [high, low], contradictions: [ct], documentIds: ['lab'], builtAt: D(2023, 9, 2) };
    store.putRecord(record);
    const session = await createMockMesh().ask('What potassium is recorded?', 'clinician', record, store);
    const surfaced = session.answer.sentences.find((s) => s.contradictionId === 'ct-k');
    expect(surfaced).toBeDefined();
    expect(surfaced!.evidence.length).toBe(2);
    checkEvidence(session);
  });

  it('drops a claim it cannot evidence and lists a gap when nothing matches', async () => {
    const { store } = labWorld();
    // A claim that matches the query by label but carries no citable quote.
    const ghost = claim({ id: 'ghost', docId: 'lab', text: 'x', quote: 'x', label: 'Xylophone marker', evidence: { docId: 'lab', start: 0, end: 0, quote: '' } });
    const record: LongitudinalRecord = { patientLabel: 'T', claims: [ghost], contradictions: [], documentIds: ['lab'], builtAt: D(2023, 9, 2) };
    store.putRecord(record);
    const matched = await createMockMesh().ask('Any xylophone finding?', 'clinician', record, store);
    expect(matched.answer.sentences).toHaveLength(0); // ghost chosen but dropped (empty quote)
    expect(matched.findings.length).toBeGreaterThan(0); // still a finding

    const none = await createMockMesh().ask('Completely absent zebra topic?', 'clinician', record, store);
    expect(none.answer.gaps).toEqual(['No evidenced claim in the record addresses this question.']);
  });

  it('excludes superseded claims from a generic answer', async () => {
    const doc = srcDoc('lab', 'Potassium 5.9 mmol/L.');
    const store = createInMemoryStore();
    store.putDocuments([doc]);
    const superseded = claim({ id: 'old', docId: 'lab', text: doc.text, quote: 'Potassium 5.9', standing: 'superseded' });
    const record: LongitudinalRecord = { patientLabel: 'T', claims: [superseded], contradictions: [], documentIds: ['lab'], builtAt: D(2023, 9, 2) };
    store.putRecord(record);
    const session = await createMockMesh().ask('What potassium is recorded?', 'clinician', record, store);
    expect(session.answer.sentences).toHaveLength(0);
    expect(session.answer.gaps).toHaveLength(1);
  });
});

// A fake engine: canned narration, empty for the labs specialist to exercise the
// summary fallback. Only submitPrompt is used by the mesh.
function fakeEngine(): EngineClient {
  return {
    kind: 'mock',
    async health() {
      return { engine: 'mock', ready: true, model: 'fake', protocol: 'in-process-deterministic' };
    },
    async *streamEvents() {
      /* unused by the mesh */
    },
    async submitPrompt(req): Promise<PromptResult> {
      const text = req.prompt.includes('labs specialist') ? '' : 'canned narration';
      return { sessionId: req.sessionId, ok: true, text, events: [] };
    },
  };
}

describe('createLiveMesh', () => {
  function multiWorld() {
    const doc = srcDoc('d', 'amlodipine 10mg. Potassium 4.2. Essential hypertension.');
    const store = createInMemoryStore();
    store.putDocuments([doc]);
    const med1 = claim({ id: 'm1', docId: 'd', text: doc.text, quote: 'amlodipine 10mg', category: 'medication', value: 'amlodipine 10 mg', fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept' } });
    const med2 = claim({ id: 'm2', docId: 'd', text: doc.text, quote: 'amlodipine 10mg', category: 'medication', value: 'amlodipine 5 mg', fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept' } });
    const lab = claim({ id: 'k', docId: 'd', text: doc.text, quote: 'Potassium 4.2', category: 'lab' });
    const dx = claim({ id: 'dx', docId: 'd', text: doc.text, quote: 'Essential hypertension', category: 'diagnosis', fhir: { resource: 'Condition', element: 'code' } });
    const ct: Contradiction = { id: 'ct-med', claimIds: ['m1', 'm2'], kind: 'medication', note: 'Doses disagree.' };
    const dangling: Contradiction = { id: 'ct-ghost', claimIds: ['nope1', 'nope2'], kind: 'lab', note: 'references missing claims' };
    const record: LongitudinalRecord = { patientLabel: 'T', claims: [med1, med2, lab, dx], contradictions: [ct, dangling], documentIds: ['d'], builtAt: D(2023, 9, 2) };
    store.putRecord(record);
    return { store, record };
  }

  it('convenes five specialists, cites from the record, and surfaces contradictions', async () => {
    const { store, record } = multiWorld();
    const session = await createLiveMesh({ engine: fakeEngine() }).ask('What is going on?', 'clinician', record, store);
    expect(session.findings).toHaveLength(5); // the fixed bounded set
    expect(session.askedAt).toBe(record.builtAt);
    checkEvidence(session); // every sentence carries >=1 span

    // The labs specialist got empty engine text -> fallback summary, still cited.
    const labs = session.findings.find((f) => f.specialist === 'labs')!;
    expect(labs.summary).toBe('No labs findings.');

    // The medications contradiction is surfaced; the dangling one is skipped.
    const surfaced = session.answer.sentences.filter((s) => s.contradictionId);
    expect(surfaced.map((s) => s.contradictionId)).toEqual(['ct-med']);

    // Specialists with no claims (correspondence) become gaps.
    expect(session.answer.gaps).toContain('No evidenced correspondence claim in the record.');
  });
});

describe('getMesh / setMesh factory', () => {
  it('returns mock by default and memoises the singleton', async () => {
    setMesh(undefined);
    const m = getMesh({} as NodeJS.ProcessEnv);
    expect(getMesh({} as NodeJS.ProcessEnv)).toBe(m);
    const { store, record } = labWorld();
    expect(await m.ask(DEMO_QUESTION, 'c', record, store)).toBe(CORPUS_DEMO_SESSION); // mock routes S2
    setMesh(undefined);
  });

  it('returns the live mesh when CORPUS_MESH=live (engine constructed lazily)', async () => {
    setMesh(undefined);
    const m = getMesh({ CORPUS_MESH: 'live' } as unknown as NodeJS.ProcessEnv);
    const { store, record } = labWorld();
    // Live mesh never short-circuits to the demo session; it convenes all five.
    const session = await m.ask(DEMO_QUESTION, 'c', record, store);
    expect(session.id).not.toBe(CORPUS_DEMO_SESSION.id);
    expect(session.findings).toHaveLength(5);
    setMesh(undefined);
  });
});
