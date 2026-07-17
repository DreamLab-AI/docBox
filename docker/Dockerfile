# syntax=docker/dockerfile:1.7
#
# docBox sandbox image — the self-modifying client dev sandbox.
#
# Design steer (PRD-000): a distillation, not agentbox. One plain multi-stage
# Dockerfile, digest-pinnable bases, and AT MOST three optional toolchain
# bundles, each gated by one build ARG that the Foreman Configuration tab writes
# into foreman.toml. Only toolchain *binaries* are baked; project *libraries*
# (npm/uv) live in per-project dependency files and are resolved at project
# setup, never here. See corpus/13-toolchain/dev-toolchain-loadout.md.
#
# Bundle gating is by ARG, evaluated in a single `if` per bundle. When a bundle's
# ARG is off the RUN is a no-op that adds no meaningful layer content, so the
# image carries only what the client provisioned. A change to any *rebuild*-class
# option re-runs this build under the blue/green orchestration in
# scripts/rebuild.sh.
#
# THIS REPO DOES NOT BUILD IMAGES IN CI (docker-in-docker with bind mounts is
# broken in the dev environment). Build on a real host or a Docker-capable CI
# runner — see docker/README.md.

# ---------------------------------------------------------------------------
# Base ref is an ARG so CI/the control plane can digest-pin it, e.g.
#   --build-arg NODE_IMAGE=node:24-bookworm-slim@sha256:<digest>
# node:24-bookworm-slim IS "debian bookworm slim + Node 24 + corepack".
# ---------------------------------------------------------------------------
ARG NODE_IMAGE=node:24-bookworm-slim

# Global tool-version ARGs — declared before the first FROM so any stage can
# re-declare (bare `ARG NAME`) and inherit these defaults. ARG defaults do NOT
# cross stage boundaries, so the version lives here once and a rebuild bumps it
# in one place.
ARG UV_VERSION=0.8.13
ARG TYPST_VERSION=0.13.1
ARG TECTONIC_VERSION=0.15.0
ARG CODE_SERVER_VERSION=4.99.3
ARG PI_VERSION=0.80.9
ARG PNPM_VERSION=10.15.0

# ===========================================================================
# Stage: base — OS packages, pnpm via corepack, a non-root user, workspace.
# Shared by every bundle. Kept deliberately small.
# ===========================================================================
FROM ${NODE_IMAGE} AS base

# Fail fast and make piped downloads fail on the first non-zero (hadolint DL4006).
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Re-declare only what this stage uses; inherits the global default above.
ARG PNPM_VERSION

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    # pnpm global store + bin, on PATH for every user.
    PNPM_HOME=/usr/local/pnpm \
    # uv-managed interpreters go to a shared, world-readable location.
    UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    # uv installs tool entry-points where the whole box can reach them.
    UV_TOOL_BIN_DIR=/usr/local/bin \
    UV_TOOL_DIR=/opt/uv/tools \
    PATH=/usr/local/pnpm:/usr/local/bin:/usr/local/sbin:/usr/bin:/bin

# System packages: certificates + fetch/VCS tooling only. git is an arm's-length
# GPL CLI invoked as a subprocess (never linked/vendored) — same policy the
# licence register records for pandoc. No apt package pinning here: the base is
# digest-pinned instead, which fixes the whole apt snapshot reproducibly.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      gnupg \
      tar \
      xz-utils \
      unzip \
      tini \
    && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (bundled with Node ≥16). Pinned for reproducibility.
RUN corepack enable \
    && corepack prepare "pnpm@${PNPM_VERSION}" --activate \
    && mkdir -p "${PNPM_HOME}" "${UV_PYTHON_INSTALL_DIR}" "${UV_TOOL_DIR}"

# Non-root user that owns the workspace. uid 1001 avoids clashing with the
# base image's own `node` user (uid 1000). Everything the agent runs runs here.
RUN groupadd --gid 1001 dev \
    && useradd --uid 1001 --gid 1001 --create-home --shell /bin/bash dev \
    && mkdir -p /workspace \
    && chown -R dev:dev /workspace "${PNPM_HOME}" "${UV_TOOL_DIR}"

