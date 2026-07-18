# Synthetic patient corpus

The demonstrator's clinical data: one fictional patient, a mixed-format document
trail, and six deliberately seeded scenarios the demo exists to surface. This
directory holds the corpus's build recipe and its machine-readable seed manifest.

> Not real data. Every document is authored and fictional. The corpus is reviewed
> for plausibility and NHS idiom, not clinically validated, and must never be read
> as a benchmark of medical truth (PRD-009 non-goals).

## What ships in the demo

The shipped demonstrator corpus is the deterministic set in
[`app/src/data/corpus.ts`](../../app/src/data/corpus.ts): one synthetic patient
(Margaret Aldington), nine documents, and the typed, evidence-linked record
grounded from them. It is frozen and reproducible — dates are fixed and every
citation's `quote` equals `text.slice(start, end)` by construction (DDD-004) — so
the demo runs the same way every time and the NER sidecar and reading mesh read
one source of truth.

[`seed-manifest.json`](./seed-manifest.json) names, for each seeded scenario,
the documents in `corpus.ts` that carry it. A reader can find every seed from the
manifest alone (a PRD-009 success criterion), and PRD-010's extraction can be
scored against it as known truth.

## The six seeds

The seeded contradictions, supersessions and duplicates are the corpus's most
important requirement, not defects to tolerate: they are the material the demo
script (PRD-008) and the reading mesh (PRD-011) exist to surface. Without them the
demonstrator would show retrieval, never reconciliation.

| Id | Scenario | Documents | What it shows |
|---|---|---|---|
| S1 | Corrected lab result supersedes the earlier one | `src-lab-mar`, `src-lab-mar-corrected` | Supersession by recency and validity, not similarity |
| S2 | Discharge medication contradicts the GP repeat list — **flagship** | `src-discharge`, `src-gp-repeat` | Contradiction surfacing (PRD-008 act 5) |
| S3 | Duplicated clinic letter | `src-clinic`, `src-clinic-dup` | De-duplication that keeps both documents' provenance |
| S4 | Referral → clinic → discharge chain | `src-referral`, `src-clinic`, `src-discharge` | Cross-document reference following and attribution |
| S5 | Working diagnosis later refuted | `src-discharge`, `src-angio` | A Claim refuted and retained, not deleted |
| S6 | Allergy present in some documents, absent from others | `src-clinic`, `src-discharge`, `src-referral`, `src-gp-repeat` | Absence as a finding; allergies weighted to persist |

## Build recipe (PRD-009)

The full corpus is authored, not generated end-to-end. The division of labour is
strict: **Synthea owns the coded events, dates and FHIR structure; humans own the
prose.** The recipe from [PRD-009](../../docs/reference/prd/PRD-009-synthetic-patient-corpus.md):

1. **Backbone.** One patient from a Synthea (Apache-2.0) Generic Module Framework
   module (`-p 1 -s <seed>`, seed recorded), producing a FHIR R4 bundle as the
   machine-readable ground truth for a UK-plausible multi-year condition journey.
2. **Documents.** Hand-rendered from PRSB templates (OGL v3.0, attribution kept),
   in the real format each document type takes — referral (e-RS), outpatient
   letters, discharge summary, pathology and radiology reports, repeat-medication
   list (dm+d-coded), GP notes, consent form, e-consult message. Free text is
   drafted on the in-box model, so even the corpus build honours the
   data-stays-in-the-box message, then hand-edited to NHS idiom before freezing.
3. **Handwriting artefacts.** A drug chart, an annotated letter and an older note,
   rendered with MIT-licensed handwriting synthesis (calligrapher.ai / sjvasquez
   handwriting-synthesis) then print-and-scanned or given simulated scan noise.
   These exercise the honest OCR limits PRD-007 records, on stage in act 3.
4. **Seeds.** The six patterns above, each recorded in this manifest naming its
   carrying documents.
5. **Freeze.** The FHIR ground-truth bundle and this seed manifest live beside the
   documents, clearly marked as build artefacts rather than patient documents.

The deterministic `corpus.ts` set is the frozen, shipped realisation of that
recipe, sized to stay near context-scale (ADR-011): enough documents to read like
a record, few enough to fit.

## Licence posture

Everything in the build chain is permissive, so the finished corpus ships and
redistributes freely:

- **Included:** Synthea (Apache-2.0); PRSB templates (OGL v3.0, attribution kept);
  handwriting synthesis tools (MIT); GNHK (CC-BY-4.0) as a style reference only —
  no image from it enters the corpus.
- **Excluded from the whole chain, including as model-prompt material:** MIMIC
  (PhysioNet credentialed data-use agreement) and IAM (non-commercial).
- Drug naming uses dm+d (OGL), the one UK terminology safe to embed. Restricted
  terminologies (SNOMED, UMLS) are a mount-time concern for the pipeline, not a
  corpus concern
  ([ADR-013](../../docs/reference/adr/ADR-013-fhir-record-and-terminology-mount.md)).

`main` relaxes the permissive-only rule for the model stack that reads the corpus
(ADR-012 may add a restricted checkpoint on the box), but the corpus itself stays
permissive and publishable. Its restricted-terminology handling stays a runtime
mount, never embedded here.

## Files

| File | Purpose |
|---|---|
| `seed-manifest.json` | S1–S6 mapped to the `corpus.ts` document ids, with claim and contradiction ids |
| `README.md` | this file — build recipe, seeds and licence posture |

Placed under `corpus/clinical/` so it sits apart from the top-level research
corpus (`corpus/README.md` and its numbered survey directories), which is a
different artefact entirely.
