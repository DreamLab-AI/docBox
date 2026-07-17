# Contributing to docBox

docBox is a self-contained client dev sandbox. This guide covers the layout, how to run the
control-plane app, and the four rules that keep the repo clean. Read it before opening a pull
request.

## Monorepo layout

| Path | What lives here |
|------|-----------------|
| `app/` | Foreman, the control-plane UI — Vite + React + TypeScript |
| `server/` | Hono backend (adapters that replace the app's mock seam) |
| `docker/` | Container definitions for the sandbox |
| `docs/` | Vision brief, client questions, and the reference record (`reference/` — PRD / ADR / DDD) |
| `corpus/` | The licence-verified research survey (13 sections) |
| `data/` | Machine-readable option datasets |

## Running the app

The control plane runs against a deterministic mock world — no backend needed.

```bash
cd app
pnpm install
pnpm dev        # http://localhost:5173
```

Before you push, run the same checks CI runs:

```bash
cd app
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsc + vite build
```

Use **Node 24** and **pnpm 10**. The lockfile (`app/pnpm-lock.yaml`, lockfile format 9) is
committed — install with `--frozen-lockfile` in automation, and commit lockfile changes whenever
you change dependencies.

## Four rules

### 1. Licence discipline — permissive dependencies only

Every dependency and every vendored tool must be **MIT, Apache-2.0, or BSD**. Badges lie, so verify
the real licence before you add anything — read the `LICENSE` file or query the GitHub API:

```bash
gh api repos/OWNER/REPO/license --jq '.license.spdx_id'
```

If the result is anything other than a permissive SPDX id (or the field is empty, which means the
project ships no licence at all), do not add it — flag it in your pull request and raise it for
discussion. The `corpus/` survey records the traps already found (custom licences, BSL, tri-licence
schemes, missing licences) — check there first.

There is **one standing, operator-approved exception**: the optional browser-sidecar module ships
**Google Chrome** (proprietary), because a real headful Chrome is what makes the sidecar
structurally undetectable — a headless/permissive image is not. It is opt-in (the `browser` compose
profile) and documented in `docker/Dockerfile.browser`. This exception does not license new
proprietary dependencies elsewhere: anything else still meets the permissive bar above.

### 2. Prose discipline — plain UK English

Docs are written in **UK English**, plainly. Run the slop scanner over anything you write in `docs/`
or `README.md`. CI fails the build on these marketing words: *seamless*, *leverage*, *robust*,
*comprehensive*, *streamline*. Rewrite them in plain language rather than reaching for a synonym —
say what the thing does.

### 3. Frozen contract — types and the adapter seam are the boundary

The domain types (`app/src/domain/types.ts`) and the data adapter (`app/src/data/adapter.ts`) are
the contract between feature modules and the outside world. Feature modules under
`app/src/features/` import **only** from those two seams and the shared UI primitives — never from
each other's internals, and never straight from the mock. Swapping the mock for a real backend is a
rewrite of `app/src/data/adapter.ts` and nothing else; keep it that way.

### 4. One tool per job

Two steers shape every decision, both from the client: this is a **distillation, not a maximalist
box**, and **maintainability beats capability**. Prefer the fewest tools, one per job, behind narrow
interfaces we own. New moving parts need a reason.

## Pull requests

- Keep changes focused and within one owner area where possible.
- Fill in the pull-request checklist: new dependencies licence-checked, docs prose-scanned, no
  secrets committed.
- Make sure CI is green: typecheck, build, prose scan, and secret scan all pass.

## Licence

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
