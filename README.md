# Client Dev Sandbox — Research Corpus

Research corpus for a client project: a **self-contained Docker dev sandbox with an embedded
agentic intelligence layer** — admin web control plane, Entra SSO, web VS Code, embedded +
provisioned LLMs, hierarchical audit trail, snapshot/rollback of agent-driven overhauls,
per-project encrypted vaults, zero-inbound-port exposure. Feeds the upcoming PRD/ADR/DDD work
(client brief expected ~late July 2026).

**Hard constraint: permissive licences only (MIT / Apache-2.0 / BSD) in anything shipped.**
Every licence claim in this corpus was verified against the GitHub API or a raw LICENSE read on
**2026-07-16** — several popular projects' badges lie (details per file).

- Vision: [`docs/vision-brief.md`](docs/vision-brief.md)
- Gaps & coverage: [`docs/gap-analysis.md`](docs/gap-analysis.md)
- Questions for the client: [`docs/client-questions.md`](docs/client-questions.md)
- Machine-readable round-1 dataset: [`data/options.json`](data/options.json)

## Corpus layout

| Directory | Contents | Round |
|---|---|---|
| `corpus/01-anthropic-native/` | Claude Code web / Cowork reference architecture, srt sandbox runtime, official devcontainer pattern | 1 |
| `corpus/02-claude-code-web-uis/` | HolyClaude, CloudCLI (AGPL flag), happy, agentapi, archived options | 1 |
| `corpus/03-agent-platforms/` | OpenHands, vibe-kanban, crystal, Sculptor | 1 |
| `corpus/04-sandbox-infra/` | E2B, Daytona (no licence!), microsandbox, Cloudflare sandbox-sdk, managed services | 1 |
| `corpus/05-identity-and-access/` | Entra SSO architecture, per-project encrypted vaults | 2 |
| `corpus/06-network-exposure/` | Zero-inbound tunnels + Entra, 3-posture matrix | 2 |
| `corpus/07-models-and-gateways/` | Embedded local models (Gemma 4!), provider gateways | 2 |
| `corpus/08-distribution/` | Desktop launcher, Docker Desktop trap, server-vs-local | 2 |
| `corpus/09-observability-audit/` | Audit/identity architecture (specialist), observability tooling | 2 |
| `corpus/10-architecture/` | Snapshot/rollback architecture (specialist) | 2 |
| `corpus/11-ecosystem/` | Nostr/Solid/chat-widgets, prior-art sweep, TypeScript stack | 2 |

## Headline findings

1. **The combination is whitespace.** No surveyed product does all six pillars; nothing at all
   does "agent overhauls its own platform tooling with snapshot+rollback". Closest three:
   Coder (AGPL — reference only), OpenHands (MIT), AnythingLLM (MIT). No single Microsoft SKU
   competes — their stack is cloud/subscription-bound at every layer, so a self-contained
   client-owned box is a defensible differentiator.
2. **Licence badges lie.** Verified-by-reading-LICENSE traps found: Open WebUI (custom
   branding-restricted licence), immudb (BSL 1.1, not Apache), Redis ≥8 (RSAL/SSPL/AGPL —
   use Valkey), Daytona (no LICENSE file at all), NLUX (modified MPL), Typebot (FSL),
   Pangolin (AGPL/commercial), NetBird control plane (AGPL), HashiCorp Vault (BUSL → OpenBao),
   AutoGPT platform dir (Polyform Shield), asciinema CLI (GPL-3) vs its player (Apache-2.0),
   util-linux `script.c` (BSD-3) vs `scriptreplay.c` (GPL-2+).
3. **Two assumptions died in research.** Gemma is no longer categorically encumbered — Gemma 4
   (Apr 2026) is Apache-2.0; the Terms-of-Use trap only applies ≤3n. And TS7 went GA
   2026-07-08 but has no stable programmatic API until 7.1 — build on tsc 5/6, run `tsgo` in CI.

## Emerging reference architecture (hypothesis for the PRD — not yet decided)

