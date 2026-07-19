# Mock to live — the three rungs

"Live" means two different things in docBox, and conflating them is the single
most common first-run confusion. This page pulls them apart and gives you the
exact command and address for each rung.

The two senses of the word:

1. **`VITE_DATA_MODE=live`** — the UI's data mode. It stops reading the in-process
   mock module and instead fetches the world over HTTP and subscribes to the live
   event stream. The *transport* is real. But the dev server re-serves the same
   mock module, so the *data* is still seeded.
2. **Host-runtime live (M3–M6)** — a real datastore and control plane behind the
   server. Only at this rung is the data itself real.

The welcome dialog states the same ladder in one breath:

> **Mock → live, three rungs**
>
> - Demo (now) — the fabricated world, fully offline.
> - Dev-live — set VITE_DATA_MODE=live and run the dev server; it re-serves the same mock module, so data is live-transported but still seeded.
> - Host — a real datastore and control plane (M3–M6); only then is the data real.

## The ladder

| Rung | What you need | What becomes real | What's still seeded |
|---|---|---|---|
| **Demo** (default) | Nothing but the app: `pnpm dev:app` → `http://localhost:5173`. No server. | Nothing. The UI boots the deterministic mock world offline (ADR-001). | Everything — every owner, agent, action and document. |
| **Dev-live** | The control-plane server running: `pnpm dev:server` → `http://127.0.0.1:8787` (terminal 1), then `cd app && VITE_DATA_MODE=live pnpm dev` → `http://localhost:5173` (terminal 2). | The transport: a real HTTP fetch of `/api/world` and a live SSE subscription to `/api/events`. | The world itself — by default. The server serves the app's mock module, so `/api/world` reports `dataSource: "seeded"`. To go real locally without containers, run `DOCBOX_DATA=real pnpm dev:server`: the server then serves the real (empty) JSON-file store, `/api/world` reports `dataSource: "real"`, and the app shows the first-project card. |
| **Host** | The built container stack on a real host: `cd docker && docker compose up -d`. Reach Foreman on `https://127.0.0.1:8443` (oauth2-proxy → control-plane) or the control plane directly on `http://127.0.0.1:8788`. | The datastore (the real JSON-file world store — `DOCBOX_DATA=real` is the compose default, on the `docbox-world` volume), identity (Entra + oauth2-proxy), audit sidecar and vaults. | Nothing of the world data: `/api/world` reports `dataSource: "real"` from an empty store, the demo layer erases, and the first `/api/provision` starts the real record. Only the option **schema** and the module **manifest** are static — capability descriptions, not seeded owners or actions. |

The guided launcher wraps every rung so you need not remember the commands. Run `pnpm launch` for
the interactive menu, or a rung directly (add `--print` to see the commands without running them):

| Rung | Launcher |
|---|---|
| Demo | `pnpm launch demo` |
| Dev-live (seeded) | `pnpm launch dev` |
| Dev-live (real store) | `pnpm launch real` |
| One-port built (compiled UI + real store on 8787, with the `/bubble` widget) | `pnpm launch up` |
| Host | `pnpm launch host` — prints the docker compose sequence; it never runs docker here |

`pnpm launch doctor` checks Node, pnpm, ports and `app/dist` before you start, and `pnpm launch
configure` writes a git-ignored `.env.docbox` of dev defaults the launcher then sources.

## Why a green "live" badge can still be seeded

At the **dev-live** rung the header badge reads **live** — the UI really did
hydrate from the server. But the server serves the mock module
(`server/src/index.ts:16-20, 39-47`), so the data underneath is seeded, not a real
datastore. The server is honest about this: `/api/world` declares
`dataSource: "seeded"` (`server/src/index.ts:46`), the UI reads it, and the demo
strip stays visible with:

> Seeded: the dev server serves the mock world (server/src/index.ts:39-47) — live-transported, not yet a real datastore.

That strip only disappears when the server serves a real datastore and flips the
flag to `"real"`. That store now exists (`server/src/world/store.ts`): the seeded
store is the byte-identical default, and `DOCBOX_DATA=real` selects the real
JSON-file store — empty until the first `/api/provision`. A green badge over
seeded data is therefore expected only while the server runs seeded (the dev-live
default and the demo); set `DOCBOX_DATA=real` (dev) or use the host stack (where
it is the default) to reach real data. It is not a bug.

## The full host build

The dev-live rung needs no containers. The host rung does, and the image build
runs on a real host (not this dev environment — a bind-mount limitation). The
build and run sequence, the compose profiles, the egress firewall and the network
boundary are all in [docker/README.md](../docker/README.md). The default stack
brings up the control-plane, agent, audit sidecar and oauth2-proxy;
`https://127.0.0.1:8443` is the authenticated entry point, and `http://127.0.0.1:8788`
is the control plane on loopback behind it.

## See also

- [getting-started.md](getting-started.md) — the first-run demo tour.
- [troubleshooting.md](troubleshooting.md) — what the amber degraded strip means
  when live is requested but the server is not up.
- [docker/README.md](../docker/README.md) — the container build and run sequence.
- [ADR-001](reference/adr/ADR-001-stack-and-mock-first.md) — the mock/live seam.
