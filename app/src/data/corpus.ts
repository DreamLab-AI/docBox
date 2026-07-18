// Deterministic synthetic corpus for the main-branch clinician demonstrator (PRD-009).
// ONE fictional patient, a handful of mixed documents, and the typed, evidence-linked
// record grounded from them. This is the offline single source of truth — the server's
// mock grounding and reading mesh read it, exactly as the control plane reads mock.ts.
//
// Every EvidenceSpan is computed from the document text by `span()`, so the DDD-004
// invariant "quote === text.slice(start, end)" holds by construction and a citation is
// always checkable. Dates are fixed (Date.UTC, no clock) so the demo is reproducible.
//
// The deliberately seeded scenarios (PRD-009) carry their ids so the demo can name them:
//   S1  a corrected laboratory result supersedes the earlier one
//   S2  the GP repeat list contradicts the current (clinic/discharge) medication — FLAGSHIP
//   S3  a duplicated clinic letter (near-identical), to show de-duplication
//   S5  a working diagnosis later refuted
// (S4 cross-document chain and S6 allergy-absence are represented by the document set.)

import type {
  SourceDocument,
  Claim,
  Contradiction,
  EvidenceSpan,
  LongitudinalRecord,
  ReadingSession,
} from '../domain/types';

export const PATIENT_LABEL = 'Margaret Aldington (synthetic)';

const D = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);

// ── Source documents (frozen text) ───────────────────────────────────────────

function makeDoc(
  d: Omit<SourceDocument, 'documentId'> & { documentId?: string },
): SourceDocument {
  return d;
}

