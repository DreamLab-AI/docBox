// Seams for the clinical corpus domain (DDD-004), mirroring the engine seam
// (engine/client.ts): a small interface with a deterministic mock default and a
// live implementation swapped in by env. The control plane drives these; it never
// depends on how grounding or the mesh actually run.
//
// Files under server/src/corpus/ implement these:
//   store.ts     — the corpus store (documents, record, lexical search)
//   grounding.ts — ingestion: SourceDocuments -> LongitudinalRecord
//   mesh.ts      — query: a Question over the record -> a ReadingSession
//
// The app's domain types are the shared contract, imported the same way index.ts
// imports the mock world.
import type {
  SourceDocument,
  LongitudinalRecord,
  ReadingSession,
  EvidenceSpan,
} from '../../../app/src/domain/types.ts';

/** A lexical hit: which document, and the span the query matched. The reading mesh
 *  uses these to pull exact passages into context — never a similarity rank. */
export interface LexicalHit {
  docId: string;
  span: EvidenceSpan;
  score: number; // BM25 (FTS5) or a deterministic mock rank
}

/** The corpus store: documents in, the reconciled record out, plus a lexical
 *  index over the frozen text. A read model — everything here is rebuildable from
 *  the documents and the record (DDD-004: no truth lives only in an index). */
export interface CorpusStore {
  putDocuments(docs: SourceDocument[]): void;
  getDocuments(): SourceDocument[];
  getDocument(id: string): SourceDocument | undefined;
  putRecord(record: LongitudinalRecord): void;
  getRecord(): LongitudinalRecord | undefined;
  /** Lexical search over frozen document text (FTS5/BM25 live; substring mock). */
  search(query: string, limit?: number): LexicalHit[];
}

/** Ingestion: turn source documents into the reconciled longitudinal record.
 *  The mock returns the seeded CORPUS_RECORD; the live path runs OCR + the NER
 *  sidecar + schema-guided extraction, then reconciles on recency and validity. */
export interface GroundingService {
  ground(docs: SourceDocument[]): Promise<LongitudinalRecord>;
}

/** Query: a Question over the record, answered by the bounded specialist mesh.
 *  Returns the full ReadingSession (findings + CitedAnswer), the query-time unit
 *  of work and of audit. */
export interface ReadingMesh {
  ask(question: string, askedBy: string, record: LongitudinalRecord, store: CorpusStore): Promise<ReadingSession>;
}
