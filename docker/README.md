# docBox — container & deployment

The build and deployment definitions for the docBox sandbox (PRD-000 milestone
M4). Everything here is **static** — this repo's own environment cannot build
images (docker-in-docker with bind mounts is broken in the dev box), so these
files are written and linted here and **built on a real host or a Docker-capable
CI runner**.

## Files

| File | Role |
|---|---|
| `Dockerfile` | Multi-stage sandbox/agent image: Node 24 + pnpm base, three ARG-gated toolchain bundles, pi engine + code-server, non-root. Ships the egress firewall + startup wrapper. |
| `Dockerfile.control-plane` | Foreman control-plane image: multi-stage build of `@docbox/server` (Hono) plus the built `@docbox/app` UI it serves, non-root, listens on 8788, healthcheck on `/api/health`. |
| `Dockerfile.audit` | Write-only audit-sidecar image: builds the audit ingest from `@docbox/server`, runs its `start:audit` entry as a dedicated non-root audit uid, ingest on 9099. |
| `Dockerfile.vault` | gocryptfs live-FUSE mount-provider image (optional `gocryptfs-fuse` engine). Debian slim + gocryptfs (MIT) from apt, non-root, no app logic. Builds under the `vault-fuse` profile. |
| `compose.yaml` | The stack, two-network topology, three-plane volumes, loopback-only host ports, per-service hardening. |
| `compose.tunnel.yaml` | Optional overlay adding the cloudflared tunnel (zero inbound ports). |
| `Dockerfile.browser` | Optional browser-sidecar image: **real headful Google Chrome** + GPU (Vulkan/ANGLE/WebGPU), Xvfb, x11vnc, chrome-devtools-mcp. Structurally undetectable (not headless). Chrome is proprietary — the one deliberate exception to the permissive-only rule. Builds only under the `browser` compose profile. |
| `launch-browser.sh` | Entry point for the browser sidecar: starts Xvfb (`:2`), x11vnc (`:5903`), and Chrome headful with the GPU + remote-debugging (CDP) flags. |
| `launch-vault.sh` | Entry point for the vault sidecar: unlocks a gocryptfs cipherdir with a passphrase and keeps the plaintext FUSE mount live in the foreground. |
| `docbox-entrypoint.sh` | Startup wrapper for the agent image: applies the egress firewall as root, then drops to the unprivileged `dev` user and execs the command. |
| `foreman.toml` | Canonical config manifest; Foreman's Configuration tab is a typed editor over these keys. |
| `.env.example` | Every environment variable the stack reads. Copy to `.env`. |
| `../scripts/rebuild.sh` | Blue/green overhaul: snapshot → build → GREEN → verify → cut over / auto-rollback. |
| `../scripts/rollback.sh` | Post-cutover rollback to a retained prior tag (+ optional git revert). |
| `../scripts/init-firewall.sh` | Default-deny egress firewall reading the allowlist from `foreman.toml`/env. Baked into the agent image and run at startup by `docbox-entrypoint.sh`. |

## Build args (bundle gating)

The image gates three optional toolchain bundles, each keyed to one `foreman.toml`
`[toolchain]` flag. Defaults match the manifest.

| Build arg | Values | Bundle |
|---|---|---|
| `TS_DASHBOARD` | `1` \| `0` | Biome + Vite + Vitest + Playwright |
| `PYTHON` | `1` \| `0` | uv + Python 3.11/3.12/3.13 + JupyterLab + papermill |
| `TYPESETTING` | `off` \| `typst` \| `full-latex` | Typst (+Tectonic), or full TeX Live (~5GB) |
| `PLAYWRIGHT_BROWSERS` | `1` \| `0` | Bake Chromium (~400MB); nested under `TS_DASHBOARD` |

Pin the base by digest for reproducibility:

```bash
docker build \
  --build-arg NODE_IMAGE=node:24-bookworm-slim@sha256:<digest> \
  --build-arg TS_DASHBOARD=1 \
  --build-arg PYTHON=1 \
  --build-arg TYPESETTING=typst \
  --build-arg PLAYWRIGHT_BROWSERS=1 \
  -t docbox/sandbox:dev \
  -f docker/Dockerfile .
```

## Run on a real host

```bash
cd docker
cp .env.example .env          # fill in provider keys, Entra IDs, cookie secret
docker compose build          # builds the core images (agent, control-plane, audit)
docker compose up -d          # base stack: control-plane, agent, audit, oauth2-proxy
```

