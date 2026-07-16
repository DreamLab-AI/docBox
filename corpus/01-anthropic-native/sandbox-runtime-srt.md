---
name: sandbox-runtime (srt)
category: anthropic-native
url: https://github.com/anthropic-experimental/sandbox-runtime
license: Apache-2.0
license_ok_for_client: true
stars: 4681
last_push: 2026-07-16
status: active
verified: 2026-07-16
---

# `@anthropic-ai/sandbox-runtime` (srt)

Anthropic's official, open-source (Apache-2.0) sandbox runtime — the same isolation layer Claude
Code uses internally for its Bash tool, exposed as a standalone library/CLI that can wrap **any
process**, including Claude Code itself.

## What it does

- Wraps an entire process tree in OS-level isolation:
  - **Linux**: bubblewrap (bwrap)
  - **macOS**: Seatbelt (`sandbox-exec`)
  - Windows: not supported
- **Deny-by-default** for filesystem writes and network; you allowlist paths and hosts.
- Running Claude Code through srt constrains *every* tool, hook, and MCP server in the session —
  not only Bash.

## Usage shape

```bash
npx @anthropic-ai/sandbox-runtime <config> -- claude ...
```

TypeScript package, config declares writable paths + permitted network hosts.

## Relevance to our container

This is the **inner layer** of the build hypothesis. Cowork's stack is VM → bwrap; ours becomes
container → srt(bwrap). Inside a Docker container on Linux, srt gives the same
second-boundary property Cowork has, at near-zero overhead, under a licence we can ship.

Caveat: bwrap inside Docker needs user namespaces available in the container (seccomp/apparmor
profiles must permit `unshare`); this is a solved but fiddly configuration point — capture the
working profile in the corpus when we prototype it.

## Sources

- https://github.com/anthropic-experimental/sandbox-runtime
- https://www.anthropic.com/engineering/claude-code-sandboxing
- https://code.claude.com/docs/en/sandbox-environments