export const CORPUS_DOCUMENTS: SourceDocument[] = [
  makeDoc({
    id: 'src-referral',
    name: 'GP referral to cardiology.pdf',
    kind: 'referral',
    provenance: 'Fieldway Surgery, Dr A. Okafor',
    date: D(2023, 1, 15),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S4',
    text:
      'Dear Cardiology, I would be grateful for your assessment of Mrs Margaret Aldington, ' +
      'a 62-year-old with poorly controlled hypertension. She currently takes amlodipine 5mg ' +
      'once daily. Blood pressure in clinic today 168/98. No known drug allergies recorded at referral.',
  }),
  makeDoc({
    id: 'src-clinic',
    name: 'Cardiology clinic letter.pdf',
    kind: 'clinic_letter',
    provenance: 'St Brannock Hospital, Cardiology, Dr P. Nair',
    date: D(2023, 2, 20),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S4',
    text:
      'Thank you for referring Mrs Aldington. Impression: essential hypertension. ' +
      'I have increased her amlodipine to 10mg once daily and will review in three months. ' +
      'Of note, she reports a penicillin allergy (rash), which was not on the referral.',
  }),
  makeDoc({
    id: 'src-clinic-dup',
    name: 'Cardiology clinic letter (copy).pdf',
    kind: 'clinic_letter',
    provenance: 'St Brannock Hospital, Cardiology (duplicate scan)',
    date: D(2023, 2, 20),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S3',
    text:
      'Thank you for referring Mrs Aldington. Impression: essential hypertension. ' +
      'I have increased her amlodipine to 10mg once daily and will review in three months. ' +
      'Of note, she reports a penicillin allergy (rash), which was not on the referral.',
  }),
  makeDoc({
    id: 'src-lab-mar',
    name: 'U&E result 10 Mar.pdf',
    kind: 'lab_report',
    provenance: 'St Brannock Hospital Laboratory',
    date: D(2023, 3, 10),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S1',
    text:
      'Urea and electrolytes, sample 10/03/2023. Sodium 139 mmol/L. Potassium 5.9 mmol/L (HIGH). ' +
      'Creatinine 78 umol/L. Query haemolysed sample; suggest repeat.',
  }),
  makeDoc({
    id: 'src-lab-mar-corrected',
    name: 'U&E result 10 Mar CORRECTED.pdf',
    kind: 'lab_report',
    provenance: 'St Brannock Hospital Laboratory',
    date: D(2023, 3, 12),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S1',
    text:
      'CORRECTED REPORT, sample 10/03/2023. The previous potassium was raised due to haemolysis. ' +
      'Repeat potassium 4.2 mmol/L (normal). Sodium 139 mmol/L. Creatinine 78 umol/L.',
  }),
  makeDoc({
    id: 'src-discharge',
    name: 'Discharge summary.pdf',
    kind: 'discharge',
    provenance: 'St Brannock Hospital, Acute Medicine',
    date: D(2023, 6, 5),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S2',
    text:
      'Discharge summary. Admitted with chest pain, ruled out for acute coronary syndrome. ' +
      'Discharge medications: amlodipine 10mg once daily; atorvastatin 20mg once daily. ' +
      'Working diagnosis of stable angina to be confirmed by outpatient testing. Allergy: penicillin.',
  }),
  makeDoc({
    id: 'src-gp-repeat',
    name: 'GP repeat medication list.pdf',
    kind: 'medication_list',
    provenance: 'Fieldway Surgery, repeat prescriptions',
    date: D(2023, 9, 1),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S2',
    text:
      'Current repeat medication for Margaret Aldington, printed 01/09/2023: ' +
      'amlodipine 5mg once daily; atorvastatin 20mg once daily. Please reorder 7 days before running out.',
  }),
  makeDoc({
    id: 'src-angio',
    name: 'Angiography report.pdf',
    kind: 'radiology',
    provenance: 'St Brannock Hospital, Cardiac Investigations',
    date: D(2023, 8, 12),
    ocrRoute: 'local',
    handwriting: false,
    seedId: 'S5',
    text:
      'CT coronary angiography, 12/08/2023. Unobstructed coronary arteries. ' +
      'No evidence of obstructive coronary artery disease. The earlier working diagnosis of ' +
      'stable angina is not supported by these findings.',
  }),
  makeDoc({
    id: 'src-drugchart',
    name: 'Ward drug chart (scan).jpg',
    kind: 'gp_notes',
    provenance: 'St Brannock Hospital, ward 6 (handwritten)',
    date: D(2023, 6, 3),
    ocrRoute: 'local',
    handwriting: true,
    text:
      'Drug chart: amlodipine 10mg OD given 03/06. Paracetamol 1g PRN. ' +
      'Handwriting partially legible; pharmacist review advised.',
  }),
];

const byId = new Map(CORPUS_DOCUMENTS.map((d) => [d.id, d]));

/** Compute an EvidenceSpan for the (nth) occurrence of `quote` in a document's text.
 *  Throws at load if the quote is absent, so the corpus cannot ship a dangling citation. */
function span(docId: string, quote: string, nth = 0): EvidenceSpan {
  const doc = byId.get(docId);
  if (!doc) throw new Error(`corpus: unknown document ${docId}`);
  let idx = -1;
  for (let i = 0; i <= nth; i += 1) idx = doc.text.indexOf(quote, idx + 1);
  if (idx < 0) throw new Error(`corpus: quote not found in ${docId}: "${quote}"`);
  return { docId, start: idx, end: idx + quote.length, quote };
}

// ── Claims (grounded from the documents) ─────────────────────────────────────

