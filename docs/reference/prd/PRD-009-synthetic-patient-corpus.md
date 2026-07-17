# PRD-009 — Synthetic Patient Corpus

Status: Draft · Owner: DreamLab · Created 2026-07-17 · Realises PRD-000 (`main` demonstrator pivot — corpus) · Supersedes: none

## Summary

The demonstrator's data does not exist yet; this PRD is the recipe for building it. One fictional
patient with a multi-year condition journey, authored from Synthea as the coded FHIR backbone,
with a document corpus hand-rendered from PRSB templates in the real formats care produces, plus a
few scanned handwritten artefacts synthesised with MIT-licensed tools. Contradictions,
supersessions, and duplicates are seeded deliberately and recorded as requirements.

If you remember one thing: **the seeded Contradictions, Supersessions, and duplicates are not
defects to tolerate — they are the corpus's most important requirement, because they are the
material the demo script ([PRD-008](./PRD-008-clinician-demonstrator.md)) and the Reading mesh
([PRD-011](./PRD-011-clinician-query-and-reading-mesh.md)) exist to surface.**

## Problem

The demonstrator needs one patient's realistic, mixed-format document trail, and nothing usable
exists:

- Real records are off-limits. No legal or ethical basis for a showcase, and using them would
  trigger every framework the brief's governance table shows does not fire for synthetic data.
- The available synthetic sets are the wrong shape. Synthea's own note output is templated and
  generic, not NHS idiom; Simulacrum and NHS England's artificial data are tabular aggregates, not
  a single patient's documents; MIMIC-IV-Note is real de-identified US data under a credentialed
  DUA and is excluded on licence.
- A demo corpus that were clean and consistent would defeat the purpose. Real longitudinal records
  contain corrected results, conflicting medication lists, and duplicate letters; a corpus without
  them lets the demonstrator show only retrieval, never reconciliation.

## Goals

1. Author one fictional patient via a Synthea (Apache-2.0) Generic Module Framework module,
   producing a FHIR R4 bundle as the machine-readable ground truth for a UK-plausible multi-year
   condition journey.
2. Hand-render a document corpus from PRSB templates (OGL v3.0), driven off Synthea's coded events,
   in the real formats each document type takes.
3. Produce scanned handwritten artefacts — a drug chart, an annotated letter, an older note — via
   MIT-licensed handwriting synthesis followed by print-and-scan or simulated scan noise.
4. Seed six contradiction/supersession/duplicate patterns as first-class, traceable requirements.
5. Keep every input inside the permissive rule (Apache-2.0 + MIT + OGL v3.0 + CC-BY-4.0), so the
   finished corpus is freely redistributable.
6. Store the corpus on the user-data plane, per project, snapshot-protected.

## Non-goals

- A population dataset, or maintenance of a UK-localised Synthea fork. One patient, hand-finished;
  Synthea supplies coded events and dates, not prose.
- Clinical validity. The corpus is reviewed for plausibility and NHS idiom, not clinically
  validated; it must never be mistaken for a benchmark of medical truth.
- Ingesting the corpus ([PRD-010](./PRD-010-clinical-grounding-pipeline.md)) or querying it
  ([PRD-011](./PRD-011-clinician-query-and-reading-mesh.md)).
- Real data of any kind, at any stage of the build.

## Users and jobs

| User | Job this does |
|---|---|
| Corpus author | Build the patient, render the documents, seed and record the conflicts |
| Presenter (PRD-008) | Know which documents carry which seed so the script lands on cue |
| Pipeline evaluator (PRD-010) | Score extraction against the FHIR bundle as ground truth |

## The one-patient backbone

Synthea generates one patient (`-p 1 -s <seed>`, seed recorded for reproducibility) from an
authored Generic Module Framework JSON module describing the condition journey. Synthea's defaults
model US census and care patterns and its note exporter is generic, so the division of labour is
strict: **Synthea owns the coded events, dates, and FHIR structure; humans own the prose.**
Free text is LLM-drafted on the in-box model — so even the corpus build honours the
data-stays-in-the-box message — then hand-edited to NHS idiom before the corpus is frozen.

## Document set

Each SourceDocument is rendered in the format its real counterpart takes, from the PRSB standard
that defines it (owned by NHS England under OGL v3.0 since 1 January 2026):

| Document | Format | Template basis |
|---|---|---|
| GP referral letter (e-RS) | DOCX + PDF | Clinical Referral Information Standard |
| Outpatient clinic letters (several) | DOCX + PDF | PRSB Outpatient Letter |
| Discharge summary | PDF | PRSB eDischarge Summary |
| Pathology reports | PDF, HL7v2-shaped values | DiagnosticReport-aligned |
| Radiology report | PDF narrative | DiagnosticReport-aligned |
| Repeat-medication list | PDF, dm+d-coded | GP system print idiom |
| GP consultation notes | Free text, SNOMED-style coding | GP record idiom |
| DNACPR / consent form | Scanned PDF | ReSPECT-style layout |
| Patient e-consult message | `.eml` | e-consult idiom |
| Handwritten drug chart, annotated letter, older note | Scanned JPEG/PDF | see below |

