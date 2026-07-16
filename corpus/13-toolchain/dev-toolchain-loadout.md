---
name: In-container dev toolchain — TS dashboards, Python/Jupyter, typesetting
category: toolchain
round: 2
researcher: main session (licences verified via gh api 2026-07-16)
verified: 2026-07-16
recommendation: three TOML-gated bundles in a plain multi-stage Dockerfile — Biome+Vite+Vitest+Playwright / uv-managed Pythons+JupyterLab / Typst+Tectonic (texlive-full only as an air-gap profile)
---

# Dev toolchain loadout

## Governing principles (user steer, 2026-07-16)

1. **This product is a distillation, not agentbox.** Agentbox is the maximalist in-house
   reference (Nix flakes, five adapter slots, sovereign mesh). The client sandbox gets a plain
   multi-stage Dockerfile, digest-pinned bases, and at most three optional toolchain bundles
   gated by one TOML key each. If a capability needs agentbox-grade machinery, the answer is
   "then they should buy agentbox", not "port the machinery".
2. **Maintainability outranks capability.** One tool per job; mainstream tools with large
   communities; libraries live in *project* dependency files (npm/uv), never baked into the
   image — only toolchain *binaries* are baked. Every tool below earns its place by replacing
   two or more alternatives.

TOML shape (mirrors the manifest-gate idea at 1/10th the complexity):

```toml
[toolchain]
ts_dashboard = true
python = true
typesetting = "typst"   # off | typst | full-latex
```

## Bundle 1 — TypeScript / dashboard build & test

| Tool | Licence (verified) | Replaces / why |
|---|---|---|
| Node 24 LTS + corepack/pnpm | MIT / MIT (35.8k★) | Runtime + package manager; pnpm's store also dedupes across projects |
| TypeScript 5/6 + tsgo | Apache-2.0 | Compiler + free 10x CI type-check (r9 stream) |
| **Vite** | MIT (82k★) | Build/dev-server standard for dashboards |
| **Vitest** | MIT (16.8k★) | Test runner, same config universe as Vite — one ecosystem, not jest+babel |
| **Biome** | Apache-2.0 (25.3k★) | **One binary replaces ESLint + Prettier** — the maintainability pick |
| **Playwright** | Apache-2.0 (93k★) | E2E; browsers install into a cached layer. NOTE: in our architecture browser automation lives in the confined browser sidecar — Playwright here is for the *client team's own* dashboard tests |
| Tailwind CSS | MIT | Via project deps; listed for completeness |
| Turborepo | MIT (verified — 30.7k★) | OPTIONAL, only if the client's meta-app-kit is a monorepo; otherwise omit |

Not baked into the image (project-level npm deps): chart libraries (ECharts Apache-2.0,
d3 ISC, Recharts MIT), component kits, Storybook (MIT, heavy — project dep if wanted).
Excluded: Highcharts (proprietary), webpack/jest (superseded by the Vite universe here).

## Bundle 2 — Python, venvs, Jupyter

| Tool | Licence | Replaces / why |
|---|---|---|
| **uv** | Apache-2.0/MIT dual (87.5k★) | **One binary replaces pyenv + pip + venv + pipx + poetry**: `uv python install 3.11 3.12 3.13` gives the "couple of different Python revs"; `uv venv -p 3.12` per project; interpreters from python-build-standalone |
| **ruff** | MIT (48.6k★) | One binary replaces flake8+isort+black (lint+format) |
| pytest | MIT | Test standard |
| **JupyterLab** + ipykernel | BSD-3-Clause (15.2k★) | Notebook UI on a container port behind the same oauth2-proxy as code-server; kernels registered per uv-venv |
| papermill | BSD-3-Clause (6.5k★) | Parameterised/headless notebook execution — the agent runs notebooks through this |
| nbconvert | BSD-3 | Notebook → HTML/PDF export (pairs with typesetting bundle) |

Scientific stack (numpy/pandas/polars/matplotlib/plotly — all BSD/MIT class) stays in
per-project `pyproject.toml`, resolved by uv at project setup, cached in a shared uv store
volume. Image carries interpreters + toolchain only. **Excluded: conda/mamba** (second
package universe = maintenance burden; uv covers it), **Quarto** (GPL-2.0 and overlaps
nbconvert+typst).

## Bundle 3 — Typesetting (the LaTeX loadout)

In-house status: agentbox ships **`pkgs.texliveFull` via Nix** plus four skills
(latex-documents incl. Beamer module, latex-book, book-publishing, jupyter-notebooks export).
**Port the skills, not the Nix.** For the client image, full TeX Live is a ~5GB liability the
CTO has to patch; tiered instead:

| Tier | Tool | Licence | Size | When |
|---|---|---|---|---|
| Default | **Typst** | Apache-2.0 (54.9k★) | single ~40MB binary | New reports/docs — modern, fast, one binary to maintain; our report templates port cleanly |
| LaTeX compat | **Tectonic** | **MIT** (GitHub misdetects NOASSERTION; LICENSE verified) (5k★) | ~30MB binary | Real XeLaTeX documents; fetches packages on demand and caches — small image, needs egress to the allowlisted bundle CDN on first use |
| Air-gap / full fidelity | texlive-full distro package | LPPL 1.3c (free, OSI-approved) + assorted | ~5GB layer | Only as the `typesetting = "full-latex"` profile when the client is offline or has deep LaTeX investment |

Arm's-length GPL CLIs, invoked as subprocesses, never linked/vendored (same policy as git):
**pandoc** (GPL-2.0 — format conversion), latexmk (GPL-2 — only in the full-latex profile).
Both flagged in the licence register.

## Image budget

| Layer | Approx size |
|---|---|
| Base (debian-slim + Node 24 + pnpm + Biome + Vite/Vitest toolchain) | ~700MB |
| + uv + 3 Python interpreters + JupyterLab | +900MB |
| + Playwright chromium | +400MB |
| + Typst + Tectonic | +80MB |
| **Default total** | **~2.1GB** |
| full-latex profile | +5GB (opt-in only) |

Compare HolyClaude's 4GB single-purpose image: we carry three languages and typesetting in
about half that, because libraries are project-level and TeX Live is opt-in.

## Maintainability contract

- Every bundle is one Dockerfile stage keyed to one TOML flag; disabling a bundle removes the
  layer — no dynamic package installation inside a running container (that's the snapshot
  system's enemy).
- Tool count: **11 baked binaries** across all three bundles. Each quarterly update cycle
  bumps digests in one place.
- Everything verified permissive except the two flagged arm's-length GPL CLIs (pandoc,
  latexmk) and LPPL for the opt-in TeX Live profile.
