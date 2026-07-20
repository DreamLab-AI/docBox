# ADR-016 — In-Box Agent Model: Gemma 4 31B Primary, gpt-oss as Defence in Depth

Status: Accepted · Date: 2026-07-20 · Deciders: DreamLab · Applies to: `doctorBox` (demonstrator); the
generic default correction is on `main` (PRD-007, `models.local.name`)

## Context

The demonstrator docs drifted from the product's own config surface. PRD-007's route table and the
serving notes in [ADR-012](./ADR-012-clinical-grounding-stack.md) /
[ADR-015](./ADR-015-target-platform-dgx-spark.md) named **gpt-oss-20b** as *the* in-box agent model,
while the config surface (`models.local.name`) always told the honest story: the embedded model is a
switchable choice, and gpt-oss's distinct value is as the **privacy option** — OpenAI-class reasoning
for data that must never reach OpenAI's API. This ADR corrects the drift and records the model
decision properly.

Two things changed since the earlier documents were written:

- **Gemma 4 shipped (2 April 2026) under Apache-2.0.** Google dropped the custom Gemma Terms of Use
  entirely, so the licence question the client-questions file raised for embedded Gemma models is
  moot for Gemma 4. The 31B dense variant carries a 256K context window, text+image input,
  explicit thinking control (a `<|think|>` switch), 140+ languages, QAT checkpoints and NVFP4
  quants, and ranks among the top open models on public leaderboards (vendor- and
  leaderboard-reported, not reproduced by us). Footprints from the model card: 69.9 GB BF16,
  34.9 GB 8-bit, 17.5 GB 4-bit.
- **Production evidence against gpt-oss as the clinical reasoner.** A single-team production
  benchmark of 25 local models for clinical documentation (RuVector digest
  `docbox-research-meda-local-llm-benchmark`; anecdotal, not independently reproduced) found
  repeatable clinical-coding failure modes in gpt-oss-20b — spurious secondary codes, systematic
  omission of administrative codes, catalogue slippage — and measured a **thinking-mode tax** of
  38–82% of output tokens spent on reasoning chains before any JSON in temperature-0 structured
  extraction.

## Decision

**Gemma 4 31B is the primary in-box agent model on `doctorBox` — served quality-first — and
gpt-oss-20b is retained as defence in depth, not dropped.**

1. **Quality-first serving on the DGX Spark.** The default build is the **8-bit QAT checkpoint
   (~35 GB)**; BF16 (~70 GB) is available where profiling on the appliance shows headroom beside
   the OCR model, the NER sidecar and the store. What makes high precision affordable is
   **multi-token prediction (MTP)** speculative decoding on the llama.cpp serving path: ~1.4–2.2×
   faster generation for roughly 2 GB of extra headroom, so the dense 31B decodes at a rate the
   demo can wear without dropping to 4-bit. The 4-bit build (17.5–20 GB, Q4/NVFP4) is the
   **commodity degraded path** — `main`'s assumption — not the Spark default.
2. **gpt-oss-20b is the defence-in-depth layer.** It stays on the `models.local.name` switch as the
   second, differently-lineaged open-weights model: the privacy story for clients who want
   OpenAI-class reasoning with nothing leaving the box, a cross-model check on the primary model's
   extraction output where a demo warrants it, and the fallback if the primary regresses or its
   supply changes. One switch, two lineages, both Apache-2.0.
3. **Thinking is pinned off for structured extraction.** The schema-guided pass of
   [PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md) runs with the `<|think|>` switch off at
   temperature 0 — the thinking-mode tax is pure overhead on schema-constrained output. Reasoning
   spend belongs, if anywhere, in the Reading mesh's cross-checks
   ([PRD-011](../prd/PRD-011-clinician-query-and-reading-mesh.md)), where it is a deliberate,
   budgeted choice.
4. **The extraction prompt is a safety control, not boilerplate.** The digest's starkest result:
   the same model at 0.0% fabrication under a tightly-scoped secretarial prompt versus ~12%
   fabricated values under a generic "summarise" prompt — and a reasoning model used as a scribe
   *actively endorsed* planted prescribing errors. The extraction pass therefore holds the
   secretarial register: transcribe what the document asserts, never evaluate it. The structural
   guards (EvidenceSpan exact-quote matching, typed Contradiction detection) already enforce this
   shape; the prompt is written to match, and both survive any future model swap.

