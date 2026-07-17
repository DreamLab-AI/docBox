# ADR-015 — Target Platform: NVIDIA DGX Spark

Status: Accepted · Date: 2026-07-17 · Deciders: DreamLab · Applies to: `main` (demonstrator)

## Context

The `main` demonstrator runs a stack of local models at once: gpt-oss for the agent mesh, the
OpenMed NER checkpoints for grounding ([ADR-012](./ADR-012-clinical-grounding-stack.md)), a vision
model for OCR (PRD-007), and the FHIR/SQLite corpus store
([ADR-014](./ADR-014-corpus-store-lexical-index-and-graph.md)). The demonstrator's central promise to
an NHS audience is that a patient's records can be reasoned over with nothing leaving the box, so all
of that should run locally rather than reach for a cloud model.

On a commodity host with a single discrete GPU — say 24 GB of VRAM — these models contend for memory.
gpt-oss-20b alone takes 13–16 GB, which is why [ADR-012](./ADR-012-clinical-grounding-stack.md)
carried a CPU-pinning trade-off (keep the NER models on CPU so gpt-oss keeps the GPU) and why the
local OCR route defaulted to a small model. The [demonstrator brief](../../demonstrator-brief.md)
also relaxes the permissive-only rule for `main` and scopes the work to a single patient, both of
which make a larger, more accurate local stack worth running — if the hardware has the memory for it.

## Decision

**`main`'s demonstrator targets an NVIDIA DGX Spark.** The relevant properties:

- **GB10 Grace Blackwell superchip** with **128 GB of unified LPDDR5X memory** shared between CPU and
  GPU. The whole local stack co-resides — gpt-oss, the OpenMed checkpoints, a vision OCR model, and
  the store — with headroom, so the CPU-pinning trade-off is unnecessary on this platform.
- **FP4 / NVFP4 acceleration**, which is what makes gpt-oss (MXFP4 weights) and larger models run
  fast rather than merely fit.
- **ARM64 (aarch64)**, so the container images and the Python NER sidecar build for aarch64.
- A **single self-contained desktop appliance**, which matches the demonstrator's loopback-only,
  zero-inbound posture (PRD-005): everything the demo needs is on one machine.

Two consequences for the other decisions follow directly. The local OCR route may be a larger, more
accurate model — a Pixtral-class Mistral vision model as well as Qwen-VL — because the memory allows
it (its weights held on the box under Mistral's terms, per the brief). And the serving note in
[ADR-012](./ADR-012-clinical-grounding-stack.md) is simpler here: models co-reside without a
memory-budget juggle.

`vanilla` stays platform-agnostic — its assumption is a commodity x86 host with a discrete GPU — so
this target is `main`'s alone.

## Consequences

- **Serving simplifies on this platform.** No CPU/GPU memory juggling; the NER sidecar, the OCR
  model, and gpt-oss run together in unified memory.
- **The build is aarch64-first for the runtime images.** The Python sidecar and any native Node
  dependency (better-sqlite3, onnxruntime) need aarch64 wheels or an in-image build. CI on x86
  runners still typechecks, builds and tests the TypeScript unchanged; the arm64 images are the
  artefact built on the appliance or the host build path, never in Actions (the repo already builds
  images only on a host — see `docker/`).
- **The local-first claim is credible.** "Nothing leaves the box" holds because the box genuinely has
  the memory to run the models the demo needs, rather than being forced to a cloud route for
  capacity.
- **Single-vendor dependency and cost.** A DGX Spark is a specific appliance. Mitigation: the stack
  is not DGX-only — it degrades to the commodity-GPU path (`vanilla`'s assumption) with the
  CPU-pinning trade-off and a smaller OCR model, so a demo can still run on other hardware at lower
  fidelity.
- **ARM64 wheel gaps** are the main practical risk. Mitigation: pin known-good aarch64 wheels, or
  build the offending dependency inside the image; both are recorded in the sidecar Dockerfiles.

## Alternatives considered

- **Commodity x86 host with a discrete GPU (e.g. 24 GB)** — `vanilla`'s assumption and the portable
  fallback. It works, but forces the CPU-pinning trade-off and a smaller local OCR model, and leaves
  less headroom for a larger agent model. Kept as the degraded path, not the target.
- **Cloud GPU** — rejected for the demonstrator. Sending pages or record text to a cloud model
  contradicts the one message the demo exists to make; a cloud route stays available per feature
  (PRD-007) for low-sensitivity material, but it cannot be the platform the demo depends on.
- **Apple Silicon (also unified memory)** — a viable memory model, but the MLX ecosystem diverges
  from the CUDA/transformers path the rest of the stack uses, and it is not the hardware this
  audience expects. Not chosen.

## Traceability

Platform note and the local-first framing: [demonstrator brief](../../demonstrator-brief.md)
("Target platform"). Serving footprint it simplifies:
[ADR-012](./ADR-012-clinical-grounding-stack.md). The demo that runs on it:
[PRD-008](../prd/PRD-008-clinician-demonstrator.md). OCR routing and the local OCR model: PRD-007.
Loopback-only, zero-inbound posture: PRD-005. Constraint source: the licence relaxation and
single-patient scope in the brief, and the RuVector digest
`project-state-docbox-main-constraints-update`.
