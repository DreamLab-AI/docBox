---
name: Claude Code official devcontainer pattern
category: anthropic-native
url: https://github.com/anthropics/claude-code/tree/main/.devcontainer
license: proprietary (Anthropic Commercial Terms of Service)
license_ok_for_client: false  # the files; the PATTERN is trivially reimplementable
stars: 138028
last_push: 2026-07-15
status: active
verified: 2026-07-16
---

# Official Claude Code devcontainer pattern

Anthropic ships a reference `.devcontainer` in the `anthropics/claude-code` repo: a Docker
environment where Claude Code can run with relaxed permissions (`--dangerously-skip-permissions`
becomes acceptable) because the container, not the permission prompts, is the security boundary.

## Licensing caution

The `anthropics/claude-code` repo's `LICENSE.md` is **"© Anthropic PBC. All rights reserved"**
under their Commercial Terms — it is NOT open source. For client work we must **reimplement the
pattern, not copy the files**. The pattern itself (a Dockerfile + an iptables init script) is
not copyrightable as an idea and takes an afternoon to rewrite.

## What the pattern contains

- Node-based dev image with Claude Code preinstalled, running as a non-root user.
- **`init-firewall.sh`** — the important part: an iptables/ipset egress firewall that
  default-denies outbound traffic and allowlists only required domains (Anthropic API, npm,
  GitHub, etc.), resolving allowed domains to IP sets at container start.
- Standard `devcontainer.json` so VS Code / GitHub Codespaces / devpod can all launch it.

## Relevance to our container

This is the **outer layer** of the build hypothesis — the containerised equivalent of Cowork's
egress proxy + VM. Combined with [srt](sandbox-runtime-srt.md) inside, it reproduces the Cowork
defence-in-depth on ordinary Docker infrastructure.

Community MIT-licensed reimplementations already exist if we want a permissive starting point to
audit rather than writing from zero (e.g. `hesreallyhim/claude-code-containers`, MIT;
`eRepublik-Labs/claude-code-container`, MIT — both small enough to review line-by-line).

## Sources

- https://github.com/anthropics/claude-code/tree/main/.devcontainer
- https://code.claude.com/docs/en/devcontainer
- https://github.com/hesreallyhim/claude-code-containers (MIT reimplementation)
