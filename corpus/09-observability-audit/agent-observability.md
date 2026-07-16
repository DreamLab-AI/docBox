---
name: Agent observability tooling — platforms, OTel, recording, identity seeding
category: observability-audit
round: 2
researcher: r5-observability (sonnet)
verified: 2026-07-16
recommendation: Helicone or OpenLIT (Apache-2.0) trace UI · Claude Code OTel (traces beta) → collector → ClickHouse + S3 Object Lock · self-built hash-chained JSONL · script --log-io + chrome-devtools screencast + rrweb
---

# Agent observability tooling

Licences verified via gh api + direct LICENSE reads, 2026-07-16.

## Platforms

| Platform | Licence | Hierarchical traces | User ID per trace | Write-only ingest | Verdict |
|---|---|---|---|---|---|
| **Helicone** | Apache-2.0 (whole repo) | Yes (`Helicone-Session-Path` /parent/child) | Yes (`Helicone-User-Id`) | **Yes — the only one**: `pk-` write-only vs `sk-` read keys | **Pick #1** |
| **OpenLIT** | Apache-2.0 (whole monorepo) | Yes (OTel-native) | Generic OTel attrs only | Ingest/UI are separate services → enforce by network topology | **Pick #2** |
| Laminar | Apache-2.0 | Yes | Yes (`setTraceUserId`) | No | #3; cleanest EE pattern (paid bits outside the repo) |
| Langfuse | MIT core + proprietary `ee/` dirs | Best-documented | Mature `userId` | No (open feature request) | Conditional — build must exclude 3 `ee/` dirs |
| Phoenix (Arize) | **Elastic License 2.0 — whole repo** | — | — | — | **Excluded** |
| AgentOps | MIT SDK, **ELv2 server/dashboard** | Best session→task→agent→tool taxonomy | Weak | — | **Excluded** (the platform part) |

## OTel GenAI + Claude Code emissions (verified against docs, not assumed)

- GenAI semantic conventions: **still `Development` status**, moved to their own repo, no
  stable release; `invoke_workflow`/`invoke_agent`/`execute_tool` spans exist; the richer
  Task/Agent/Team taxonomy is design-stage only.
- **Claude Code emits OTel today**: metrics + logs GA; **traces beta** requires
  `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` alongside `OTEL_TRACES_EXPORTER`. Master switch
  `CLAUDE_CODE_ENABLE_TELEMETRY=1`. Content redacted by default — `OTEL_LOG_USER_PROMPTS`,
  `OTEL_LOG_TOOL_DETAILS`, `OTEL_LOG_TOOL_CONTENT` opt-ins needed for an actionable trail.
- Beta span tree: `claude_code.interaction` → `llm_request`/`hook`/`tool`; **subagent spawns
  nest under the parent's tool span** — the delegation chain is captured, in Claude's own
  vocabulary (not `gen_ai.*`-aligned yet).
- Caveats: OTEL_* env is NOT auto-propagated to Bash/hook/MCP subprocesses (set explicitly);
  `TRACEPARENT` IS propagated to Bash when tracing is on; `enduser.id` injectable via
  `OTEL_RESOURCE_ATTRIBUTES`.
- Pipeline: otlp receiver → attributes processor (collector-injected container_id the sandbox
  can't spoof) → ClickHouse exporter (hot, immutability = revoke ALTER/DELETE on the DB user)
  + S3 exporter under **Object Lock** (WORM is a bucket property; exporter only PUTs).
  **No immudb exporter exists** in otelcol-contrib.

## Tamper-evidence — licence correction

- **immudb is NOT Apache-2.0: relicensed to Business Source License 1.1** (Nov–Dec 2023, was
  Apache through v1.9.0). Fails the permissive constraint; internal-use grant likely applies
  but needs legal sign-off. **This corrects the v2 note in audit-architecture.md.**
- Rekor/sigstore: genuinely Apache-2.0 but ~5 services incl. Trillian+MySQL — disproportionate.
- Existing hash-chain packages: dead, immature, or AGPL (AuditKit). journald FSS: interval
  seals + past forgery CVEs — not a substitute.
- **Recommendation: self-built hash-chained JSONL** (~100 lines, own code, fully permissive)
  with external anchoring of head hashes (signed → existing Nostr relay / git / S3 Object
  Lock) — converges with the s2 specialist design.

## Write-only enforcement (compose-level, three independent layers)

1. Method-ACL reverse proxy (nginx `limit_except POST`) + the sidecar on an `internal: true`
   network the agent never joins (precedent: github/gh-aw-firewall api-proxy-sidecar).
2. Docker logging-driver forwarding (syslog/fluentd) — dockerd owns delivery, the agent process
   never holds the transport handle.
3. `chattr +a` on a sidecar-exclusive named volume (real ext4/xfs only — unreliable on overlay2
   writable layers, moby#37931); grant CAP_LINUX_IMMUTABLE for init, then drop.

## Session recording licences (the fine print matters)

- **asciinema is three licences**: CLI recorder **GPL-3.0** (subprocess-only, never vendor);
  **asciinema-player Apache-2.0** (safe to embed for playback); server Apache-2.0 since 2017.
- **util-linux `script`**: repo badge says GPL but per-file SPDX: **`script.c` = BSD-3-Clause**
  (safe to vendor); `scriptreplay.c` = GPL-2.0+ (exec only). `script --log-io --log-timing`
  (≥2.35) captures I/O + timing on every base image — **zero-dependency core terminal capture**.
- VHS (MIT) = wrong model (re-renders scripts, not real timing). Evidence primitives are
  `.cast` / `--log-timing` data, not video.
- Browser/VNC: **chrome-devtools-mcp has a built-in screencast** (`--experimentalScreencast`,
  Apache-2.0, CDP Page.startScreencast → ffmpeg) — cheapest integration given our existing
  sidecar; ffmpeg x11grab (LGPL default build, subprocess = licence-inert) for whole-display;
  **rrweb (MIT)** DOM-mutation JSON with per-event timestamps — replayable ground truth,
  arguably stronger evidence than pixels.

## Identity seeding — prior art

- Entra **`oid`** (immutable, cross-app stable) is the correct key — Microsoft warns against
  `sub` (pairwise per-app) and `upn`/email (mutable). Converges with s2.
- Mechanism: validate JWT once at orchestrator entry → strip token (Microsoft's own
  Claude-Desktop+APIM pattern: "no user token ever leaves APIM") → `oid` into OTel **Baggage**
  + mirrored `enduser.id` span attribute via BaggageSpanProcessor → across process spawns,
  inject `TRACEPARENT`/`BAGGAGE` as env vars (Sentry precedent). Baggage pitfalls: 8KB/64-entry
  cap, plaintext, auto-attaches outbound unless stripped at trust boundaries — **identifiers
  only, never tokens**.
- Gap: `gen_ai.*` conventions define agent and conversation IDs but **no end-user identity** —
  wiring `enduser.id` onto tool-call spans is on us.
- **Microsoft Entra Agent ID** (GA Apr 2026): purpose-built agent identity — on-behalf-of OAuth
  flow (blueprint → agent instance → user) and audit-log `agentType`/`blueprintId` fields.
  Watch closely: a Microsoft-shop client may ask for alignment with it.

## Flagged exceptions for the licence register

Langfuse `ee/` (proprietary) · Phoenix (ELv2) · AgentOps server (ELv2) · asciinema CLI (GPL-3,
subprocess-only) · scriptreplay (GPL-2+, subprocess-only) · immudb (BSL 1.1) · TigerVNC/x11vnc
(GPL-2, unmodified isolated infra — compliant as-is).
