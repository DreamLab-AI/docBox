# Demonstrator Brief — Clinician-Facing Corpus Intelligence

Status: Pivot brief · Created 2026-07-17 · Applies to `main` only (`vanilla` remains the generic
sandbox baseline at its own line)

This brief fixes the shared ground truth for the pivot of docBox's `main` branch into a **showcase
for NHS clinicians**. It sits above the pivot's PRD/ADR/DDD set the way the vision brief sat above
the original product: it names the use case, the architecture, the vocabulary every document must
share, and the honest framing for a synthetic-data demonstrator. The per-document specs consume
this brief; where a detail is contested, this file wins until a document supersedes it by reference.

The pivot is **additive to the governance spine, not a rebuild of it**. Audit hash chain, identity
attribution, per-feature local/cloud routing, egress proof, snapshots, and the panel/surface system
are unchanged; the pivot re-aims them at a defined audience. That is why this is a documentation
phase, not a re-architecture.

## The use case

A single fictional patient's records arrive as the mixed formats real care produces: referral and
clinic letters (DOCX/PDF), discharge summaries, laboratory and radiology reports, a repeat-medication
list, GP consultation notes, patient e-consult messages (`.eml`), and a few **scanned handwritten
artefacts** (a drug chart, an annotated letter, an older note). The existing routed OCR reads the
page images. An agent layer **grounds** the corpus into a typed, evidence-linked longitudinal record.
A hypothetical clinician then asks questions of that record and receives answers where **every
sentence cites the exact source passage it came from**.

The audience is NHS doctors who are being taught, in 2026, to be wary of AI that overclaims. The
demonstrator earns their trust by showing the affordances a real system would need — attribution,
audit, local-versus-cloud data flow, contradiction surfacing — over one synthetic patient, and by
stating plainly what it is not.

### Scope boundary: single-patient context

The demonstrator operates on **one patient's context at a time**. One patient's record is small
enough to sit inside the agent mesh's working context, and that single fact is what the whole
retrieval design rests on. Population-scale search, cross-patient linkage, and multi-tenant
retrieval are **out of scope** — not deferred polish but a different product that would need the
very index this design rejects. One session, one `LongitudinalRecord`. This keeps the build inside
the "maintainability outranks capability" rule (PRD-000).

## What it is not

Stated up front because the audience will ask, and because honesty is the register (PRD-007 set the
precedent with OCR accuracy):

- **Not for clinical use.** It makes no diagnostic or treatment claim and is not a medical device.
- **Not real data.** One fabricated patient, built from permissively licensed synthetic sources; no
  living identifiable person, so no personal data.
- **Not a clinical record system.** It ingests documents to reason over them; it is not an EPR, and
  it does not write back to any care system.

## Architecture in brief

Four moving parts, each grounded in the research digests held in RuVector `project-state`
(`docbox-research-openmed`, `-dataset`, `-retrieval`, and the decision `-context-native-mesh`):

1. **Synthetic corpus** — one patient, authored from Synthea (Apache-2.0) as the longitudinal FHIR
   backbone, with documents hand-rendered from PRSB templates (Open Government Licence v3.0) and
   handwriting synthesised with MIT-licensed tools. Contradictions, supersessions, and duplicates
   are **seeded deliberately** so the demonstrator can show reconciliation, not merely retrieval.

2. **Grounding pipeline (ingestion time)** — each source document is OCR'd, then read by a clinical
   information-extraction stack (OpenMed NER, Apache-2.0; medspaCy for negation/section context;
   GLiNER-biomed as a zero-shot fallback) plus schema-guided LLM extraction. The output is a set of
   **Claims**, each carrying a typed value, a FHIR mapping, an **evidence span** back to the exact
   source characters, a confidence score, and a temporal validity interval. Claims reconcile into
   one **LongitudinalRecord**.

