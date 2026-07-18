// The corpus store (DDD-004 read model): documents and the reconciled record held
// in memory, plus a lexical index over each document's frozen text. `search` is a
// case-insensitive substring scan that returns the exact matched span, so a hit
// always quotes real source characters — the reading mesh pulls passages, never a
// similarity guess.
//
// On the live box this same `search` runs FTS5 over an external-content table and
// ranks by BM25 (node:sqlite ships in Node 24); the interface — query in,
// LexicalHit out — does not change, so the mesh is blind to which index answers.
// In-memory substring is the default so the suite is deterministic and needs no
// native dependency.
import type { SourceDocument, LongitudinalRecord } from '../../../app/src/domain/types.ts';
import type { CorpusStore, LexicalHit } from './contract';

/** Case-insensitive count of non-overlapping occurrences of `needle` in a
 *  pre-lowercased `hay`, plus the first offset (-1 when absent). */
function scan(hay: string, needle: string): { count: number; first: number } {
  let count = 0;
  let first = -1;
  let idx = hay.indexOf(needle);
  while (idx >= 0) {
    if (first < 0) first = idx;
    count += 1;
    idx = hay.indexOf(needle, idx + needle.length);
  }
  return { count, first };
}

/** The default in-memory store. Documents are keyed by id (insertion order kept),
 *  the record is a single slot, and search scans the frozen text. */
export function createInMemoryStore(): CorpusStore {
  const docs = new Map<string, SourceDocument>();
  let record: LongitudinalRecord | undefined;

  return {
    putDocuments(incoming) {
      for (const d of incoming) docs.set(d.id, d);
    },
    getDocuments() {
      return [...docs.values()];
    },
    getDocument(id) {
      return docs.get(id);
    },
    putRecord(r) {
      record = r;
    },
    getRecord() {
      return record;
    },
    search(query, limit = 10) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      const hits: LexicalHit[] = [];
      for (const doc of docs.values()) {
        const { count, first } = scan(doc.text.toLowerCase(), needle);
        if (count === 0) continue;
        // Quote the exact source text (original casing) at the first match.
        const quote = doc.text.slice(first, first + needle.length);
        hits.push({
          docId: doc.id,
          span: { docId: doc.id, start: first, end: first + needle.length, quote },
          // More matches rank higher; an earlier first hit breaks ties. Deterministic.
          score: count + 1 / (1 + first),
        });
      }
      hits.sort((a, b) => (b.score - a.score) || a.docId.localeCompare(b.docId));
      return hits.slice(0, limit);
    },
  };
}

// Module singleton chosen the way getAuditEmitter() is, overridable for tests.
// The in-memory store is the only impl today; an FTS5-backed store would swap in
// here behind the same CorpusStore interface without touching callers.
let store: CorpusStore | undefined;

export function getStore(): CorpusStore {
  if (!store) store = createInMemoryStore();
  return store;
}

/** Replace the singleton (tests inject a fresh store; pass undefined to reset). */
export function setStore(s: CorpusStore | undefined): void {
  store = s;
}
