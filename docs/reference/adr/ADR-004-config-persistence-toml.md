# ADR-004 — Configuration persistence as TOML

Status: Accepted · 2026-07-16 · Realises PRD-002

## Context

Foreman's configuration is the system definition: providers, toolchain bundles, identity, network,
vaults, audit, snapshots, and agents. It has to be human-diffable (a rebuild is a git diff of it),
layerable (defaults, then a dotenv, then environment overrides), and the single source of truth that
both the server and the UI read. The stack is TypeScript-first (corpus/11), so the format and its
loader must be TS-native and permissively licensed.

## Decision

Configuration is a TOML file (`foreman.toml`), parsed by smol-toml and layered by c12 in the order
file → dotenv → env, then validated by zod v4. The file is the source of truth; the UI is a view over
it. A change made in the config plane is written back to the file, and a rebuild is triggered by, and
diffed from, that file. No authoritative config state lives in a database or in the running process
alone.

## Consequences

- A rebuild's TOML diff is the reviewable plan (ADR-002): the operator reads exactly what changed
  before anything runs.
- Config survives a restart because it lives in a file, not process memory; the server rehydrates
  from it.
- Environment overrides let an operator or CI pin a value without editing the file, and c12's watch
  support feeds the config plane's live view.
- zod validation of the merged result rejects a malformed change at write time, and the same schema
  can generate the admin wizard forms (corpus/11).
- Cost: TOML is less expressive than a full programming language for config. That is the point; a
  config file that can compute is a config file that can surprise.

## Alternatives considered

- **JSON or YAML.** JSON has no comments and is noisy to hand-edit; YAML's implicit typing and
  indentation traps are exactly what a config an operator edits under pressure should avoid. TOML
  reads plainly and diffs cleanly.
- **A database as source of truth.** Puts authoritative state where git cannot diff it and a rebuild
  cannot bracket it, and adds a moving part against the maintainability steer. The file wins because
  the rollback story depends on it being a file.
- **@iarna/toml as the parser.** Six years stale; smol-toml is the maintained parser (BSD-3-Clause,
  one line in the licence register).

## Traceability

Realises PRD-002. Config plane and apply-class: PRD-001, ADR-002. Rebuild diffs the file: PRD-004,
DDD-002, ADR-006. Corpus basis: corpus/11 typescript-stack, corpus/13 dev-toolchain-loadout (the
TOML-gate shape).