export const CORPUS_CLAIMS: Claim[] = [
  {
    id: 'c-htn',
    category: 'diagnosis',
    label: 'Essential hypertension',
    value: 'essential hypertension',
    fhir: { resource: 'Condition', element: 'code', system: 'SNOMED', code: '59621000', display: 'Essential hypertension' },
    evidence: span('src-clinic', 'essential hypertension'),
    confidence: { score: 0.96, method: 'ocr+ner' },
    validity: { from: D(2023, 2, 20), precision: 'day' },
    standing: 'active',
  },
  {
    id: 'c-amlo-5-referral',
    category: 'medication',
    label: 'Amlodipine 5mg once daily',
    value: 'amlodipine 5 mg PO OD',
    fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept', system: 'dm+d', display: 'Amlodipine 5mg tablets' },
    evidence: span('src-referral', 'amlodipine 5mg once daily'),
    confidence: { score: 0.93, method: 'ocr+ner' },
    validity: { from: D(2023, 1, 15), to: D(2023, 2, 20), precision: 'day' },
    standing: 'superseded',
  },
  {
    id: 'c-amlo-10-clinic',
    category: 'medication',
    label: 'Amlodipine 10mg once daily',
    value: 'amlodipine 10 mg PO OD',
    fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept', system: 'dm+d', display: 'Amlodipine 10mg tablets' },
    evidence: span('src-clinic', 'amlodipine to 10mg once daily'),
    confidence: { score: 0.95, method: 'ocr+ner' },
    validity: { from: D(2023, 2, 20), precision: 'day' },
    standing: 'active',
    supersedesClaimId: 'c-amlo-5-referral',
  },
  {
    id: 'c-allergy-pen',
    category: 'allergy',
    label: 'Penicillin allergy (rash)',
    value: 'penicillin',
    fhir: { resource: 'AllergyIntolerance', element: 'code', system: 'SNOMED', code: '294505008', display: 'Penicillin allergy' },
    evidence: span('src-clinic', 'penicillin allergy (rash)'),
    confidence: { score: 0.94, method: 'ocr+ner' },
    validity: { from: D(2023, 2, 20), precision: 'day' },
    standing: 'active',
  },
  {
    id: 'c-k-high',
    category: 'lab',
    label: 'Potassium 5.9 mmol/L (high)',
    value: '5.9 mmol/L',
    fhir: { resource: 'Observation', element: 'valueQuantity', system: 'LOINC', code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' },
    evidence: span('src-lab-mar', 'Potassium 5.9 mmol/L (HIGH)'),
    confidence: { score: 0.9, method: 'ocr+ner' },
    validity: { from: D(2023, 3, 10), to: D(2023, 3, 12), precision: 'day' },
    standing: 'superseded',
  },
  {
    id: 'c-k-normal',
    category: 'lab',
    label: 'Potassium 4.2 mmol/L (normal, corrected)',
    value: '4.2 mmol/L',
    fhir: { resource: 'Observation', element: 'valueQuantity', system: 'LOINC', code: '2823-3', display: 'Potassium [Moles/volume] in Serum or Plasma' },
    evidence: span('src-lab-mar-corrected', 'Repeat potassium 4.2 mmol/L (normal)'),
    confidence: { score: 0.95, method: 'ocr+ner' },
    validity: { from: D(2023, 3, 12), precision: 'day' },
    standing: 'active',
    supersedesClaimId: 'c-k-high',
    seedId: 'S1',
  },
  {
    id: 'c-amlo-10-discharge',
    category: 'medication',
    label: 'Amlodipine 10mg once daily (discharge)',
    value: 'amlodipine 10 mg PO OD',
    fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept', system: 'dm+d', display: 'Amlodipine 10mg tablets' },
    evidence: span('src-discharge', 'amlodipine 10mg once daily'),
    confidence: { score: 0.95, method: 'ocr+ner' },
    validity: { from: D(2023, 6, 5), precision: 'day' },
    standing: 'active',
    seedId: 'S2',
  },
  {
    id: 'c-amlo-5-gprepeat',
    category: 'medication',
    label: 'Amlodipine 5mg once daily (GP repeat list)',
    value: 'amlodipine 5 mg PO OD',
    fhir: { resource: 'MedicationStatement', element: 'medicationCodeableConcept', system: 'dm+d', display: 'Amlodipine 5mg tablets' },
    evidence: span('src-gp-repeat', 'amlodipine 5mg once daily'),
    confidence: { score: 0.93, method: 'ocr+ner' },
    validity: { from: D(2023, 9, 1), precision: 'day' },
    standing: 'active',
    seedId: 'S2',
  },
  {
    id: 'c-angina',
    category: 'diagnosis',
    label: 'Stable angina (working diagnosis, later refuted)',
    value: 'stable angina',
    fhir: { resource: 'Condition', element: 'code', system: 'SNOMED', code: '233821000', display: 'Stable angina' },
    evidence: span('src-discharge', 'Working diagnosis of stable angina'),
    confidence: { score: 0.82, method: 'ocr+ner' },
    validity: { from: D(2023, 6, 5), to: D(2023, 8, 12), precision: 'day' },
    standing: 'refuted',
    seedId: 'S5',
  },
];

// ── Contradictions (surfaced, never silently resolved) ───────────────────────

export const CORPUS_CONTRADICTIONS: Contradiction[] = [
  {
    id: 'ct-amlo-dose',
    claimIds: ['c-amlo-10-discharge', 'c-amlo-5-gprepeat'],
    kind: 'medication',
    note: 'Discharge summary lists amlodipine 10mg; the later GP repeat list still shows 5mg.',
    seedId: 'S2',
  },
];

export const CORPUS_RECORD: LongitudinalRecord = {
  patientLabel: PATIENT_LABEL,
  claims: CORPUS_CLAIMS,
  contradictions: CORPUS_CONTRADICTIONS,
  documentIds: CORPUS_DOCUMENTS.map((d) => d.id),
  builtAt: D(2023, 9, 2),
};

// ── A worked ReadingSession for the flagship S2 Question (demo act 4–5) ───────
// The mock reading mesh returns this for a medications-and-timeline Question; the
// live mesh produces the same shape from the record.

export const DEMO_QUESTION = 'What is this patient taking, and since when?';

export const CORPUS_DEMO_SESSION: ReadingSession = {
  id: 'rs-demo-s2',
  question: DEMO_QUESTION,
  askedBy: 'clinician',
  askedAt: D(2023, 9, 2),
  findings: [
    {
      specialist: 'medications',
      summary: 'Current antihypertensive is amlodipine; the recorded dose conflicts between sources.',
      claimIds: ['c-amlo-10-clinic', 'c-amlo-10-discharge', 'c-amlo-5-gprepeat'],
      evidence: [
        span('src-clinic', 'amlodipine to 10mg once daily'),
        span('src-discharge', 'amlodipine 10mg once daily'),
        span('src-gp-repeat', 'amlodipine 5mg once daily'),
      ],
    },
    {
      specialist: 'chronology',
      summary: 'The dose was raised from 5mg to 10mg in February 2023; the GP list printed in September still says 5mg.',
      claimIds: ['c-amlo-5-referral', 'c-amlo-10-clinic', 'c-amlo-5-gprepeat'],
      evidence: [span('src-gp-repeat', 'printed 01/09/2023')],
    },
  ],
  answer: {
    sentences: [
      {
        text: 'The patient is on amlodipine for hypertension, increased to 10mg once daily at the cardiology clinic in February 2023.',
        evidence: [span('src-clinic', 'amlodipine to 10mg once daily')],
      },
      {
        text: 'The June 2023 discharge summary also records amlodipine 10mg once daily.',
        evidence: [span('src-discharge', 'amlodipine 10mg once daily')],
      },
      {
        text: 'However, the GP repeat list printed in September 2023 still shows amlodipine 5mg, which contradicts the current 10mg dose and should be reconciled.',
        evidence: [span('src-gp-repeat', 'amlodipine 5mg once daily')],
        contradictionId: 'ct-amlo-dose',
      },
      {
        text: 'She also takes atorvastatin 20mg once daily.',
        evidence: [span('src-discharge', 'atorvastatin 20mg once daily')],
      },
    ],
    gaps: ['Adherence and any doses taken at home are not evidenced by the record.'],
  },
};
