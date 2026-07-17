// Drives the live PiEngine through its injected spawn seam — no real `pi` process.
// A controllable fake child lets us push RPC responses and assert the driver's
// routing, streaming, error handling, health and shutdown: the paths a real
// subprocess would exercise. The pure framing/parsing is covered in engine.test.ts.
import { describe, it, expect } from 'vitest';
import { PiEngine, type ChildLike, type SpawnFn } from './pi';

function fakeChild() {
  let onData: (c: string | Buffer) => void = () => {};
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  let killed = false;
  const writes: string[] = [];
  const child: ChildLike = {
    stdin: { write: (chunk: string) => { writes.push(chunk); return true; } },
    stdout: {
      on: (_ev: 'data', cb: (c: string | Buffer) => void) => { onData = cb; },
      setEncoding: () => {},
    },
    stderr: { on: () => {} },
    on: (ev: 'exit' | 'error' | 'close', cb: (...a: unknown[]) => void) => {
      (handlers[ev] ??= []).push(cb);
    },
    kill: () => { killed = true; },
    get killed() { return killed; },
  };
  return {
    child,
    writes,
    feed: (obj: unknown) => onData(JSON.stringify(obj) + '\n'),
    emit: (ev: string) => (handlers[ev] ?? []).forEach((cb) => cb()),
    isKilled: () => killed,
  };
}

const spawnOf = (f: ReturnType<typeof fakeChild>): SpawnFn => () => f.child;

describe('PiEngine live driver (injected spawn)', () => {
  it('writes a prompt line, streams events, and resolves the accumulated text', async () => {
    const f = fakeChild();
    const eng = new PiEngine({ spawn: spawnOf(f) });
    const p = eng.submitPrompt({ sessionId: 's1', prompt: 'hi' });
    await Promise.resolve();
    expect(f.writes[0]).toContain('"method":"prompt"');
    f.feed({ id: 1, type: 'event', event: { kind: 'agent_message', text: 'hello' } });
    f.feed({ id: 1, type: 'event', event: { kind: 'agent_message', text: 'world' } });
    f.feed({ id: 1, type: 'result', result: {} });
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.text).toBe('hello world');
    expect(r.events.some((e) => e.kind === 'agent_message')).toBe(true);
  });

  it('routes an error response into a failed result with an error event', async () => {
    const f = fakeChild();
    const eng = new PiEngine({ spawn: spawnOf(f) });
    const p = eng.submitPrompt({ sessionId: 's2', prompt: 'boom' });
    await Promise.resolve();
    f.feed({ id: 1, type: 'error', error: 'engine blew up' });
    const r = await p;
    expect(r.ok).toBe(false);
    expect(r.events.some((e) => e.kind === 'error')).toBe(true);
  });

  it('surfaces a process exit as a failure to the pending caller', async () => {
    const f = fakeChild();
    const eng = new PiEngine({ spawn: spawnOf(f) });
    const p = eng.submitPrompt({ sessionId: 's3', prompt: 'hang' });
    await Promise.resolve();
    f.emit('exit');
    const r = await p;
    expect(r.ok).toBe(false);
  });

  it('answers health from a result response and reports the model', async () => {
    const f = fakeChild();
    const eng = new PiEngine({ spawn: spawnOf(f), model: 'fallback-model' });
    const hp = eng.health();
    await Promise.resolve();
    f.feed({ id: 1, type: 'result', result: { model: 'reported-model' } });
    const h = await hp;
    expect(h.engine).toBe('pi');
    expect(h.ready).toBe(true);
    expect(h.model).toBe('reported-model');
  });

  it('spawns lazily and reuses one subprocess across calls, then kills it on close()', async () => {
    let spawns = 0;
    const f = fakeChild();
    const eng = new PiEngine({ spawn: () => { spawns += 1; return f.child; } });
    const h1 = eng.health(); await Promise.resolve(); f.feed({ id: 1, type: 'result', result: {} }); await h1;
    const h2 = eng.health(); await Promise.resolve(); f.feed({ id: 2, type: 'result', result: {} }); await h2;
    expect(spawns).toBe(1);
    eng.close();
    expect(f.isKilled()).toBe(true);
  });
});
