---
name: Zero-inbound-port tunnels + Entra ID — three client postures
category: network-exposure
round: 2
researcher: r8-secure-tunnel (sonnet)
verified: 2026-07-16
recommendation: posture (a) cloudflared + Cloudflare Access→Entra OIDC (minimal change from house pattern); (b) same unless client mandates Microsoft SSE stack; (c) OpenZiti self-hosted
---

# Secure tunnel exposure with corporate login

Licences verified via gh api + direct LICENSE reads, 2026-07-16. SERVICE = procurement
question; SOFTWARE = shippable component.

## Cloudflare Tunnel + Access + Entra — confirmed working combo

- **cloudflared: Apache-2.0** (SOFTWARE), free and unmetered on any tier since 2021.
- **Cloudflare Access** (SERVICE): dedicated Entra ID OIDC integration; group policies keyed on
  Entra group Object IDs; SCIM sync needs Entra P1/P2. Enforcement at the edge — origin never
  sees unauthenticated traffic. **IdP federation is NOT tier-gated** (works on Free).
- Zero Trust pricing 2026: **Free ≤50 users**, $7/user/mo PAYG, Enterprise custom (secondary
  sources; pricing page is JS-rendered — re-verify at procurement).
- Feb 2026 rename wave (WARP→Cloudflare One Client etc.) — no impact on Tunnel/Access.

## Tailscale / headscale

- **tailscaled client: BSD-3-Clause**; control plane is proprietary SaaS. Entra SSO + SCIM
  **bundled from Standard ($8/user/mo)** under pricing v4 — stronger Entra story than expected.
  Intune device-posture integration exists; no native Conditional-Access awareness.
- **headscale: BSD-3-Clause**, active (v0.29.2), but explicitly community/non-enterprise. Entra
  via generic OIDC works with a real gap: **OIDC groups can gate login but cannot be used in
  ACL rules** (open issue) — Entra-group authorisation incomplete. No Funnel/Serve, no device
  posture. Fine for our own ops mesh; hard sell to a client security team.

## Self-hosted alternatives — licence ground truth

| Tool | Licence | Entra | Verdict |
|---|---|---|---|
| **OpenZiti** (+ zrok) | Apache-2.0 | **First-party documented** via `ext-jwt-signer` | **Best permissive self-host** — accept medium-high ops burden (controller+routers) |
| frp | Apache-2.0 (108k★) | None (its `oidc` is machine-to-machine) | Raw tunnel; bolt oauth2-proxy in front for user SSO |
| rathole | Apache-2.0 | None | Leaner frp for simple cases |
| NetBird | **Split: BSD-3 client, AGPL-3.0 control plane** | First-party guide | Client shippable; running the AGPL control plane internally is defensible, handing it to the client as a deliverable is not — counsel flag |
| Pangolin | **AGPL-3.0 / paid commercial dual** | — | **Excluded** under permissive-only |
| boringproxy | MIT | None | Unmaintained (~2 yrs) — excluded |

## Microsoft-native (all SERVICES)

- **Entra Private Access / Global Secure Access**: the "buy more Microsoft" play — per-app ZTNA
  gated by Conditional Access, but requires a **Windows Server connector host** (doesn't fit an
  all-Linux compose stack) and P1/P2 + $5/user/mo add-on (or Entra Suite $12/user/mo).
- **Azure Relay**: hybrid-app protocol relay, no CA-aware identity gating — ruled out.
- **Dev Tunnels**: Microsoft explicitly says not for production; auto-expiring — demo use only.

## Three-posture recommendation matrix

| Posture | Transport | SSO gate | Stack delta from house pattern |
|---|---|---|---|
| **(a) Cloudflare-friendly** | cloudflared (unchanged) | CF Access → Entra OIDC, group-object-ID policies | Minimal: one Access app + one Entra app registration; Free tier ≤50 users; keep Tailscale for our own ops access |
| **(b) Microsoft-everything** | (i) still cloudflared+Access→Entra unless client mandates Microsoft SSE; (ii) if mandated: Entra Private Access | Entra Conditional Access either way | (i) same as (a); (ii) add a Windows connector host + P1/P2+add-on licensing — materially heavier |
| **(c) Self-host-everything** | OpenZiti controller+routers (or frp/rathole + oauth2-proxy) ; headscale for the mesh side | ext-jwt-signer→Entra, or oauth2-proxy→Entra | Highest ops investment; zero external control-plane vendors |

Composes with the r1 stream: in postures (a)/(b-i) Cloudflare Access does edge auth AND
oauth2-proxy still runs inside the stack for defence-in-depth + local role mapping; in (c)
oauth2-proxy is the only auth layer.

## Sources

developers.cloudflare.com (Entra ID, policies, self-hosted apps, tunnel-for-everyone,
rename changelog) · tailscale.com/kb (Entra SSO, SCIM, pricing v4, Intune, posture) ·
github.com/juanfont/headscale (+FAQ, issues #2366/#846/#1040) · netfoundry.io OpenZiti Entra
guides · NetBird/Pangolin LICENSE reads · learn.microsoft.com (GSA, connectors, Relay, Dev
Tunnels) · full URL list in the r8 research transcript.
