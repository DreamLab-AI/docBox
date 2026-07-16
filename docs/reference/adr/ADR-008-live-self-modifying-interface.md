# ADR-008 — Live self-modifying interface

Status: Accepted · 2026-07-16 · Realises PRD-001, extends ADR-002

## Context

docBox's agent layer edits the sandbox, and the sandbox includes its own user-facing interface.
An operator or primary user asks in chat for a change ("put the visualiser on the left, make the
document panel bigger, add a panel that shows today's uploads"), and the agent should be able to
make that change and have the user see it in seconds, not after an image rebuild. This is the
interface equivalent of the CTO-scale overhaul: the surface rewrites itself under human guidance.

Three problems have to be solved together for that to be safe and usable:

1. **Speed.** Waiting for a rebuild on every layout tweak is too slow. The user needs edits to
   land live.
2. **Data survival.** If a hot edit reloads the interface, anything the user had entered or was
   looking at must not vanish.
3. **Containment.** An agent editing a live interface will sometimes write a broken panel. One
   broken panel must not blank the whole surface.

## Decision

Run the interface as a **Vite dev server with hot module replacement (HMR) facing the user**, and
build the interface so that agent edits are fast, non-destructive, and contained:

- **State lives outside the component tree.** Domain data comes from the control-plane server
  (`/api/world`), and per-user interface state (active tab, filters, layout) is persisted to
  `localStorage` and re-read on load. An HMR update or a full reload re-hydrates from these, so
  nothing the user entered is lost. This is why the adapter seam (ADR-001) mattered: components
  hold no authoritative state.
- **Panels are functionally isolated.** Each panel renders inside its own error boundary and reads
  its own data. An agent can rewrite or restart one panel without touching the others, and a panel
  that throws shows a contained fallback (with a "reload this panel" affordance) instead of taking
  down the interface.
- **Layout is data, not code.** A layout manifest (which panels, in what arrangement, at what
  size) is read by the shell. The human directs layout in chat; the agent edits the manifest; the
  shell re-lays-out live. Layout changes never touch component source, so they cannot break a
  panel.
- **A new apply-class: `hot`.** ADR-002 defined live / session / rebuild. Interface edits that
  land through HMR or a manifest change are **hot**: sub-second, no rebuild, no session boundary.
  The four classes now read: hot (interface, instant) · live (running box) · session (new
  sessions) · rebuild (image). Only rebuild can break the box; only a bad panel edit can break a
  panel, and the error boundary contains that.
- **The agent sees what the user sees.** After an edit, the agent captures a screenshot of the
  rendered interface (through the browser sidecar already in the stack) and checks its work
  against the user's request. Human guidance in chat → agent edit → HMR → screenshot → confirm or
  correct. The loop closes without the human describing pixels.

## Consequences

- A dev user inside the container runs the Vite HMR server; that is the surface the primary user
  reaches (through the tunnel and oauth2-proxy). This is a deliberate choice to ship a dev server
  as the runtime for the self-editing surface, accepted because the container is the boundary and
  the interface is meant to change under the user.
- Structural changes (a new dependency, a new build-time capability) are still **rebuild**-class
  and go through the snapshot/rollback flow (DDD-002). Hot edits are for layout and panel content,
  not for changing what the image contains.
- UI-state persistence is per-browser by default; a `/api/ui-state` endpoint can move it
  server-side later so a layout follows a user across devices.
- Error boundaries change how panels are written: a panel may assume it can fail alone. This is a
  small discipline with a large safety payoff for a self-editing surface.

## Alternatives considered

- **Production build on every edit.** Correct and safe, but too slow for chat-driven layout work,
  and it discards the whole point of a surface that changes live.
- **iframes per panel for isolation.** Stronger isolation than error boundaries, but heavier, with
  awkward shared-state and styling boundaries. Error boundaries plus the externalised store give
  most of the containment at a fraction of the cost; revisit iframes only if a panel needs to run
  genuinely untrusted code.
- **Keeping all state in components.** Simplest to write, but any reload loses the user's work,
  which makes live self-editing hostile to use. Rejected.

## Traceability

Extends ADR-002 (apply-class, now four classes). Realises PRD-001. The overhaul-versus-hot
distinction connects to DDD-002 (rebuild-class changes keep their snapshot/rollback safety; hot
changes do not need it). Panel isolation and layout-as-data are modelled in DDD-003.
