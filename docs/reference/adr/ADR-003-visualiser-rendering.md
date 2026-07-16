# ADR-003 — Visualiser rendering approach

Status: Accepted · 2026-07-16 · Realises PRD-001 (F2)

## Context

The visualiser plots the action stream (~180 events now, more later) on a timeline that regroups
by owner, agent, element, or action kind, with hover, selection, and a playback cursor. The user
asked for eye-candy where it helps, kept lean and understandable.

## Decision

Render the mark field on a **2D canvas**, not the DOM and not a heavy chart library. Compute
layout in plain TypeScript (time→x, lane→y). Keep an optional, self-contained WebGL accent for the
play cursor's glow, gated so the view degrades to pure canvas if WebGL is unavailable or reduced
motion is requested.

No charting dependency (D3, visx, ECharts). The layout maths is simple enough to own, and owning
it keeps the bundle small and the code legible, which the brief asked for.

## Consequences

- ~180 marks stay smooth; the design scales to thousands without a DOM node per mark.
- Regrouping is a recompute of lane assignment, not a re-render of a component tree.
- The code is readable: coordinate maths is commented and lives in one place.
- Accessibility cost: canvas is not in the accessibility tree. Mitigation: the Activity tab (F3)
  presents the same events as a semantic, filterable list, so nothing in the visualiser is the
  only way to reach a fact.
- Reduced-motion is honoured: no auto-play, and the WebGL accent is skipped.

## Alternatives considered

- **SVG marks**: accessible and simple but a node per mark gets heavy and janky past a few
  hundred events.
- **A charting library**: faster to start, but adds bundle weight and its own opinions, and the
  regrouping interaction is bespoke enough that we would fight the library.
