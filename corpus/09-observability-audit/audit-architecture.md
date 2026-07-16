---
name: Audit & identity architecture — hierarchical, user-seeded, write-only
category: observability-audit
round: 2
researcher: s2-audit-arch (opus specialist)
verified: 2026-07-16
recommendation: Entra oid/tid seed → ULID hierarchy via Claude Code hooks → topologically write-only sidecar → hash-chained JSONL + signed off-box anchors
---

# Audit & identity architecture

Specialist deliverable. Design stance: dev-sandbox-proportionate — *detect* tampering cheaply
and provably; full insider *prevention* is v2. The driving question: **"what did the agent
change and who asked for it?"**, answerable months later.

## Identity chain

- Canonical `user_id` = **`entra:{tid}:{oid}`** — `oid`/`tid` are immutable; `upn`/email are
  descriptive only (they change on marriage/rebrand — never the join key).
- Browser → Entra (auth-code+PKCE) → **oauth2-proxy** validates → gateway mints an **internal
  session JWT** (own key, 15-min TTL, `aud: orchestrator`). The orchestrator trusts only this
  JWT — never raw forwarded headers reachable from the agent network (agents must not be able to
  forge identity by setting a header).
- **Hierarchy** (ULIDs — time-ordered, lexically sortable, MIT impls):
  `user_id → session_id → agent_id (+parent_agent_id spawn tree) → action_id`.
  Every event carries the full tuple plus a materialised **`lineage[]`** (root→emitter agent
  path) so "everything user X's session did, N spawns deep" is one filter, no recursion.
- **Propagation**: orchestrator is the sole ID minter; injects `AUDIT_*` env at spawn
  (user/session/agent/parent/lineage, ingest URL, HMAC key id — key mounted read-only, not env).
  **Claude Code hooks** (PreToolUse/PostToolUse/SubagentStop/SessionStart/Stop — the pattern we
  already run in-house) enrich every tool call: identity comes from process env set by the
  trusted spawner, unforgeable by prompt content.

## Write-only sidecar — enforcement is topological

Two docker networks: `agent-net` (orchestrator, agents, and ONLY the sidecar's ingest port) and
`audit-net` (sidecar, storage, read console, SIEM forwarder — **no agents attached**). The
sidecar is dual-homed; no read/query handler is bound on the agent-net interface. Write-only is
a property of the wiring, not a promise in the handler.

- Ingest: `POST /v1/events` NDJSON batches; idempotent by `event_id`; no GET on agent-net.
- Volume: owned by dedicated `audit` uid, not mounted into any agent container. Active segment
  gets **`chattr +a`** (append-only inode) via a privileged init that then drops
  `CAP_LINUX_IMMUTABLE` — even a compromised sidecar can append but not truncate/rewrite.
  Rotation via a separate `log-rotator` sidecar that re-acquires the cap to seal segments.
- **Downtime = buffered fail-closed**: hooks write to a local append-only WAL spool first
  (tmpfs); forwarder drains to sidecar. If spool age > ~30 min or size > cap, PreToolUse
  **denies** — sustained outage blocks unaudited work; blips are invisible. Gaps are detectable:
  orchestrator emits AGENT_SPAWN independently and per-agent `seq` is monotonic.

## Storage: hash-chained JSONL v1, immudb v2

- Each committed record: `hash = SHA256(prev_hash ‖ canonical_json(record))`; sidecar assigns
  authoritative `seq`/`prev_hash` (single writer = unambiguous order). Agent HMAC proves
  origin; chain proves order+integrity.
- **Hourly Ed25519-signed Merkle-root anchors shipped off-box** (client SIEM and/or our existing
  relay egress) — retroactive edits break the chain AND fail the external anchor, so even
  volume-write admins can't tamper undetectably.
- grep/jq-able; `audit-verify` CLI recomputes the chain. **Correction from the r5 stream:
  immudb is BSL 1.1 since late 2023, NOT Apache-2.0** — the v2 upgrade path is ClickHouse
  (Apache-2.0) for query scale, or immudb only with legal sign-off on BSL internal use;
  **Loki (AGPL) and Elasticsearch (SSPL) fail the licence bar**.
- SIEM: CEF over syslog RFC 5424/TLS (safest common denominator); signed bulk export
  (segments + Merkle manifest) lets the client verify independently.

## Event schema (common envelope + per-level payloads)

Envelope: `schema, event_id (ULID), event_type, ts, seq, user_id, upn, session_id, agent_id,
parent_agent_id, lineage[], prev_hash, hash, sig, payload`. Event types: SESSION_START (auth
context incl. groups, jti, amr), AGENT_SPAWN (orchestrator-emitted — records existence
independently of the agent; prompt as sha256 + capped preview), TOOL_CALL (tool, decision,
target, redacted args, duration), FILE_CHANGE (sha256 before/after, lines ±, caused_by_action,
diff by content-address in v2), SYSTEM_EVENT (snapshot/rollback — **rollbacks are recorded
actions, never erasures; audit volume sits outside all snapshot scope**), POLICY_DENY.

**Redaction two-stage** (hook redacts, sidecar re-redacts — never trust agent-side alone): key
patterns (`sk-…`, `ghp_…`, `AKIA…`, JWTs, PEM blocks, conninfo strings) →
`[REDACTED:sha256:<8>]` so presence is provable without storage. Never log prompts/outputs
verbatim (hash + 120-char preview, capped fields) — and because agents can't read the trail,
the log can't become a prompt-injection feedback surface.

## Threat model (proportionate)

- **Agent self-tampering**: no route to read path; append-only inode; independent spawn events;
  monotonic seq → worst case is a *detectable* gap. Low residual.
- **Injected exfil via log channel**: write-only kills read-back; ingest terminates at sidecar
  (no pass-through egress); console escapes fields (no stored-XSS pivot).
- **Admin insider**: detect-not-prevent for v1 (separation of uids, append-only, off-box
  anchors make tampering provable); full WORM/S3-Object-Lock/4-eyes is v2.

## Integration notes

- Browser sidecar (chrome-devtools + VNC :5903) emits ARTIFACT events (screenshots/network by
  content hash) linked to the driving `action_id` — visual ground truth, zero new infra.
- Offered as follow-up: reference `docker-compose.yml` + `audit-hook.cjs` v1 implementation.
- Composes with the s1 snapshot architecture: SYSTEM_EVENTs are the shared vocabulary; both
  specify audit-outside-rollback independently — convergent, keep as invariant.
