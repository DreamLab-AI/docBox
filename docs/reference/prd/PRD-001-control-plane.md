# PRD-001 — Management Web Interface (Control Plane)

Status: Draft · Owner: DreamLab · Created 2026-07-16 · Supersedes: none

## Summary

Foreman is the single web interface an operator uses to run a client's agentic dev sandbox. It
gives an admin one place to provision the system, watch what the agents and people are doing,
approve or roll back large changes, and read the audit trail. Primary users of the *sandbox*
never see Foreman; they see a chat bubble in their own dashboard. Foreman is for the person who
owns the box.

If you remember one thing: **Foreman makes the difference between a live change and a rebuild
visible at every control**, so an operator always knows whether a toggle is instant or triggers
an image rebuild with rollback.

## Problem

A self-modifying agent sandbox has three audiences with different needs, and today nothing serves
the operator:

- The **primary user** wants a chat bubble and nothing else.
- The **agent layer** wants a work ledger and a place to run.
- The **operator/admin** (often the client CTO) needs to answer, quickly: is the box healthy,
  who did what, what is about to change, and can I undo it. That is Foreman.

Without a control plane, provisioning is hand-edited TOML, "what did the agent change" is a log
grep, and rollback is a manual Docker dance. The operator carries risk they cannot see.

## Goals

1. One surface to provision and reconfigure the sandbox, with the live/session/rebuild
   distinction made unmissable.
2. A visualiser that answers "who did what, to what, and when" across owners, agents, elements,
   and actions over time.
3. Safe overhauls: snapshot, rebuild, healthcheck, blue/green cutover, one-click rollback, all
   visible and reversible.
4. A readable audit trail an operator trusts months later.
5. Works offline against mock data during development; the data seam swaps to a real backend
   later without touching feature code.

## Non-goals

- The primary-user chat experience (that is the embedded bubble, a separate surface).
- The agent engine itself (pi) or the container build system (later PRDs).
- Real backend wiring, authentication, or persistence in this milestone. Foreman ships first as
  a mock-backed UI so the design can be judged before anything is containerised.

## Users and jobs

| User | Job Foreman does |
|---|---|
| Admin / CTO | Provision providers and toolchain; approve overhauls; roll back; read audit |
| Operator | Watch live activity; spot blocked or failed actions; unlock a project vault |
| Reviewer / compliance | Verify the audit chain; export records; trace an owner's actions |

## Feature sets

Each set states when and why to use it. The UI repeats this guidance in place (a "when to use"
block opens every feature) so the operator is never guessing.

### F1 — Overview
At-a-glance health and load. Use it first each session to decide where to look next. Shows open
sessions, running agents, blocked/failed counts, any overhaul in flight, and work waiting on
human approval.

### F2 — Visualiser
The centrepiece. A timeline of actions over time that regroups by owner, agent, element, or
action kind. Use it to trace an owner's blast radius, spot a rogue agent, or watch an overhaul
burst. Playback sweeps a time cursor so change is legible as motion.

### F3 — Activity
An action feed plus the agent spawn tree, coordinated. Use it to follow a live session or audit
one agent in detail. Filter by owner, kind, or status; click an agent to scope the feed.

### F4 — Work (ledger)
The beads work ledger: dependency graph, ready queue, and approval gates. Use it to track
long-horizon overhaul work across sessions and to give the human sign-off that lets a gated
overhaul proceed.

### F5 — Configuration
Every changeable option, grouped into tab groups (providers, toolchain, identity, network,
vaults, audit, snapshots, agents). Every control shows its apply-class. Use it to provision a new
client, change providers day to day, or plan a rebuild. Rebuild changes stage into a plan the
operator reviews before it runs.

### F6 — Operations
Snapshots and rollback, the audit trail, and vault lock state. Use it to recover from a bad
overhaul, prove what changed and who asked, or unlock a project to work on it.

### F7 — Documents
Upload scans and forms for the agent to read, watch OCR progress, and confirm the handwriting
fields the model was unsure of. Each document shows whether it stayed private (OCR ran in the box)
or went to a cloud provider. Detail in PRD-007.

### F8 — Self-modifying interface
The interface edits itself under human guidance. A user asks in chat for a layout change; the
agent applies it live through hot reload or the layout manifest, and sees the result via a
screenshot. Panels are functionally isolated, so an agent edit that breaks one panel is contained,
and interface state survives the reload. Architecture in ADR-008; the Interface configuration
group carries the hot-class controls.

## Apply-class model (core requirement)

Every configuration option is one of four classes. The UI must make the class obvious at the
point of change.

| Class | Meaning | Example |
|---|---|---|
| **Hot** | Interface edit through hot reload or the layout manifest: sub-second, no rebuild | Panel layout, density, agent layout edits |
| **Live** | Takes effect immediately on the running sandbox | Toggle a provider, edit the egress allowlist |
| **Session** | Applies to sessions started after saving | Default model route, audit verbosity |
| **Rebuild** | Writes TOML → builds image → blue/green swap with rollback | Toolchain bundles, embedded model, agent engine |

Rebuilds are the only changes that can break the box, so they are the only changes routed through
a reviewed plan and protected by auto-rollback. Hot changes cannot break the box or a panel: the
layout is data and each panel is isolated by an error boundary.

## Success criteria

- An operator can, from a cold open, tell within 10 seconds whether the box is healthy.
- Every config control shows its apply-class (hot, live, session, or rebuild) without a click.
- The visualiser renders ~180 events smoothly and regroups without a reload.
- The audit chain verifies in-browser and reports the last off-box anchor.
- No feature reads mock data directly; all data flows through the adapter seam.
- A full reload keeps the user on the same tab with their filters intact; a panel that faults is
  contained and offers a reload without blanking the interface.

## Open questions (for the client brief)

- Which config options are admin-only vs operator-visible (RBAC granularity)?
- Does the visualiser need live streaming, or is periodic refresh enough for v1?
- Retention and export format for the audit trail (SIEM target)?

## Traceability

Realised by: ADR-001 (stack), ADR-002 (apply-class), ADR-003 (visualiser rendering),
ADR-007 (primary-user surface), ADR-008 (self-modifying interface), DDD-001 (domain model),
DDD-003 (interface domain). Feature sets F1–F8 map to `app/src/features/*`; F7 is detailed in
PRD-007, F8 in ADR-008.
