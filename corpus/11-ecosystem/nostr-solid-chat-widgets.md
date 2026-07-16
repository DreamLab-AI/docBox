---
name: Permissive Nostr/Solid replacements + embeddable chat-bubble widgets
category: ecosystem
round: 2
researcher: r4-nostr-solid-chat (sonnet)
verified: 2026-07-16
recommendation: nostr-rs-relay (MIT) + nostr-tools/rust-nostr if Nostr is kept at all; CommunitySolidServer (MIT) for Solid; deep-chat (MIT) for the script-tag chat bubble
---

# Nostr/Solid permissive replacements + chat widgets

Licences verified via gh api + raw LICENSE reads, 2026-07-16.

## Nostr relays

| Relay | Licence | Verdict |
|---|---|---|
| **nostr-rs-relay** | MIT | **Top pick** — single Rust binary, embedded SQLite, DockerHub image |
| **rnostr** | MIT | Strong second — embedded LMDB, zero external deps, compose example |
| strfry | **GPL-3.0** | Best-engineered, **excluded** |
| nostream | MIT | Needs PostgreSQL + Redis — see Redis trap below |
| khatru / relayer | Unlicense¹ | Frameworks not binaries; khatru GitHub-archived (maintenance mode) |

¹ **Unlicense caveat**: functionally more permissive than MIT but not literally on a
"MIT/Apache/BSD only" checklist — public-domain dedication is shaky in some jurisdictions
(Germany), no patent grant. One-line note to counsel, likely fine, don't assume auto-pass.

**Dependency trap found**: **Redis ≥8 is tri-licensed RSALv2/SSPLv1/AGPLv3** — none permissive.
Pin Redis ≤7.2 (BSD-3) or use **Valkey** (BSD-3, Linux Foundation, drop-in). Applies anywhere in
the product, not just nostream.

Client libs all clean: **rust-nostr** (MIT, now `nostrdevkit/nostr`), **nostr-tools**
(Unlicense¹), **NDK** (MIT).

## Solid / data pods

- **CommunitySolidServer — MIT confirmed**, active (pushed 2026-07-16). Direct drop-in if real
  Solid semantics (WebID, WAC, LDP) are needed.
- **remoteStorage.js** (MIT) — much lighter user-owned-storage spec if full Solid isn't needed.
- **AT Protocol / Bluesky PDS** — genuinely dual MIT/Apache-2.0; a whole federation substrate,
  heavy for "just a pod".

## The engineering-honest verdict on Nostr for audit mirroring

For **internal** audit/log mirroring in one trust domain, Nostr buys nothing: its value is
decentralisation across relays you don't control. You'd inherit signature verification, NIP
protocol overhead, and relay ops for properties a signed append-only log or internal bus (NATS,
Valkey streams) provides more cheaply. **Where Nostr IS right**: if the product feature is the
END USER owning a portable, self-sovereign copy of their history (our existing NIP-59
session-mirror pattern is exactly that). Ask the client whether users take this data elsewhere.
Yes → keep Nostr with the permissive relay swap. No → boring internal bus; the audit trail
design (s2 stream) already covers tamper-evidence without Nostr.

## Embeddable chat-bubble widgets

| Widget | Licence | Framework | Auth pass-through | Verdict |
|---|---|---|---|---|
| **deep-chat** | MIT (3.7k★, pushed today) | **Web component — plain script tag** | `request` + `interceptor` hook injects the dashboard's JWT per call; backend-agnostic | **Best worst-case fit** |
| **assistant-ui** | MIT (11.1k★) | React only | You own the transport | Best if the dashboard is React |
| Vercel AI SDK UI | **Apache-2.0** (misdetected NOASSERTION) | React/Vue/Svelte hooks | You implement | Building blocks, not a bubble |
| Chainlit Copilot | Apache-2.0 | Script tag + `accessToken` JWT | Yes — but **couples you to a Chainlit Python backend** | Only if adopting Chainlit server-side |
| Botpress Webchat | MIT | Script tag | Via Botpress runtime only | Adopts their bot-runtime middle layer |
| NLUX | **custom MPL + AI-training restriction, ~8mo stale** | — | — | **Excluded** |
| Typebot | **FSL-1.1** (competing-use ban, 2-yr delayed Apache) | — | — | **Excluded** |
| LibreChat | MIT | Full app, not a widget | Own auth system | Wrong shape for embedding (right shape for our own web UI — see entra-sso.md) |

**Recommendation**: **deep-chat** for the unknown-corporate-dashboard worst case (script tag +
JWT interceptor straight to our agentapi/control-plane backend); **assistant-ui** if React is
confirmed. Avoid NLUX/Typebot outright.

## Sources

gh api / raw LICENSE reads for all repos listed; deepchat docs; chainlit copilot docs; botpress
webchat docs; redis/valkey LICENSE files. Full URL list in the r4 research transcript.
