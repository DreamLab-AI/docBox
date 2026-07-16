# Single-Purpose Agent Container — Research Corpus

Research corpus for a client project exploring the **Claude Code on the web / Claude Cowork model**:
a self-contained Docker-style container running a coding agent, exposed through a single-purpose
web interface. This repo collects the candidate architectures, projects, and infrastructure options
with verified licence and health data.

**Hard constraint: permissive licences only (MIT / Apache-2.0 / BSD). This is client work — no
AGPL, no GPL, no unlicensed code in the shipped product.**

All GitHub metadata (licence, stars, last push, archived status) verified **2026-07-16** via the
GitHub API. Machine-readable dataset: [`data/options.json`](data/options.json).

## The target model (what we are emulating)

Anthropic's own products define the pattern:

- **Claude Code on the web** — each session runs in an isolated per-session VM on Anthropic infra,
  with network egress proxied through an allowlist and scoped credential injection.
- **Claude Cowork (local)** — a full Linux VM on the desktop (Apple Virtualization.framework /
  Hyper-V), and *inside* that VM the agent still runs under bubblewrap + seccomp, a VirtioFS
  folder whitelist, and an egress proxy. Defence in depth: VM → process sandbox → FS whitelist → network allowlist.

See [`corpus/01-anthropic-native/`](corpus/01-anthropic-native/) for the full breakdown.

## Corpus layout

| Directory | Contents |
|---|---|
| [`corpus/01-anthropic-native/`](corpus/01-anthropic-native/) | Anthropic's own architecture, sandbox-runtime (srt), official devcontainer pattern |
| [`corpus/02-claude-code-web-uis/`](corpus/02-claude-code-web-uis/) | Self-hosted web front-ends that wrap the real Claude Code CLI in a container |
| [`corpus/03-agent-platforms/`](corpus/03-agent-platforms/) | Full agent platforms and multi-agent orchestration UIs |
| [`corpus/04-sandbox-infra/`](corpus/04-sandbox-infra/) | Isolation/sandbox infrastructure (microVMs, container sandboxes, managed services) |

## Decision matrix (verified 2026-07-16)

### ✅ Permissive — usable for client work

| Project | Licence | Stars | Last push | What it is |
|---|---|---|---|---|
| [OpenHands](corpus/03-agent-platforms/openhands.md) | MIT (excl. `enterprise/`) | 81,010 | 2026-07-16 | Full agent platform: Docker sandbox runtime + web GUI + SDK |
| [code-server](corpus/02-claude-code-web-uis/agentapi.md) | MIT | 78,425 | 2026-07-16 | VS Code in the browser (general-purpose, not agent-specific) |
| [vibe-kanban](corpus/03-agent-platforms/vibe-kanban.md) | Apache-2.0 | 27,403 | 2026-04-24 | Kanban web UI orchestrating Claude Code/Codex/Gemini agents |
| [happy](corpus/02-claude-code-web-uis/happy.md) | MIT | 22,667 | 2026-07-11 | Self-hostable web+mobile client for Claude Code, E2E encrypted |
| [E2B](corpus/04-sandbox-infra/e2b.md) | Apache-2.0 | 13,006 | 2026-07-16 | Firecracker microVM sandboxes for agents (hosted + self-host) |
| [microsandbox](corpus/04-sandbox-infra/microsandbox.md) | Apache-2.0 | 6,951 | 2026-07-16 | Self-hosted libkrun microVM sandboxes |
| [sandbox-runtime (srt)](corpus/01-anthropic-native/sandbox-runtime-srt.md) | Apache-2.0 | 4,681 | 2026-07-16 | Anthropic's official OS-level sandbox (bubblewrap/Seatbelt) |
| [crystal](corpus/03-agent-platforms/crystal.md) | MIT | 3,099 | 2026-02-26 | Desktop multi-session Claude Code manager (worktrees) |
| [agentapi](corpus/02-claude-code-web-uis/agentapi.md) | MIT | 1,455 | 2026-05-27 | HTTP API wrapper around Claude Code/Goose/Aider — UI building block |
| [cloudflare/sandbox-sdk](corpus/04-sandbox-infra/cloudflare-sandbox-sdk.md) | Apache-2.0 | 1,071 | 2026-07-16 | SDK for Cloudflare Containers agent sandboxes (service is cloud-only) |
| [OpenHands agent SDK](corpus/03-agent-platforms/openhands.md) | MIT | 903 | 2026-07-16 | Composable SDK: DockerWorkspace, browser VS Code/VNC, ACP |

### ⚠️ Flagged — licence or health problems

| Project | Problem |
|---|---|
| [claudecodeui / CloudCLI](corpus/02-claude-code-web-uis/claudecodeui-cloudcli.md) (12,674★) | **AGPL-3.0** — excluded for client work |
| [HolyClaude](corpus/02-claude-code-web-uis/holyclaude.md) (2,431★) | Repo is MIT but **bundles AGPL CloudCLI as its web UI** — contaminated for our purposes |
| [Daytona](corpus/04-sandbox-infra/daytona.md) (72,274★) | **No LICENSE file in repo** as of 2026-07-16 (historically AGPL-3.0) — treat as all-rights-reserved |
| opcode, ex-Claudia (22,179★) | AGPL-3.0, stale (last push 2025-10) |
| claude-squad (8,132★) | AGPL-3.0 (terminal-based anyway) |
| [sugyan/claude-code-webui](corpus/02-claude-code-web-uis/claude-code-webui-sugyan.md) (1,142★) | MIT but **archived** 2026-05 |
| textcortex/claude-code-sandbox (320★) | No licence + archived |
| omnara (2,650★) | Apache-2.0 but **archived** 2026-01 |
| anthropics/claude-code `.devcontainer` | Repo is proprietary (Anthropic commercial ToS) — the *pattern* is reimplementable, the files are not copy-paste |

### Proprietary references (architecture study only)

- **Claude Code on the web / Cowork** — the model itself; see corpus 01.
- **Sculptor (Imbue)** — per-agent Docker containers from devcontainer specs, cached images, Pairing Mode; see corpus 03.
- **Fly.io Sprites, Modal Sandboxes, Cloudflare Containers (service), Anthropic Managed Agents** — managed execution substrates; see corpus 04.

## Emerging synthesis (working hypothesis, not yet decided)

The permissive-licence build path that matches the Cowork model:

1. **Container**: reimplement the official devcontainer pattern — pinned base image, agent user,
   network egress firewall with allowlist (the load-bearing security control).
2. **Inner sandbox**: run Claude Code under `@anthropic-ai/sandbox-runtime` (Apache-2.0) inside the
   container — defence in depth exactly as Cowork does (container ≈ VM layer, srt ≈ bwrap layer).
3. **Web interface**: either build thin on **agentapi** (MIT, HTTP/SSE API over Claude Code),
   adopt **happy** (MIT, mature web+mobile client), or adopt the **OpenHands** GUI/SDK (MIT) if the
   client wants multi-agent/platform scope.
4. **Scale-out later**: per-session microVMs via **E2B** (Apache-2.0) or **microsandbox**
   (Apache-2.0) if multi-tenant isolation becomes a requirement.

## Corpus conventions

Every corpus file carries YAML frontmatter: `name`, `category`, `url`, `license`,
`license_ok_for_client`, `stars`, `last_push`, `status`, `verified` (date the data was checked).
Update `verified` when refreshing. Add new options as new files; keep one option per file.
