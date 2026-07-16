---
name: E2B
category: sandbox-infra
url: https://github.com/e2b-dev/E2B
license: Apache-2.0 (SDK and infra repos)
license_ok_for_client: true
stars: 13006
last_push: 2026-07-16
status: active
verified: 2026-07-16
---

# E2B

Agent-focused sandbox infrastructure on **Firecracker microVMs** — each sandbox boots its own
Linux kernel (KVM), so isolation is hardware-grade rather than shared-kernel containers.
Apache-2.0 across `e2b-dev/E2B` (SDK) and `e2b-dev/infra` (the platform itself).

## Key facts

- Hosted: ~$0.083/hr for 1 vCPU + 2 GiB (per-second billing); Hobby tier with one-off credit,
  Pro ~$150/mo base with 24h max session length.
- Self-hosting: the full stack is open (Nomad-based) but documented for **AWS/GCP only and not
  self-serve** — realistic for an enterprise engagement, not a weekend deploy.
- Network egress controls (allow/block outbound) built in; sandbox templates for pre-baked
  environments; SDKs stream stdout/stderr — natural fit for a web front-end.

## Fit for the client project

Not needed for the v1 single-container model, but it is the permissive-licence answer to the
**multi-tenant** question: if the client later serves many users, per-session Firecracker VMs
(the actual Claude-Code-on-the-web architecture) via E2B beats hardening shared Docker.
Anthropic's Managed Agents also lists Daytona/Modal/Cloudflare/Vercel as execution substrates —
E2B is the one whose entire stack we could run and ship under Apache-2.0.

## Sources

- https://github.com/e2b-dev/E2B / https://github.com/e2b-dev/infra
- https://e2b.dev
- https://www.superagent.sh/blog/ai-code-sandbox-benchmark-2026 (pricing benchmark)