3. **Deterministic tools (shared workspace)** — a SQLite FTS5 (BM25, public-domain) lexical index
   over raw text and claims, a per-document hierarchical tree (PageIndex-style, embedding-free), and
   a typed entity graph that is *constructed* by NLP/LLM but **never embedded**. These are how the
   agents find and cite exact passages — a workspace, not a retrieval backbone.

4. **Reading mesh (query time)** — a **bounded mesh of specialist agents** (Medications, Labs &
   Observations, Diagnoses & Problems, Chronology, Correspondence), coordinated by the existing
   Foreman, each holding the slices of the record it owns in its own context and cross-checking the
   others. It answers by reconciling Claims on **recency and validity**, not vector similarity, and
   returns a **CitedAnswer** whose every sentence is anchored to source evidence.

### Target platform: NVIDIA DGX Spark

`main`'s demonstrator targets an **NVIDIA DGX Spark** — a single desktop appliance with a GB10 Grace
Blackwell superchip, 128 GB of unified CPU/GPU memory, and FP4 acceleration
([ADR-015](reference/adr/ADR-015-target-platform-dgx-spark.md)). Two things follow. The unified
memory holds the whole local stack at once — gpt-oss for the agents, the OpenMed NER checkpoints, and
a vision model for OCR all co-resident — so there is no need to pin models to CPU to spare GPU
memory, and the local route can run a larger, more accurate OCR model than a memory-constrained box
allows. The appliance is ARM64, so the container images and the Python sidecar build for aarch64. A
single self-contained box also matches the demonstrator's whole posture — loopback-only, zero
inbound, everything the demo needs on one machine — which is the strongest backing for the "your data
never leaves the box" message the NHS audience is there to test. `vanilla` stays platform-agnostic;
this target is `main`'s.

### Why no vector RAG

The operator's position, backed by the retrieval research: for a single-patient corpus the whole
record nearly fits in context, so chunk-and-embed retrieval buys nothing and costs the things that
matter here — document structure, provenance, and recency. Embedding-similarity returns the
*most similar* passage, never the *most recent* or *superseding* one, which is precisely what a
longitudinal record turns on. Vector RAG remains the right tool for large heterogeneous corpora
(10⁴+ documents) where fuzzy recall at scale dominates; ADR-011 states that trade-off honestly
rather than pretending the technique has no place.

### The multidisciplinary-team framing

For the clinician audience the reading mesh is legible as an **MDT**: a lead convenes specialists
who each read the parts they own and cross-check before a shared conclusion. It mirrors how
clinicians already reason, which makes the harness idea land without jargon. Two honesty guards:
the analogy is a teaching device, not a claim of clinical equivalence; and a mesh costs roughly an
order of magnitude more tokens than a single reader, affordable **only** because one patient's
record is near context-sized — a boundary ADR-011 must state so the pattern is not copied to a
corpus that would make it ruinous.

## Ubiquitous language (fixed here for every document)

Every PRD, ADR, and DDD in this set uses these terms with these meanings. DDD-004 owns the formal
model; this table is the binding reference so the writers do not diverge.

| Term | Meaning |
|---|---|
| **SourceDocument** | One ingested artefact (letter, lab report, email, scanned note) with an id, type, provenance, and OCR/extracted text addressable by character offset. |
| **Ingestion** / **Grounding pipeline** | The ingestion-time process that turns a SourceDocument into Claims and folds them into the LongitudinalRecord. |
| **Extraction** | The act and result of pulling structured information from a SourceDocument (OCR → NER → schema-guided extraction). |
| **Claim** | A single typed, evidence-linked assertion derived from a SourceDocument — `{ value, FHIR mapping, EvidenceSpan, confidence, validity interval }`. Named "Claim" because it can be contradicted or superseded; that mutability is the point. |
| **EvidenceSpan** | The exact provenance of a Claim: `source_doc_id` + character span + the quoted passage. The citation primitive. |
| **LongitudinalRecord** | The reconciled, FHIR-shaped view assembled from all Claims across all SourceDocuments over time, for one patient. |
| **Contradiction** | A detected conflict between two Claims (e.g. a discharge medication list against the GP repeat list). A first-class object the mesh surfaces. |
| **Supersession** | A temporal relation where one Claim replaces another (e.g. a corrected laboratory result). |
| **Question** | A clinician's natural-language query against the LongitudinalRecord. |
| **CitedAnswer** | An answer whose every sentence carries EvidenceSpans to the source passages that support it. |
| **Reading mesh** | The bounded set of specialist agents that resolves a Question by reading the record in context and reconciling Claims, coordinated by the Foreman. |
| **Specialist** | One agent in the reading mesh with a defined slice (Medications, Labs & Observations, Diagnoses & Problems, Chronology, Correspondence). |

