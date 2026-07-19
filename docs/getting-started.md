# Getting started — the first-run tour

You just opened Foreman for the first time. You are in **demo mode**: a fabricated
world that boots offline and renders the same on every load. Nothing you see is
real, and nothing you do here touches a real system. This page is the 60-second
tour — read it, click through the eight tabs, then come back when you want the
data to be real.

## What opens first

The first run shows a one-time welcome dialog titled:

> You are looking at a fabricated demo world

It names the invented owners, states the frozen clock, sketches the tab loop, and
gives you two ways out: **Read the getting-started guide** (this page) and
**Explore the demo** (dismiss and start clicking). The dialog remembers you have
seen it, so it appears once.

## Everything below the top bar is invented

A full-width strip sits under the tab bar. In demo mode it reads:

> Demo world — every owner, agent, action and document below is fabricated (ADR-001). Nothing here is real until you go live.

The four owners — **Dana Okoro**, **Ravi Menon**, **Lena Fischer** and
**Sam Whitfield** — their agents, actions and documents are all invented, and the
clock is frozen at **16 July 2026** so the world renders the same on every load.
Every panel heading carries a small **DEMO DATA** chip, and the header badge reads
**mock** (a violet tint, not the amber of a fault) with the title *Deterministic
mock world (offline)*. Between the strip, the chip and the badge, you can always
tell at a glance that the data is seeded.

## The loop across the eight tabs

Foreman is eight tabs. The demo is built as a loop: start on **Overview**, act in
a named tab, undo what you did in **Operations**, then see the shape of it all in
**System**.

| Tab | What it answers |
|---|---|
| **Overview** | Is the box healthy and busy? (start here) |
| **Visualiser** | Who did what, to what, when? |
| **Activity** | What is happening right now? |
| **Work** | What is the agent doing over the long run? (act here) |
| **Documents** | What has been uploaded, and did it stay private? (act here) |
| **Configuration** | What can I change, and how does it land? (act here) |
| **Operations** | Can I undo this, and prove what changed? (undo here) |
| **System** | What is the box made of, and what is on? (see the shape) |

Any action you take in the demo that would change a real system — a sign-off, an
apply, a rollback, a vault unlock — is tagged **Simulated** and confirms with:

> Simulated — this ran against the fabricated demo world. Nothing on a real system changed.

Seeded secrets (a masked API key, an Entra tenant id) carry an **example** tag for
the same reason: they are not the box's real provisioned values.

## Mock, or live? How to tell

Two signals never lie:

- **The demo strip.** Present whenever the data is not a real datastore. It says
  *demo world* in mock mode, warns you in amber if you asked for live and the
  control plane did not answer, and — once you go live — stays honest that the dev
  server is still serving seeded data.
- **The header badge.** Reads **mock** (violet) offline. It only reads **live**
  when the UI has genuinely hydrated from the control-plane server.

If the strip and the badge disappear entirely, you are on real data. Until then,
you are looking at the seeded world.

## Going live

Demo mode is the first of three rungs. The next rung (dev-live) keeps the same
seeded world but transports it over the real server; only the host rung makes the
data real. The full ladder, with the exact commands and addresses per rung, is in
[mock-to-live.md](mock-to-live.md).

To meet real data locally without containers, run `DOCBOX_DATA=real pnpm dev:server`.
The server then serves the real (empty) JSON-file store instead of the seeded mock,
`/api/world` reports `dataSource: "real"`, and the Overview tab greets you with the
first-project card: name a project, provision it, and the demo world is gone for
good as the real record begins.

## See also

- [glossary.md](glossary.md) — every domain word on one screen (owner, agent,
  action, apply-class, snapshot, bead, gate, audit record, and more).
- [mock-to-live.md](mock-to-live.md) — the three rungs from demo to real data.
- [troubleshooting.md](troubleshooting.md) — first-run snags, starting with
  "the data looks fabricated".
- [ADR-001](reference/adr/ADR-001-stack-and-mock-first.md) — why the UI is
  mock-first and where the mock/live seam sits.
