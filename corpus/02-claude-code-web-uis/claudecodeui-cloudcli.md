---
name: claudecodeui / CloudCLI (siteboon)
category: claude-code-web-ui
url: https://github.com/siteboon/claudecodeui
license: AGPL-3.0
license_ok_for_client: false
stars: 12674
last_push: 2026-07-15
status: active
verified: 2026-07-16
---

# claudecodeui (CloudCLI)

The most popular web UI for Claude Code (also drives Cursor CLI and Codex). Desktop and mobile
browser interface for viewing projects/sessions and interacting remotely. Node/React;
`npx @siteboon/claude-code-ui` and it serves on :3001.

## Excluded: AGPL-3.0

Serving it to users over a network (exactly our use case) triggers AGPL's network-copyleft
clause — the client would have to publish source for any modifications. **Do not embed, do not
fork.** This also contaminates [HolyClaude](holyclaude.md), which ships it as its UI.

## What to learn from it (clean-room, feature level only)

- Feature set that 12k+ stars validated: session/project browser across multiple agent CLIs,
  mobile-first layout, file tree + editor, git panel, permission-prompt relay to the browser.
- It wraps the Claude Code CLI via its `--output-format stream-json` interface rather than
  scraping the TTY — the same integration point [agentapi](agentapi.md) (MIT) exposes, so we can
  get equivalent functionality from permissive parts.

## Sources

- https://github.com/siteboon/claudecodeui
- https://cloudcli.ai
