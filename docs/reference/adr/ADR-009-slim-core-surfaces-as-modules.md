# ADR-009 — Slim core, surfaces as modules

Status: Accepted · 2026-07-16 · Cross-cutting; governs ADR-001 through ADR-008

## Context

Three rounds of building revealed a shape we did not set out to design but kept arriving at: a
small, stable centre with a growing set of optional pieces around it. Documents, OCR, gpt-oss, the
companion extension, the local model, the possible streamed desktop — each landed as an addition
that did not change the centre. That is a signal, and this ADR names it so the next surface is
built to the same shape instead of against it.

The client's two steers make this not just observed but required: "a distillation, not agentbox"
and "maintainability outranks capability". A slim core with droppable modules is what those steers
look like as architecture.

## Decision

**The core is the governance and data spine, not any user interface.** It is:

- the control-plane server and its API (`/api/world`, `/api/config`, `/api/events`,
  `/api/documents`, …),
- the frozen domain contract (`app/src/domain/types.ts`) and the adapter seam,
- the four invariants everything else obeys: identity, audit, apply-class, snapshot/rollback.

The core stays small, structured, and always-on. It is the thing that is cheap to run for many
users and that makes every agent action attributable.

**Everything else is a surface or a module.**

- A **surface** is how a human or agent interacts: the Foreman web control plane, code-server,
  the companion extension, a possible streamed desktop. Surfaces may be rich; they route their
  consequential actions through the core, so the audit boundary sits at the core contract, not at
  the surface. That is what lets a heavy surface coexist with a strict audit story.
- A **module** is an optional capability: the local model, the local OCR service, the browser
  sidecar, the vault sidecar, the work ledger, the tunnel. A module is three things and no more: a
  compose service (profile-gated when optional), a config entry in `foreman.toml` with an
  apply-class, and a reach to the core over its stable API. Adding a capability is adding a module,
  never changing the core.

**A module manifest** (the `modules` array in `app/src/data/mock.ts`, typed by `ModuleInfo` in
`app/src/domain/types.ts`) is the single source of truth for what exists: each entry names its
layer, its state, its config gate, its compose service, and whether it is heavy (wants a GPU or
real resources). The System view renders it; the docs reference it.

## What this explicitly is not

This is a stated convention, not a framework. We do **not** build:

- a plugin SDK, an extension marketplace, or module hot-swap machinery,
- formal extension points or contracts for modules that do not yet exist,
- a module lifecycle beyond "a compose profile is on or off and a config gate is set".

That is the line between this and agentbox's five-slot adapter model. We independently arrived at a
slimmer version of the same idea; the reason ours fits this client is that we stop at the
deployment seam (compose profile + config gate + core API) instead of building the adapter
framework. Same idea, a tenth of the surface. Crossing that line would rebuild the maximalist
machine the client rejected.

## Consequences

- Every open question in the client brief — desktop yes or no, which chat surface, which OCR route
  — becomes "add or drop a module", not a core rewrite. That is the best position to hold going
  into a brief we have not seen.
- Heavy, optional, or risky capabilities (streamed desktop, GPU models, native apps) are
  off-by-default modules. The core carries none of their cost until a client turns them on.
- New discipline on surfaces: a surface's state-changing actions must go through the core contract
  so they are audited. A surface that writes outside the core is a bug, not a feature.
- The manifest has to be kept honest. A module added to compose without a manifest entry, or a
  manifest entry with no gate, is drift; the System view exists partly to make that drift visible.

## Honest status

Partly true today, partly aspiration. The compose services and the adapter seam are already
modular; the local-ocr profile gate is the pattern working. Not everything routes cleanly yet:
Foreman is more tightly coupled to the server than the companion extension is, and identity
injection into modules is not fully wired. Leaning in means tightening toward this shape as M3–M7
are built, not declaring it finished.

## Traceability

Governs the surface and module decisions in ADR-001 (stack), ADR-007 (primary-user surface),
ADR-008 (self-modifying interface). The manifest is modelled in DDD-001's System-Definition
context. Realised by the `modules` array in `app/src/data/mock.ts` and the System view.