| Layer | Choice | Source |
|---|---|---|
| Config | agentbox.toml adapter-slot pattern · smol-toml + c12 + zod v4 · first-boot wizard writes TOML (Coolify pattern, Portainer time-boxed admin claim) | in-house · 11 · r6 |
| Identity | Entra App Roles → oauth2-proxy (`ms_entra_id`) → Traefik/Caddy forward-auth; internal gateway-signed JWT; `entra:{tid}:{oid}` as the immutable seed | 05 · 09 |
| Core stack | Node 24 LTS control plane on Hono (+`hc` typed client) · Bun for agent supervision + single-binary sidecars · tsc 5/6 now, TS7 at 7.1 | 11 |
| Surfaces | code-server behind the proxy · LibreChat (MIT) or bespoke chat UI · **deep-chat** (MIT) script-tag bubble in the client dashboard → agentapi/Hono SSE backend | 02 · 05 · 11 |
| Models | Vercel AI SDK (Apache-2.0) in-process, provisioned from TOML+dotenv · embedded Qwen3-4B/8B or Gemma-4-E4B on llama.cpp / Docker Model Runner (8 vCPU/16GB) | 07 · 11 |
| Agent layer | claude-flow/ruflo orchestrator + Claude Code under **srt** inside the hardened container (devcontainer egress-firewall pattern) | 01 |
| Snapshots | "Three planes, one supervisor": git+local registry (system), restic (user data), WORM (audit) · blue/green cutover with data-compat probe · supervisor in a recovery partition outside the agent's reach | 10 |
| Audit | Claude Code hooks → WAL spool → **topologically write-only sidecar** (two networks) · hash-chained JSONL + hourly Ed25519 anchors off-box · OTel (traces beta) → collector → ClickHouse · Helicone/OpenLIT UI · `script --log-io` + chrome-devtools screencast + rrweb | 09 |
| Vaults | gocryptfs (MIT) cipherdirs · v1 decrypt-on-unlock (zero privileges) · DEKs wrapped in client's Azure Key Vault, released on Entra session | 05 |
| Network | Loopback-only host binding + cloudflared + **Cloudflare Access→Entra** (posture a) · Entra Private Access if Microsoft-mandated (b) · OpenZiti self-host (c) | 06 |
| Distribution | Likely server-hosted + thin URL shell/PWA (kills Docker Desktop licensing + WSL2/GPO friction structurally); Electron-over-Podman/Rancher only if offline/local is required | 08 |

**Cross-stream conflict resolutions**: LiteLLM (r2) superseded by Vercel AI SDK (r9) for the
TS-first constraint — both permissive, language/ops call. immudb corrected from Apache-2.0 (s2)
to BSL 1.1 (r5, LICENSE read). Nostr for internal audit mirroring: r4's honest answer is
"protocol enthusiasm — use an internal bus" *unless* the client wants user-sovereign data
portability; r5's anchoring of audit head-hashes to our existing relay is the one lightweight
legitimate use either way.

## Round-1 quick matrix (original single-purpose-container survey)

✅ Permissive & healthy: OpenHands (MIT, 81k★) · code-server (MIT, 78k★) · vibe-kanban
(Apache-2.0) · happy (MIT) · E2B (Apache-2.0) · microsandbox (Apache-2.0) · srt (Apache-2.0) ·
agentapi (MIT) · cloudflare/sandbox-sdk (Apache-2.0).
⚠️ Flagged: claudecodeui/CloudCLI (AGPL) · HolyClaude (MIT shell over AGPL UI) · Daytona (no
licence) · opcode/claude-squad (AGPL) · sugyan webui + omnara + textcortex (archived) ·
anthropics/claude-code `.devcontainer` (proprietary files, reimplementable pattern).

## Conventions

One option per file; YAML frontmatter with `verified:` date — update when refreshing. Round-2
files carry `researcher:` provenance (nine Sonnet researchers + two Opus specialists,
fan-out/fan-in 2026-07-16). Add new findings as new files; corrections edit the original file
with a note citing the correcting stream.
