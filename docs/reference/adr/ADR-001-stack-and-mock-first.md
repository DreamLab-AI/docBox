# ADR-001 — Control-plane stack and mock-first build

Status: Accepted · 2026-07-16 · Realises PRD-001

## Context

We need to design and judge the control-plane UI before anything is containerised or wired to a
backend. The wider product decisions (corpus round 2) fixed a TypeScript-first stack: Node 24,
Bun for supervision, Hono for the eventual server, Vite/Vitest/Biome for the front end. The
control plane is the first thing we build against those decisions.

## Decision

Build Foreman as a **Vite + React 18 + TypeScript** single-page app, **mock-first**: all data
comes from a deterministic in-memory store behind a single adapter module (`data/adapter.ts`).
Feature modules import only from the adapter and the frozen domain types, never from the mock
generator.

React over the alternatives (Leptos, plain Hono templates) because the visualiser needs rich
client interaction and the team's component knowledge is deepest here; the eventual control-plane
*server* is still Hono, which serves this SPA.

## Consequences

- The design is reviewable now, offline, with a realistic world seeded from one PRNG.
- Swapping mock for a real HTTP/SSE client is a rewrite of `data/adapter.ts` alone; no feature
  code changes. The seam is the whole point.
- Vite/esbuild is the lean toolchain already chosen for the product; no new tooling debt.
- Cost: the SPA is not yet server-rendered or authenticated. Acceptable, because this milestone is
  the interface, not the deployment. Containerisation and Entra wiring are later PRDs.

## Alternatives considered

- **Leptos (Rust/WASM)**: matches an all-Rust future but slower to iterate on a visual-heavy UI
  and further from the team's current reach. Revisit only if the product goes Rust-first.
- **Server-rendered Hono + htmx**: leaner runtime, but the visualiser's canvas interaction and
  playback want a real client component model.
