# ADR-012 — Clinical Grounding Stack

Status: Accepted · Date: 2026-07-17 · Deciders: DreamLab

## Context

The grounding pipeline ([PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md)) turns OCR'd text
into Claims. Between OCR output and schema-guided LLM extraction sits the clinical NLP question:
which named-entity recognition and assertion stack, under the permissive-licence rule
([PRD-000](../prd/PRD-000-product-shape.md): MIT/Apache-2.0/BSD plus explicitly open government
licences, no new proprietary exception)?

The stack must: recognise diseases, drugs and chemicals, anatomy and oncology-specific entities in
English clinical prose; determine assertion status, because "no chest pain" must not become a
chest-pain Claim and a drug listed under *Allergies* is not a drug under *Current medication*;
attach section context; and serve alongside gpt-oss-20b (13–16 GB VRAM) without contending for the
GPU.

The verified research digest (RuVector, `docbox-research-openmed`) establishes the field. OpenMed
is a solo project by Maziyar Panahi (previously lead of John Snow Labs' Spark NLP), launched
16 July 2025: ~481 medical NER checkpoints on Hugging Face at 33M–770M parameters, with both the
checkpoints and the PyPI toolkit under Apache-2.0 (verified in model-card metadata) and every base
model permissive (DeBERTa-v3 MIT, PubMedBERT/BiomedBERT MIT, BioELECTRA Apache-2.0). The paper
(arXiv 2508.01630) reports state-of-the-art micro-F1 on 10 of 12 benchmarks — paper-reported, not
independently reproduced. The project is active: v1.9.1 released 14 July 2026.

## Decision

**A three-layer clinical NER and assertion stack, served from a Python sidecar behind the
TypeScript control plane.**

1. **OpenMed NER with pinned checkpoints.** A small fixed set from the SuperClinical family:
   **DiseaseDetect-184M** (diseases; BC5CDR/NCBI lineage), **PharmaDetect** and **ChemicalDetect**
   (medications and chemicals), **AnatomyDetect**, and **OncologyDetect-434M**. OpenMed's design is
   one entity family per checkpoint, so orchestrating several is inherent, not a workaround. Exact
   model revisions are pinned so upstream changes cannot alter extraction behaviour silently.

2. **medspaCy for assertion and section context.** Rule-based ConText/NegEx negation, uncertainty
   and historical-status detection plus the sectioniser — the layer OpenMed does not have. Being
   rule-based it is deterministic and inspectable: a mis-negation traces to a rule, which suits the
   audit register better than a second statistical model would.

3. **GLiNER-biomed (Apache-2.0) as zero-shot fallback** for entity types the pinned checkpoints do
   not cover, without adding a fine-tuned checkpoint per new type.

**Serving.** The stack runs as a Python sidecar module in the
[ADR-009](./ADR-009-slim-core-surfaces-as-modules.md) shape — a compose service, a `foreman.toml`
gate, a reach to the core over its API — using the Hugging Face transformers token-classification
pipeline (`aggregation_strategy="simple"`) or ONNX Runtime. BERT-class fp16 footprints are small
(184M ≈ 370 MB, 434M ≈ 870 MB), so the whole stack fits on CPU or a sub-2 GB GPU slice and
**gpt-oss keeps the GPU**. Latency of tens to hundreds of milliseconds per model per page is
immaterial at ingestion time.

Entity linking is deliberately outside this ADR: OpenMed is NER-only (its roadmap places concept
linking after Q1 2026; it is not implemented), and coding against SNOMED/UMLS/dm+d is settled by
the terminology-mount decision in [ADR-013](./ADR-013-fhir-record-and-terminology-mount.md).

## Risks and honest limits

- **Bus factor.** OpenMed has a single maintainer. Mitigations: checkpoints are pinned by revision,
  so upstream disappearance cannot break a build; the sidecar seam makes the NER layer swappable
  for any alternative below without touching the control plane.
- **MIMIC-III provenance caveat.** OpenMed's domain-adaptive pretraining corpus included MIMIC-III,
  which sits under a PhysioNet data-use agreement. That constrains redistribution of the *training
  data*, not the released Apache-2.0 *weights*; the fine-tuning sets (BC5CDR and peers) are public.
  Recorded here so the licence story is complete rather than merely tidy.
- **Literature-trained NER underperforms on noisy EHR text.** The benchmark scores above come from
  curated corpora; real clinical prose is messier. Our synthetic corpus is cleaner than real EHR
  text, so the demonstrator's extraction quality *overstates* what this stack would achieve on real
  records — PRD-008's honesty register requires that this is said out loud in the demo.
- Accuracy claims are paper- or vendor-reported throughout; none has been independently reproduced
  by us.

## Alternatives considered

- **scispaCy** (AllenAI, Apache-2.0) — ships the UMLS/MeSH/RxNorm/HPO EntityLinker that OpenMed
  lacks, but with lower NER accuracy. Not adopted as first-line NER; retained as the candidate
  *linker* for a site that mounts UMLS under its own licence (ADR-013).
- **John Snow Labs Spark NLP for Healthcare** — the strongest commercial clinical NLP stack, and
  **rejected on licence**: a commercial EULA with CC-BY-NC-ND model weights breaches the
  permissive-only rule. Not a trade-off to weigh; a hard exclusion under PRD-000's licence posture.
- **Stanza biomedical (Apache-2.0), HunFlair2/Flair (MIT), BioBERT derivatives** — permissive and
  viable, but without OpenMed's reported accuracy or its per-family checkpoint granularity. They
  form the swap list that the bus-factor mitigation depends on.

## Consequences

- A new module: the NER sidecar joins OCR and the browser sidecar as the third Python/native
  service behind the control plane, under ADR-009's unchanged module rules (compose profile, config
  gate, apply-class, manifest entry).
- The grounding stack is wholly Apache-2.0/MIT; the licence table in the
  [demonstrator brief](../../demonstrator-brief.md) holds without exception.
- Assertion handling is deterministic rules layered over statistical NER, which keeps the
  audit-trail story concrete: every suppressed or negated entity is attributable to a named rule.
- The entities this stack emits are the raw material for the Claims of PRD-010 and the nodes of the
  entity graph in [ADR-014](./ADR-014-corpus-store-lexical-index-and-graph.md).

## Traceability

Grounded in the RuVector digest `docbox-research-openmed` (primary-source licence verification,
16 Jul 2025 launch, v1.9.1 currency, arXiv 2508.01630). Consumed by
[PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md); linking deferred to
[ADR-013](./ADR-013-fhir-record-and-terminology-mount.md); downstream storage in
[ADR-014](./ADR-014-corpus-store-lexical-index-and-graph.md); retrieval role fixed by
[ADR-011](./ADR-011-context-native-retrieval.md). Modelled in
[DDD-004](../ddd/DDD-004-clinical-corpus-domain.md).
