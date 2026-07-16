---
name: Snapshot & rollback architecture for a self-modifying sandbox
category: architecture
round: 2
researcher: s1-snapshot-arch (opus specialist)
verified: 2026-07-16
recommendation: "three planes, one supervisor" — GitOps images + restic volumes + blue/green cutover; supervisor in a recovery partition outside the agent's reach
---

# Snapshot & rollback for the self-modifying sandbox

Specialist architecture deliverable. Licences verified via gh api this session.

## Governing invariants

1. **The rollback boundary must separate tooling/definition from user data and audit.** Undoing
   an overhaul must never destroy user work or erase the record of what the agent did.
2. **The thing that performs rollback must survive the thing it rolls back.** The supervisor is
   a *recovery partition*: separately versioned, outside the agent's writable scope. A
   self-modifying system must not be able to modify its own undo button.

## Decision matrix (1-5)

| Option | Recover | Audit | Data safety | Disk | Complexity | Infra friction | Licence | Verdict |
|---|--|--|--|--|--|--|--|---|
| 1. Immutable image + GitOps rebuild | 5 | 5 | 4 | 4 | 3 | 5 | 5 | Core |
| 2. `docker commit` layer snapshots | 3 | 1 | 1 | 2 | 5 | 4 | 5 | **Reject** — opaque, misses volumes, bakes in secrets |
| 3. Volume snapshots (restic/kopia) | 4 | 4 | 5 | 5 | 3 | 5 | 5 | Core (data plane) |
| 3b. btrfs/ZFS subvolumes | 4 | 3 | 5 | 5 | 3 | **1** | **2** (CDDL/kernel deps) | Optional accelerator only |
| 4. CRIU checkpoint/restore | 2 | 2 | 2 | 2 | **1** | **1** | **2** (GPL) | **Reject** — resurrects RAM of a broken process; privileged; no compose-wide consistency; still research-grade 2026 |
| **5. Hybrid: git + restic + image tags + blue/green** | **5** | **5** | **5** | 4 | 3 | 5 | 5 | ★ **RECOMMENDED** |

## The three state planes

| Plane | Contents | Mechanism | Rolled back with tooling? |
|---|---|---|---|
| System-Definition | Dockerfiles, compose, TOML, agent capability manifests ("meta app kit" source) | git (signed commits) + local OCI registry (tags = commit SHA) | **Yes — the rollback target** |
| User-Data | Projects, workspaces, DBs, identity, secrets | restic (scheduled + pre-overhaul) | **Never** (survives by partition; restore is separate, guarded, forks to a new volume) |
| Audit | Proposals, diffs, restore-point manifests, healthcheck verdicts | restic rest-server `--append-only` (WORM) + append-only files | **Never** (no UI control exists to roll it back) |

## Overhaul data-flow

Propose (agent submits git diff + rationale) → record proposal in audit → **restore point**
(git tag SHA_before + restic snapshot of user-data/audit + retain current image tag + signed
manifest) → apply (merge → build → tag SHA_after → deploy GREEN stack on isolated
network while BLUE keeps serving) → **verify** (healthcheck suite incl. a read-only
**data-compatibility probe** against real user data) → PASS: cut proxy over to GREEN, retire
BLUE (retain tag) / FAIL: tear down GREEN, traffic never moved, reset branch, manifest
`AUTO_ROLLED_BACK`, return logs to agent for re-planning.

**Auto-rollback is free because blue/green**: rollback-on-failure = don't cut over. Post-cutover
rollback = re-point proxy at the retained previous tag + git revert (seconds, no rebuild).

## Component choices (licences verified)

restic BSD-2-Clause · restic rest-server BSD-2-Clause (append-only mode = the WORM property) ·
kopia Apache-2.0 (alt) · CNCF Distribution `registry:2` Apache-2.0 · Compose v2 Apache-2.0 ·
Traefik MIT / Caddy Apache-2.0 · git GPL-2.0 (arm's-length CLI, not linked — accepted;
policy note in doc). **Excluded**: CRIU (GPL), OpenZFS (CDDL), Grafana Loki (AGPL — audit store
must be plain append-only NDJSON or BSD/Apache store instead). Borg is BSD-3 (acceptable alt but
restic wins on rest-server append-only + single binary).

## Admin plane (Restore Points view)

Timeline from signed manifests: timestamp, proposal summary/id, SHA pair + view-diff, image tag,
healthcheck verdict, one-click ⟲ rollback. **Deliberately asymmetric semantics**: default
rollback = System-Definition plane only; user-data restore is a separate guarded operation
(typed confirmation + reason, restores to a NEW volume for inspection, never overwrites live);
audit is view-only.

## Never inside rollback scope (enforced by partition + permissions, not convention)

1. Audit/provenance (WORM) 2. User identity/auth 3. User projects/DBs 4. Secrets/keys (never in
images) 5. The Supervisor + admin plane itself (separate human-gated release channel) 6. The
restic repo + its keys 7. The registry's retained prior tags (agent cannot prune its own
rollback targets).

## Condensed ADRs

- ADR-001 GitOps immutable images over `docker commit` (diffable audit, reproducibility; cost =
  minutes of build latency, mitigated by layer cache + blue/green zero-downtime).
- ADR-002 restic for the data plane; FS-level snapshots rejected as baseline (kernel/host-FS
  assumptions we cannot make), optional accelerator where the host offers them.
- ADR-003 Blue/green + clean restart on prior definition, not CRIU RAM resurrection.
- ADR-004 Recovery partition outside overhaul scope; supervisor upgrades human-gated.
- ADR-005 Audit is WORM, never a rollback target; growth bounded by cold-archive tiering, never
  deletion-on-rollback.

## Key risks

Agent attacks its own recovery partition (no write mount, digest-pinned supervisor) · silent
data-format breakage (pre-cutover data probe) · disk growth (retain N tags + M snapshots, restic
dedup) · air-gapped sites (all components local: registry, rest-server, no SaaS) · restic key
loss (keys in recovery partition; optional `restic copy` off-box).
