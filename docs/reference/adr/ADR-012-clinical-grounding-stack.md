# ADR-012 — Clinical Grounding Stack

Status: Accepted · Date: 2026-07-17 · Deciders: DreamLab

## Context

The grounding pipeline ([PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md)) turns OCR'd text
into Claims. Between OCR output and schema-guided LLM extraction sits the clinical NLP question:
which named-entity recognition and assertion stack, under the permissive-licence rule
([PRD-000](../prd/PRD-000-product-shape.md): MIT/Apache-2.0/BSD plus explicitly open government
licences, no new proprietary exception)?

On `doctorBox` that rule is relaxed — the demonstrator is a one-shot, non-redistributed showcase, so a
restrictively-licensed stack is allowed on merit ([demonstrator brief](../../demonstrator-brief.md),
"Licence posture"). The default below is chosen to be permissive and light regardless, so `main`
runs it unchanged and `doctorBox` reaches past it only where accuracy warrants.

The stack must: recognise diseases, drugs and chemicals, anatomy and oncology-specific entities in
English clinical prose; determine assertion status, because "no chest pain" must not become a
chest-pain Claim and a drug listed under *Allergies* is not a drug under *Current medication*;
attach section context; and serve alongside the in-box agent model — Gemma 4 31B, 17.5–70 GB
depending on precision ([ADR-016](./ADR-016-in-box-agent-model.md)) — without contending for the
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
(184M ≈ 370 MB, 434M ≈ 870 MB). On the target DGX Spark (128 GB unified memory,
[ADR-015](./ADR-015-target-platform-dgx-spark.md)) the NER checkpoints, the Gemma 4 agent model and
the OCR model co-reside without contention, so no CPU-pinning trade-off is needed; on a
memory-constrained host the same small footprints still fit a sub-2 GB GPU slice beside the agent
model. The sidecar builds for ARM64.
Latency of tens to hundreds of milliseconds per model per page is immaterial at ingestion time.

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
- **John Snow Labs Spark NLP for Healthcare** — the strongest commercial clinical NLP stack. Under
  the permissive-only rule (`main`) it is excluded: a commercial EULA with CC-BY-NC-ND weights.
  Under `doctorBox`'s relaxed rule it is **available on merit** — it needs a John Snow Labs licence key
  and its weights stay on the demo box, out of this public repo. It is not the default: OpenMed is
  lighter, fully open, and already covers the corpus's entity families, so JSL is a reach-for option
  when a demo needs an entity type or an accuracy the open stack misses, not a baseline dependency.
- **Stanza biomedical (Apache-2.0), HunFlair2/Flair (MIT), BioBERT derivatives** — permissive and
  viable, but without OpenMed's reported accuracy or its per-family checkpoint granularity. They
  form the swap list that the bus-factor mitigation depends on.

## Consequences

- A new module: the NER sidecar joins OCR and the browser sidecar as the third Python/native
  service behind the control plane, under ADR-009's unchanged module rules (compose profile, config
  gate, apply-class, manifest entry).
- The default grounding stack is wholly Apache-2.0/MIT, so `main` runs it unchanged and the
  brief's permissive floor holds; `doctorBox` may add a restrictively-licensed component (John Snow Labs,
  a larger model) on merit under its relaxed rule.
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
