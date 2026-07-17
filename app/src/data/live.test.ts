// Tests for live.ts. IS_LIVE is captured at module-eval time from
// import.meta.env.VITE_DATA_MODE, so every case resets the module registry and
// re-imports live.ts (and the adapter it hydrates) under a stubbed env. fetch is
// stubbed per-test; EventSource is absent in jsdom, so a small mock class stands
// in and captures the 'action' listener, onerror handler, and close() call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { World } from './adapter';

/** Reset modules, stub the data-mode env, and import a fresh live + adapter pair. */
async function loadLive(mode: 'live' | 'mock') {
  vi.resetModules();
  vi.stubEnv('VITE_DATA_MODE', mode);
  const live = await import('./live');
  const adapter = await import('./adapter');
  return { live, adapter };
}

/** Minimal but complete World for a successful bootstrap. */
const liveWorld: World = {
  now: 42,
  owners: [{ id: 'live-owner', name: 'Live', upn: 'l@live.co', role: 'admin', colour: 'var(--l)' }],
  sessions: [],
  agents: [],
  elements: [],
  actions: [],
  config: [],
  snapshots: [],
  beads: [],
  audit: [],
  vaults: [],
  documents: [],
  modules: [],
  system: {
    activeStack: 'green',
    imageTag: 'live:abc',
    uptimeHours: 1,
    pendingRebuildChanges: 0,
    auditChainVerifiedAt: 0,
    localModel: 'qwen',
    providersOnline: ['anthropic'],
  },
};

class MockEventSource {
  // Mirror the readyState constants of the real EventSource so live.ts can
  // reference EventSource.CLOSED against this stand-in.
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  static instances: MockEventSource[] = [];
  url: string;
  listeners: Record<string, (ev: unknown) => void> = {};
  onerror: (() => void) | null = null;
  closed = false;
  // A freshly-constructed source is OPEN; a transient error moves it to
  // CONNECTING (browser auto-retrying); a fatal one moves it to CLOSED.
  readyState: number = MockEventSource.OPEN;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    this.listeners[type] = cb;
  }
  close() {
    this.closed = true;
    this.readyState = MockEventSource.CLOSED;
  }
  /** Test helper: dispatch a frame to the registered listener as a MessageEvent. */
  emit(type: string, data: string) {
    this.listeners[type]?.({ data });
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  MockEventSource.instances.length = 0;
});

describe('IS_LIVE', () => {
  it('is true when VITE_DATA_MODE=live', async () => {
    const { live } = await loadLive('live');
    expect(live.IS_LIVE).toBe(true);
  });

  it('is false for any other mode', async () => {
    const { live } = await loadLive('mock');
    expect(live.IS_LIVE).toBe(false);
  });
});

describe('bootstrapWorld', () => {
  it('returns false and never calls fetch when not live', async () => {
    const { live } = await loadLive('mock');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await live.bootstrapWorld()).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('hydrates the world and returns true on a successful fetch', async () => {
    const { live, adapter } = await loadLive('live');
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => liveWorld });
    vi.stubGlobal('fetch', fetchSpy);

    expect(await live.bootstrapWorld()).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith('/api/world');
    expect(adapter.store.now()).toBe(42);
    expect(adapter.store.owners()).toEqual(liveWorld.owners);
  });

  it('returns false, keeps the mock world, and warns on a non-ok response', async () => {
    const { live, adapter } = await loadLive('live');
    const before = adapter.store.owners();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await live.bootstrapWorld()).toBe(false);
    expect(adapter.store.owners()).toBe(before);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('live world unavailable'), 'world fetch 503');
  });

  it('catches a thrown fetch, warns, and returns false', async () => {
    const { live } = await loadLive('live');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await live.bootstrapWorld()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('live world unavailable'), 'network down');
  });
});

describe('subscribeActions', () => {
  it('returns a no-op unsub and builds no EventSource when not live', async () => {
    const { live } = await loadLive('mock');
    vi.stubGlobal('EventSource', MockEventSource);
    const unsub = live.subscribeActions(() => {});
    expect(MockEventSource.instances).toHaveLength(0);
    expect(() => unsub()).not.toThrow();
  });

  it('parses a good frame: calls onAction and pushAction appends it to the world', async () => {
    const { live, adapter } = await loadLive('live');
    vi.stubGlobal('EventSource', MockEventSource);
    const onAction = vi.fn();
    const before = adapter.store.actions().length;

    live.subscribeActions(onAction);
    const es = MockEventSource.instances[0];
    expect(es.url).toBe('/api/events');

    const ev = {
      id: 'live-ac',
      ts: adapter.store.now() + 1,
      kind: 'tool_call',
      ownerId: 'o1',
      agentId: 'ag-1',
      sessionId: 's1',
      label: 'live edit',
      status: 'ok',
    };
    es.emit('action', JSON.stringify(ev));

    expect(onAction).toHaveBeenCalledWith(ev);
    expect(adapter.store.actions()).toHaveLength(before + 1);
    expect(adapter.store.actions().some((a) => a.id === 'live-ac')).toBe(true);
  });

  it('ignores a malformed frame: no throw, no onAction, no append', async () => {
    const { live, adapter } = await loadLive('live');
    vi.stubGlobal('EventSource', MockEventSource);
    const onAction = vi.fn();
    const before = adapter.store.actions().length;

    live.subscribeActions(onAction);
    const es = MockEventSource.instances[0];
    expect(() => es.emit('action', 'not-json{')).not.toThrow();

    expect(onAction).not.toHaveBeenCalled();
    expect(adapter.store.actions()).toHaveLength(before);
  });

  it('does NOT close on a transient error so EventSource can auto-reconnect', async () => {
    const { live } = await loadLive('live');
    vi.stubGlobal('EventSource', MockEventSource);
    live.subscribeActions(() => {});
    const es = MockEventSource.instances[0];
    expect(typeof es.onerror).toBe('function');
    // Non-terminal state: the browser is retrying. Killing the stream here would
    // defeat the built-in reconnect, so onerror must leave it open.
    es.readyState = MockEventSource.CONNECTING;
    es.onerror?.();
    expect(es.closed).toBe(false);
  });

  it('closes the stream only once EventSource has reached the terminal CLOSED state', async () => {
    const { live } = await loadLive('live');
    vi.stubGlobal('EventSource', MockEventSource);
    live.subscribeActions(() => {});
    const es = MockEventSource.instances[0];
    // Browser gave up (readyState CLOSED) — now tearing down is correct.
    es.readyState = MockEventSource.CLOSED;
    es.onerror?.();
    expect(es.closed).toBe(true);
  });

  it('unsubscribe closes the stream', async () => {
    const { live } = await loadLive('live');
    vi.stubGlobal('EventSource', MockEventSource);
    const unsub = live.subscribeActions(() => {});
    const es = MockEventSource.instances[0];
    unsub();
    expect(es.closed).toBe(true);
  });
});
