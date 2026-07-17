# Gap Analysis — Product State

Date: 2026-07-17 · Scope: docBox as it stands on `main` (commit 2f06867)

This is a gap analysis of the *product as built*, distinct from
[`gap-analysis.md`](gap-analysis.md) (which analysed research coverage). It answers: what is real,
what is mock, what is specified-but-not-built, and what is genuinely missing or risky.

## Verdict

docBox is a **complete, verified design and a working front-of-house**, sitting on a **thin
real backend and a large body of specified-not-built infrastructure**. The UI (5,740 LOC, eight
tabs, browser-verified) and the control-plane server (153 LOC, six endpoints) are real. Almost
everything that makes it a *secure, multi-user, agentic* product — auth, the pi engine, the
write-only audit, real snapshots — is designed in detail but not wired. That is the honest
milestone position (M1–M2 done, M3–M7 specified), not a defect. The gaps below are what stands
between "an excellent, judgeable prototype" and "a pilot a client can run".

## 1. Build reality: real vs mock vs specified

| Capability | State | Evidence |
|---|---|---|
| Foreman UI, 8 tabs | **Real**, verified in browser | `app/src` 5,740 LOC, typecheck+build green |
| Control-plane server | **Real** (mock-backed) | `server/src/index.ts`, 6 endpoints |
| Adapter seam (mock ↔ live) | **Real**, proven end to end | `adapter.ts` + `live.ts`, browser-verified |
| Config as TOML (read) | **Real** | `GET /api/config` |
| Config write / rebuild | **Simulated** | `PUT /api/config` is a no-op unless `DOCBOX_CONFIG_WRITABLE=1`; rebuild flow is a mock progress sequence |
| Documents upload + OCR | **Mock** | in-memory `documents.unshift`; no persistence, no real OCR |
| Live event stream | **Synthetic** | `/api/events` emits fabricated actions, not agent hooks |
| Companion extension | **Scaffold** (compile-checked) | talks to `/api/chat`, which does not exist |
| Agent engine (pi) | **Not wired** (M3) | zero references in server code |
| Identity / Entra SSO | **Not wired** (M5) | no auth on any endpoint; "auth" in code is config labels only |
| Write-only audit sidecar | **Not wired** (M6) | the audit trail is mock data; no hash-chaining, no identity injection in running code |
| Snapshots / rollback | **Simulated** (M4) | mock restore points; blue/green is a bash script, never run |
| Vaults | **Mock** (M6) | mock lock/unlock; no gocryptfs |
| Container build | **Definitions only** | DinD blocks building here; static-validated |

## 2. Engineering and quality gaps

- **~~Zero automated tests.~~ CLOSED 2026-07-17.** A Vitest suite now covers app and server:
  **358 tests, 99.95% app line coverage** (99.95% statements, 97.6% functions, 97% branches) and
  98.97% server line coverage. Harness: Vitest + jsdom + @testing-library, with canvas / matchMedia
  / ResizeObserver mocked for the visualiser and system-map. CI runs both suites with coverage
  gates. The residual under 100% is defensive fallbacks (`?? default`, an unreachable control-type
  `return null`, singular/plural branches) where a contrived test adds no real safety, so the
  thresholds are set to the genuinely-met level rather than to hollow tests.
- **No linter configured.** Biome is named in the toolchain corpus but there is no `biome.json`
  and CI runs typecheck + build + tests + prose + secret-scan, but no lint. Style/consistency is
  currently held by convention, not enforcement. (Next after tests.)
- **Three referenced Dockerfiles do not exist.** `compose.yaml` references
  `Dockerfile.control-plane`, `Dockerfile.audit`, and `Dockerfile.vault` (commented as M2/M6
  deliverables). The stack cannot build as written until they land — expected, but worth stating.
- **The QE fleet's automated SAST is low-signal here.** It flagged 60 items; 59 were relative
  `import` paths mis-read as path traversal and 1 was `regex.exec()` mis-read as `eval`. All false
  positives. Real static analysis needs the Opus review pass, not the pattern scanner.

## 3. Security gaps (real vs specified)

- **No authentication or authorisation on any endpoint** (specified for M5). If the current server
  were exposed, `/api/config` PUT (with the writable flag) and the whole world are open. The
  design (oauth2-proxy + Entra, ADR-005/PRD-005) is sound; it is simply not present in code.
- **The trust story is specified, not enforced.** The product's headline — provable, hash-chained,
  identity-seeded audit — exists as architecture (corpus/09, DDD, ADR) and as *mock data in the
  UI*. No running code injects identity or writes an immutable trail. A pilot that needs the audit
  guarantee does not yet have it.
- **CORS is wide open** (`cors()` with no origin allow-list) on the server. Harmless while
  mock-only and local, a real gap the moment the server does anything stateful over a network.
- Detailed findings from the security audit pass are folded into §6 once verified.

## 4. Product and operational gaps (carried + new)

Still open from the round-2 gap analysis, and confirmed still open:

1. **Own-stack licence audit.** ruflo/ruvector and the QE fleet are used in *building* docBox but
   have not been licence-audited as *shippable* components. If any ship in the product, they need
   the same permissive verification everything else got.
2. **Secrets management.** Config has a `secret` type and masks values, but there is no real key
   store, rotation, or wrapping. Provider keys currently have nowhere safe to live.
3. **Product update channel.** How a client receives docBox updates (signed images, staged
   rollout) is unaddressed.
4. **Whole-system backup / restore.** Distinct from overhaul snapshots; not designed.
5. **RBAC and approval.** The beads `human` gate models overhaul approval, but there is no real
   role system: who may trigger an overhaul vs who may only chat is unmodelled beyond the config
   toggle.
6. **Prompt-injection defence** for an agent that can rebuild its own container — noted in corpus,
   not implemented.
7. **Cost metering** per user/project across providers — not present.
8. **Multi-tenancy / multi-project topology** — one shared box vs per-user is still a client-brief
   question that changes auth, audit partitioning, and the vault model.

## 5. What is deliberately not a gap

To keep the analysis honest, these look like gaps but are intended:

- Mock-first with no backend persistence — the point of M1/M2 is a judgeable design before
  containerising; the adapter seam makes the swap a one-file change.
- Container definitions unbuilt — the DinD limit is environmental; they build on a real host.
- The companion extension unrun — it needs code-server, which is not in this dev environment.
- The streamed-desktop surface absent — it is an ADR-009 *candidate* module, off by design.

## 6. Verified audit findings

Findings from the QE audit (Opus mesh: correctness, security, licence, consistency, a11y/UX)
are appended here after verification, most-severe first. See the audit summary in the session.

## Priorities

If the aim is "closest to a runnable pilot", the order is: (1) a test suite + Biome + a CI lint
gate, so the contract is enforced not just verified; (2) wire real auth (oauth2-proxy + Entra) so
nothing is open; (3) make the audit trail real (identity injection + hash-chained sink), because
it is the product's trust claim; (4) the three missing Dockerfiles so the stack builds; then the
M3 pi engine so the agent actually acts. The design for all of these already exists — the gap is
wiring, not decisions.
