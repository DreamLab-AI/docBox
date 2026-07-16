---
name: Desktop launcher, container runtimes, and the Docker Desktop trap
category: distribution
round: 2
researcher: r3-desktop-wrapper (sonnet)
verified: 2026-07-16
recommendation: decide local-vs-server first; if local, Electron launcher targeting the generic Docker API (Podman/Rancher engines), never Docker Desktop
---

# Double-click launcher + container runtime for client desktops

Licences verified via GitHub Licenses API, 2026-07-16.

## Electron vs Tauri v2

| | Electron | Tauri v2 |
|---|---|---|
| Licence | MIT | Dual MIT + Apache-2.0 |
| Bundle | 80-150MB+ (Chromium+Node) | ~10-20MB real apps (OS WebView + Rust) |
| Auto-update | Most mature (electron-updater) | tauri-plugin-updater, no diffing yet |
| Spawning docker compose + health-check + load localhost | Trivial (child_process) | shell plugin + capability manifest — more config, genuinely safer (webview can only exec declared binaries) |
| Prior art for THIS pattern | Docker Desktop, Podman Desktop (Apache-2.0, 109k★), Rancher Desktop (Apache-2.0), container-desktop (MIT, active) — all Electron | Little |

**Verdict**: Electron for prior-art density and update maturity in a thin launcher; Tauri v2 if
minimal footprint/attack surface is a stated client requirement (its permission manifest is the
better security story for a wrapper that shells out).

Flags: **LM Studio** is closed-source freeware — UX reference only, never a licence template.
**janhq/jan** licence is NOASSERTION via API with conflicting secondary claims — unusable as a
citation without a direct LICENSE read.

## THE TRAP: Docker Desktop licensing (confirmed 2026 terms)

Free only for personal use, education, non-commercial OSS, or companies **<250 employees AND
<$10M revenue**. Company-wide trigger, not per-seat (Pro ~$9, Team ~$15, Business ~$24/user/mo).
Shipping a Docker-Desktop-dependent tool to a larger client creates an unbudgeted per-seat
liability the first time it's used for work.

**Clean alternatives (per-OS):**

| Tool | Licence | Notes |
|---|---|---|
| Podman Desktop | Apache-2.0 | Win needs WSL2/Hyper-V + admin at setup |
| Rancher Desktop | Apache-2.0 | Presents docker-CLI-compatible socket (moby/dockerd or containerd) |
| Colima | MIT | macOS/Linux only — no Windows |
| Lima | Apache-2.0 | The VM engine under both; not a product |
| OrbStack | Proprietary paid | **Excluded** |

**Build rule**: target the **Docker Compose v2 spec + generic Docker-API socket**, auto-detect
whichever engine is present. Never hard-depend on Docker Desktop.

## Locked-down corporate Windows reality

- WSL2 enablement requires **local admin** (Windows feature: Virtual Machine Platform).
- Group Policy can and does block Hyper-V/WSL2 outright; installer cannot route around IT policy.
- Post-setup, Podman/Rancher day-to-day use doesn't need admin — but setup always does.
- **Conclusion**: on genuinely locked-down Windows there is NO local-container path without an IT
  ask. The lowest-friction answer is architectural, not tooling: don't require a container
  runtime on the client machine.

## The alternative that sidesteps everything: shared server + thin client

| Dimension | Local per-desktop containers | Server-hosted + pinned-URL shell/PWA |
|---|---|---|
| IT friction | N× WSL2/admin tickets | Zero client install beyond a browser |
| Data governance | Data on N laptops | One governed location, revoke = kill a login |
| GPU | Per-laptop lottery (WSL2 GPU-PV ~5-15% overhead where present) | One shared GPU, centralised drivers |
| Offline | Works on a plane | None without a degraded mode |
| Contention | None | Needs session isolation/scheduling for multi-user |
| Security surface | Local | Network-exposed endpoint — needs the r8 tunnel/auth work |
| Wrapper engineering | Real (lifecycle, detection, N-machine updates) | Trivial (URL pin / PWA manifest) |

**Recommendation**: this is a scoping question for the client (client-questions.md Q1/Q3). If
>250 employees or locked-down Windows — the likely case — go server-hosted: the "double-click
app" becomes a ~10MB URL shell or just a PWA, and the Docker Desktop/WSL2 problems vanish
structurally. If true offline/per-user isolation is required and the org is small, Electron
launcher over Podman/Rancher engines with WSL2 flagged as a deployment prerequisite.

## Web-only adjacent finds

- **Dockge** (MIT) — self-hosted compose-stack manager; relevant to the server model's ops, not
  the launcher.
- **Portainer CE** (Zlib) — CE is enough for single-team use; BE gates SSO/OIDC among other
  things (noteworthy: container-management SSO is a paid feature there, reinforcing the
  oauth2-proxy approach from the r1 stream).

## Sources

docs.docker.com/subscription/desktop-license; docker.com Subscription Service Agreement;
Podman/Rancher/Colima/Lima/container-desktop/Dockge/Portainer licences via GitHub Licenses API;
Microsoft Learn (WSL FAQ, Group Policy virtualization blocking, microsoft/WSL#12300); NVIDIA
CUDA-on-WSL docs; OrbStack licensing/pricing; LM Studio app terms. Full URL list in the r3
research transcript.
