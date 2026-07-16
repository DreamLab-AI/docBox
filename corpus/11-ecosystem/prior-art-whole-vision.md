---
name: Prior art — whole-vision sweep and forgotten requirements
category: ecosystem
round: 2
researcher: r6-prior-art (sonnet)
verified: 2026-07-16
headline: no product combines all six pillars — the combination is genuine whitespace; the "agent overhauls its own platform tooling with rollback" capability exists nowhere surveyed
---

# Prior art: closest products and what they teach

Licences verified via gh api + raw LICENSE reads, 2026-07-16. Six pillars checked: zero-config
boot→admin wizard · TOML+dotenv · web VS Code · self-modifying agent layer w/ rollback ·
chat-bubble-only UX · Entra SSO + audit. **Nobody does all six; the closest three each cover a
different ~40-60% slice.**

## Closest three, ranked

1. **Coder** (coder/coder, 13.8k★) — closest to the *admin plane + agent governance* half:
   self-hosted, Terraform-defined workspaces, agents governed centrally with cost/model
   controls and per-action audit, OIDC SSO. **AGPL-3.0 — architecture reference only, no code
   reuse.** (Its MIT satellites — agentapi, code-server — are already in our corpus.)
2. **OpenHands** (MIT core, 81k★) — closest to the *agent-in-own-sandbox* half; ships an
   embedded browser VS Code tab. No admin plane, no SSO OSS-side, no business-user split.
3. **AnythingLLM** (MIT, 63.4k★) — closest to the *primary-user* half: first-run wizard,
   multi-user role-based admin, and a **built-in embeddable website chat-bubble widget** — a
   near-literal match for our front-of-house requirement. No code-server, no self-overhaul.

**Pattern source**: **Coolify** (Apache-2.0, 58.7k★) / **Dokploy** (Apache-2.0 core, 35.7k★) —
boot headless → auto-generate secrets → web wizard → admin account → env-file-backed config.
Add **Portainer's time-boxed first-admin-claim** (instance locks if admin not created within N
minutes) as the hardening detail. **Supabase self-host is the negative lesson**: manual `.env`
secret generation is exactly the friction our wizard removes.

## Licence flags in the agent-platform field

| Product | Status |
|---|---|
| AutoGPT | MIT *except* `autogpt_platform/` — the orchestrator part is **Polyform Shield** (non-compete). Excluded. |
| Dify | Modified Apache: no multi-tenant SaaS without commercial licence + branding lock. Flag. |
| n8n | Fair-code "Sustainable Use License" — **not permissive**, UX reference only. |
| Flowise / Activepieces | Apache-2.0 / MIT cores with EE carve-outs — usable cores. |
| **Sim** (simstudioai/sim, 29.1k★) | **Apache-2.0, no carve-out** — cleanest permissive agent-orchestrator reference. |
| odysseus (83k★, 6 weeks old, viral) | **AGPL** — but proof the "compose up → admin password → agentic workspace" pattern resonates. |
| openclaw (383k★, MIT) | "Gateway is the control plane, the chat assistant is the product" — the philosophical precedent for our chat-bubble positioning. |

## The Microsoft competitive answer (for the client conversation)

No single Microsoft SKU matches: **Dev Box** = cloud Windows VMs + Intune + Entra P1 per-seat;
**Codespaces** = not self-hostable; **Copilot Workspace** sunset May 2025, absorbed into Copilot
Coding Agent / Copilot App (cloud/GitHub-Actions-hosted only); **Foundry Agent Service** is
managed cloud; **Foundry Local** (2026) is the closest — but it's on-prem *model serving*, not a
bundled sandbox product. **Every Microsoft piece is cloud/subscription-dependent; a genuinely
self-contained, offline-capable, client-owned compose stack is a defensible differentiator, not
a feature gap.**

## GitHub sweep

Exact-phrase searches for this combination return **zero results** — nobody self-describes it
yet. The specific capability "agent performs CTO-scale overhauls of the platform's own tooling
with snapshot+rollback" appears in **nothing surveyed** — genuinely novel.

## Forgotten requirements (adjacent products treat as first-class; promote to gap-analysis)

1. Secrets management/rotation beyond initial provisioning
2. Backup/DR of the control plane's own state (distinct from overhaul rollback)
3. **Update channel for the product itself** (staged rollout, pinning, auto-update toggle)
4. Offline/air-gapped mode + telemetry consent
5. Multi-tenancy/project isolation model
6. **LLM cost governance / quotas** (Coder leads with this)
7. RBAC granularity — who may *trigger* an overhaul vs who may chat
8. **Human approval gate for self-modifications** (PR-style review, not just after-the-fact rollback)
9. **Licence/SBOM hygiene for agent-introduced dependencies** — the product's own agent must not
   vendor GPL/AGPL code into client repos (deliciously recursive given this corpus)
10. Compliance posture statement (SOC2/ISO27001 — Sim and Coder lead with it)
11. Data residency
12. Plugin/skill marketplace — how agent capabilities grow between overhauls

## Sources

gh api for all repos; Microsoft product pages (Dev Box, Foundry, Copilot App); Coolify/Dokploy
docs; full URL list in the r6 research transcript.
