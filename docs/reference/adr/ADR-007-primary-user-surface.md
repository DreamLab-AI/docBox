# ADR-007 — The primary user's surface is a code-server extension

Status: Accepted · 2026-07-16 · Realises PRD-000, PRD-003

## Context

docBox serves two audiences with different jobs. The admin owns the box and drives it through
Foreman: provisioning, watching activity, approving overhauls, reading the audit trail. The
primary user does the work: they talk to the agent about problems bigger than their interface,
and they handle documents that need OCR. PRD-000 drew that second surface as a chat "bubble" in
the client's own dashboard (milestone M7), with a bespoke file manager and document panel built
to sit beside it.

The box already ships a full editor. code-server (VS Code for the web) runs in the `agent`
container, serves `/workspace`, and is exposed externally behind oauth2-proxy with Entra SSO
(PRD-005). It is where the primary user already sits when they touch files. Building a second file
manager and a second dock inside the Foreman React app would rebuild an explorer, a panel system,
a layout engine, and an external-serving path that VS Code already gives us and maintains. That
runs straight into the project's steer: maintainability beats capability, fewest tools, one per
job.

## Decision

The primary user's surface is a **code-server sidebar extension**, "docBox Companion", not new
screens in Foreman. It contributes a docBox container to the activity bar with two webview views:
**Chat** for talking to the agent, and **Documents** for listing, uploading, and tracking OCR.
VS Code's own file explorer is the file manager; the extension adds only what the explorer lacks.

Foreman stays the admin's control plane. The Companion is the primary user's surface. The two do
not merge.

The extension is a thin client. Chat posts prompts to the control-plane server, which relays the
pi engine's streaming events (PRD-003); Documents reads `GET /api/documents` and uploads via
`POST /api/documents`. No agent logic and no datastore live in the extension: it is a view onto
the one server we already own.

## Consequences

- The chat "bubble" from PRD-000 becomes a docked sidebar view. It sits where the user works,
  keeps the conversation in sight, and inherits the editor's theme, keybindings, and
  accessibility rather than reimplementing them.
- The file manager stops being something we build. VS Code's explorer is it: open, rename, diff,
  and search across `/workspace`, all maintained upstream.
- The only new code is one small extension: two webview providers, some HTML and CSS, and a fetch
  to the control plane. It compiles against `@types/vscode` and loads in code-server as any
  VS Code plugin does.
- Auth comes for free. code-server already sits behind oauth2-proxy, so the same Entra session
  that reaches the editor reaches the sidebar: there is no second front door to secure.
- The Chat and Documents views target the same control-plane routes the deep-chat option would,
  so the backend is written once and both surfaces share it.
- Cost: the primary user now sees an IDE, not a stripped dashboard. For a technical client team
  living in `/workspace` that is a fit, not a tax. A non-technical audience on someone else's
  portal is the case the alternative below still covers.
- The extension cannot run in this dev environment: it needs a code-server host, which is not
  launched here. It is compile-checked (`tsc --noEmit`) and loaded on a real box.

## Alternatives considered

- **Bespoke file manager and chat dock in Foreman React.** Rejected as duplication. It rebuilds an
  explorer, a panel layout, upload handling, and an external-serving path that code-server already
  provides. It also blurs the two audiences by folding the primary user's tools into the admin's
  control plane, the exact separation the product depends on.
- **A deep-chat script-tag bubble in an arbitrary dashboard.** Kept, but as a separate option, not
  the primary surface. deep-chat (MIT, corpus/11) is a backend-agnostic web component that injects
  the host page's token per call. It is the right answer when the host is not code-server: a client
  who wants the bubble inside their own portal. It talks to the same control-plane chat route this
  extension uses, so the two surfaces stay backend-compatible.
- **Everything inside Foreman, one surface to maintain.** Rejected. It optimises for a single
  codebase at the price of rebuilding capabilities VS Code hands us, and it collapses the
  admin/user boundary that the rest of the design leans on.

## Traceability

Realises the primary-user surface in PRD-000 and consumes the agent engine over the control-plane
API (PRD-003). Uses the documents routes in the server (PRD-002) and the SSE transport (ADR-005)
for the chat stream. Reuses code-server and its oauth2-proxy exposure (PRD-005). The deep-chat
bubble (corpus/11) remains the option for hosts that are not code-server. Scaffold in `extension/`.
