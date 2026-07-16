---
name: Corporate SSO — Microsoft Entra ID integration
category: identity-and-access
round: 2
researcher: r1-sso (sonnet)
verified: 2026-07-16
recommendation: oauth2-proxy (MIT) forward-auth in front of Traefik/Caddy; LibreChat replaces Open WebUI; App Roles not group claims
---

# Entra ID / Corporate SSO for the sandbox

All licences verified via GitHub API + raw LICENSE fetch, 2026-07-16.

## Headline verdicts

- **Open WebUI: EXCLUDED.** Moved to a custom "Open WebUI License" (source-available, NOT
  OSI). Branding may not be altered/removed except ≤50 users per rolling 30 days, written
  permission, or paid enterprise licence. Fails the permissive bar for client redistribution.
  (Its Entra support is first-class — irrelevant given the licence.)
- **LibreChat (MIT, 40.8k★, active): ACCEPTABLE.** First-class Entra OIDC
  (`OPENID_*` env vars, role gating via `OPENID_REQUIRED_ROLE*`), strong multi-provider LLM
  config (`librechat.yaml`: OpenAI, Azure OpenAI, Anthropic native, Bedrock, Vertex, DeepSeek,
  OpenRouter, Ollama, custom endpoints). Setup has known rough edges (#4309, #5143) — budget
  debug time.
- **oauth2-proxy (MIT, 14.7k★): best auth component.** Native `ms_entra_id` provider, handles
  group-claim overage and multi-tenant; single static Go binary, stateless, no DB.
- **code-server has NO built-in OIDC** (issues #905, #85 closed unimplemented; native auth is a
  shared password). Known-good pattern: `--auth none` + oauth2-proxy forward-auth via
  Traefik/Caddy.

## Component comparison

| Component | Licence | Entra support | Footprint | Verdict |
|---|---|---|---|---|
| oauth2-proxy | MIT | Native `ms_entra_id` provider | Single Go binary, no DB | **Pick** |
| Dex | Apache-2.0 | `microsoft` connector | Go binary ~45-50MB | Only if brokering multiple IdPs later |
| Keycloak | Apache-2.0 | Mature brokering | Quarkus, ~267MB image + Postgres | Only if client already runs it |
| Authentik | MIT core / proprietary `enterprise/` | Yes (source + reverse-sync provider) | 4 containers (Django+Go+PG+Redis) | Heavy; OSS-features-only if used |
| Authelia | Apache-2.0 | **NO — implements OP role only, cannot consume an upstream OIDC IdP** | Smallest (~25MB) | Functionally disqualified |
| Zitadel | AGPL-3.0 | Strong | Go | **Excluded on licence** |

## Recommended architecture

```
Entra ID (App Roles: Sandbox.Admin / Sandbox.User)
   │ OIDC
   ▼
oauth2-proxy (MIT, ms_entra_id)      ← one stateless auth container
   │ forward-auth
   ▼
Traefik (MIT) or Caddy (Apache-2.0)
   ├── LibreChat (MIT)  — chat surface
   ├── code-server (MIT) — --auth none, proxy-protected
   └── admin control plane
```

## Entra practicalities (for the ADR later)

- One App Registration, multiple redirect URIs. Single-tenant. Client secrets expire (max 24
  months) — rotation is an operational task; surface it in the admin plane.
- **Managed tenants often omit the `email` claim by default** — add as optional claim on the ID
  token or SSO breaks silently (bit both Open WebUI and LibreChat communities).
- **Use App Roles, not raw group claims**: group GUIDs are tenant-specific; >200 group
  memberships triggers claim overage (claim omitted, Graph call required). Define
  `Sandbox.Admin`/`Sandbox.User` App Roles; assign security groups to roles in the Enterprise
  App blade.
- Conditional Access evaluates the *user's device* at sign-in, not our container host. For mixed
  fleets prefer MFA + named-location policies over require-compliant-device (which only
  recognises domain-joined Windows).
- App Roles assigned to groups are NOT emitted for service principals — direct assignment needed
  for service-to-service callers.

## Sources

Key: raw LICENSE fetches (open-webui, authentik core+enterprise); gh api for all repos;
librechat.ai/docs/configuration/authentication/OAuth2-OIDC/azure;
oauth2-proxy.github.io ms_entra_id provider docs; code-server issues #905/#85; Microsoft Learn
(app roles, group claims, conditional access). Full URL list in the r1 research transcript.
