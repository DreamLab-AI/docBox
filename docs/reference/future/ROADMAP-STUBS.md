# Future document stubs

Placeholders for documents we know we will write, one per roadmap milestone (PRD-000). Each is a
title and a one-line scope so the corpus shape is visible before the content exists. Fill in when
the milestone starts.

## PRD stubs
- **PRD-002 — Control-plane backend.** Hono server, adapter contract, SSE streaming of live events.
- **PRD-003 — Agent engine embed.** pi via RPC/SDK; extension hooks for audit and identity.
- **PRD-004 — Container and rebuild.** Multi-stage Dockerfile, TOML-gated bundles, blue/green.
- **PRD-005 — Identity and network.** Entra SSO, oauth2-proxy, cloudflared + Access, loopback-only.
- **PRD-006 — Audit and vaults.** Write-only sidecar, hash chain + anchors, gocryptfs unlock.
- **PRD-007 — Chat bubble.** deep-chat embed, identity pass-through, worst-case script-tag host.

## ADR stubs
- **ADR-004 — Config persistence format.** TOML layering (smol-toml + c12), env overrides.
- **ADR-005 — Live event transport.** SSE vs WebSocket for the visualiser and activity feed.
- **ADR-006 — Snapshot store.** git + local registry + restic; recovery partition boundary.
- **ADR-007 — Harness integration boundary.** pi RPC vs SDK; where audit hooks attach.
- **ADR-008 — Ledger boundary.** beads behind a narrow interface; embedded vs server Dolt.

## DDD stubs
- **DDD-002 — Overhaul lifecycle.** Propose to snapshot to apply to verify to cutover or rollback.
- **DDD-003 — Audit and identity.** Entra seed to ULID lineage to write-only chain.
