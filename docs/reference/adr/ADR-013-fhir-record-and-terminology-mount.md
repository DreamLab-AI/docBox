# ADR-013 — FHIR Record and Terminology Mount

Status: Accepted · Date: 2026-07-17 · Deciders: DreamLab

## Context

Three interlocking decisions sit under the LongitudinalRecord: what shape it takes internally,
which toolkit manipulates that shape from TypeScript, and how Claims get clinical codes when the
major UK terminologies carry licences that forbid redistribution.

The representation question has an obvious front-runner. The FHIR R4 specification is published
under CC0 — public domain, no licence risk — and Synthea (Apache-2.0), the corpus backbone chosen
in [PRD-009](../prd/PRD-009-synthetic-patient-corpus.md), emits FHIR R4 bundles natively, so the
machine-readable ground truth and the internal representation align without translation.

The terminology question turns on the licence split, and on which branch we build. The verified
positions (RuVector digests `docbox-research-openmed` and `docbox-research-retrieval`):

| Terminology | Licence | Redistribute in a permissive image (`vanilla`) | Embed on the `main` box |
|---|---|---|---|
| SNOMED CT (UK edition) | TRUD / NHS England Affiliate — free at point of use, redistribution-restricted | **No** | **Yes**, with a TRUD account |
| UMLS | NLM licence, restricted redistribution | **No** | **Yes**, with a UTS account |
| ICD-10 | WHO-licensed | **No** | **Yes**, under WHO free-use terms |
| dm+d | Open Government Licence v3.0 | **Yes**, with attribution | **Yes** |
| MeSH / HPO / MONDO | Permissive (CC-BY class) | **Yes** | **Yes** |

OpenMed does NER only ([ADR-012](./ADR-012-clinical-grounding-stack.md)); nothing in the grounding
stack links entities to codes, so whatever coding exists must come from this decision. The
[demonstrator brief](../../demonstrator-brief.md) sets the branch rule: `vanilla` ships permissive
only and can embed nothing past the permissive rows; `main` is a one-shot demo, not redistributed,
so it may embed any of them on the box under their free-to-use terms, provided the restricted files
never enter this public repo.

## Decision

**1. FHIR R4 is the internal shape of the LongitudinalRecord.** Patient, Condition,
MedicationStatement, Observation, DocumentReference and Encounter are the working resource set.
FHIR is the internal vocabulary only: the demonstrator is not an EPR and writes back to no care
system ([demonstrator brief](../../demonstrator-brief.md), "What it is not").

**2. The Medplum TypeScript SDK (Apache-2.0) is the FHIR toolkit** — typed resources, validation
and helpers, FHIR-native rather than generated bindings, and production-proven (Medplum reports
20M+ patient records in production; vendor figure). We consume the SDK only, not the Medplum
server or its Postgres stack — pulling in a second server would invert the distillation rule.

**3. The Claim model.** Every Claim is
`{ typed value, FHIR mapping, EvidenceSpan, confidence, temporal validity interval }`. The
validity interval is what makes the record longitudinal rather than merely aggregated:

- **Supersession** is computable — a corrected laboratory result closes the validity interval of
  the Claim it replaces, so "what is the current value?" is an interval query, not a similarity
  guess.
- **Contradiction** is computable — two open, incompatible Claims in the same slice (the discharge
  medication list against the GP repeat list) are a first-class Contradiction for the reading mesh
  to surface.

The name is Claim, not Fact, because this mutability is the point: anything extracted from a
document can later be contradicted or superseded by another document.

**4. Terminology: a mount by default, an embed for `main`.** The permissive floor — what `vanilla`
ships and what `main` runs with zero setup — is:

- the NER stack (ADR-012), which needs no licensed terminology to run;
- **code-free canonicalisation** — lemmatisation and string clustering — so reconciliation and
  contradiction detection work with no code system at all;
- **dm+d** (OGL v3.0, with attribution) for medication coding, plus optionally MeSH/HPO/MONDO;
- a **user-supplied mount**: a declared volume where a site places its own SNOMED CT or UMLS release
  under its own licence, read but never redistributed.

Because `main` is a one-shot demonstrator and not redistributed, it may go further and **embed
SNOMED CT / UMLS / ICD-10 directly on the demo box** under the free-to-use terms in the brief,
coding the record fully instead of mounting. The restricted files are obtained at build time and
stay on the box, never committed to this public repo. `vanilla` keeps the mount-only path as its
permissive guarantee.

Either way, terminology is read through an anticorruption layer, and choosing or mounting one is a
configuration change with an apply-class whose event lands in the audit chain
([PRD-006](../prd/PRD-006-audit-and-vaults.md)) — the same shape as the per-feature local/cloud
switch ([ADR-002](./ADR-002-apply-class-model.md)).

## Consequences

- **The demonstrator is complete without any mount.** dm+d codes the highest-value category
  (medications); canonicalisation reconciles everything else; full SNOMED/UMLS coding appears where
  `main` embeds it on the box or a site mounts its own. The demo script (PRD-008) can show the mount
  as an affordance — "your terminology, your licence, your box" — which lands well with an NHS
  audience.
- The FHIR-shaped record plus coded medications exhibit the interoperability domain a
  DTAC-literate audience checks for, without any real-data or integration claim.
- Supersession and contradiction become interval queries over typed Claims — no similarity measure
  involved, which is exactly the reconciliation contract
  [ADR-011](./ADR-011-context-native-retrieval.md) requires.
- Medplum is a real dependency with its own release cadence; the fallback position (types-only
  `@types/fhir` plus owned validation) is understood and acceptable if it ever must be shed.

## Alternatives considered

- **`@types/fhir` (MIT)** — types only: no runtime validation, no helpers, so the validation code
  becomes ours to own. Kept as the named fallback behind Medplum, not the first choice.
- **fhir-typescript** — Apache-2.0 generated resource classes; a smaller community and slower
  cadence than Medplum, with none of its production track record.
- **Bundle SNOMED CT into a redistributed image** — rejected for `vanilla` and for anything pushed
  to this public repo: that is redistribution and breaches the TRUD Affiliate licence. It is *not*
  rejected for `main`'s demo box, which may embed SNOMED under a TRUD account because the box is not
  redistributed — the file stays on the box, out of the repo.
- **UMLS-based linking as the shipped default** (e.g. scispaCy's EntityLinker) — not the permissive
  default, since the NLM licence cannot travel in a redistributed image; available to `main` on the
  box, or to any site through the mount.
- **No coding at all** — the simplest and licence-trivial option, and canonicalisation alone would
  carry reconciliation. Rejected because coded data is the interoperability affordance the clinical
  audience looks for, and dm+d provides a fully permissive path to it for medications.

## Traceability

Licence positions verified in the RuVector digests `docbox-research-openmed` and
`docbox-research-retrieval`; posture fixed by the
[demonstrator brief](../../demonstrator-brief.md) ("Licence posture"). The Claim model is realised
by [PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md) and consumed by the reading mesh of
[PRD-011](../prd/PRD-011-clinician-query-and-reading-mesh.md); the corpus ground truth aligns via
[PRD-009](../prd/PRD-009-synthetic-patient-corpus.md). Storage of Claims and the record is decided
in [ADR-014](./ADR-014-corpus-store-lexical-index-and-graph.md); aggregates are modelled in
[DDD-004](../ddd/DDD-004-clinical-corpus-domain.md).