The core images all build by default: the agent/sandbox (`Dockerfile`), the control plane
(`Dockerfile.control-plane`) and the audit sidecar (`Dockerfile.audit`). The optional module
sidecars build under their compose profiles — `Dockerfile.browser` under `browser`
(`docker compose --profile browser build`) and `Dockerfile.vault` under `vault-fuse`
(`docker compose --profile vault-fuse build`). The control-plane and audit builds compile the
`@docbox/server` package (and, for the control plane, the `@docbox/app` UI it serves), so they
expect the server package to expose `build`, `start` and `start:audit` scripts.

> **Licence note.** The `browser` profile pulls **Google Chrome** (proprietary) at build time — the
> single deliberate exception to docBox's permissive-only rule. Real headful Chrome is what makes the
> sidecar structurally undetectable; a headless or permissive image is not. The exception is opt-in
> (no `browser` profile → no Chrome) and is documented in the header of `Dockerfile.browser`.

Egress is default-deny. The agent image bakes in `scripts/init-firewall.sh`, and
`docbox-entrypoint.sh` runs it at container start (as root, with the scoped `NET_ADMIN` the `agent`
service grants) before dropping to the unprivileged `dev` user. It installs an iptables/ipset OUTPUT
allowlist from the `foreman.toml` `egress_allowlist` (or `$EGRESS_ALLOWLIST`) and denies everything
else — including all IPv6. It is fail-closed: with `DOCBOX_EGRESS_FIREWALL=1` (the image default) the
container refuses to start if the rules cannot be applied. There is no manual `init-firewall` step to
run after `up`; it is already active inside the agent.

Host ports bind `127.0.0.1` only. Reach Foreman on `https://127.0.0.1:8443`
(oauth2-proxy → control-plane) or the control plane directly on
`http://127.0.0.1:8788`.

### With the tunnel (zero inbound ports)

```bash
docker compose -f compose.yaml -f compose.tunnel.yaml up -d
```

cloudflared dials out to Cloudflare's edge; Cloudflare Access does Entra OIDC at
the edge, so the origin never sees unauthenticated traffic. Nothing listens on a
public interface.

### Overhaul (blue/green rebuild)

```bash
../scripts/rebuild.sh         # snapshot → build SHA tag → GREEN → verify → cut over
../scripts/rollback.sh        # re-point live stack to the retained prior tag
```

`rebuild.sh` proves the new image in an isolated GREEN project — including a
read-only data-compatibility probe against the live User-Data volume — before it
moves any traffic. A failed healthcheck tears GREEN down and never cuts over
(auto-rollback is free with blue/green). See
`corpus/10-architecture/snapshot-rollback.md`.

## Network boundary

Two docker networks enforce write-only audit **topologically**, not by policy in
a handler:

- **`agent-net`**: control-plane, oauth2-proxy, agent, browser/vault sidecars,
  and only the audit sidecar's ingest interface. Egress is enforced: the agent
  applies a default-deny firewall at startup (`init-firewall.sh`) that permits
  only the `foreman.toml` allowlist. `NET_ADMIN` is granted to the agent service
  alone, used once to install the rules, then shed when the entrypoint drops to
  the unprivileged user.
- **`audit-net`**: `internal: true`. The audit sidecar (dual-homed) and its
  storage. No agent is attached, so agents have no route to the audit read path.

Authentication sits in front of the control plane via **oauth2-proxy**
(ms-entra-id provider). It admits only the App Roles `Sandbox.Admin` /
`Sandbox.User`, uses a stateless cookie session (no DB) whose lifetime tracks
`foreman.toml` `identity.session_ttl_min`, and sets secure/httponly cookies for
the TLS-terminated tunnel path. code-server (`--auth none`) is loopback-only for
debug and is reached authenticated through this proxy / the tunnel edge, never on
an open interface.

Three named volumes keep the state planes separate so a rollback can cut
System-Definition without touching User-Data or Audit: `docbox-system`,
`docbox-user-data`, `docbox-audit` (+ `docbox-vaults`).

## Why CI does not build here

The dev environment mounts the Docker socket but bind-mount paths resolve on the
**host** filesystem, so a build launched from inside it bakes stale image code
rather than the current source. Image builds therefore run on a real host or a
Docker-capable CI runner with a proper build context — never from this
environment. These definitions are validated statically (`docker compose config`,
hadolint/shellcheck where available) and built downstream.
