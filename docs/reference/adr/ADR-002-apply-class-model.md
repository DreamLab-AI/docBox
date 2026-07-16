# ADR-002 — The apply-class model

Status: Accepted · 2026-07-16 · Realises PRD-001

## Context

The sandbox is self-modifying: some settings change the running system instantly, some only
affect new sessions, and some rewrite the system definition and force an image rebuild. An
operator who cannot tell these apart will either fear every toggle or, worse, trigger a rebuild by
accident. This distinction is the product's signature idea and it must live in the model, not
just the copy.

## Decision

Every configuration option carries an **apply-class**: `live`, `session`, or `rebuild`. The class
is a property of the option, fixed and known in advance. The UI renders the class as a coloured
badge next to every control (teal/live, amber/session, rose/rebuild), and only rebuild changes
route through a reviewed plan with snapshot and auto-rollback.

## Consequences

- The operator learns each control's class once; the badge is always visible.
- Rebuild changes are staged, not applied on click. They collect into a plan showing TOML diffs
  and the build → healthcheck → cutover → rollback sequence before anything runs.
- Live and session changes apply without ceremony, keeping day-to-day work fast.
- The colour semantic (teal/amber/rose) is reused across the app: the same rose that marks a
  rebuild marks a rollback and a failure, so "this is the heavy, risky class" reads consistently.

## Consequence for the domain

`ApplyClass` is a frozen enum in `domain/types.ts`. Adding an option means choosing its class,
which forces the author to decide up front whether a setting is safe to change live. That decision
is the useful discipline the model imposes.
