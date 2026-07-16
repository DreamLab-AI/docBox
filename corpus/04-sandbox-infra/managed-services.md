---
name: Managed sandbox services (Fly Sprites, Modal, Anthropic Managed Agents)
category: sandbox-infra
license: proprietary services
license_ok_for_client: false  # services, not shippable code — usable operationally if client accepts vendor terms
verified: 2026-07-16
---

# Managed sandbox services (grouped)

Cloud-only substrates. None are shippable code, but any could host the execution layer if the
client prefers opex to self-hosting. Grouped here to keep the corpus focused on buildable options.

## Fly.io Sprites

Firecracker microVM sandboxes with **checkpoint/restore**, explicitly marketed for coding agents
("run Claude Code safely in isolation"). Long-running, stateful, per-CPU-second billing. More
DIY than E2B (general PaaS, thinner agent SDK) but cheap and strong isolation.
- https://fly.io/ai/

## Modal Sandboxes

Managed containers, per-second billing, **the GPU option** — relevant only if the agent workload
needs CUDA (ML-adjacent tasks). Cloud-only, no BYOC, priciest CPU rates in 2026 benchmarks.
Python-centric function model rather than long-lived dev box.
- https://modal.com

## Anthropic Managed Agents — self-hosted sandboxes

The hybrid worth watching: **Anthropic runs the agent loop/orchestration; tool execution happens
in a sandbox you control** (Cloudflare, Daytona, Modal, Vercel, or a custom sandbox client via an
environment-worker that polls a task queue). This flips our architecture — instead of us hosting
Claude Code in a container, Anthropic hosts the brain and our container only executes tools.
Less code to own, but couples the client to Anthropic's platform surface and pricing.
- https://platform.claude.com/docs/en/managed-agents/self-hosted-sandboxes

## Also noted, not corpus-worthy

- **Vercel Sandbox** — same category as Modal/Cloudflare, weaker terminal story.
- **Coder (coder/coder)** — AGPL platform (its `agentapi` and `code-server` components are MIT
  and covered in corpus 02).
- **Gitpod/Ona, GitHub Codespaces** — general cloud dev environments; the devcontainer pattern
  transfers, the platforms are not single-purpose.
