---
name: Beads (bd) — dependency-graphed work ledger for the agentic layer
category: agent-harness
round: 2
researcher: r11-beads (sonnet)
verified: 2026-07-16
recommendation: adopt behind the beads adapter-slot boundary — embedded mode per-session sandbox, actor seeded from Entra identity by the control plane, bead IDs as foreign keys in the audit trail; treat bd as a swappable fast-moving dependency
---

# Beads as the agent work ledger

Licences verified via gh api + raw LICENSE reads, 2026-07-16.

## Verified facts

- **`gastownhall/beads`** (steveyegge/beads 301-redirects). **MIT** (raw LICENSE: "© 2025 Beads
  Contributors"). 25.4k★, 346 contributors, created 2025-10-12, pushed same-day. **Single
  static Go binary** (`bd`), installable via brew / `npm i -g @beads/bd`. Velocity: 254 PRs
  merged in the last 30 days.
- **Storage — corrected assumption**: launched as JSONL-in-git; **migrated to Dolt**
  (version-controlled SQL DB) as source of truth by v0.50 — a breaking change that stranded
  old-format community tools. `issues.jsonl` is now an *export for interchange, not the source
  of truth*. Two modes: **embedded** (in-process Dolt, single writer, zero ops — default) and
  **server** (`dolt sql-server`, concurrent multi-agent writers). Postgres/MySQL/SQLite
  dialects exist but lose history/branching/sync.
- **IDs**: hash-based, collision-resistant, adaptive length (`bd-a1b2`), hierarchical for
  epics (`bd-a3f8.1.1`) — built for multi-agent/multi-branch merge safety.
- **Dependency semantics**: blocking — `blocks`, `parent-child`, `conditional-blocks` (run B
  only if A fails), `waits-for` (fan-in); annotations — `related`, `tracks`,
  `discovered-from`, `caused-by`, `validates`, `supersedes`; plus **gates**: `gh:pr` (waits
  for merge), `gh:run` (CI), `timer`, `bead` (cross-repo), **`human` (manual approval)** —
  bridging "ledger says done" to external reality. Cycle detection at write time.
- **Agent workflow**: `bd ready --claim --json` = atomic claim-first-match for concurrent
  agent polling. **Compaction**: `bd admin compact` LLM-summarises old closed issues
  (claude-haiku default) with `bd restore` from Dolt history. `molecules`/`formulas` =
  epic-as-reusable-template (`bd cook`) — repeatable overhaul patterns.
- **Integration surface for a TS control plane**: `--json` on every command is the documented
  supported boundary (internal Go packages are not public API); `beads-mcp` (PyPI) MCP
  adapter; third-party TS SDK (`@herbcaudill/beads-sdk`); OTel metrics/spans incl. Dolt lock
  waits (`BD_OTEL_METRICS_URL`). Docs recommend CLI+hooks (~1-2k tokens) over MCP (~10-50k)
  when shell access exists — which our sandbox has.

## The Gas Town finding

`gastownhall` is Yegge's org; **Gas Town** (`gastownhall/gastown`, MIT, 17k★) is his own
multi-agent orchestrator (20-30 parallel agents) **built on beads as its control and data
plane**. Beads is the substrate of his flagship. Two implications: the ledger-for-agents
pattern is being production-proven at scale by its own author; and our agentic layer is
adjacent to Yegge's product roadmap — watch Gas Town for both ideas and collision.

## Fit assessment

- **(a) CTO-scale overhaul ledger: strong fit.** Hierarchical decomposition, real ordering
  semantics, cross-session `bd ready` pickup, gates for merge/CI/human-approval — the `human`
  gate is a ready-made hook for the "who approves an overhaul" RBAC requirement (gap #7/#8).
- **(b) vs the audit trail: compose, don't merge.** Beads = *intent/planning* record (actor
  strings, issue events, coarse provenance); the s2 audit sidecar = *execution* record (tool
  calls, file hashes, tamper-evidence). Correlate via **bead ID as a foreign key in audit
  events**; never let one subsume the other.
- **(c) Entra attribution: workable, our responsibility.** `BEADS_ACTOR`/`--actor` is an
  unauthenticated string — the control plane resolves the Entra identity at session start and
  exports it before any `bd` invocation (same trust model as `git config user.email`). It then
  flows to assignee fields, OTel attributes, and git trailers.
- **(d) Compose deployment**: no official Docker image — bake the static binary into the
  sandbox image, `BEADS_DIR` on a mounted volume, **embedded mode** for per-session
  single-writer (the natural fit). Escalate to a `dolt sql-server` sidecar over a **Unix
  socket** (docs' own recommendation for sandboxed setups) only if concurrent multi-container
  writers materialise. Dolt remotes/federation exist for cross-site sync if ever needed.

## Risks (weighed against the maintainability steer)

1. **One foundational rewrite already** (JSONL→Dolt) that broke downstream tools — churn
   precedent for a 9-month-old project.
2. **Vibe-coded velocity**: Yegge's own framing; PR #433's merge note — "Claude Code did all
   the heavy lifting… I did apply amateur eyeballs". Fast fixes, fast under-reviewed change.
3. **Open corruption issue #4521** (2026-06-30): Dolt journal corruption + stale locks under
   agent-driven batch writes — *exactly our workload shape*. Six recovery runbooks ship
   in-repo (corruption, merge conflicts, cycles, sync failures…) = these are expected,
   recurring failure classes with a `bd doctor --fix` path. Mitigation: server mode + socket
   reduces per-call engine spin-up.
4. **Bus factor**: Yegge ~13x the #2 contributor; a PROJECT_CHARTER and 346 contributors
   soften it; architecture direction is still one person.
5. **Abandonment is survivable**: MIT, JSONL export always available, Dolt independently
   maintained (DoltHub), community fork-and-carry-on reflex already demonstrated.

## Position

Adopt the *capability* behind the existing **beads adapter-slot boundary** (the agentbox
five-slot precedent — `agbx:HandoffClaim` already models bead claims with attribution chains):
the product depends on a narrow ledger interface; `bd` is the v1 implementation, isolated and
swappable. **backlog.md (MIT)** is the simpler fallback if Dolt's ops burden offends the
maintainability steer in practice. Excluded: TaskMaster (`claude-task-master` — **MIT +
Commons Clause**, bars fee-based resale/hosting: not permissive for a paid client product).
