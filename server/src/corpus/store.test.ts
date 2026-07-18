// CorpusStore suite: the in-memory read model and its substring lexical index.
import { describe, it, expect } from 'vitest';
import { createInMemoryStore, getStore, setStore } from './store';
import type { SourceDocument, LongitudinalRecord } from '../../../app/src/domain/types.ts';

function doc(id: string, text: string): SourceDocument {
  return {
    id,
    name: `${id}.pdf`,
    kind: 'clinic_letter',
    provenance: 'test',
    date: Date.UTC(2023, 0, 1),
    text,
    ocrRoute: 'local',
    handwriting: false,
  };
}

const RECORD: LongitudinalRecord = {
  patientLabel: 'Test patient',
  claims: [],
  contradictions: [],
  documentIds: ['a'],
  builtAt: Date.UTC(2023, 0, 2),
};

describe('createInMemoryStore documents + record', () => {
  it('puts and gets documents by id, keeping insertion order', () => {
    const store = createInMemoryStore();
    store.putDocuments([doc('a', 'alpha'), doc('b', 'beta')]);
    expect(store.getDocuments().map((d) => d.id)).toEqual(['a', 'b']);
    expect(store.getDocument('a')?.text).toBe('alpha');
    expect(store.getDocument('missing')).toBeUndefined();
  });

  it('overwrites a document with the same id', () => {
    const store = createInMemoryStore();
    store.putDocuments([doc('a', 'first')]);
    store.putDocuments([doc('a', 'second')]);
    expect(store.getDocuments()).toHaveLength(1);
    expect(store.getDocument('a')?.text).toBe('second');
  });

  it('puts and gets the record, undefined before it is set', () => {
    const store = createInMemoryStore();
    expect(store.getRecord()).toBeUndefined();
    store.putRecord(RECORD);
    expect(store.getRecord()).toBe(RECORD);
  });
});

describe('createInMemoryStore.search', () => {
  it('finds a substring case-insensitively and quotes the exact source text', () => {
    const store = createInMemoryStore();
    store.putDocuments([doc('a', 'Potassium 5.9 mmol/L (HIGH)')]);
    const [hit] = store.search('POTASSIUM');
    expect(hit.docId).toBe('a');
    expect(hit.span.quote).toBe('Potassium'); // original casing preserved
    expect(hit.span).toMatchObject({ docId: 'a', start: 0, end: 9 });
  });

  it('returns [] for a miss and for an empty/whitespace query', () => {
    const store = createInMemoryStore();
    store.putDocuments([doc('a', 'nothing here')]);
    expect(store.search('absent')).toEqual([]);
    expect(store.search('   ')).toEqual([]);
  });

  it('ranks more matches higher and applies the limit', () => {
    const store = createInMemoryStore();
    store.putDocuments([
      doc('one', 'dose dose dose'), // 3 matches
      doc('two', 'a single dose'), // 1 match
    ]);
    const hits = store.search('dose');
    expect(hits.map((h) => h.docId)).toEqual(['one', 'two']);
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
    expect(store.search('dose', 1).map((h) => h.docId)).toEqual(['one']);
  });

  it('breaks a score tie deterministically by docId', () => {
    const store = createInMemoryStore();
    store.putDocuments([doc('zeta', 'amlodipine'), doc('alpha', 'amlodipine')]);
    // Equal match count and first position -> equal score -> docId ascending.
    expect(store.search('amlodipine').map((h) => h.docId)).toEqual(['alpha', 'zeta']);
  });
});

describe('getStore / setStore singleton', () => {
  it('returns a stable default store and accepts an injected one', () => {
    setStore(undefined);
    const first = getStore();
    expect(getStore()).toBe(first); // memoised
    const injected = createInMemoryStore();
    setStore(injected);
    expect(getStore()).toBe(injected);
    setStore(undefined); // reset for other suites
  });
});