# ===========================================================================
# Stage: sandbox — the final image. Layers the always-on engine (pi +
# code-server) then the three ARG-gated toolchain bundles.
# ===========================================================================
FROM base AS sandbox

# SHELL is inherited from base, but re-declare defensively so piped RUNs in this
# stage are unambiguously pipefail-safe (hadolint DL4006).
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Re-declare the ARGs needed in this stage; each inherits its global default.
ARG UV_VERSION
ARG TYPST_VERSION
ARG TECTONIC_VERSION
ARG CODE_SERVER_VERSION
ARG PI_VERSION

# Bundle gates — defaults mirror foreman.toml [toolchain]. The control plane
# passes these on a rebuild:
#   --build-arg TS_DASHBOARD=1|0
#   --build-arg PYTHON=1|0
#   --build-arg TYPESETTING=off|typst|full-latex
#   --build-arg PLAYWRIGHT_BROWSERS=1|0   (only meaningful when TS_DASHBOARD=1)
ARG TS_DASHBOARD=1
ARG PYTHON=1
ARG TYPESETTING=typst
ARG PLAYWRIGHT_BROWSERS=1

# ---------------------------------------------------------------------------
# ALWAYS ON — agent engine + web editor. Both MIT.
#   pi (@earendil-works/pi-coding-agent) is the embedded harness (corpus/12).
#   code-server is the web VS Code surface, run behind oauth2-proxy with
#   --auth none (it has no native OIDC; corpus/05).
# ---------------------------------------------------------------------------
RUN --mount=type=cache,target=/root/.cache,uid=0,gid=0 \
    set -eux; \
    pnpm add -g "@earendil-works/pi-coding-agent@${PI_VERSION}"; \
    # Standalone code-server install (no apt), pinned, prefixed into /usr/local.
    curl -fsSL https://code-server.dev/install.sh \
      | sh -s -- --version "${CODE_SERVER_VERSION}" --method standalone --prefix /usr/local; \
    pi --version; \
    code-server --version

# ---------------------------------------------------------------------------
# GATED BUNDLE 1 — TypeScript / dashboard build & test (foreman: toolchain.ts_dashboard)
#   Biome (one binary = ESLint + Prettier), Vite, Vitest, Playwright, tsgo.
#   Baked as global CLIs; chart/component libraries stay in project package.json.
#   Playwright browsers are a second, nested gate (toolchain.playwright_browsers)
#   because Chromium is ~400MB and agent browsing uses the confined sidecar
#   regardless — this bundle is only for the client team's OWN dashboard tests.
# ---------------------------------------------------------------------------
RUN --mount=type=cache,target=/root/.cache,uid=0,gid=0 \
    set -eux; \
    if [ "${TS_DASHBOARD}" = "1" ]; then \
      pnpm add -g \
        @biomejs/biome \
        vite \
        vitest \
        @typescript/native-preview \
        playwright; \
      if [ "${PLAYWRIGHT_BROWSERS}" = "1" ]; then \
        # System deps + Chromium only; browsers cache under PLAYWRIGHT_BROWSERS_PATH.
        PLAYWRIGHT_BROWSERS_PATH=/opt/playwright playwright install --with-deps chromium; \
        chmod -R a+rX /opt/playwright; \
      fi; \
      biome --version; \
    else \
      echo "toolchain.ts_dashboard=off — TS/dashboard bundle skipped"; \
    fi
# Point Playwright at the baked browser cache for every user (harmless if unset dir).
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright

