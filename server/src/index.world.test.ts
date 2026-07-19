// The control-plane routes driven in REAL mode (DOCBOX_DATA=real) against a
// temp-dir JSON store. This is the live+real+empty path: an empty world, a first
// provision that creates the first owner from the auth headers, and the honest
// SSE stream that never fabricates. The seeded route behaviour is the regression
// gate in index.test.ts and is left untouched.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from './index';
import { resetWorldStore } from './world/store';
import { setAuditEmitter, createLocalEmitter, GENESIS_HASH, type LocalSink } from './audit/emit';

let dir: string;
let sink: LocalSink;
const prevData = process.env.DOCBOX_DATA;
const prevDir = process.env.DOCBOX_DATA_DIR;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'docbox-world-'));
  process.env.DOCBOX_DATA = 'real';
  process.env.DOCBOX_DATA_DIR = dir;
  resetWorldStore();
  sink = { prevHash: GENESIS_HASH, lines: [] };
  setAuditEmitter(createLocalEmitter(sink));
});

afterEach(() => {
  resetWorldStore();
  setAuditEmitter(undefined);
  rmSync(dir, { recursive: true, force: true });
  if (prevData === undefined) delete process.env.DOCBOX_DATA;
  else process.env.DOCBOX_DATA = prevData;
  if (prevDir === undefined) delete process.env.DOCBOX_DATA_DIR;
  else process.env.DOCBOX_DATA_DIR = prevDir;
});

describe('GET /api/world (real mode)', () => {
  it('reports dataSource "real", empty world-data arrays and a finite [now, now] window', async () => {
    const res = await app.request('/api/world');
    expect(res.status).toBe(200);
    const w = await res.json();
    expect(w.dataSource).toBe('real');
    for (const key of ['owners', 'sessions', 'agents', 'elements', 'actions',
      'snapshots', 'beads', 'audit', 'vaults', 'documents']) {
      expect(w[key]).toHaveLength(0);
    }
    // The manifest is present; it is capability, not seeded data.
    expect(w.modules.length).toBeGreaterThan(0);
    expect(w.timeWindow[0]).toBe(w.now);
    expect(w.timeWindow[1]).toBe(w.now);
    expect(Number.isFinite(w.timeWindow[0])).toBe(true);
  });
});

describe('POST /api/provision (real mode)', () => {
  it('creates the first owner from the auth headers, a locked vault and a provision action; returns a fresh world', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'entra:9f2a:6b1c', 'x-auth-request-email': 'dana@client.co' },
      body: JSON.stringify({ project: 'aurora' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const w = body.world;
    expect(w.dataSource).toBe('real');
    // The acting owner came from the headers, never the body.
    expect(w.owners).toHaveLength(1);
    expect(w.owners[0].id).toBe('entra:9f2a:6b1c');
    expect(w.owners[0].role).toBe('admin');
    // A locked vault for the project, and the provision action attributed to them.
    expect(w.vaults).toHaveLength(1);
    expect(w.vaults[0]).toMatchObject({ project: 'aurora', state: 'locked' });
    expect(w.actions).toHaveLength(1);
    expect(w.actions[0].kind).toBe('provision');
    expect(w.actions[0].ownerId).toBe('entra:9f2a:6b1c');

    // The action was audited with the acting owner, one 'provision' event.
    const rec = JSON.parse(sink.lines.at(-1)!);
    expect(rec.event.kind).toBe('provision');
    expect(rec.event.actor.ownerId).toBe('entra:9f2a:6b1c');
    expect(rec.event.actor.agentId).toBe('foreman');
  });

  it('never trusts an ownerId in the body — attribution is the header user', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'real-user' },
      body: JSON.stringify({ project: 'aurora', ownerId: 'entra:spoofed:owner' }),
    });
    const body = await res.json();
    expect(body.world.owners[0].id).toBe('real-user');
  });

  it('attributes an unauthenticated provision to anonymous', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'aurora' }),
    });
    const body = await res.json();
    expect(body.world.owners[0].id).toBe('anonymous');
    expect(JSON.parse(sink.lines.at(-1)!).event.actor.ownerId).toBe('anonymous');
  });

  it('honours vault: false — no vault, but the action is still recorded', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: 'novault', vault: false }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.world.vaults).toHaveLength(0);
    expect(body.world.actions).toHaveLength(1);
  });

  it('rejects a missing project name with 400 and records nothing', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ project: '' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(sink.lines).toHaveLength(0);
  });

  it('rejects a malformed / missing body with 400', async () => {
    const res = await app.request('/api/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '}{ not json',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate project with 409', async () => {
    const first = await app.request('/api/provision', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'aurora' }),
    });
    expect(first.status).toBe(200);
    const dup = await app.request('/api/provision', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'aurora' }),
    });
    expect(dup.status).toBe(409);
    expect((await dup.json()).ok).toBe(false);
  });
});

describe('GET /api/events (SSE, real mode)', () => {
  it('does not fabricate: an empty real world yields no synthetic frame', async () => {
    const controller = new AbortController();
    const res = await app.request('/api/events', { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    // Race a read against a short timeout: with no appended actions the stream is
    // silent, so the timeout must win. (Seeded mode would have emitted at once.)
    const first = reader.read();
    const timeout = new Promise<'quiet'>((r) => setTimeout(() => r('quiet'), 300));
    const outcome = await Promise.race([first.then(() => 'frame' as const), timeout]);
    expect(outcome).toBe('quiet');
    await reader.cancel();
    controller.abort();
  }, 5000);

  it('streams a genuinely appended provision action', async () => {
    const controller = new AbortController();
    const res = await app.request('/api/events', { signal: controller.signal });
    const reader = res.body!.getReader();
    // Let the stream capture its baseline (current action count) before we append.
    await new Promise((r) => setTimeout(r, 60));
    await app.request('/api/provision', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ project: 'aurora' }),
    });
    const { value, done } = await reader.read();
    expect(done).toBe(false);
    const frame = new TextDecoder().decode(value);
    expect(frame).toContain('event: action');
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))!;
    const event = JSON.parse(dataLine.slice('data:'.length).trim());
    expect(event.kind).toBe('provision');
    await reader.cancel();
    controller.abort();
  }, 5000);
});
