---
name: HolyClaude
category: claude-code-web-ui
url: https://github.com/CoderLuii/HolyClaude
license: MIT (repo) — but bundles AGPL-3.0 CloudCLI web UI
license_ok_for_client: false
stars: 2431
last_push: 2026-07-15
status: active
verified: 2026-07-16
---

# HolyClaude

The closest existing thing to the target model: the **real Claude Code CLI in a single Docker
container with a browser UI**, plus headless Chromium/Playwright and a full dev toolchain.
`docker compose up`, open `localhost:3001`, log in with Anthropic credentials (Pro/Max plan or
API key). ~4 GB image (2 GB slim tag without browser).

## Why it is flagged for client work

- Its web interface is **CloudCLI (siteboon/claudecodeui), which is AGPL-3.0**. The repo's MIT
  badge covers the packaging, not the UI it ships. Distributing this to a client as a network
  service triggers AGPL obligations on the UI component.
- Container hardening is weak by design: compose file uses `cap_add: SYS_ADMIN, SYS_PTRACE` and
  `security_opt: seccomp=unconfined` (needed for Chromium sandboxing inside). That inverts the
  isolation story — the container is *less* confined than a default one.

## What to learn from it

- Validates demand and UX for the "one container, one URL" model — active, popular, real users.
- Credential handling pattern: bind-mount `~/.claude` so OAuth session survives restarts.
- Bundling Playwright/Chromium in-container is what forces the weak seccomp profile — our design
  should push browser automation to a sidecar (as our existing agentbox stack already does) to
  keep the agent container tight.

## Sources

- https://github.com/CoderLuii/HolyClaude
- https://hub.docker.com/r/coderluii/holyclaude
- https://dev.to/coderluii/how-i-run-claude-code-in-docker-with-a-web-ui-and-headless-browser-5dko
