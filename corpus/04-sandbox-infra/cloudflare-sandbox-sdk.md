---
name: cloudflare/sandbox-sdk (Cloudflare Sandboxes)
category: sandbox-infra
url: https://github.com/cloudflare/sandbox-sdk
license: Apache-2.0 (GitHub misdetects as NOASSERTION — LICENSE file verified)
license_ok_for_client: true  # SDK; the runtime is a cloud-only service
stars: 1071
last_push: 2026-07-16
status: active
verified: 2026-07-16
---

# Cloudflare Sandboxes / sandbox-sdk

Apache-2.0 TypeScript SDK for **Cloudflare Containers**-backed sandboxes: persistent isolated
Linux environments with a code-interpreter API, **browser-accessible terminal, preview URLs for
exposed ports, egress proxies with credential injection, and snapshot/warm-start** (GA April
2026). The feature set reads like a hosted version of exactly our target model.

## Fit for the client project

- The SDK is permissive but the runtime is **cloud-only** — no self-host. Fit depends entirely
  on whether the client is Cloudflare-committed.
- If they are: sandboxes + Workers give the web front-end and the isolated backend in one
  platform, and it is one of Anthropic's supported Managed Agents substrates.
- If not: treat as a design reference — their preview-URL and egress-proxy-with-secret-injection
  patterns are worth copying into our container design.

## Sources

- https://github.com/cloudflare/sandbox-sdk
- https://www.infoq.com/news/2026/04/cloudflare-sandboxes-ga/
