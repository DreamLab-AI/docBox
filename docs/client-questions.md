# Questions for the Client Brief

Prepared ahead of the main brief (~late July 2026). Ordered by how much each answer changes the
architecture.

## Topology & deployment (changes everything)

1. **Where does the sandbox run?** Client-hosted server(s), each developer's laptop, or their
   cloud tenancy? (Determines: desktop-launcher vs pinned-URL shell, GPU availability for the
   embedded model, tunnel architecture, Docker Desktop licensing exposure.)
2. **One shared sandbox or per-user/per-project instances?** Concurrency expectations?
   (Determines: SSO/session model, audit partitioning, vault-per-project design, snapshot scope.)
3. **What OS are team members on?** Locked-down corporate Windows? Admin rights? WSL2 allowed by
   group policy?

## The interface we haven't seen

4. **What is the business dashboard built on** (React? server-rendered? iframe/CSP policies?)
   and can we inject a script-tag chat bubble, or do they embed a component from us?
5. **Who exactly is the "primary user"** — developers, analysts, non-technical staff? What do
   they do today when they hit a problem bigger than their interface?
6. **How does the CTO's overhaul work today?** Concrete examples of the last two "core
   reorganisation" changes — artifacts touched, time taken, what went wrong. (This defines the
   agent's benchmark tasks and the DDD core domain.)
7. **What are the "meta app kits" concretely** — a codebase we get access to? Where is source of
   truth (Azure DevOps? GitHub Enterprise? on-prem GitLab)?

## Identity, governance, compliance

8. **Entra ID**: can we get an app registration in their tenant? Who administers group→role
   mapping (admin vs primary user)? Conditional access / device compliance in play?
9. **Data egress policy**: which cloud LLM providers are permissible at all (Anthropic, OpenAI,
   DeepSeek, GLM — the last two often fail corporate procurement in UK/EU)? Is a fully-local
   (embedded model only) mode required for some work?
10. **Audit**: who consumes the trail (CTO, compliance, security)? Retention period? SIEM export
    (Sentinel?) required? Tamper-evidence expectations?
11. **Licence posture**: MIT/Apache/BSD confirmed as acceptable — is MPL-2.0 tolerable
    (affects OpenBao)? Are non-OSI model licences (Gemma Terms of Use) acceptable for an
    *embedded* model, or must the local model be Apache-2.0 (Qwen/OLMo class)?

## Operations

12. **Snapshots/rollback**: what must survive a rollback (user work? databases? project vaults?)
    and what RPO/RTO do they expect? Who is allowed to roll back?
13. **Network posture**: inbound ports acceptable on their infra, or zero-inbound (tunnel)
    required? Cloudflare relationship? Tailscale/NetBird tolerance? Or Microsoft-native only?
14. **Update channel**: how do they want to receive product updates from us — and who approves
    an update that changes agent capabilities?
15. **Budget shape**: appetite for per-seat services (Cloudflare Zero Trust, Tailscale) vs
    self-host-everything? Cloud LLM spend caps per user/project?

## Success criteria

16. **What does the pilot have to prove** — one CTO-scale overhaul executed by the agent with
    rollback available? Time-to-first-value for a primary user? A specific workflow?
17. **Who signs off security** — internal team or external pentest? (Sets the bar for the
    threat-model documentation we ship.)
