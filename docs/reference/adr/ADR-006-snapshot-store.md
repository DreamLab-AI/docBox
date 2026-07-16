# ADR-006 — Snapshot store: git + registry + restic, behind a recovery partition

Status: Accepted · 2026-07-16 · Realises PRD-004

## Context

A rebuild has to be undoable without losing user work or the audit trail. That needs a snapshot store
spanning three kinds of state that behave differently under rollback: the system definition (rolled
back), user data (never rolled back, restored separately), and audit (never a rollback target).
corpus/10 scored the options on recovery, audit, data safety, disk, complexity, infra friction, and
licence, and the winning row was a hybrid.

## Decision

Snapshots use three mechanisms, one per state plane, with a supervisor that lives outside the agent's
reach:

| Plane | Mechanism | Rolled back by tooling? |
|---|---|---|
| System-Definition | git (signed commits) + local OCI registry, image tag = commit SHA | Yes, the rollback target |
| User-Data | restic (scheduled + pre-overhaul snapshots) | Never; restore is separate and guarded, forks to a new volume |
| Audit | restic rest-server `--append-only` (WORM) + append-only files | Never; no UI control to roll it back exists |

Cutover is blue/green, so auto-rollback is free: a failed verify means the proxy never moves. The
supervisor and admin plane sit in a recovery partition, separately versioned and outside the agent's
writable scope, upgraded through a human-gated channel. A self-modifying system must not be able to
modify its own undo button.

## Consequences

- Rollback of a bad overhaul is re-pointing the proxy at the retained prior image tag plus a git
  revert: seconds, no rebuild (PRD-004).
- The rollback boundary is enforced by partition and permissions, not convention: the agent has no
  write mount to the supervisor, the restic repo and keys, or the registry's retained prior tags, so
  it cannot prune its own rollback targets.
- All components are local (git, `registry:2`, restic, rest-server), so an air-gapped site works with
  no SaaS dependency.
- Disk growth is bounded by retaining N image tags and M restic snapshots with restic dedup, and by
  cold-archive tiering of audit, never deletion-on-rollback.
- Cost: GitOps rebuilds add minutes of build latency versus an opaque `docker commit`. Accepted,
  because layer cache plus blue/green makes cutover zero-downtime and the diffable audit is worth the
  wait.

## Alternatives considered

- **`docker commit` layer snapshots.** Opaque, miss volumes, and bake secrets into layers. Rejected
  in corpus/10.
- **CRIU checkpoint/restore.** Resurrects the RAM of a possibly-broken process, needs privilege, has
  no compose-wide consistency, and is GPL. Rejected; blue/green with a clean restart is safer.
- **btrfs/ZFS subvolumes.** Fast, but assume a host filesystem we cannot require (ZFS is CDDL plus a
  kernel module). Kept only as an optional accelerator where the host offers it.

## Traceability

Realises PRD-004. Architecture and decision matrix: corpus/10 snapshot-rollback. Rollback is the
heavy apply-class (ADR-002). Overhaul saga: DDD-002. Audit-outside-rollback: PRD-006, DDD-001. Vault
as the User-Data plane on disk: PRD-006, corpus/05.
