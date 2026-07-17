# PRD-000 — Product Shape and Roadmap

Status: Living scaffold · Created 2026-07-16

This is the map of what the product is and the order we expect to build it. It sits above the
per-surface PRDs and points at the research corpus that justifies each choice. Treat the future
milestones as scaffolding: shaped enough to plan against, not yet specified.

## What we are building

A self-contained dev sandbox for a client team. A primary user sees a chat bubble in their own
dashboard and hands the agent problems bigger than their interface. An admin runs the box through
**Foreman**, the control plane. The agent layer does CTO-scale overhauls of the sandbox itself,
bracketed by snapshots and rollback. Everything in the default box is permissively licensed, with
one deliberate exception: the optional browser-sidecar module ships Google Chrome (proprietary) for
a structurally undetectable agent browser (an operator-level decision — see `docker/Dockerfile.browser`).

Two governing rules, from the client steers:

- **A distillation, not agentbox.** Plain container, few moving parts, TOML-gated bundles. If a
  client needs the maximalist machine, sell them agentbox.
- **Maintainability outranks capability.** Fewest tools, one per job, narrow interfaces we own.

These rules take architectural shape as a **slim core with surfaces and modules around it**
([ADR-009](../adr/ADR-009-slim-core-surfaces-as-modules.md)). The core is the governance and data
spine; every other capability is a surface or a module that plugs in through config and a compose
profile. Each open question below then resolves to "add or drop a module", not a core rewrite.

## Milestones

```mermaid
flowchart LR
  M1[M1 Control plane UI\nmock-backed] --> M2[M2 Backend + real data\nHono + adapters]
  M2 --> M3[M3 Agent engine\npi embed + hooks]
  M3 --> M4[M4 Container + rebuild\nsnapshot/rollback]
  M4 --> M5[M5 Identity + tunnels\nEntra + Cloudflare]
  M5 --> M6[M6 Audit + vaults\nwrite-only + gocryptfs]
  M6 --> M7[M7 Chat bubble\nembed in client dashboard]
  classDef done fill:#0e2b28,stroke:#33c2b4;
  classDef active fill:#2b2410,stroke:#f0a53a;
  class M1 done;
  class M2 done;
  class M3,M4,M5,M6 active;
```

Status legend: **Done** shipped and judged · **In progress** being specified or built now ·
**Planned** scoped, not yet started.

| Milestone | Delivers | Status | Basis |
|---|---|---|---|
| **M1** | Foreman UI, mock-backed, judged before containerising | Done | PRD-001, ADR-001/002/003 |
| **M2** | Hono control-plane server; adapter swaps mock for HTTP/SSE | Done | PRD-002, ADR-004/005, corpus/11 |
| **M3** | pi embedded via RPC/SDK; audit + identity injection through its hooks | In progress | PRD-003, corpus/12 |
| **M4** | Multi-stage Dockerfile; three-planes snapshot/rollback; blue/green | In progress | PRD-004, ADR-006, DDD-002, corpus/10, corpus/13 |
| **M5** | Entra SSO via oauth2-proxy; cloudflared + Access; loopback-only | In progress | PRD-005, corpus/05, corpus/06 |
| **M6** | Write-only audit sidecar; hash chain + anchors; gocryptfs vaults | In progress | PRD-006, corpus/09, corpus/05 |
| **M7** | deep-chat bubble in the client dashboard → pi over the control plane | Planned | corpus/11 |

M3–M6 are in progress: their seams are built and tested (`server/src/engine/`, `server/src/audit/`)
or their container definitions written and compose-validated; what remains is host-runtime wiring —
a live `pi` process, real Entra/OIDC and tunnel secrets, and the image builds. M7 is not started:
the client dashboard is unseen.

## Feature areas and their homes

| Area | Surface | Status |
|---|---|---|
| System overview | Foreman F1 | M1 built |
| Action visualiser | Foreman F2 | M1 built |
| Activity + agent tree | Foreman F3 | M1 built |
| Work ledger (beads) | Foreman F4 | M1 built (UI); engine M3 |
| Configuration + apply-class | Foreman F5 | M1 built (UI); rebuild engine M4 |
| Snapshots, audit, vaults | Foreman F6 | M1 built (UI); real M4/M6 |
| Documents + OCR routing | Foreman F7 | M2 built (UI + server); OCR M6, PRD-007 |
| Core/surfaces/modules manifest | Foreman F8 (System) | Built; ADR-009 |
| Agent engine | embedded pi | M3 |
| Chat bubble | client dashboard | M7 |

The tab list is eight (Overview, Visualiser, Activity, Work, Documents, Configuration, Operations,
System); App.tsx and the README are canonical for the current set.

## What we deliberately defer

- Kubernetes or multi-host deployment. Single-host compose for the pilot.
- Multi-tenant isolation beyond per-project vaults, pending the client brief.
- The primary-user chat UX polish, until the sandbox underneath is solid.

## Open questions carried to the client brief

See `docs/client-questions.md`. The five that most change the build: where it runs, one shared
box vs per-user, the concrete "meta app kit", which providers survive procurement, and who may
trigger an overhaul.