## Handwriting artefacts

Scanned handwriting is not nostalgia: a 2026 BMJ survey of 182 trusts found only a quarter fully
electronic, so paper drug charts, Lloyd George GP records, and handwritten DNACPR forms remain
realistic — and they exercise the honest OCR limits PRD-007 established, on stage in act 3 of the
demo. Generation path: MIT-licensed handwriting synthesis (calligrapher.ai / sjvasquez
handwriting-synthesis) renders the text, then print-and-scan or simulated noise produces the
artefact. The IAM database is excluded (non-commercial licence); GNHK (CC-BY-4.0) may inform
style choices only — no image from it enters the corpus.

## Seeded conflicts (first-class requirements)

Six patterns, seeded on purpose, each recorded in a corpus manifest naming the documents that
carry it — so PRD-008's script can land on cue and PRD-010's detection can be tested against known
truth. These conflicts are the demo script's material; without them the demonstrator shows
retrieval, not reconciliation.

| Id | Seed | Documents involved | What it lets the demonstrator show |
|---|---|---|---|
| S1 | Laboratory result later corrected by an amended report | Two pathology reports | Supersession: recency and validity govern, not similarity |
| S2 | Discharge medication list conflicts with the GP repeat list | Discharge summary, repeat-medication list | Contradiction surfacing — the flagship demo moment (PRD-008 act 5) |
| S3 | Duplicate near-identical clinic letters | Two outpatient letters | De-duplication without losing either document's provenance |
| S4 | Referral → clinic letter → discharge cross-reference chain | Three documents | Cross-document reference following and attribution |
| S5 | Working diagnosis later refuted | GP note, later clinic letter | A Claim's mutability: refuted and retained, not deleted |
| S6 | Allergy recorded in one document, absent from another | Discharge summary, GP record | Absence as a finding; staleness weighting (allergies persist) |

## Licence posture

Everything in the build chain is permissive, so the corpus ships and redistributes freely:

- **Included**: Synthea (Apache-2.0); PRSB templates (OGL v3.0, attribution kept); handwriting
  synthesis tools (MIT); GNHK (CC-BY-4.0) as style reference only.
- **Excluded**: MIMIC (PhysioNet credentialed DUA) and IAM (non-commercial) — neither appears
  anywhere in the chain, including as model-prompt material.
- Drug naming uses dm+d (OGL), the one UK terminology safe to embed; restricted terminologies are
  a mount-time concern for the pipeline, not a corpus concern
  ([ADR-013](../adr/ADR-013-fhir-record-and-terminology-mount.md)).

## Storage

The corpus lives on the user-data plane, per project, under the same snapshot and rollback
protection as any uploaded document (PRD-006, DDD-002). Dropping it into a project is an ordinary
audited ingest; the FHIR ground-truth bundle and the seed manifest live beside it, clearly marked
as build artefacts rather than patient documents.

## Success criteria

- One FHIR R4 bundle plus a document corpus in the listed formats, regenerable from the recorded
  Synthea seed and module.
- All six seeds present; the manifest names each seed's carrying documents, and a reader can find
  every seed from the manifest alone.
- Every input's licence recorded; no MIMIC or IAM content anywhere in the build chain.
- The handwritten artefacts push OCR confidence low enough to exercise the review queue (PRD-007)
  without stalling the demo narrative.
- The corpus ingests through PRD-010 as-is, and extraction scored against the bundle shows the
  seeded events were recoverable.
- Corpus size lands where the retrieval design needs it: enough documents to feel like a real
  record, few enough that the record stays near context-sized (ADR-011's boundary).

## Open questions (for the client brief)

- Which condition journey? It needs multiple years, more than one speciality, and plausible
  medication changes; the choice shapes which seeds feel natural.
- Where in the 50–100 document range does the corpus land, given the context-size boundary?
- Who reviews for NHS idiom before the corpus freezes — is a clinical advisor pass available?

## Traceability

Binding ground truth: [../../demonstrator-brief.md](../../demonstrator-brief.md). Product shape:
[PRD-000](./PRD-000-product-shape.md). Consumers: [PRD-008](./PRD-008-clinician-demonstrator.md)
(script stands on the seeds), [PRD-010](./PRD-010-clinical-grounding-pipeline.md) (ingests the
documents, evaluates against the bundle). Record shape the bundle grounds:
[ADR-013](../adr/ADR-013-fhir-record-and-terminology-mount.md). Storage plane and audit: PRD-006,
DDD-002. OCR limits the artefacts exercise: PRD-007. Domain vocabulary:
[DDD-004](../ddd/DDD-004-clinical-corpus-domain.md). Research: RuVector `project-state` digest
`docbox-research-dataset` (generators, templates, handwriting, licences, contradiction prior art).
