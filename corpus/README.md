# Research Corpus

Licence-verified survey behind the design. Every claim was checked against the GitHub API or a raw
LICENSE read on **2026-07-16**. Permissive licences only (MIT / Apache-2.0 / BSD) for anything
shipped; each file flags the traps.

| Section | Contents |
|---|---|
| `01-anthropic-native/` | Claude Code web / Cowork reference architecture, srt sandbox runtime, devcontainer pattern |
| `02-claude-code-web-uis/` | HolyClaude, CloudCLI (AGPL), happy, agentapi, archived options |
| `03-agent-platforms/` | OpenHands, vibe-kanban, crystal, Sculptor |
| `04-sandbox-infra/` | E2B, Daytona (no licence), microsandbox, Cloudflare sandbox-sdk |
| `05-identity-and-access/` | Entra SSO, per-project encrypted vaults |
| `06-network-exposure/` | Zero-inbound tunnels + Entra, three-posture matrix |
| `07-models-and-gateways/` | Embedded local models (Gemma 4 is Apache-2.0), provider gateways |
| `08-distribution/` | Desktop launcher, Docker Desktop trap, server-vs-local |
| `09-observability-audit/` | Audit/identity architecture, observability tooling |
| `10-architecture/` | Snapshot/rollback architecture |
| `11-ecosystem/` | Nostr/Solid/chat widgets, prior-art sweep, TypeScript stack |
| `12-agent-harness/` | pi and the permissive harness field; beads work ledger |
| `13-toolchain/` | TS dashboard + Python/Jupyter + typesetting bundles |

## Decisions the corpus settled

- **Agent engine: pi (MIT, earendil-works)** — RPC/SDK embeddable, TypeScript-native, hooks carry
  audit and identity. Replaces the proprietary Claude Code CLI, closing the redistribution
  question. Metered API keys only, never subscription OAuth. See `12-agent-harness/`.
- **Work ledger: beads (MIT)** behind a narrow, swappable interface. See `12-agent-harness/`.
- **Embedded model: Qwen3 or Gemma 4**, both Apache-2.0. See `07-models-and-gateways/`.
- **Identity: Entra via oauth2-proxy App Roles**; **network: cloudflared + Access**; **audit:
  write-only sidecar, hash-chained**; **vaults: gocryptfs decrypt-on-unlock**.

## Licence traps found (badges that lie)

Open WebUI (custom source-available licence), immudb (BSL 1.1, not Apache), Redis ≥8
(RSAL/SSPL/AGPL — use Valkey), Daytona (no LICENSE file), NLUX (modified MPL), Typebot (FSL),
Pangolin and NetBird control plane (AGPL), HashiCorp Vault (BUSL — use OpenBao), TaskMaster
(MIT + Commons Clause), Crush (FSL). Each is documented where it appears.
