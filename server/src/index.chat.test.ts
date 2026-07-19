// The Companion chat route across both transports (ADR-005), the real-mode world
// recording it drives, and the M7 chat-bubble static routes. The JSON path is the
// unchanged { ok, reply } contract; the SSE path mirrors the extension chatView's
// pipeStream frame contract (data: lines, [DONE] sentinel). The bubble routes read
// their assets from a temp public dir via DOCBOX_PUBLIC_DIR so the test needs no
// files under server/public.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { app } from './index';
import { resetWorldStore } from './world/store';
import { setAuditEmitter, createLocalEmitter, GENESIS_HASH, type LocalSink } from './audit/emit';

/** Drain an SSE response body into the list of trimmed `data:` payloads, exactly
 *  as chatView's pipeStream splits it: frames on a blank line, one payload per
 *  data: line. */
async function readSseData(res: Response): Promise<string[]> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const payloads: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
  }
  for (const frame of buffer.split('\n\n')) {
    for (const line of frame.split('\n')) {
      if (line.startsWith('data:')) payloads.push(line.slice('data:'.length).trim());
    }
  }
  return payloads;
}

describe('POST /api/chat — JSON transport (unchanged)', () => {
  let sink: LocalSink;
  beforeEach(() => {
    sink = { prevHash: GENESIS_HASH, lines: [] };
    setAuditEmitter(createLocalEmitter(sink));
  });
  afterEach(() => setAuditEmitter(undefined));

  it('returns a single { ok, reply } body when Accept is not text/event-stream', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'summarise the billing module' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.reply).toBe('string');
    expect(body.reply.length).toBeGreaterThan(0);
  });

  it('rejects an empty prompt with 400 and records nothing', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: '  ' }),
    });
    expect(res.status).toBe(400);
    expect(sink.lines).toHaveLength(0);
  });

  it('audits the turn exactly once on the JSON path, attributed to the auth-header user', async () => {
    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'dana' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    expect(sink.lines).toHaveLength(1);
    const rec = JSON.parse(sink.lines[0]);
    expect(rec.event.kind).toBe('prompt');
    expect(rec.event.surface).toBe('companion');
    expect(rec.event.actor.ownerId).toBe('dana');
  });
});

describe('POST /api/chat — SSE transport (ADR-005, chatView contract)', () => {
  let sink: LocalSink;
  beforeEach(() => {
    sink = { prevHash: GENESIS_HASH, lines: [] };
    setAuditEmitter(createLocalEmitter(sink));
  });
  afterEach(() => setAuditEmitter(undefined));

  it('streams trajectory data frames terminated by the [DONE] sentinel', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ prompt: 'summarise the billing module' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const payloads = await readSseData(res);
    // The turn ends with the sentinel chatView's pipeStream stops on.
    expect(payloads.at(-1)).toBe('[DONE]');
    // At least one delta preceded it, and none of the deltas is the sentinel.
    expect(payloads.length).toBeGreaterThan(1);
    expect(payloads.slice(0, -1).every((p) => p !== '[DONE]')).toBe(true);
  });

  it('audits the turn exactly once on the SSE path too', async () => {
    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ prompt: 'hello' }),
    });
    await readSseData(res);
    expect(sink.lines).toHaveLength(1);
    expect(JSON.parse(sink.lines[0]).event.kind).toBe('prompt');
  });
});

describe('POST /api/chat — a real-mode turn appears in /api/world', () => {
  let dir: string;
  const prevData = process.env.DOCBOX_DATA;
  const prevDir = process.env.DOCBOX_DATA_DIR;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'docbox-chatworld-'));
    process.env.DOCBOX_DATA = 'real';
    process.env.DOCBOX_DATA_DIR = dir;
    resetWorldStore();
    setAuditEmitter(createLocalEmitter({ prevHash: GENESIS_HASH, lines: [] }));
  });
  afterEach(() => {
    resetWorldStore();
    setAuditEmitter(undefined);
    rmSync(dir, { recursive: true, force: true });
    if (prevData === undefined) delete process.env.DOCBOX_DATA; else process.env.DOCBOX_DATA = prevData;
    if (prevDir === undefined) delete process.env.DOCBOX_DATA_DIR; else process.env.DOCBOX_DATA_DIR = prevDir;
  });

  it('appends attributed actions a subsequent /api/world reports, and they survive a restart', async () => {
    const before = await (await app.request('/api/world')).json();
    expect(before.actions).toHaveLength(0);

    await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'entra:9f2a:6b1c' },
      body: JSON.stringify({ prompt: 'edit the billing module' }),
    });

    const after = await (await app.request('/api/world')).json();
    expect(after.actions.length).toBeGreaterThan(0);
    expect(after.owners[0].id).toBe('entra:9f2a:6b1c');
    expect(after.actions.every((a: { agentId: string }) => a.agentId === 'companion-chat')).toBe(true);

    // The recorded turn persisted: a fresh store over the same dir re-reads it.
    resetWorldStore();
    const restarted = await (await app.request('/api/world')).json();
    expect(restarted.actions.length).toBe(after.actions.length);
  });
});

describe('GET /bubble and /bubble.js — M7 static widget routes', () => {
  let pub: string;
  const prevPub = process.env.DOCBOX_PUBLIC_DIR;
  beforeEach(() => {
    pub = mkdtempSync(join(tmpdir(), 'docbox-public-'));
    process.env.DOCBOX_PUBLIC_DIR = pub;
  });
  afterEach(() => {
    rmSync(pub, { recursive: true, force: true });
    if (prevPub === undefined) delete process.env.DOCBOX_PUBLIC_DIR; else process.env.DOCBOX_PUBLIC_DIR = prevPub;
  });

  it('serves bubble.html as text/html', async () => {
    writeFileSync(join(pub, 'bubble.html'), '<!doctype html><title>docBox chat bubble — embed demo</title>', 'utf8');
    const res = await app.request('/bubble');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('embed demo');
  });

  it('serves bubble.js as text/javascript', async () => {
    writeFileSync(join(pub, 'bubble.js'), '(function(){window.docBoxBubble={};})();', 'utf8');
    const res = await app.request('/bubble.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toContain('docBoxBubble');
  });

  it('404s with a plain message when an asset is absent', async () => {
    const html = await app.request('/bubble');
    expect(html.status).toBe(404);
    expect(await html.text()).toContain('not found');
    const js = await app.request('/bubble.js');
    expect(js.status).toBe(404);
  });
});
