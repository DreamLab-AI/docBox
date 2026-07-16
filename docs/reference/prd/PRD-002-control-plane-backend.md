# PRD-002 — Control-plane Backend (Foreman Server)

Status: Draft · Owner: DreamLab · Created 2026-07-16 · Realises PRD-000 (M2) · Supersedes: none

## Summary

Foreman's server is a small Hono service that turns the mock-backed SPA into a live control plane.
It serves the domain world over HTTP, streams live events over SSE, reads and writes
`foreman.toml`, and triggers rebuild orchestration. The SPA hydrates from it at boot; no feature
code changes, because the server sits behind the adapter seam PRD-001 defined.

If you remember one thing: **the server fills the seam, it does not move it.** `data/adapter.ts`
swaps its mock backend for an HTTP/SSE client, and every feature keeps importing the same adapter
and the same frozen domain types.

## Problem

M1 shipped Foreman as a deterministic in-memory world so the design could be judged offline. That
world is read-only fiction: it cannot show a real session, persist a config change, or start a
rebuild. To be a control plane rather than a mock-up, Foreman needs a backend that holds the real
domain state, pushes change as it happens, owns the config file, and is the one place a rebuild is
triggered.

## Goals

1. Serve the domain world (owners, sessions, agents, actions, config, snapshots, audit head) over
   a typed HTTP API the adapter consumes.
2. Stream live activity over SSE so the visualiser and activity feed update without polling.
3. Read and write `foreman.toml` as the source of truth for configuration, validated on the way in.
4. Expose rebuild orchestration triggers: stage a plan, start a rebuild, report progress, roll back.
5. Keep the offline mock as the default: the server is opt-in, selected by adapter config, never
   required to run the UI.

## Non-goals

- Authentication and network exposure (PRD-005), and the audit sidecar and vaults (PRD-006). The
  server integrates with them; it does not implement them.
- The agent engine (PRD-003) and the container build itself (PRD-004). The server triggers a
  rebuild; the build system performs it.
- Any feature-code change. If a feature needs a new import to talk to the server, the seam has
  leaked and the design is wrong.

## Adapter seam contract

The seam is one module (`data/adapter.ts`) exporting typed functions and an event subscription,
with two implementations behind one interface:

| Concern | Mock (default, offline) | Server (opt-in) |
|---|---|---|
| Reads | Seeded PRNG world in memory | `GET` JSON from the Hono API |
| Live events | Scripted replay on a timer | SSE stream from `/api/events` |
| Config write | Mutates the in-memory copy | `PUT` → server writes `foreman.toml` |
| Rebuild | Fakes plan and progress | Real orchestration triggers |

Boot order: the app reads its adapter mode from runtime config. In server mode it hydrates initial
state from the API, then opens the SSE stream. If the server is unreachable it does not silently
fall back to the mock; it surfaces the failure, because a control plane that quietly shows stale
fiction is worse than one that says it is offline.

## API surface (shape, not final)

| Route | Method | Purpose |
|---|---|---|
| `/api/world` | GET | Initial hydration: owners, sessions, agents, recent actions, config, snapshots |
| `/api/events` | GET (SSE) | Live action, agent, and system events |
| `/api/config` | GET / PUT | Read the merged config; write staged changes to `foreman.toml` |
| `/api/rebuild/plan` | POST | Stage rebuild changes into a reviewable plan (TOML diff + sequence) |
| `/api/rebuild` | POST | Start a staged rebuild; progress arrives on the event stream |
| `/api/rebuild/rollback` | POST | Roll back to the retained prior definition |

The typed client (`hc`) gives the adapter end-to-end types from the Hono route definitions, so a
route-shape change is a compile error in the adapter, not a runtime surprise.

## Stack

Hono (MIT) on Node 24 LTS, from corpus/11: it runs identically on Node and Bun, has first-class
SSE (`hono/sse`), and ships a typed client that gives tRPC-grade types without tRPC. Config is
parsed by smol-toml, layered by c12 (file → dotenv → env), and validated by zod v4 (ADR-004). SSE
over WebSocket is decided in ADR-005.

## Success criteria

- The SPA runs unchanged against either adapter backend; switching is a config flag, not an edit.
- A config change written through the UI lands in `foreman.toml` and survives a server restart.
- An action emitted by the engine appears in the visualiser within a second, over SSE, no reload.
- A rebuild started from the UI produces a plan, runs, and reports progress and outcome on the stream.
- Killing the server surfaces an offline state in the UI; it never renders stale data as live.

## Open questions (for the client brief)

- One server per box, or a shared control plane fronting several sandboxes?
- Does config write need optimistic locking if two operators edit at once?
- SSE reconnection and backfill: how much event history to replay on reconnect?

## Traceability

Realises PRD-000 (M2). Fills the seam from ADR-001 and PRD-001. Config format: ADR-004. Event
transport: ADR-005. Triggers the rebuild in PRD-004 and the engine in PRD-003. Domain vocabulary:
DDD-001. Corpus basis: corpus/11 typescript-stack.