# ---------------------------------------------------------------------------
# GATED BUNDLE 2 — Python, venvs, Jupyter (foreman: toolchain.python)
#   uv (one binary = pyenv + pip + venv + pipx + poetry) provides interpreters
#   3.11/3.12/3.13; ruff/pytest/JupyterLab/papermill/nbconvert baked as tools.
#   Scientific libraries (numpy/pandas/…) resolve into per-project pyproject.toml
#   at project setup, cached in a shared uv store volume — NOT baked here.
# ---------------------------------------------------------------------------
RUN --mount=type=cache,target=/root/.cache,uid=0,gid=0 \
    set -eux; \
    if [ "${PYTHON}" = "1" ]; then \
      # Map dpkg arch → uv release triple so the bundle is multi-arch correct.
      arch="$(dpkg --print-architecture)"; \
      case "${arch}" in \
        amd64) triple="x86_64-unknown-linux-gnu" ;; \
        arm64) triple="aarch64-unknown-linux-gnu" ;; \
        *) echo "unsupported arch for uv: ${arch}" >&2; exit 1 ;; \
      esac; \
      curl -fsSL "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-${triple}.tar.gz" \
        | tar -xz -C /usr/local/bin --strip-components=1 "uv-${triple}/uv" "uv-${triple}/uvx"; \
      uv --version; \
      # The three "couple of different Python revs" the client asked for.
      uv python install 3.11 3.12 3.13; \
      # Toolchain entry-points, installed globally to /usr/local/bin.
      uv tool install ruff; \
      uv tool install pytest; \
      uv tool install jupyterlab; \
      uv tool install papermill; \
      uv tool install nbconvert; \
      chmod -R a+rX "${UV_PYTHON_INSTALL_DIR}" "${UV_TOOL_DIR}"; \
    else \
      echo "toolchain.python=off — Python/Jupyter bundle skipped"; \
    fi

# ---------------------------------------------------------------------------
# GATED BUNDLE 3 — Typesetting (foreman: toolchain.typesetting = off|typst|full-latex)
#   typst      → Typst binary only (~40MB, Apache-2.0) — the default.
#   typst      → also fetch Tectonic (~30MB, MIT) for real XeLaTeX documents;
#                Tectonic pulls TeX packages on demand from the allowlisted CDN.
#   full-latex → the ~5GB texlive-full distro for air-gapped / deep-LaTeX clients
#                (LPPL 1.3c, flagged in the licence register). latexmk (GPL-2) is
#                an arm's-length CLI included only in this profile.
#   off        → no typesetting layer at all.
# ---------------------------------------------------------------------------
RUN --mount=type=cache,target=/root/.cache,uid=0,gid=0 \
    set -eux; \
    case "${TYPESETTING}" in \
      typst) \
        arch="$(dpkg --print-architecture)"; \
        case "${arch}" in \
          amd64) typ="x86_64-unknown-linux-musl"; tec="x86_64-unknown-linux-gnu" ;; \
          arm64) typ="aarch64-unknown-linux-musl"; tec="aarch64-unknown-linux-gnu" ;; \
          *) echo "unsupported arch for typesetting: ${arch}" >&2; exit 1 ;; \
        esac; \
        curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${typ}.tar.xz" \
          | tar -xJ -C /usr/local/bin --strip-components=1 "typst-${typ}/typst"; \
        curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${tec}.tar.gz" \
          | tar -xz -C /usr/local/bin tectonic; \
        typst --version; \
        tectonic --version ;; \
      full-latex) \
        apt-get update; \
        apt-get install -y --no-install-recommends texlive-full latexmk; \
        rm -rf /var/lib/apt/lists/*; \
        echo "typesetting=full-latex — texlive-full (LPPL) + latexmk (GPL-2) baked" ;; \
      off) \
        echo "toolchain.typesetting=off — typesetting bundle skipped" ;; \
      *) \
        echo "invalid TYPESETTING='${TYPESETTING}' (want off|typst|full-latex)" >&2; exit 1 ;; \
    esac

# ---------------------------------------------------------------------------
# Runtime posture.
# ---------------------------------------------------------------------------
LABEL org.opencontainers.image.title="docBox sandbox" \
      org.opencontainers.image.description="Self-contained client dev sandbox: pi agent + code-server + TOML-gated toolchain bundles" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.source="https://example.invalid/docbox"

WORKDIR /workspace
USER dev

# tini reaps zombies from agent subprocesses (pi spawns child processes / tools).
ENTRYPOINT ["/usr/bin/tini", "--"]
# Neutral default; every compose service overrides `command` with its real role.
CMD ["bash"]
