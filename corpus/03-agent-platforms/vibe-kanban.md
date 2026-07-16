---
name: vibe-kanban (BloopAI)
category: agent-platform
url: https://github.com/BloopAI/vibe-kanban
license: Apache-2.0
license_ok_for_client: true
stars: 27403
last_push: 2026-04-24
status: active-quiet
verified: 2026-07-16
---

# vibe-kanban

A **kanban-board web UI for orchestrating parallel coding agents** (Claude Code, Codex, Gemini
CLI, opencode, Amp, …). Apache-2.0, 27k★. Rust backend + React frontend, launched via
`npx vibe-kanban`, serves a local web app.

## Architecture

- Tasks are kanban cards; starting a task spawns the chosen agent CLI against an isolated **git
  worktree** of the repo; review/merge flow built in; dev-server preview per attempt.
- Centralises MCP configuration across agents; tracks task status across many parallel attempts.
- Isolation model is **worktrees, not containers** — agents share the host environment by
  default. (Their docs discuss running the whole thing inside a container for isolation.)

## Fit for the client project

- Licence-clean and validated UX for the "queue of agent tasks" interaction model — relevant if
  the client's single-purpose UI is task-oriented rather than session-oriented.
- Not itself the container layer; it would run *inside* our container (one vibe-kanban + N
  worktrees), or be cannibalised for UX patterns.
- Push cadence has slowed (last push 2026-04) — check pulse before committing; the company
  (Bloop) has pivoted before.

## Sources

- https://github.com/BloopAI/vibe-kanban
- https://www.vibekanban.com
