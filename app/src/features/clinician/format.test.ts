// Unit tests for the Clinician pure helpers: date/confidence formatting, the
// standing/specialist vocabularies, question routing, and the record-derived
// reading session. Values are asserted against the deterministic corpus so a
// regression in grounding shows up here.
import { describe, it, expect } from 'vitest';
import {
  fmtDate,
  fmtValidity,
  formatPct,
  fmtConfidence,
  isMedicationQuestion,
  deriveFindings,
  deriveSession,
  claimLabel,
  claimDoc,
  contradictionFor,
  SPECIALIST_FOR_CATEGORY,
  CATEGORY_LABEL,
} from './format';
import { CORPUS_RECORD, CORPUS_CLAIMS, CORPUS_DOCUMENTS, DEMO_QUESTION } from '../../data/corpus';

const claim = (id: string) => CORPUS_CLAIMS.find((c) => c.id === id)!;
const docById = (id: string) => CORPUS_DOCUMENTS.find((d) => d.id === id);

describe('formatting', () => {
  it('formats a document date (noon UTC, timezone-stable)', () => {
    expect(fmtDate(Date.UTC(2023, 5, 5, 12))).toBe('5 Jun 2023');
  });

  it('formats an open validity window as ongoing and a closed one as a range', () => {
    expect(fmtValidity({ from: Date.UTC(2023, 1, 20, 12), precision: 'day' })).toMatch(/ – ongoing$/);
    expect(fmtValidity({ from: Date.UTC(2023, 0, 15, 12), to: Date.UTC(2023, 1, 20, 12), precision: 'day' })).toMatch(/ – 20 Feb 2023$/);
  });

  it('formats confidence as a whole percent and with its method', () => {
    expect(formatPct(0.955)).toBe('96%');
    expect(formatPct(0.9)).toBe('90%');
    expect(fmtConfidence({ score: 0.94, method: 'ocr+ner' })).toBe('94% · ocr+ner');
  });
});

describe('question routing', () => {
  it('routes the demo question to the medications flow', () => {
    expect(isMedicationQuestion(DEMO_QUESTION)).toBe(true);
    expect(isMedicationQuestion('Which tablets is she on?')).toBe(true);
  });

  it('routes a non-medications question elsewhere', () => {
    expect(isMedicationQuestion('What conditions does she have?')).toBe(false);
  });
});

describe('reference resolution', () => {
  it('labels a resolved claim and falls back for a missing one', () => {
    expect(claimLabel(claim('c-htn'))).toBe('Essential hypertension');
    expect(claimLabel(undefined)).toBe('referenced claim not found');
  });

  it('resolves a claim to its evidence document, undefined for a missing claim', () => {
    expect(claimDoc(claim('c-amlo-10-discharge'), docById)?.id).toBe('src-discharge');
    expect(claimDoc(undefined, docById)).toBeUndefined();
  });

  it('finds a contradiction by id, and none for an absent or missing id', () => {
    expect(contradictionFor(CORPUS_RECORD, 'ct-amlo-dose')?.kind).toBe('medication');
    expect(contradictionFor(CORPUS_RECORD, 'ct-does-not-exist')).toBeUndefined();
    expect(contradictionFor(CORPUS_RECORD, undefined)).toBeUndefined();
  });

  it('maps every claim category to a specialist', () => {
    expect(SPECIALIST_FOR_CATEGORY.medication).toBe('medications');
    expect(SPECIALIST_FOR_CATEGORY.allergy).toBe('correspondence');
    expect(SPECIALIST_FOR_CATEGORY.procedure).toBe('chronology');
    expect(CATEGORY_LABEL.lab).toBe('Lab result');
  });
});

describe('deriveFindings', () => {
  const findings = deriveFindings(CORPUS_CLAIMS);

  it('groups claims under specialists in the fixed order, dropping empty ones', () => {
    expect(findings[0].specialist).toBe('medications');
    // No encounter/procedure claims in the corpus, so chronology is dropped.
    expect(findings.map((f) => f.specialist)).not.toContain('chronology');
    expect(findings.map((f) => f.specialist)).toEqual(['medications', 'labs', 'diagnoses', 'correspondence']);
  });

  it('uses singular vs plural in the summary', () => {
    const meds = findings.find((f) => f.specialist === 'medications')!;
    const corr = findings.find((f) => f.specialist === 'correspondence')!;
    expect(meds.claimIds.length).toBeGreaterThan(1);
    expect(meds.summary).toMatch(/claims read/);
    expect(corr.claimIds).toHaveLength(1);
    expect(corr.summary).toBe('1 claim read across the record.');
  });
});

describe('deriveSession', () => {
  const session = deriveSession(CORPUS_RECORD, 'What conditions does she have?');

  it('answers only with active claims, each carrying its own evidence', () => {
    expect(session.id).toBe('rs-derived');
    expect(session.askedAt).toBe(CORPUS_RECORD.builtAt);
    const activeCount = CORPUS_CLAIMS.filter((c) => c.standing === 'active').length;
    expect(session.answer.sentences).toHaveLength(activeCount);
    for (const s of session.answer.sentences) {
      expect(s.evidence.length).toBeGreaterThanOrEqual(1);
    }
    // Superseded and refuted values must not surface in the derived answer.
    const text = session.answer.sentences.map((s) => s.text).join(' ');
    expect(text).toMatch(/Potassium 4\.2/);   // active, corrected
    expect(text).not.toMatch(/Potassium 5\.9/); // superseded
    expect(text).not.toMatch(/Stable angina/);  // refuted
  });

  it('carries an honest gap and the full specialist fan-out', () => {
    expect(session.answer.gaps).toHaveLength(1);
    expect(session.findings.length).toBeGreaterThan(0);
  });
});