## Licence posture

**`main` relaxes the permissive-only rule; `vanilla` keeps it.** The demonstrator on `main` is a
one-shot, non-commercial showcase, not a distributed product, so it is not bound by the "everything
shipped is MIT/Apache-2.0/BSD" rule that defines `vanilla`. `main` may use whatever makes the best
demonstrator — including restrictively-licensed clinical terminology (SNOMED CT UK, UMLS, ICD-10)
and commercial clinical NLP (John Snow Labs Healthcare) — each under its own free-to-use terms. Two
engineering caveats survive the relaxation, as good practice rather than licence philosophy:

- **The public repo stays clean.** docBox is a public repository. Restricted terminology files and
  proprietary model weights go on the demo box at build or run time, never committed here —
  committing them would be redistribution to the world, which the demo framing does not cure.
- **Free-to-use still means obtaining the licence.** SNOMED CT UK needs a TRUD account and Affiliate
  acceptance; UMLS needs a UTS account; John Snow Labs Healthcare needs a licence key. Each is free
  for this use, but a step the build performs, not an assumption.

The permissive stack below stays the **default and the zero-setup floor** — the demonstrator is
fully working with nothing but it, and it is `vanilla`'s defining constraint. `main` reaches past it
only where a richer component sharpens the demo.

- **Grounding models** — the default is OpenMed (Apache-2.0), medspaCy (permissive), GLiNER-biomed
  (Apache-2.0). John Snow Labs Spark NLP for Healthcare, previously ruled out on licence, is
  available to `main` on merit (needs a JSL key; its weights are CC-BY-NC-ND) —
  [ADR-012](reference/adr/ADR-012-clinical-grounding-stack.md).
- **OCR** — the default local route is Qwen-VL; on `main` a Pixtral-class Mistral vision model may
  serve as a larger, more accurate local OCR route, its weights held on the box under Mistral's
  terms. Cloud OCR routes are unchanged (PRD-007).
- **FHIR** — specification is CC0; the Medplum TypeScript SDK is Apache-2.0.
- **Lexical index** — SQLite FTS5 is public domain.
- **Corpus** — Synthea (Apache-2.0), PRSB templates (OGL v3.0), handwriting synthesis (MIT). The
  corpus we author stays permissive so it remains freely publishable; MIMIC (credentialed DUA) and
  IAM (non-commercial) are still excluded from it.
- **Terminology.** OpenMed does NER only, so coding comes from this layer. The zero-setup floor is
  dm+d (OGL) plus code-free canonicalisation, with a **user-supplied mount** for a site's own
  SNOMED/UMLS — that floor is `vanilla`'s only path and `main`'s default. Because `main` is not
  redistributed, it may also **embed SNOMED CT / UMLS / ICD-10 directly on the box** under the
  free-to-use terms above, coding the record fully. Either way the terminology is read through an
  anticorruption layer and the choice is an audited, operator-owned decision — the same shape as the
  local/cloud switch. [ADR-013](reference/adr/ADR-013-fhir-record-and-terminology-mount.md) records
  this.

## Governance framing (synthetic showcase)

Named because a clinical audience expects them, and because naming precisely why each does not fire
is more credible than silence. Each still has a corresponding affordance the architecture shows.

