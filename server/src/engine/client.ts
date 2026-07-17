// The agent-engine seam (PRD-003). Feature code and the control-plane routes
// import ONLY from here. One typed `EngineClient` interface with two impls
// behind it: a deterministic in-process mock (default, offline) and the live
// `pi` driver spoken over its RPC protocol. Swapping mock for the real engine
// is `getEngine()` plus pi.ts — the routes never change. This mirrors the app's
// data adapter (mock/live) so the two seams read the same way.

/** Which impl is answering. The health payload and UI badge read this. */
export type EngineKind = 'mock' | 'pi';

/** The unforgeable identity tuple the orchestrator sets at spawn (PRD-006):
 *  entra owner → session → agent → action. It is stamped onto engine events
 *  from the spawner's environment, NEVER parsed from prompt content. */
export interface IdentityTuple {
  ownerId: string; // entra:{tid}:{oid}
  sessionId: string;
  agentId: string;
  actionId: string;
}

/** The streaming event model pi exposes over RPC, distilled to what the control
 *  plane records. tool_call / tool_result are the hook injection points where
 *  audit and identity attach (PRD-003). */
export type EngineEventKind =
  | 'session_start'
  | 'agent_message'
  | 'tool_call'
  | 'tool_result'
  | 'session_end'
  | 'error';

export interface EngineEvent {
  kind: EngineEventKind;
  sessionId: string;
  seq: number; // monotonic within a prompt, so a client can order/replay
  ts: number; // epoch ms
  text?: string; // assistant text (agent_message) or a short note
  tool?: string; // tool name (tool_call / tool_result)
  args?: unknown; // tool arguments
  status?: 'ok' | 'blocked' | 'failed';
  identity?: IdentityTuple; // stamped by the spawner, unforgeable from the prompt
}

export interface PromptRequest {
  sessionId: string;
  prompt: string;
  model?: string; // provider/model route; a session-class config change
  identity?: IdentityTuple;
}

export interface PromptResult {
  sessionId: string;
  ok: boolean; // false if the trajectory produced an error event
  text: string; // concatenated agent_message text
  events: EngineEvent[]; // the full trajectory, in order
}

export interface EngineHealth {
  engine: EngineKind;
  ready: boolean;
  model: string;
  protocol: string; // 'in-process-deterministic' (mock) | 'rpc-jsonl' (pi)
}

/** The one interface both impls satisfy. submitPrompt is the aggregate form of
 *  streamEvents, kept consistent so a caller can pick either without surprise. */
export interface EngineClient {
  readonly kind: EngineKind;
  health(): Promise<EngineHealth>;
  submitPrompt(req: PromptRequest): Promise<PromptResult>;
  streamEvents(req: PromptRequest): AsyncIterable<EngineEvent>;
}

import { createMockEngine } from './mock';
import { createPiEngine } from './pi';

/** Return the engine impl for this deployment. Mock by default so the control
 *  plane works offline; the live `pi` driver only when DOCBOX_ENGINE=live. The
 *  live impl is constructed lazily (no subprocess until first use), so choosing
 *  it here never spawns a process. */
export function getEngine(env: NodeJS.ProcessEnv = process.env): EngineClient {
  if (env.DOCBOX_ENGINE === 'live') return createPiEngine();
  return createMockEngine();
}
