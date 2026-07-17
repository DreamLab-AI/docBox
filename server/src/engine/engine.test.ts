// Engine seam suite. Covers the deterministic mock end-to-end, the factory
// branch, and the pi RPC framing/parsing — both as pure functions and driven
// end-to-end against an in-memory stand-in process (no live `pi`).
import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { getEngine, type IdentityTuple, type PromptRequest } from './client';
import { createMockEngine, mockTrajectory } from './mock';
import {
  encodeRpcLine, createNdjsonParser, rpcResponseToEvent, promptToRpc, createPiEngine,
  type ChildLike, type EngineRpcResponse,
} from './pi';

const ID: IdentityTuple = {
  ownerId: 'entra:9f2a:6b1c', sessionId: 's1', agentId: 'ag-1', actionId: 'act-1',
};

describe('getEngine factory', () => {
  it('returns the mock engine by default', () => {
    expect(getEngine({} as NodeJS.ProcessEnv).kind).toBe('mock');
  });
  it('returns the pi engine when DOCBOX_ENGINE=live (without spawning)', () => {
    // Construction is lazy: choosing pi here must not start a subprocess.
    expect(getEngine({ DOCBOX_ENGINE: 'live' } as NodeJS.ProcessEnv).kind).toBe('pi');
  });
});

describe('mock engine', () => {
  it('runs a deterministic trajectory bracketed by session_start/session_end', async () => {
    const engine = createMockEngine();
    const res = await engine.submitPrompt({ sessionId: 's1', prompt: 'add an export endpoint' });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe('s1');
    expect(res.events[0].kind).toBe('session_start');
    expect(res.events[res.events.length - 1].kind).toBe('session_end');
    expect(res.events.some((e) => e.kind === 'tool_call')).toBe(true);
    expect(res.text.length).toBeGreaterThan(0);
    // seq is monotonic from 0.
    res.events.forEach((e, i) => expect(e.seq).toBe(i));
  });

  it('is deterministic for one input and varies across inputs', async () => {
    const engine = createMockEngine();
    const a1 = await engine.submitPrompt({ sessionId: 's', prompt: 'same prompt' });
    const a2 = await engine.submitPrompt({ sessionId: 's', prompt: 'same prompt' });
    const b = await engine.submitPrompt({ sessionId: 's', prompt: 'a different prompt entirely' });
    expect(a1.events).toEqual(a2.events); // same input → identical trajectory
    expect(a1.events).not.toEqual(b.events); // different input → different trajectory
  });

  it('streamEvents yields the same trajectory submitPrompt aggregates', async () => {
    const engine = createMockEngine();
    const req: PromptRequest = { sessionId: 's1', prompt: 'stream me' };
    const streamed = [];
    for await (const e of engine.streamEvents(req)) streamed.push(e);
    const { events } = await engine.submitPrompt(req);
    expect(streamed).toEqual(events);
  });

  it('stamps identity from the tuple, never from prompt text', async () => {
    const engine = createMockEngine();
    const res = await engine.submitPrompt({ sessionId: 's1', prompt: 'ownerId=hacker', identity: ID });
    // The forged "ownerId=" in the prompt is ignored; identity comes from the tuple.
    for (const e of res.events) {
      expect(e.identity?.ownerId).toBe('entra:9f2a:6b1c');
      expect(e.identity?.actionId).toMatch(/^act-1\.\d+$/);
    }
  });

  it('reports health', async () => {
    const h = await createMockEngine().health();
    expect(h).toEqual({ engine: 'mock', ready: true, model: 'mock-sonnet', protocol: 'in-process-deterministic' });
  });

  it('mockTrajectory step count is fixed by the input', () => {
    const t1 = mockTrajectory({ sessionId: 's', prompt: 'x' });
    const t2 = mockTrajectory({ sessionId: 's', prompt: 'x' });
    expect(t1.map((e) => e.kind)).toEqual(t2.map((e) => e.kind));
  });
});

