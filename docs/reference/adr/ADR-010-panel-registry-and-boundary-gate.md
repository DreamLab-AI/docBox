# ADR-010 — Panel registry and the mechanical boundary gate

Status: Accepted · 2026-07-17 · Extends ADR-008 (self-modifying interface) and ADR-009 (frozen contract)

## Context

ADR-008 lets agents create and edit the interface's panels live; ADR-009 froze the contract that
keeps that safe — feature panels import **only** through the data adapter seam and the shared UI
primitives, never each other's internals, never the mock or live source directly. Both have held
perfectly: across 28 data imports every one goes through the seam, and no feature imports another.

But "held perfectly by hand" is the risk. As the editor of the panels becomes an agent rather than
a careful human, two rot vectors open:

1. **A boundary-breaking import.** Nothing failed when a panel reached past the seam — it was caught
   in review, if at all. Import number 29, written by an agent, has no guard.
2. **A malformed panel.** The tab set lived as an inline literal in `App.tsx` with no single,
   validated source of truth. An agent adding a panel had no fixed shape to fill and no gate that
   rejected a bad one before it reached Vite HMR — a broken edit could blank the surface.

A scout survey of "predictable surface creation" pointed at the same answer from two angles: a typed
manifest the agent fills the same way every time, and a validation that rejects a non-conforming
panel before render. This ADR adopts the parts that add the least surface and enforce the most.

## Decision

**1. A typed, validated panel registry is the single source of truth.** `app/src/ui/panels.ts`
holds the panel manifest (the serialisable `{ id, label, hint }` an agent may author) and binds each
entry to its component through a registry checked with `satisfies Record<PanelId, …>` — so adding a
`PanelId` but forgetting its component **fails `tsc`**. The manifest is validated
(`parsePanelManifest`) before `buildPanels` binds it: an unknown id, an empty label/hint, or a
duplicate throws a precise, agent-actionable message. This is validate-before-render — a bad panel
is a caught error, not a blank screen. `App.tsx` renders `PANELS` and imports nothing else.

**2. The validator is owned code, not a schema library.** The contract is three fixed fields; a
hand-checked validator keeps the app's runtime dependencies at exactly React and React-DOM (the
distillation steer). Zod is the drop-in at `parsePanelManifest` if the manifest ever grows rich
enough to earn a schema library — the seam is already there.

**3. The frozen contract is enforced mechanically.** `app/.dependency-cruiser.cjs` runs in CI
(`pnpm --filter @docbox/app run depcruise`) with three forbidden rules: no cross-feature imports,
features reach the world only through `data/adapter` (never `data/mock`/`data/live`), and no import
cycles. A violating edit exits non-zero and **fails the build** — ADR-009's rule becomes a gate, not
a convention. It is dev-only tooling; it ships nothing.

**4. The component vocabulary stays owned and small.** Panels compose from the owned primitives
(`app/src/ui/primitives.tsx`) and the domain contract. When the owned set lacks an accessible
primitive (dialog, popover, …), the sanctioned source is **Radix Primitives (MIT)**, pulled
per-component — not a wholesale UI framework. Panel error isolation remains `PanelBoundary` (owned;
ADR-008), which already implements the "reload one panel" invariant, so no error-boundary library is
added.

## Consequences

- Adding a panel is one predictable edit: a manifest entry plus its component in the registry. The
  two ways to get it wrong (missing component, malformed entry) both fail automatically — one at
  compile time, one at load time.
- An agent edit that breaks the import boundary fails CI rather than relying on a reviewer noticing.
- The runtime dependency surface stays at React; all new enforcement is dev-only
  (dependency-cruiser) plus compile-time (`satisfies`) plus a small owned validator.
- Held in reserve from the same scout survey, adopted only when a real need appears (each is
  permissively licensed and self-hostable): **Ladle + Playwright** for a story-per-panel with
  visual-regression baselines that fail CI on a diff; the **OpenTelemetry JS browser SDK → Jaeger**
  for persistent frontend telemetry alongside the audit sidecar; **XState v5** for the minority of
  panels whose state graph is complex enough to pay for a statechart.
