// The Clinician surface's single data seam. Today it reads the deterministic
// offline corpus (DDD-004): the reconciled record, its source documents, and the
// worked flagship reading session. `ask` routes a medications question to that
// worked session and anything else to a record-derived answer.
//
// This hook is the ONLY place the surface touches a data source. To go live,
// repoint the three corpus imports at the adapter store (record, documents and a
// grounded `ask`) while keeping the returned `Corpus` shape unchanged — the
// components never learn where the record came from.
import { useMemo } from 'react';
import type { Claim, LongitudinalRecord, ReadingSession, SourceDocument } from '../../domain/types';
import { CORPUS_DEMO_SESSION, CORPUS_DOCUMENTS, CORPUS_RECORD, DEMO_QUESTION } from '../../data/corpus';
import { deriveSession, isMedicationQuestion } from './format';

/** Everything the Clinician surface reads, behind one stable shape. */
export interface Corpus {
  /** The reconciled, FHIR-shaped view assembled from every Claim. */
  record: LongitudinalRecord;
  /** The source documents, so a citation can name the artefact it quotes. */
  documents: SourceDocument[];
  /** The pre-fillable demonstration question. */
  demoQuestion: string;
  /** Resolve a SourceDocument by id (for evidence and contradiction display). */
  documentById(id: string): SourceDocument | undefined;
  /** Resolve a Claim by id (for supersession and contradiction display). */
  claimById(id: string): Claim | undefined;
  /** Answer a question against the record, returning a fully-cited session. */
  ask(question: string): ReadingSession;
}

export function useCorpus(): Corpus {
  return useMemo(() => {
    const record = CORPUS_RECORD;
    const documents = CORPUS_DOCUMENTS;
    const docs = new Map(documents.map((d) => [d.id, d]));
    const claims = new Map(record.claims.map((c) => [c.id, c]));
    return {
      record,
      documents,
      demoQuestion: DEMO_QUESTION,
      documentById: (id) => docs.get(id),
      claimById: (id) => claims.get(id),
      ask: (question) =>
        isMedicationQuestion(question) ? CORPUS_DEMO_SESSION : deriveSession(record, question),
    };
  }, []);
}