describe('pi framing / parsing (pure)', () => {
  it('encodeRpcLine emits exactly one newline-terminated JSON line', () => {
    const line = encodeRpcLine({ id: 7, method: 'prompt', params: { prompt: 'hi' } });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.indexOf('\n')).toBe(line.length - 1); // no embedded newline
    expect(JSON.parse(line)).toEqual({ id: 7, method: 'prompt', params: { prompt: 'hi' } });
  });

  it('promptToRpc forwards identity so pi hooks can stamp it', () => {
    const rpc = promptToRpc({ sessionId: 's1', prompt: 'go', model: 'claude', identity: ID }, 3);
    expect(rpc.method).toBe('prompt');
    expect(rpc.id).toBe(3);
    expect(rpc.params).toMatchObject({ sessionId: 's1', prompt: 'go', model: 'claude', identity: ID });
  });

  it('parses a stream of newline-JSON, including a line split across chunks', () => {
    const p = createNdjsonParser();
    // First chunk ends mid-object: nothing complete yet.
    expect(p.push('{"id":1,"type":"result"')).toEqual([]);
    // The rest of line 1 arrives with two more complete lines.
    const got = p.push('}\n{"id":2,"type":"ack"}\n{"id":3,"type":"event","event":{"kind":"agent_message"}}\n');
    expect(got.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(got[0].type).toBe('result');
    expect(got[2].event?.kind).toBe('agent_message');
  });

  it('drops malformed lines and flushes a trailing partial line', () => {
    const p = createNdjsonParser();
    expect(p.push('not json\n{"id":9,"type":"ack"}\n')).toHaveLength(1); // malformed line dropped
    p.push('{"id":10,"type":"result"}'); // complete object but no trailing newline
    const flushed = p.flush();
    expect(flushed).toHaveLength(1);
    expect(flushed[0].id).toBe(10);
    expect(p.flush()).toEqual([]); // buffer now empty
  });

  it('rpcResponseToEvent maps events, stamps identity, and ignores non-events', () => {
    const evtResp: EngineRpcResponse = {
      id: 1, type: 'event', event: { kind: 'tool_call', tool: 'read_file', ts: 5, seq: 2, status: 'ok' },
    };
    const ev = rpcResponseToEvent(evtResp, { sessionId: 's1', seq: 0, identity: ID });
    expect(ev).toMatchObject({ kind: 'tool_call', tool: 'read_file', sessionId: 's1', seq: 2, ts: 5 });
    expect(ev?.identity?.actionId).toBe('act-1.2');
    // An unknown kind degrades to agent_message rather than inventing a kind.
    const odd = rpcResponseToEvent({ id: 1, type: 'event', event: { kind: 'weird' } }, { sessionId: 's', seq: 4 });
    expect(odd?.kind).toBe('agent_message');
    expect(odd?.seq).toBe(4); // falls back to context seq when the event omits one
    // Results are not events.
    expect(rpcResponseToEvent({ id: 1, type: 'result', result: {} }, { sessionId: 's', seq: 0 })).toBeNull();
  });
});

// An in-memory stand-in for the `pi` subprocess: it reads request lines off its
// stdin and answers with newline-JSON on its stdout, splitting one response
// across two writes to exercise the driver's own buffering.
function fakePi(): { child: ChildLike; stdin: PassThrough; stdout: PassThrough } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  let inbuf = '';
  stdin.on('data', (chunk: Buffer) => {
    inbuf += chunk.toString('utf8');
    let nl: number;
    while ((nl = inbuf.indexOf('\n')) >= 0) {
      const line = inbuf.slice(0, nl);
      inbuf = inbuf.slice(nl + 1);
      if (!line.trim()) continue;
      const req = JSON.parse(line) as { id: number; method: string };
      if (req.method === 'health') {
        stdout.write(JSON.stringify({ id: req.id, type: 'result', result: { model: 'fake-pi-1' } }) + '\n');
        continue;
      }
      if (req.method === 'prompt') {
        const id = req.id;
        const frames =
          JSON.stringify({ id, type: 'event', event: { kind: 'session_start', ts: 1, seq: 0, status: 'ok' } }) + '\n' +
          JSON.stringify({ id, type: 'event', event: { kind: 'tool_call', tool: 'read_file', ts: 2, seq: 1, status: 'ok' } }) + '\n' +
          JSON.stringify({ id, type: 'event', event: { kind: 'agent_message', text: 'hello', ts: 3, seq: 2 } }) + '\n' +
          JSON.stringify({ id, type: 'event', event: { kind: 'session_end', ts: 4, seq: 3, status: 'ok' } }) + '\n' +
          JSON.stringify({ id, type: 'result', result: { ok: true } }) + '\n';
        // Split mid-frame so the client parser must buffer across two 'data' events.
        const cut = Math.floor(frames.length / 2);
        stdout.write(frames.slice(0, cut));
        stdout.write(frames.slice(cut));
      }
    }
  });

  const child: ChildLike = {
    stdin,
    stdout,
    stderr,
    on: () => {},
    kill: () => {},
    killed: false,
  };
  return { child, stdin, stdout };
}

describe('pi engine driven over an injected process', () => {
  it('submits a prompt and streams mapped events in order', async () => {
    const { child } = fakePi();
    const engine = createPiEngine({ spawn: () => child });
    const res = await engine.submitPrompt({ sessionId: 's1', prompt: 'do the thing', identity: ID });
    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe('s1');
    expect(res.events.map((e) => e.kind)).toEqual(['session_start', 'tool_call', 'agent_message', 'session_end']);
    expect(res.text).toBe('hello');
    // Identity stamped from the tuple, refined per event.
    expect(res.events[0].identity?.ownerId).toBe('entra:9f2a:6b1c');
    expect(res.events[1].identity?.actionId).toMatch(/^act-1\./);
  });

  it('resolves health from the injected process result', async () => {
    const { child } = fakePi();
    const engine = createPiEngine({ spawn: () => child });
    const h = await engine.health();
    expect(h).toEqual({ engine: 'pi', ready: true, model: 'fake-pi-1', protocol: 'rpc-jsonl' });
  });
});
