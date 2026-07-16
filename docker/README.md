# docBox — container & deployment

The build and deployment definitions for the docBox sandbox (PRD-000 milestone
M4). Everything here is **static** — this repo's own environment cannot build
images (docker-in-docker with bind mounts is broken in the dev box), so these
files are written and linted here and **built on a real host or a Docker-capable
CI runner**.

## Files

| File | Role |
|---|---|
| `Dockerfile` | Multi-stage sandbox image: Node 24 + pnpm base, three ARG-gated toolchain bundles, pi engine + code-server, non-root. |
| `compose.yaml` | The stack, two-network topology, three-plane volumes, loopback-only host ports. |
| `compose.tunnel.yaml` | Optional overlay adding the cloudflared tunnel (zero inbound ports). |
| `foreman.toml` | Canonical config manifest; Foreman's Configuration tab is a typed editor over these keys. |
| `.env.example` | Every environment variable the stack reads. Copy to `.env`. |
| `../scripts/rebuild.sh` | Blue/green overhaul: snapshot → build → GREEN → verify → cut over / auto-rollback. |
| `../scripts/rollback.sh` | Post-cutover rollback to a retained prior tag (+ optional git revert). |
| `../scripts/init-firewall.sh` | Default-deny egress firewall reading the allowlist from `foreman.toml`/env. |

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
docker compose build          # builds agent + control-plane images
docker compose up -d          # base stack: control-plane, agent, audit, sidecars

# Inside the agent container, install the egress allowlist (needs CAP_NET_ADMIN):
docker compose exec agent /scripts/init-firewall.sh
```

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
  and only the audit sidecar's ingest interface. Egress is shaped by
  `init-firewall.sh`.
- **`audit-net`**: `internal: true`. The audit sidecar (dual-homed) and its
  storage. No agent is attached, so agents have no route to the audit read path.

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
