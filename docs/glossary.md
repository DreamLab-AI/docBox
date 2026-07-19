# Glossary

One screen of the words Foreman, the code, and this repo all use, so a newcomer
never has to open a design document to read the interface. The domain terms mirror
the ubiquitous language in
[DDD-001](reference/ddd/DDD-001-control-plane-domain.md); the frozen source is
`app/src/domain/types.ts`. The operator terms below the rule are the everyday
words for the product and its parts.

## Domain terms (from DDD-001)

| Term | Meaning |
|---|---|
| **Owner** | A human, identified by their Entra object id (`entra:{tid}:{oid}`). The stable key for attribution. Name and UPN are descriptive and may change. |
| **Session** | One human's working span. Root of an agent spawn tree. |
| **Agent** | A running unit of the agent layer (orchestrator or a spawned specialist). Carries owner, session, and parent, so lineage is reconstructable. |
| **Element** | A thing acted upon: a file, service, config, model, or vault. |
| **Action** | One recorded thing an agent did to an element at a time, with a status. The atom of the visualiser and the audit trail. |
| **Apply-class** | How a configuration change lands: hot, live, session, or rebuild. The system's core distinction (ADR-002, extended by ADR-008). |
| **Snapshot / restore point** | A bracket around an overhaul: the system definition before, the outcome after, and the healthcheck verdict. |
| **Bead** | A work item in the ledger, with dependencies, a gate, and an owner who asked for it. |
| **Gate** | A condition a bead waits on: human approval, CI, or a PR merge. |
| **Audit record** | An append-only, hash-chained entry. The system of record for what happened. |

## Operator terms

| Term | Meaning |
|---|---|
| **Foreman** | The web control plane in this repo — the eight-tab admin interface (`app/` + `server/`). The person who owns the box provisions, watches, approves, rolls back, and reads the audit trail here. The primary user never sees it. |
| **Surface** | A way people and agents interact with the box (Foreman web, code-server, the companion extension, the chat bubble). A surface's state-changing actions route through the core contract, so the audit boundary sits at the core, not the surface (ADR-009). |
| **Module** | An optional capability, and exactly three things: a compose service (profile-gated when optional), a config entry with an apply-class, and a reach to the core API. Adding a capability is adding a module, never changing the core. The **System** tab renders the module manifest live. |
| **Overhaul** | A large, structural change to the sandbox itself — a rebuild-class change routed through a reviewed plan: snapshot → build → healthcheck → cut over, with auto-rollback on failure (DDD-002). The expensive, risky work the agent layer takes on. |
| **Vault** | A gocryptfs-encrypted, per-project filesystem. Unlocked through Foreman or corporate login; the sidecar owns the live FUSE mount (PRD-006). |
| **Apply-class: hot / live / session / rebuild** | The four ways a change lands — an instant interface edit (hot), applied now to the running box (live), applied to new sessions (session), or a full image rebuild (rebuild). Shown as a coloured badge at the point of change so you know before you commit. |
| **Demo / mock world** | The deterministic, offline world the UI boots by default (ADR-001). Every owner, agent, action and document is seeded and fabricated; the clock is frozen so it renders the same on every load. See [mock-to-live.md](mock-to-live.md) for how it becomes real. |

## See also

- [DDD-001](reference/ddd/DDD-001-control-plane-domain.md) — the full domain model,
  bounded contexts, and invariants.
- [getting-started.md](getting-started.md) — the first-run tour.
- [mock-to-live.md](mock-to-live.md) — mock, dev-live, and host, rung by rung.
