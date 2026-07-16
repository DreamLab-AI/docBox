---
name: Sculptor (Imbue)
category: agent-platform
url: https://imbue.com/blog/sculptor-announce
license: proprietary (free desktop app)
license_ok_for_client: false
role: reference-architecture
verified: 2026-07-16
---

# Sculptor (Imbue) — architecture reference only

Proprietary desktop app ("the missing UI for parallel coding agents") — not usable code, but the
best public writing on **per-agent Docker container** engineering:

- Every agent runs in its **own Docker container built from the project's devcontainer spec** —
  clean state, safe parallel execution, host never touched.
- **Cached, project-customised Docker images** cut agent startup from minutes to seconds
  (dependencies pre-baked instead of installed per-run).
- **Pairing Mode** syncs a container's filesystem state to the local IDE for instant review —
  their answer to "how does the human inspect the sandbox?", which for us maps to what the web
  UI must surface (diffs, running processes, previews).

Read alongside [OpenHands](openhands.md) (open equivalent of the runtime) and
[HolyClaude](../02-claude-code-web-uis/holyclaude.md) (single-container variant).

## Sources

- https://imbue.com/blog/sculptor-announce
- https://imbue.com/blog/containers (startup-latency engineering)
