---
name: agentapi (Coder)
category: claude-code-web-ui
url: https://github.com/coder/agentapi
license: MIT
license_ok_for_client: true
stars: 1455
last_push: 2026-05-27
status: active
verified: 2026-07-16
---

# agentapi

An **HTTP API server around coding-agent CLIs** (Claude Code, Goose, Aider, Codex, Gemini CLI)
from Coder (the code-server / Coder workspaces company). MIT. Single Go binary. This is the best
permissive *building block* if we build our own single-purpose web UI.

## Architecture

- Runs the agent CLI in an in-memory terminal emulator inside whatever environment you choose
  (our container), and exposes:
  - `POST /message` — send a message to the agent
  - `GET /messages` — conversation history
  - `GET /events` (SSE) — stream agent output/state changes
  - `GET /status` — agent state (stable/running)
- Ships a minimal built-in chat web UI; intended to be fronted by your own interface.
- Because it wraps the TTY generically, it survives agent-CLI updates better than parsers of
  internal formats; for Claude Code specifically it can also use structured output.

## Fit for the client project

- The "thin control plane inside the container" piece: container boots → agentapi supervises
  `claude` under srt → our bespoke single-purpose web UI (or the client's product) talks
  HTTP/SSE. Clean layering, tiny audit surface, MIT.
- Note Coder's own "Coder Tasks" platform builds on exactly this primitive — evidence the
  pattern holds up at production scale.
- Related from same org: **code-server** (MIT, 78k★) if the client ever wants full VS Code in
  the browser inside the same container; heavier single-purpose story though.

## Sources

- https://github.com/coder/agentapi
- https://github.com/coder/code-server
- https://coder.com/blog (Coder Tasks announcements)
