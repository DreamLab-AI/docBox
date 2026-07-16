# Vision Brief — Client Dev Sandbox with Agentic Intelligence Layer

Status: pre-brief scaffold (client brief expected ~late July 2026). This captures the working
vision so research, and later PRD/ADR/DDD, have a stable reference. Requirements here are
provisional until the client brief lands.

## Client context

- Client runs a dev sandbox where team members work **within their interface**, constrained
  inside their business dashboard BAU. We have not yet seen this interface.
- The **CTO periodically performs large structural updates** — core organisation, feature set,
  capabilities of the system ("meta app kit" overhauls). This is the expensive, risky work the
  agentic layer should take on.
- Client is **wary of AGPL-3.0** (rules out our existing Nostr/Solid stack as-is — fair).
  Corpus rule: MIT/Apache-2.0/BSD for anything shipped.
- Corporate identity is **Microsoft** — Entra ID login is the expected auth story.

## Product shape

A self-contained Docker (or similar) system:

1. **Radically simple entry** — double-click desktop app (Electron/Tauri class) that ensures the
   container stack is up and opens the usual tooling. Web-based VS Code (code-server) exposed on
   a container port.
2. **Smart TOML setup** — precedent: `agentbox.toml` (five-slot adapter architecture, each slot
   `local-*` / `external` / `off`; manifest-gated subsystems; env vars as runtime overrides;
   ADR references inline). Providers (Anthropic, OpenAI, DeepSeek, GLM, …) provisioned by the
   admin via TOML + dotenv.
3. **Bootstrap without TOML** — first boot with no config lands on an **admin web control
   plane**: setup wizard, provisioning, user management, rollbacks. One smooth control plane;
   TOML remains the durable, diffable source of truth underneath.
4. **Agentic intelligence layer** — our orchestration stack (ruflo/ruvector class) embedded, able
   to take on CTO-scale overhauls of the sandbox's own surfaces and capabilities. Also embedded:
   search, design, report building (LaTeX), security/QE fleet — **abstracted out of sight** of
   the primary user.
5. **Primary user UX** — just a **chat bubble** (in the client's dashboard and/or our web UI)
   to hand the agent problems bigger than the UX/UI they live in.
6. **Embedded local model** — a Gemma-class small model in-container for provider-independent
   operation; cloud providers layered on via admin provisioning.
7. **Traceability** — hierarchical, **user-ID-seeded** recording of agent actions across time.
   Working design instinct: a **write-only logging sidecar** the agents can emit to but not
   read or alter. The chromium-devtools browser sidecar pattern (VNC-observable, data-access
   confined) is attractive as an observation surface.
8. **Snapshots + rollback** — agentic overhauls of container internals must be bracketed by
   snapshots with one-click rollback, exposed in the admin plane.
9. **Encrypted-at-rest, portable, per-project filesystem** — likely a sidecar owning per-project
   vaults; unlocked via the web interface or corporate login.
10. **Zero-inbound-port exposure** — precedent from agentbox: loopback-only host binding,
    in-container Tailscale (userspace WireGuard) for mesh access, Cloudflare Tunnel overlay for
    selective public exposure. Radically reduced threat surface; research how this composes with
    Entra login for the client.
11. **TypeScript-first** — core product in TypeScript, tracking TS7 (native compiler) if it is
    production-ready.

## In-house assets and their status

| Asset | Status for this project |
|---|---|
| `agentbox.toml` five-slot adapter pattern | Direct precedent for the config system |
| Loopback + Tailscale + CF Tunnel strata | Direct precedent for network exposure |
| ruflo / ruvector orchestration + memory | Embed; **audit our own licence position before shipping** |
| chromium-devtools + VNC browser sidecar | Precedent for confined, observable sidecars |
| Nostr / Solid stack | Blocked on AGPL — permissive replacements under research |
| Agentic QE fleet, LaTeX reporting, search/design skills | Embed behind the scenes; packaging TBD |

## Non-negotiables (as currently understood)

- **Not agentbox.** The product is a distillation: plain multi-stage Dockerfile, no Nix, no
  five-slot adapter mesh, at most a handful of TOML-gated bundles. If a client needs
  agentbox-grade machinery, they should be sold agentbox — this product stays simple.
- **Maintainability outranks capability.** Fewest tools, one per job, mainstream choices,
  libraries in project dependency files not the image, digest-pinned bases, small update
  surface. (User steer 2026-07-16.)
- The agent engine should be an extensible permissive harness (pi-class), not an embedded
  proprietary CLI (user steer 2026-07-16; research in corpus/12-agent-harness/).
- Toolchain requirement: TS dashboard build/test tools, multiple Python versions with venvs +
  Jupyter, and the in-house LaTeX/report loadout — spec in corpus/13-toolchain/.
- Permissive licences in everything shipped.
- Primary users never see the machinery — one chat bubble, one URL.
- Admin sees one control plane — provisioning, users, snapshots, rollback, unlock.
- Every agent action attributable to a human identity, months later.
- The sandbox can rebuild large parts of itself without becoming unrecoverable.
