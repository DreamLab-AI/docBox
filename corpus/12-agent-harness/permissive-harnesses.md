---
name: Permissive extensible agent harnesses — pi deep-dive + landscape
category: agent-harness
round: 2
researcher: r10-harness (sonnet)
verified: 2026-07-16
recommendation: pi (MIT, earendil-works) via RPC/SDK modes as the embedded engine; opencode (MIT) as the batteries-included fallback; metered API keys only, never subscription OAuth
---

# Permissive agent harnesses

All licences verified via gh api AND raw LICENSE reads, 2026-07-16. This stream replaces the
"embed proprietary Claude Code CLI" assumption (user steer 2026-07-16) and closes the
redistribution legal flag from the gap analysis.

## pi — the preferred candidate, verified

- **Repo**: `earendil-works/pi` (`badlogic/pi-mono` 301-redirects — org transfer, not a fork).
  **MIT** (raw LICENSE: © 2025 Mario Zechner; Earendil RFC 0015 commits core to staying MIT).
  71.8k★, created 2025-08, pushed same-day (v0.80.9). TypeScript, Node ≥22.19, optional
  Bun-compiled binary. npm ~6.7M downloads/30d.
- **Architecture**: 4 packages — `pi-ai` (unified LLM API: Anthropic/OpenAI/Google/any
  OpenAI-compatible incl. local), `pi-agent-core` (tool-calling runtime), `pi-tui`,
  `pi-coding-agent` (CLI). Zechner's stated philosophy: MCP, subagents, plan mode, permission
  popups are **"anti-features"** — deliberately not built in.
- **Embeddability (its real strength)**: **RPC mode** (`pi --mode rpc`) — headless
  newline-JSON over stdio, explicitly for embedding: prompt/steer/follow_up/abort/model-switch/
  compaction/session fork-clone-tree commands, streaming event model (message deltas, thinking,
  tool_execution_*), and a request/response sub-protocol so extension dialogs work headlessly.
  **SDK mode** — `createAgentSession()` imported directly into a Node/Bun host, no subprocess.
  Both first-class and documented with worked examples. Cleanest "TS control plane drives the
  agent over a versioned protocol" story surveyed.
- **Extension model**: TS modules (jiti, no build step); hooks can **block tool calls**,
  **rewrite tool results**, intercept provider requests/responses, cancel forks/compaction;
  distributed as npm packages or git refs. ~70 first-party examples. **These hooks are exactly
  our audit/identity-injection points** (s2 architecture) — implementable as a pi extension
  rather than wrapper scraping.
- **MCP**: none built-in; community `nicobailon/pi-mcp-adapter` (MIT, ~1k★, author has 33
  commits in pi core). Adopt-and-own if needed.
- **Subagents**: a documented ~500-line example extension (child pi processes, ≤8 parallel,
  single/parallel/chain modes) — production-usable reference code we fork and own.
- **Bus factor, honestly**: single-maintainer until 2026-04-08, when Zechner joined
  **Earendil Inc.** (PBC; co-founder Armin Ronacher — Flask/Jinja2 — is hands-on with 399
  commits). Materially de-risked but only ~3 months old; commercial roadmap not public.
- **Sandboxing**: none built in — README recommends containerising. A non-issue for us: the
  hardened container + srt IS the boundary, and pi not fighting us with its own permission
  popups fits the design.
- **Fit with our steers**: pi's anti-feature minimalism is the harness-shaped version of
  "distillation, not agentbox" — we add only what the product needs, via hooks we own.

## Landscape (verified)

| Harness | Licence | Stars | Embeddability | Verdict |
|---|---|---|---|---|
| **opencode** (`anomalyco/opencode`, ex-sst) | MIT | 186.5k | Client/server; headless `serve` HTTP+SSE; native MCP; first-class subagents; Vercel AI SDK providers | **Fallback pick** — most feature-complete, more opinionated surface |
| **Crush** (charmbracelet) | **FSL-1.1-MIT — NOT permissive** (GitHub shows NOASSERTION) | 26.6k | — | **Excluded**. (Provenance: the opencode fork dispute; Crush is Charm's FSL continuation) |
| **codex** (openai) | Apache-2.0 | 98.8k | `codex-exec` headless, `codex-app-server` JSON-RPC, MCP client+server; arbitrary providers via TOML | Strong; Rust; no subagents; single-vendor stewardship, config churn |
| **gemini-cli** | Apache-2.0 | 106k | Good MCP but **Gemini-locked** and **sunset** (free tiers cut off 2026-06-18 → Antigravity CLI) | **Excluded as embed target** |
| **qwen-code** | Apache-2.0 | 26.1k | gemini-cli fork, genuinely provider-agnostic | The practical continuation of that codebase; Alibaba governance |
| **goose** (now `aaif-goose`, Linux Foundation AAIF) | Apache-2.0 | 51.2k | `goosed` daemon REST+SSE+WS (~103 endpoints); MCP-native extensions; 15+ providers | #3 — vendor-neutral governance; Rust daemon, no subagents |
| **aider** | Apache-2.0 | 47.4k | Python API + one-shot | ~8 weeks stale, momentum moved to community fork — avoid |
| **cline** | Apache-2.0 | 64.7k | Real SDK/CLI/IDE split, one engine, headless mode, MCP, multi-agent teams | **Dark horse #4** — least battle-tested headless |
| kilocode (ex-RooCode) | MIT | 26.3k | IDE-bound, no verified headless surface | Skip |
| OpenHands software-agent-sdk | MIT | 903 | Purpose-built headless, event-sourced replay, DelegateTool subagents | Python — misfits the TS-first steer; keep as pattern reference |
| smolagents | Apache-2.0 | 28.4k | Agent-loop library, not a coding harness | Skip |
| **agentapi** (coder) | MIT | 1.5k | Wraps ANY CLI via pty **screen-scraping** + REST/SSE | **Demoted from earlier corpus position**: stopgap adapter for swap-optionality only — fragile vs pi's native protocol; ~7 weeks stale |

## Ranked for our use case (TS control plane, audit hooks, identity injection)

1. **pi** — embeddability as a documented dual-mode protocol; TS-native; hook surface gives
   audit/identity injection nearly free; minimalism matches the maintainability steer. Cost:
   own the MCP adapter + subagent extension; young-company bet.
2. **opencode** — MCP + subagents out of the box with least integration work; cost is surface
   area and opinionation. The conventional low-risk default.
3. **goose** — if Linux Foundation neutrality outranks TS-native fit; language-agnostic daemon.

## Model-access terms (closes the old legal flag)

Standard **metered API keys** (Anthropic console/Bedrock/Vertex, OpenAI, Gemini) are permitted
in third-party harnesses inside commercial products under all three providers' current terms.
The Jan–Apr 2026 Anthropic enforcement targeted **subscription OAuth tokens** (Free/Pro/Max) in
third-party harnesses — later softened with "Agent SDK credits" — and never restricted API
keys. **Product rule: never bridge a user's personal Claude subscription OAuth into the
harness; admin provisions metered API keys via the TOML/control plane.** With pi (MIT) as the
engine, nothing proprietary ships at all.

## Sources

gh api + raw LICENSE for every repo listed; pi.dev docs + RFC; Earendil announcement; the
opencode/Crush provenance reporting; Anthropic commercial terms + The Register/VentureBeat on
the OAuth enforcement; full URL list in the r10 research transcript.
