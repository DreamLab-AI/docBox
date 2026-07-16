# DDD-003 — Interface Domain

Status: Draft · Created 2026-07-16 · Realises ADR-008, extends DDD-001

The interface is not just a view onto the domain: it is itself a thing the agent edits. That makes
it a small domain of its own, with its own language and invariants. This models it.

## Ubiquitous language

| Term | Meaning |
|---|---|
| **Panel** | One functionally isolated unit of the interface (a tab, a dockable view). Renders inside an error boundary, reads its own data, can be restarted alone. |
| **Layout manifest** | The data that says which panels are shown, in what order and size. Read by the shell; edited by the agent under human guidance. Layout is data, not code. |
| **UI state** | Per-user interface state (active panel, filters, layout) held outside the component tree so it survives a hot reload. |
| **Hot edit** | An interface change applied through hot module replacement or a manifest change: sub-second, no rebuild, no session boundary. The fourth apply-class. |
| **Panel fault** | An error thrown while rendering a panel. Contained by the panel's boundary; never blanks the interface. |
| **Screenshot check** | The agent capturing the rendered interface to confirm an edit matches the human's request. |

## Model

```mermaid
flowchart TB
  human([Human]) -->|chat: "make the visualiser bigger"| agent[Agent]
  agent -->|edits| manifest[Layout manifest]
  agent -->|edits| source[Panel source]
  manifest --> shell[Shell reads manifest]
  source -->|HMR| shell
  shell --> panels{{Isolated panels}}
  panels -->|reads| store[(Externalised store\nworld + UI state)]
  shell --> screen[Rendered interface]
  screen -->|screenshot| agent
  panels -. fault contained .-> boundary[Error boundary\nreload one panel]
```

## Invariants

1. **A panel fault is contained to its panel.** The interface never blanks because one panel
   threw. Enforced by an error boundary per panel, not by convention.
2. **UI state survives a reload.** Active panel and filters are read from outside the component
   tree on load, so a hot reload or an agent edit does not lose the user's place or work.
3. **Layout changes cannot break a panel.** Layout is data; editing it rearranges panels but never
   touches panel source, so a layout edit is always safe and always hot-class.
4. **Structural change is still rebuild-class.** Adding a dependency or a build-time capability is
   not a hot edit; it goes through the snapshot and rollback flow (DDD-002). Hot edits are for
   layout and panel content only.
5. **The agent confirms against what the user sees.** An edit is not done until the screenshot
   check matches the request, closing the loop without the human describing pixels.

## Relationship to the config domain

The Interface configuration group (System-Definition context, DDD-001) carries the hot-class
controls: density, visible panels, whether the agent may edit the layout, and where UI state
lives. `interface.panels` is the layout manifest surfaced as a config option. `interface.agent_edits`
is the switch that lets a chat request reach the layout at all: off freezes the interface for a
locked-down deployment.

## What this is not

This domain does not own the agent's reasoning or the document surface; it owns only the shape and
safety of the interface the agent edits. The chat that drives it is the primary-user surface
(ADR-007); the reasoning behind an edit is the agent engine (PRD-003).
