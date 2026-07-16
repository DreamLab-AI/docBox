# ADR-005 — Live event transport: SSE, not WebSocket

Status: Accepted · 2026-07-16 · Realises PRD-002 (F2, F3)

## Context

The visualiser and the activity feed update as things happen: new actions, agent spawns, and system
events like a rebuild's progress. The flow is one-directional, server to client. The client sends
commands (stage a plan, start a rebuild) over ordinary HTTP requests, not over the live channel. The
transport also has to work through the cloudflared tunnel and Cloudflare Access (PRD-005) without
special handling.

## Decision

Live events flow over Server-Sent Events (SSE), served by Hono's `hono/sse`, not over WebSocket. One
long-lived `GET /api/events` stream carries action, agent, and system events to the client; commands
stay on the typed HTTP API (PRD-002). The adapter's server implementation opens the stream at boot
after hydration and reconnects on drop.

## Consequences

- The transport matches the traffic: events are server→client only, which is exactly what SSE is, so
  there is no unused bidirectional machinery to reason about.
- SSE is plain HTTP, so it passes through the tunnel and the edge proxy with no protocol upgrade, no
  separate port, and the same auth as every other request (PRD-005).
- Reconnection and event ids are built into the SSE contract; the browser's `EventSource` retries
  automatically, and `Last-Event-ID` gives a backfill hook.
- Hono serves SSE identically on Node and Bun (corpus/11), so the runtime decision stays reversible.
- Cost: SSE is text and one-directional. If a future surface needs low-latency client→server
  streaming (live terminal input, say), it gets its own WebSocket for that surface; the visualiser
  feed does not pay for a capability it never uses.

## Alternatives considered

- **WebSocket.** Bidirectional and lower per-message overhead, but the feed has nothing to send
  upstream, and it adds a protocol upgrade that tunnels and proxies sometimes mishandle. Reserved for
  a surface that genuinely needs duplex.
- **Polling.** Simple, but it trades either latency or load for that simplicity, and the visualiser
  wants change to read as motion (ADR-003). SSE gives push without the WebSocket surface.

## Traceability

Realises PRD-002. Consumed by the visualiser (ADR-003) and activity feed (PRD-001 F2/F3). Works
through PRD-005 exposure. Served by the stack in corpus/11 typescript-stack.
