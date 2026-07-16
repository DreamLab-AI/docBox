---
name: TypeScript-first stack — TS7 status, runtimes, framework, config, LLM SDK
category: ecosystem
round: 2
researcher: r9-typescript (sonnet)
verified: 2026-07-16
recommendation: tsc 5.x/6.x now with tsgo as CI side-check (TS7 GA but API-less until 7.1); Node 24 LTS control plane + Bun for agent supervision; Hono; smol-toml+c12+zod; Vercel AI SDK replaces LiteLLM
---

# TypeScript-first stack decisions

Licences verified against raw LICENSE files, 2026-07-16.

## TypeScript 7 (typescript-go / "Corsa") — GA but one week old

- **TS 7.0 went GA 2026-07-08** (RC June 18). Port not rewrite — same semantics as 6.x.
  Verified speedups 8-12x (VS Code codebase: 125.7s → 10.6s). Apache-2.0.
- **Gap**: shipped **without a stable programmatic API** (lands in 7.1, ~Q4 2026) — so
  typescript-eslint, Vue/Svelte/Astro template checking cannot adopt yet; native LSP still
  early (completions just enabled, no `--build`, no declaration emit).
- **Call**: build on stable tsc 5.x/6.x; run `tsgo --noEmit` as a parallel fast CI check (free
  10x speed, identical semantics); plan the formal migration at 7.1+ once typescript-eslint
  confirms. Low-risk future migration, not a blocker.

## Runtime: hybrid

- **Node 24 LTS** (MIT, supported to Apr 2028) — the web control plane. Deepest ecosystem, LTS
  contract; avoid Node 26 (Current, not LTS) for a client product.
- **Bun 1.x** (MIT) — the agent-process supervision layer + single-binary sidecars:
  sub-15ms cold starts, fast `Bun.spawn`, `bun build --compile` produces the smallest
  single-file binaries (precedent: Claude Code itself ships as one). **Flag for the licence
  register**: Bun statically links JavaScriptCore (**LGPL-2**) — no obligations on our code for
  normal use or compiled output, but note it in due diligence.
- Deno 2 (MIT): watch-list only — its `--allow-run` permission gating is a real
  defence-in-depth idea for spawning agent binaries if a client demands it.

## Server framework: Hono (MIT)

Runs identically on Node and Bun (keeps the runtime decision reversible), first-class SSE
(`hono/sse`) / streaming / WebSocket for agent-output relay, and its built-in typed client
(`hc`) gives tRPC-grade end-to-end types without adding tRPC. Runner-up Fastify (Node-only,
most battle-tested); NestJS only if the client demands enterprise DI weight.

## Config layer (the agentbox.toml pattern in TS)

- **smol-toml** (BSD-3-Clause — note: permissive but not MIT/Apache, one line in the register)
  — the maintained TOML parser; @iarna/toml is 6 years stale, avoid.
- **c12** (unjs, MIT) — prior art for exactly our layering: TOML file → dotenv → env overrides,
  with watch/HMR for the admin plane's live config view.
- **zod v4** (MIT) — validate the merged config; 7-14x faster than v3, first-party JSON Schema
  generation (useful for generating the admin wizard forms from the config schema).

## LLM abstraction: drop LiteLLM, go TS-native

**Supersedes the r2 stream's LiteLLM recommendation for our TS-first constraint** (both remain
permissive; this is a language/ops call, not a licence one):

- **Vercel AI SDK** (`vercel/ai`) — **Apache-2.0** (misdetected NOASSERTION; LICENSE verified).
  Unified provider abstraction (OpenAI/Anthropic/Google/Mistral/…) + streaming-first design that
  plugs straight into the Hono SSE pipeline. One dependency, one language. **Pick.**
- **token.js** (MIT) — minimal in-process alternative, 200+ models, no proxy.
- **Portkey Gateway** (TS/Node) — LICENSE file says **MIT** but July 2026 press claims an
  Apache-2.0 "Gateway 2.0" move AND Palo Alto Networks is acquiring Portkey (announced Apr 2026,
  closing ~Q4 FY26) — **re-verify at contract time**. Only needed if a standalone multi-tenant
  proxy (rate limits, guardrails) is required rather than an in-process SDK.
- "llm.ts" from the brief could not be verified as a real maintained package — likely a mix-up
  with token.js or similar; don't plan against the name.

**Go binaries are not polyglot friction**: agentapi (MIT), gocryptfs (MIT), cloudflared
(Apache-2.0) are invoked as subprocess binaries, not embedded runtimes — keep them. The real
one-language win is specifically removing LiteLLM's Python container.

## Stack summary

tsc 5.x/6.x (+tsgo CI) · Node 24 LTS control plane · Bun agent-supervisor + sidecar binaries ·
Hono + hc · smol-toml + c12 + zod v4 · Vercel AI SDK · Go sidecars as subprocesses. No copyleft
in the core graph; register notes: Bun/LGPL-2 link, smol-toml BSD-3, Portkey re-verify.
