<!--
Thanks for contributing to docBox. Keep the change focused and within one owner area
(app / server / docker / docs / corpus) where possible. See CONTRIBUTING.md.
-->

## What this changes

<!-- One or two sentences. Link any related issue with "Closes #123". -->

## Owner area

<!-- Tick the area(s) this PR touches. -->

- [ ] `app/` — control-plane UI
- [ ] `server/` — backend adapters
- [ ] `docker/` — container definitions
- [ ] `docs/` — design docs and reference corpus
- [ ] `corpus/` — research survey
- [ ] Repo hygiene / CI

## Checklist

- [ ] New dependencies are **licence-checked** (MIT / Apache-2.0 / BSD only, verified with `gh api`)
- [ ] Docs and README are **prose-scanned** — no banned marketing words, UK English
- [ ] **No secrets** committed (keys, tokens, `.env` values)
- [ ] Feature modules import only from the frozen contract (`domain/types.ts`, `data/adapter.ts`) and shared UI primitives
- [ ] `pnpm run typecheck` and `pnpm run build` pass locally (for `app/` changes)
- [ ] CI is green