| Framework | Why a synthetic demonstrator does not trigger it | Affordance shown anyway |
|---|---|---|
| **UK GDPR / DPIA** | A fully fictional single patient is not personal data; there is no data subject. | Data-flow and egress documentation (PRD-005). |
| **DTAC** (v2, live 6 Apr 2026) | A procurement/onboarding gate for tech entering the NHS with real data; a showcase is not being procured. | The four DTAC domains are visibly addressed (safety, data protection, security, interoperability). |
| **DCB0129 / DCB0160** | Clinical-risk-management standards for health IT touching care; no live decisions, no real patients. | Hazard-log-style audit trail and attribution (PRD-006). |
| **UKCA / MDR (MHRA)** | Not-for-clinical-use with no medical claim, so not a medical device. | The attribution and audit a regulated device would require. |
| **DSPT** | Org-level data-security baseline, not triggered by synthetic data. | Loopback-only, zero-inbound network posture (PRD-005). |

## Document map

The pivot's documentation set, and who owns which in the writing mesh. Numbering continues the
existing series without reuse.

| Document | Covers |
|---|---|
| **PRD-008** Clinician demonstrator | Product shape, audience, the guided narrative/demo script, non-clinical framing, success criteria. |
| **PRD-009** Synthetic patient corpus | Dataset specification: Synthea backbone, document types, the deliberately seeded contradictions/supersessions/duplicates, handwriting artefacts, licences, build and storage. |
| **PRD-010** Clinical grounding pipeline | Ingestion: OCR → NER → schema-guided extraction → Claims → LongitudinalRecord; evidence spans; temporal validity; contradiction detection. |
| **PRD-011** Clinician query & reading mesh | The bounded specialist mesh, the query surface/panel, the CitedAnswer contract, honest limits. |
| **ADR-011** Context-native retrieval | Reject the vector-RAG/embedding backbone; adopt ingestion-time grounding + context-native mesh reading + deterministic tools. Honest trade-offs and the token-economics boundary. |
| **ADR-012** Clinical grounding stack | OpenMed + medspaCy + GLiNER by default; John Snow Labs available to `main` on merit (needs a key); the Python NER sidecar behind the TypeScript control plane. |
| **ADR-013** FHIR record + terminology | FHIR R4 internal representation; Medplum TS SDK; dm+d floor with a user mount, and (on `main`) SNOMED/UMLS embedded on the box; the evidence-plus-validity Claim model. |
| **ADR-014** Corpus store, lexical index & entity graph | SQLite FTS5 (BM25) as the deterministic lexical tool; the per-document tree and the typed, non-embedded entity graph as the mesh's shared workspace; where the store sits relative to the data plane. |
| **ADR-015** Target platform: DGX Spark | The `main` demonstrator's hardware target — GB10 Grace Blackwell, 128 GB unified memory, ARM64, FP4 — and its serving, build, and local-first consequences. |
| **DDD-004** Clinical corpus bounded context | The formal ubiquitous language and aggregates for the corpus domain; the context map to DDD-001 (control plane), DDD-002 (overhaul lifecycle), DDD-003 (interface). |

## Reuse of the existing spine

What the pivot consumes unchanged, so the writers reference rather than reinvent:

- **Routed OCR and the local/cloud switch** — PRD-007, ADR-002. Ingestion begins where PRD-007 ends.
- **Audit hash chain and identity attribution** — PRD-006, `server/src/audit/`. Every ingestion and
  every Question is an attributable, chain-verifiable event.
- **Egress proof and loopback-only posture** — PRD-005. The `local` route proves no page leaves the
  box; the same record backs the "data stays in the box" message.
- **Panel/surface system** — ADR-009, ADR-010. The clinician query surface is a panel in the
  interface domain (DDD-003), registered through the typed panel registry.
- **Agent engine seam** — PRD-003. The reading mesh runs on the same engine seam the control plane
  already drives.
