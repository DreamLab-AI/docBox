# PRD-003 — Agent Engine (pi, embedded)

Status: Draft · Owner: DreamLab · Created 2026-07-16 · Realises PRD-000 (M3) · Supersedes: none

## Summary

The sandbox embeds pi (MIT, earendil-works) as its agent engine, driven by the control plane over
pi's own RPC protocol, with audit and identity injected through pi's tool-call hooks. Nothing
proprietary ships. Model access is always a metered API key the admin provisions; a user's personal
Claude subscription is never bridged into the harness.

If you remember one thing: **we drive pi over a versioned protocol and enrich it through hooks we
own**, rather than wrapping and scraping a CLI we do not control.

## Problem

Foreman needs an engine to run the agent layer, and the earlier plan (embed the proprietary Claude
Code CLI) fails the permissive-redistribution bar. corpus/12 surveyed permissive harnesses and
picked pi: MIT, TypeScript-native, built to be embedded. The product needs a clean way to drive the
engine from a TypeScript control plane, hook points to attach audit and unforgeable identity, and a
model-access story that survives procurement.

## Goals

1. Embed pi as the engine, driven from the control plane, with no proprietary component in the
   shipped image.
2. Drive it over pi's RPC mode (headless newline-JSON over stdio) as the default, with SDK mode
   (`createAgentSession()` in-process) available where a subprocess boundary is not wanted.
3. Attach audit and identity through pi's extension hooks, which can block a tool call and rewrite
   a tool result, so these become an engine extension rather than a wrapper.
4. Provision models only as metered API keys through the config plane (Anthropic, OpenAI, Google,
   or any OpenAI-compatible local endpoint).
5. Own the two extensions the product needs that pi leaves out: the MCP adapter and the subagent
   runner, forked from pi's reference examples.

## Non-goals

- Building an agent framework. pi's deliberate minimalism (no built-in MCP, subagents, or
  permission popups) is the point; we add only what the product needs through hooks.
- The audit sidecar and identity chain themselves (PRD-006). This PRD owns the injection points;
  that PRD owns where the events land.
- Sandboxing inside the engine. The hardened container is the boundary (PRD-004); pi not fighting
  us with its own permission model fits the design.

## Engine integration

| Concern | Mechanism |
|---|---|
| Drive | pi RPC mode: prompt / steer / follow-up / abort / model-switch / compaction / session fork-clone-tree, with a streaming event model |
| In-process option | pi SDK mode: `createAgentSession()` imported into the Bun supervisor, no subprocess |
| Extend | TS module hooks (jiti, no build step): intercept tool calls and results, provider requests, forks, compaction |
| Supervise | Bun spawns and supervises engine processes (corpus/11): fast cold start, `Bun.spawn` |

## Audit and identity through hooks

pi's `tool_call` / `tool_result` hooks are the injection points corpus/09 needs:

- On every tool call the hook stamps the unforgeable identity tuple (owner → session → agent →
  action) from process env the orchestrator set at spawn, never from prompt content (DDD-001
  invariant 2, PRD-006).
- The hook can deny a call (policy gate) and can redact a result before it is recorded, giving the
  two-stage redaction the audit design requires.
- Because the hook writes to the audit spool rather than the agent seeing the trail, the log cannot
  become a prompt-injection feedback surface.

## Model access

Metered API keys only, provisioned by the admin through the config plane, one live-class toggle per
provider (PRD-001 apply-class). Never a subscription OAuth token: corpus/12 records that the 2026
enforcement targeted subscription OAuth in third-party harnesses and never restricted metered keys.
Product rule, stated plainly: the admin provisions keys; a user's personal Claude Pro/Max login is
never wired into the engine.

## Success criteria

- The control plane starts, steers, and aborts a pi session over RPC, and receives its streaming
  events.
- Every tool call carries the full identity tuple, set by the spawner, unforgeable from inside the
  agent.
- A policy denial from the hook stops a tool call and records a POLICY_DENY event.
- Switching a provider is a config change; no image rebuild is needed to change the model route
  (session-class).
- No proprietary code and no subscription token is present in the shipped image or its runtime.

## Open questions (for the client brief)

- Which providers survive the client's procurement, and is a local model required?
- Do we need the MCP adapter in v1, or defer until a client tool demands it?
- Subagent parallelism cap: pi's reference uses ≤8; is that the right default here?

## Traceability

Realises PRD-000 (M3). Engine choice and licence ground truth: corpus/12 permissive-harnesses.
Hook-based audit and identity: PRD-006, corpus/09. Supervision runtime: corpus/11. Harness boundary
ADR to follow (ADR-007 stub). Domain vocabulary: DDD-001.
