---
name: microsandbox
category: sandbox-infra
url: https://github.com/superradcompany/microsandbox
license: Apache-2.0
license_ok_for_client: true
stars: 6951
last_push: 2026-07-16
status: active
verified: 2026-07-16
---

# microsandbox

Self-hosted **libkrun microVM** sandboxes (KVM on Linux, Hypervisor.framework on macOS) — each
sandbox gets its own kernel, giving VM-grade isolation with container-like startup (~200ms) and
OCI image compatibility. Apache-2.0, active, fully self-hostable with no cloud dependency —
the strongest "we own the whole stack" option below E2B's complexity.

## Key facts

- `msb` server + SDKs (Python/JS/Rust); MCP server built in, so agents can request sandboxes
  natively.
- Uses standard OCI images — our existing container build pipeline carries over.
- Lower-level than E2B/Daytona: no built-in web terminal, Git tooling, or orchestration — we
  build the session lifecycle and UI layer ourselves.

## Fit for the client project

The self-hosted path to Cowork-grade isolation: v1 ships a hardened Docker container (fast to
build, works everywhere), v2 swaps the *same OCI image* into microsandbox microVMs when the
client wants hard multi-tenancy on their own metal. Requires KVM access on the host — fine on
bare metal/most VPSes, not inside already-virtualised environments without nested virt.

## Sources

- https://github.com/superradcompany/microsandbox
- https://pixeljets.com/blog/ai-sandboxes-daytona-vs-microsandbox/
