---
name: happy (slopus)
category: claude-code-web-ui
url: https://github.com/slopus/happy
license: MIT
license_ok_for_client: true
stars: 22667
last_push: 2026-07-11
status: active
verified: 2026-07-16
---

# happy

The strongest **permissive** web/mobile client for Claude Code. MIT, very active, 22k+ stars.
Web app + native iOS/Android clients, end-to-end encrypted, with a self-hostable relay server —
designed for exactly the "control my Claude Code session from anywhere" use case.

## Architecture

- A **daemon/CLI wrapper** (`happy` command) runs alongside Claude Code wherever Claude Code
  runs — which for us means *inside our container*.
- Clients (web/mobile) connect through a relay server (theirs, or self-hosted —
  `slopus/happy-server`) with end-to-end encryption; the relay cannot read session content.
- Supports multiple concurrent sessions/machines, push notifications on permission requests,
  voice input.

## Fit for the client project

- Licence-clean (MIT across happy, happy-server, happy-cli).
- Composes with our container rather than competing with it: our single-purpose container runs
  Claude Code + srt + happy daemon; the web UI is already built, maintained, and mobile-capable.
- Trade-off: its UX is chat/session-centric (a Claude Code remote control), not an
  IDE-in-browser. If the client needs file-tree/editor/diff views in the web UI, we either extend
  it or build thin on [agentapi](agentapi.md) instead.
- Self-hosting the relay adds one more service to operate; evaluate whether E2E-encryption via
  relay or direct LAN/VPN access fits the client's deployment.

## Sources

- https://github.com/slopus/happy
- https://github.com/slopus/happy-server
- https://happy.engineering
