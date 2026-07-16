---
name: Daytona
category: sandbox-infra
url: https://github.com/daytonaio/daytona
license: "NO LICENSE FILE in repo (verified 2026-07-16); historically AGPL-3.0"
license_ok_for_client: false
stars: 72274
last_push: 2026-07-09
status: active
verified: 2026-07-16
---

# Daytona — excluded on licence

Container-based agent sandboxes with **sub-90ms cold starts**, persistent workspaces, Git/LSP
tooling, web terminals; one of Anthropic's supported Managed Agents execution substrates. Very
popular (72k★) and technically a strong fit for stateful "remote dev box" semantics.

## Why excluded

As of 2026-07-16 the GitHub repo has **no LICENSE file at all** (the licence API returns 404 and
the repo root contains only README.md). Historically the project was Apache-2.0, then relicensed
**AGPL-3.0** when it pivoted to agent sandboxes. No licence = all rights reserved by default —
strictly worse than AGPL for client redistribution. Unless they publish a permissive licence,
this is a managed-service option only, and their cloud terms would govern.

Isolation is also default **shared-kernel OCI containers** (optional VM mode) — weaker than the
Firecracker/libkrun options for untrusted multi-tenant code.

## Sources

- https://github.com/daytonaio/daytona
- https://www.daytona.io/docs/en/sandboxes/
- https://pixeljets.com/blog/ai-sandboxes-daytona-vs-microsandbox/
