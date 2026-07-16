# Gap Analysis — Round-1 Corpus vs the Product Vision

Round 1 (corpus/, 2026-07-16) surveyed "container + web UI for a coding agent". The vision in
[`vision-brief.md`](vision-brief.md) is a *product* wrapping that pattern. This maps what
transfers, what's missing, and which round-2 researcher owns each gap.

## What round 1 already gives us

| Vision requirement | Round-1 answer | Fit |
|---|---|---|
| Web VS Code on a port | **code-server** (MIT, 78k★) | Direct hit |
| Chat/control API over CLI agents | **agentapi** (MIT) — HTTP/SSE over Claude Code, Goose, Aider | Strong building block for the chat bubble backend |
| Container hardening model | Official devcontainer egress-firewall pattern + **srt** (Apache-2.0) inside | Adopt as-is |
| Isolation reference | Cowork: VM → bwrap → FS whitelist → egress allowlist | Design north star |
| Full-platform alternative | **OpenHands** (MIT) | Wrong shape (their platform, their UI) but the sandboxed action-server pattern and ACP-drives-Claude-Code are reusable |
| All-in-one container precedent | HolyClaude | Validates demand; AGPL UI + weak hardening = anti-pattern to learn from |
| Multi-tenant upgrade path | E2B / microsandbox (Apache-2.0) | Defer to v2 |
| Session UX patterns | happy (MIT), vibe-kanban (Apache-2.0), Sculptor (reference) | Mine for UX |

## Gaps — round-2 researchers assigned

| # | Gap (not covered in round 1) | Owner |
|---|---|---|
| 1 | Corporate SSO: Entra ID into web UI + code-server; OpenWebUI licence check | r1-sso |
| 2 | Embedded local model: Gemma **Terms-of-Use trap**, permissive model alternatives, runtime (llama.cpp/Ollama/vLLM), RAM realities | r2-local-model |
| 3 | Multi-provider LLM gateway from TOML/dotenv (LiteLLM et al.) | r2-local-model |
| 4 | Double-click desktop launcher; **Docker Desktop paid-licence trap**; Podman/Rancher alternatives; locked-down Windows reality | r3-desktop-wrapper |
| 5 | Permissive Nostr/Solid replacements; is Nostr even the right transport for audit mirroring | r4-nostr-solid-chat |
| 6 | Embeddable chat-bubble widget for an unknown corporate dashboard (script-tag worst case, identity pass-through) | r4-nostr-solid-chat |
| 7 | Agent observability: hierarchical traces, user identity per trace, OTel GenAI status, Claude Code OTel emissions, tamper-evidence | r5-observability |
| 8 | First-boot admin control plane precedents; closest whole-vision prior art; Microsoft-native competitive answer ("why not Dev Box/Copilot Workspace?") | r6-prior-art |
| 9 | Encrypted-at-rest portable per-project vaults; FUSE sidecar privileges; SSO-gated key release | r7-encrypted-fs |
| 10 | Zero-inbound-port tunnels for client posture (CF Access+Entra, Tailscale/headscale, NetBird, OpenZiti); 3-posture matrix | r8-secure-tunnel |
| 11 | TS7 production-readiness; TS runtime/framework; TS-native LLM gateway to avoid Python | r9-typescript |
| 12 | Snapshot/rollback architecture for a self-modifying container system | s1-snapshot-arch (specialist) |
| 13 | Identity-seeded hierarchical audit + write-only sidecar enforcement design | s2-audit-arch (specialist) |

## Gaps nobody is researching yet — parked, must reach the PRD

1. **Shipping Claude Code itself.** The CLI is proprietary (Anthropic Commercial ToS). Embedding
   it in a client-distributed container is a licensing/legal question, not a technical one —
   likely fine when each user authenticates with their own Anthropic account, but *redistribution
   of the binary* needs checking. Same question for any provider CLI we embed. **Legal check
   before the brief response.**
2. **Our own stack's licences.** ruflo/ruvector/claude-flow, the QE fleet, skills — audit what
   we can ship permissively before promising them in the container.
3. **Secrets management.** Provider keys live where? (Gateway holds them; agents must never read
   raw keys; admin plane writes them.) Related: key storage for the r7 vaults.
4. **Product update channel.** How the client receives our updates (signed images, watchtower,
   staged channels) — and how updates interact with s1 snapshots.
5. **Whole-system backup/restore** — distinct from overhaul snapshots (host dies, restore
   elsewhere; overlaps r7 portability).
6. **Multi-project / multi-user topology.** Per-project vaults imply per-project workspaces —
   one shared container vs per-user/per-project instances. Changes SSO, audit, and snapshot
   design. Needs the client brief.
7. **RBAC + approval workflow for overhauls.** Who may ask the agent for CTO-scale changes?
   Four-eyes approval? The chat bubble can't be the only gate.
8. **Prompt-injection defence** for an agent empowered to rebuild its own container (we have
   in-house aidefence patterns; needs explicit treatment given system-modification powers).
9. **Cost metering** per user/project across provisioned providers — the client admin will ask.
10. **Telemetry consent / offline posture** — can the sandbox run fully air-gapped on the
    embedded model alone?

## Deliberately out of scope until the client brief

- Kubernetes/fleet deployment (assume single-host docker-compose for the pilot).
- The client dashboard integration specifics (unknown stack — chat bubble research covers the
  worst case).
- Data-residency guarantees per provider (needs client's compliance requirements).