Two capabilities are noted, not decided. The 256K context window doubles the headroom under
[ADR-011](./ADR-011-context-native-retrieval.md)'s context-native premise (one patient's record in
context). And the 31B accepts images, which opens a possible consolidation of the agent and OCR
routes onto one served model — PRD-007's OCR decision (Qwen-VL default, Pixtral-class option) stands
until that is evaluated on the appliance.

## Risks and honest limits

- **The evidence class is thin.** The clinical benchmark is one team's unreproduced report;
  Gemma 4's quality claims are vendor- and leaderboard-reported. The acceptance step is ours: a
  head-to-head against PRD-009's Synthea ground truth on the appliance, gpt-oss-20b and
  Qwen3-30B-A3B as comparators, scored on the PRD-010 success criteria (seeded-event recall,
  fabrication rate by type, omission rate).
- **MTP figures are Unsloth-reported on x86 GPUs.** llama.cpp's MTP path on aarch64/GB10 is
  unverified; the serving claim holds only after it is measured on the Spark. If MTP
  underdelivers there, the fallback order is 8-bit QAT without MTP, then the 26B-A4B MoE, then
  4-bit.
- **KV cache at 256K is not free.** Long-context sessions on the BF16 build can add tens of GB;
  the 8-bit QAT default and the single-patient scope keep this inside the 128 GB envelope, but
  the profile on the appliance decides BF16, not this document.

## Alternatives considered

- **Stay with gpt-oss-20b as primary** — rejected. The digest's documented failure modes sit
  exactly in this demonstrator's territory (typed clinical assertions, administrative codes), its
  context window is half Gemma 4's, and it is text-only. Retained as the defence-in-depth layer,
  which is the role its own positioning (local, private, OpenAI-lineage) fits best.
- **Qwen3-30B-A3B (non-thinking)** — the digest's clinical-reasoning winner: Apache-2.0, ~18 GB,
  MoE with ~3B active parameters, and the strongest documented performance on exactly the
  prescribing-trap and coding tasks that matter here. Not adopted as default — Gemma 4 31B
  outranks it on the open leaderboards, brings 256K context, vision, QAT/NVFP4 builds aligned
  with the Spark's FP4 path, and MTP — but it is the **named benchmark alternative** in the
  acceptance head-to-head and first on the swap list if Gemma 4 disappoints on our corpus.
- **Gemma 4 26B-A4B (MoE, 3.8B active)** — the latency pick. If five concurrent Specialists
  (PRD-011) profile poorly against the dense 31B on the appliance, the MoE sibling trades some
  quality for materially faster tokens-per-second at two-thirds the memory. Held as the
  concurrency fallback, same family, same runtime.

## Consequences

- The `doctorBox` demo world's config default flips to `gemma-4-31b` (the mock is the demonstrator's
  narrative surface, so it tells the ADR-015/016 story); `main` keeps its CPU-class `qwen3-8b`
  floor with `gemma-4-31b` available on the switch.
- The serving notes in [ADR-012](./ADR-012-clinical-grounding-stack.md),
  [ADR-015](./ADR-015-target-platform-dgx-spark.md), the demonstrator brief and the NER sidecar
  README now name the Gemma 4 31B agent model, with gpt-oss-20b in its defence-in-depth role.
- PRD-010's schema-guided pass gains the two operating constraints above (thinking off,
  secretarial register), each traceable to the digest rather than folklore.
- The licence posture simplifies: the whole default agent layer — primary and fallback — is
  Apache-2.0, inside `main`'s permissive floor, with no `doctorBox` exemption spent on it.

## Traceability

Evidence: RuVector `project-state` digests `docbox-research-meda-local-llm-benchmark` (clinical
benchmark, thinking tax, prompt-as-lever, scribe-neutrality incident) and `docbox-research-openmed`
(grounding stack context). Platform it serves on:
[ADR-015](./ADR-015-target-platform-dgx-spark.md). Pipeline it powers:
[PRD-010](../prd/PRD-010-clinical-grounding-pipeline.md) (schema-guided extraction),
[PRD-011](../prd/PRD-011-clinician-query-and-reading-mesh.md) (Reading mesh). Route switch it
configures: PRD-007 (per-feature local/cloud switch), PRD-003 (engine seam). Binding brief:
[../../demonstrator-brief.md](../../demonstrator-brief.md).
