---
name: OpenHands (+ software-agent-sdk)
category: agent-platform
url: https://github.com/OpenHands/OpenHands
license: MIT (all except enterprise/ directory)
license_ok_for_client: true
stars: 81010
last_push: 2026-07-16
status: active
verified: 2026-07-16
---

# OpenHands

The largest open agent platform (81k★, MIT except `enterprise/`). Formerly All-Hands-AI /
OpenDevin. If the client project's scope grows from "one container, one web UI" to "agent
platform", this is the permissive incumbent rather than something we build.

## Architecture (ICLR 2025 paper + SDK docs)

- **Event-stream architecture**: UI, agent, and environment communicate via an event stream —
  UI is agent- and runtime-agnostic.
- **Per-session Docker sandbox runtime**: each session spins up an isolated container holding a
  bash shell, Jupyter/IPython server, and a Playwright-controlled Chromium browser. An
  **action-execution REST API server runs inside the sandbox**; the platform posts actions
  (bash/python/browse) and receives observations. Arbitrary base images supported.
- **Web GUI**: chat + live visualisation of agent actions, workspace mount, real-time feedback.
- **software-agent-sdk** (MIT, 903★, very active): the 2026 re-architecture into four packages
  (SDK / Tools / Workspace / Server). `DockerWorkspace` gives local-to-remote execution
  portability; interactive surfaces include **browser VS Code, VNC desktop, and persistent
  Chromium**; REST/WebSocket server built in.
- **Agent Client Protocol (ACP) support**: Agent Canvas and the SDK can drive **Claude Code**,
  Codex, or Gemini CLI as the underlying agent inside their sandboxes — so "OpenHands
  infrastructure + Claude Code brain" is a supported configuration, not a hack.

## Fit for the client project

- Pros: mature per-session container lifecycle, web UI, MIT, huge community; ACP means we keep
  Claude Code as the agent.
- Cons: it is a *platform* — much larger surface than a single-purpose container; the
  self-hosted GUI assumes its opinionated workflow; Docker-outside-of-Docker orchestration
  needs care in our DinD-hostile environment (see workspace CLAUDE.md).
- Best extraction if we stay minimal: the **sandboxed action-server pattern** (REST server
  inside the sandbox, thin control plane outside) — same shape as agentapi but battle-tested at
  platform scale.

## Sources

- https://github.com/OpenHands/OpenHands
- https://github.com/OpenHands/software-agent-sdk
- https://docs.openhands.dev/sdk/guides/agent-server/docker-sandbox
- https://arxiv.org/html/2511.03690v1 (SDK paper)
- ICLR 2025: "OpenHands: An Open Platform for AI Software Developers as Generalist Agents"
