// Drive the ingest request handler and the file store directly — no bound port.
// requestListener is fed a fake req/res pair so every HTTP-shaped branch runs
// deterministically; createFileStore is exercised against a temp file. The chain
// maths itself is covered in audit.test.ts.
import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { requestListener, createFileStore, type IngestStore } from './ingest';
import { GENESIS_HASH } from './chain';

function memStore(): IngestStore & { lines: string[] } {
  return { prevHash: GENESIS_HASH, lines: [], async append(line: string) { this.lines.push(line); } };
}

/** Feed (method, url, body) through requestListener and resolve on res.end. */
function drive(store: IngestStore, method: string, url: string, body = ''): Promise<{ status: number; out: string }> {
  return new Promise((resolve) => {
    const req = new EventEmitter() as EventEmitter & { method: string; url: string; destroy: () => void };
    req.method = method;
    req.url = url;
    req.destroy = () => {};
    let status = 0;
    const res = {
      writeHead: (s: number) => { status = s; },
      end: (out = '') => resolve({ status, out }),
    };
    requestListener(store)(req as never, res as never);
    queueMicrotask(() => {
      if (body) req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  });
}

describe('ingest request handling (write-only)', () => {
  it('appends an event on POST /v1/events and returns its hash', async () => {
    const store = memStore();
    const r = await drive(store, 'POST', '/v1/events', JSON.stringify({ kind: 'test', at: 1 }));
    expect(r.status).toBe(200);
    const body = JSON.parse(r.out);
    expect(body.ok).toBe(true);
    expect(typeof body.hash).toBe('string');
    expect(store.lines).toHaveLength(1);
  });

  it('serves GET /health with no event data', async () => {
    const r = await drive(memStore(), 'GET', '/health');
    expect(r.status).toBe(200);
    expect(JSON.parse(r.out).status).toBe('ok');
  });

  it('refuses to read: GET /v1/events is 405 with an Allow: POST', async () => {
    const r = await drive(memStore(), 'GET', '/v1/events');
    expect(r.status).toBe(405);
  });

  it('rejects a non-JSON body with 400', async () => {
    const r = await drive(memStore(), 'POST', '/v1/events', 'not json');
    expect(r.status).toBe(400);
  });

  it('404s an unknown path', async () => {
    const r = await drive(memStore(), 'GET', '/nope');
    expect(r.status).toBe(404);
  });

  it('rejects an oversized body with 413 before parsing', async () => {
    const r = await drive(memStore(), 'POST', '/v1/events', 'x'.repeat(1_000_001));
    expect(r.status).toBe(413);
  });
});

describe('createFileStore resumes the chain head from the file tail', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('starts from genesis when the file is absent, resumes prevHash after a write', async () => {
    dir = mkdtempSync(join(tmpdir(), 'docbox-audit-'));
    const path = join(dir, 'events.jsonl');
    const s1 = createFileStore(path);
    expect(s1.prevHash).toBe(GENESIS_HASH);
    await s1.append(JSON.stringify({ seq: 1, hash: 'deadbeefcafe' }) + '\n');
    const s2 = createFileStore(path);
    expect(s2.prevHash).toBe('deadbeefcafe');
  });
});
