// Deterministic in-process engine. No subprocess, no network, no randomness:
// the same request always yields the same trajectory, and different requests
// differ, because the sequence is seeded from the prompt. This is the engine
// twin of the app's mock world — the control plane can start, steer and read a
// plausible agent run with no `pi` present, and tests get stable output.
import type {
  EngineClient, EngineEvent, PromptRequest,
} from './client';

// Fixed clock so timestamps are stable across runs (a wall clock would drift the
// trajectory each call and break determinism).
const MOCK_NOW = Date.UTC(2026, 6, 16, 14, 30, 0);
const MOCK_MODEL = 'mock-sonnet';
const TOOLS = ['read_file', 'grep', 'edit_file', 'run_command', 'write_file'];

// FNV-1a: a small stable string hash, used only to seed the PRNG from input.
function hashSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// mulberry32: the same tiny seeded PRNG the app's mock world uses, so both
// planes render replayably from a seed.
function mulberry32(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Build the full, ordered trajectory for a request. Pure and deterministic. */
export function mockTrajectory(req: PromptRequest): EngineEvent[] {
  const seed = hashSeed(`${req.prompt}|${req.model ?? MOCK_MODEL}`);
  const rnd = mulberry32(seed);
  const steps = 1 + (seed % 4); // 1..4 tool iterations, fixed by the input
  const events: EngineEvent[] = [];
  let seq = 0;

  const stamp = (
    partial: Omit<EngineEvent, 'seq' | 'ts' | 'sessionId' | 'identity'>,
  ): EngineEvent => {
    const e: EngineEvent = { ...partial, seq, ts: MOCK_NOW + seq * 250, sessionId: req.sessionId };
    // Identity comes from the orchestrator-provided tuple, never from prompt
    // text (PRD-003 / PRD-006 invariant). actionId is refined per event.
    if (req.identity) e.identity = { ...req.identity, actionId: `${req.identity.actionId}.${seq}` };
    seq += 1;
    return e;
  };

  events.push(stamp({ kind: 'session_start', status: 'ok', text: `run: ${req.prompt.slice(0, 60)}` }));
  for (let i = 0; i < steps; i++) {
    const tool = TOOLS[Math.floor(rnd() * TOOLS.length)];
    events.push(stamp({ kind: 'agent_message', text: `step ${i + 1}: use ${tool}` }));
    events.push(stamp({ kind: 'tool_call', tool, args: { step: i + 1 }, status: 'ok' }));
    events.push(stamp({ kind: 'tool_result', tool, status: 'ok', text: `${tool} ok` }));
  }
  events.push(stamp({ kind: 'agent_message', text: `done after ${steps} step(s)` }));
  events.push(stamp({ kind: 'session_end', status: 'ok' }));
  return events;
}

/** The mock EngineClient. streamEvents and submitPrompt read the same
 *  deterministic trajectory, so the streaming and aggregate forms never drift. */
export function createMockEngine(): EngineClient {
  return {
    kind: 'mock',
    async health() {
      return { engine: 'mock', ready: true, model: MOCK_MODEL, protocol: 'in-process-deterministic' };
    },
    async *streamEvents(req) {
      for (const e of mockTrajectory(req)) yield e;
    },
    async submitPrompt(req) {
      const events = mockTrajectory(req);
      const text = events
        .filter((e) => e.kind === 'agent_message' && e.text)
        .map((e) => e.text)
        .join(' ');
      return { sessionId: req.sessionId, ok: true, text, events };
    },
  };
}
