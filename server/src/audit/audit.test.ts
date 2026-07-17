// Audit suite. Covers the hash chain's integrity and tamper/reorder detection,
// the write-only ingest contract driven at the handler level (no port, no
// volume), and the node:http glue via a fake request/response.
import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  appendEvent, verifyChain, hashEvent, canonical, GENESIS_HASH, type AuditEvent,
} from './chain';
import {
  handleIngest, requestListener, resolveAuditPath, type IngestStore,
} from './ingest';

// Build a set of chained lines from a list of events, as the sidecar would.
function buildChain(events: AuditEvent[]): { lines: string[]; head: string } {
  let prev = GENESIS_HASH;
  const lines: string[] = [];
  for (const e of events) {
    const { line, hash } = appendEvent(prev, e);
    lines.push(line);
    prev = hash;
  }
  return { lines, head: prev };
}

// An in-memory ingest store: records appended lines, tracks the chain head.
function memStore(): IngestStore & { lines: string[] } {
  const s = {
    prevHash: GENESIS_HASH,
    lines: [] as string[],
    append(line: string) {
      s.lines.push(line);
      return Promise.resolve();
    },
  };
  return s;
}

describe('hash chain', () => {
  it('canonical sorts keys at every depth so order does not change the hash', () => {
    const a = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
    const b = { a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 };
    expect(canonical(a)).toBe(canonical(b));
    expect(hashEvent(GENESIS_HASH, a)).toBe(hashEvent(GENESIS_HASH, b));
  });

  it('appendEvent links each record and verifyChain accepts the intact chain', () => {
    const { lines } = buildChain([
      { seq: 1, kind: 'session_start', userId: 'entra:9f2a:6b1c' },
      { seq: 2, kind: 'tool_call', tool: 'edit_file' },
      { seq: 3, kind: 'config_change', key: 'providers.anthropic' },
    ]);
    expect(verifyChain(lines)).toEqual({ ok: true, brokenAt: null });
    // Each record's prevHash is the prior record's hash.
    const recs = lines.map((l) => JSON.parse(l));
    expect(recs[0].prevHash).toBe(GENESIS_HASH);
    expect(recs[1].prevHash).toBe(recs[0].hash);
    expect(recs[2].prevHash).toBe(recs[1].hash);
  });

  it('detects a tampered event: flipping a byte breaks the chain at that line', () => {
    const { lines } = buildChain([{ seq: 1, amount: 100 }, { seq: 2, amount: 200 }, { seq: 3, amount: 300 }]);
    // Edit the payload of line 1 (index 1) without recomputing its hash.
    const rec = JSON.parse(lines[1]);
    rec.event.amount = 999; // the classic retroactive edit
    lines[1] = JSON.stringify(rec);
    expect(verifyChain(lines)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('detects reordering: swapping two lines breaks the prevHash link', () => {
    const { lines } = buildChain([{ seq: 1 }, { seq: 2 }, { seq: 3 }]);
    [lines[1], lines[2]] = [lines[2], lines[1]];
    const res = verifyChain(lines);
    expect(res.ok).toBe(false);
    expect(res.brokenAt).toBe(1);
  });

  it('flags an unparseable line', () => {
    const { lines } = buildChain([{ seq: 1 }, { seq: 2 }]);
    lines[1] = '{ this is not json';
    expect(verifyChain(lines)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('tolerates a trailing blank line', () => {
    const { lines } = buildChain([{ seq: 1 }]);
    expect(verifyChain([...lines, ''])).toEqual({ ok: true, brokenAt: null });
  });
});

describe('ingest: write path', () => {
  it('appends a hash-chained line per POST and the result chain verifies', async () => {
    const store = memStore();
    const heads: string[] = [];
    for (const e of [{ kind: 'session_start' }, { kind: 'tool_call', tool: 'grep' }, { kind: 'session_end' }]) {
      const res = await handleIngest('POST', '/v1/events', JSON.stringify(e), store);
      expect(res.status).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.ok).toBe(true);
      expect(body.hash).toMatch(/^[0-9a-f]{64}$/);
      heads.push(body.hash);
    }
    // The store's head advanced to the last returned hash…
    expect(store.prevHash).toBe(heads[heads.length - 1]);
    // …and the appended JSONL is a valid, ordered chain.
    expect(verifyChain(store.lines)).toEqual({ ok: true, brokenAt: null });
    expect(store.lines).toHaveLength(3);
  });

  it('serialises concurrent appends into one unbroken chain', async () => {
    const store = memStore();
    // Fire several appends without awaiting between them: the per-store lock must
    // still produce a linear chain.
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => handleIngest('POST', '/v1/events', JSON.stringify({ seq: i }), store)),
    );
    expect(store.lines).toHaveLength(8);
    expect(verifyChain(store.lines)).toEqual({ ok: true, brokenAt: null });
  });

  it('rejects a non-object event body with 400', async () => {
    const store = memStore();
    for (const bad of ['not json', '[1,2,3]', 'null', '42']) {
      const res = await handleIngest('POST', '/v1/events', bad, store);
      expect(res.status).toBe(400);
    }
    expect(store.lines).toHaveLength(0);
  });

  it('health reports ok and the current chain head, but no events', async () => {
    const store = memStore();
    await handleIngest('POST', '/v1/events', JSON.stringify({ kind: 'x' }), store);
    const res = await handleIngest('GET', '/health', '', store);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.chain).toBe(store.prevHash);
  });
});

describe('ingest: write-only topology', () => {
  it('answers a read attempt on /v1/events with 405, never event data', async () => {
    const store = memStore();
    await handleIngest('POST', '/v1/events', JSON.stringify({ secret: 'do-not-leak' }), store);
    for (const method of ['GET', 'PUT', 'DELETE', 'HEAD']) {
      const res = await handleIngest(method, '/v1/events', '', store);
      expect(res.status).toBe(405);
      expect(res.headers.allow).toBe('POST');
      expect(res.body).not.toContain('do-not-leak'); // no trail is ever returned
    }
  });

  it('returns 404 for any other path', async () => {
    const store = memStore();
    const res = await handleIngest('GET', '/v1/events/1', '', store);
    expect(res.status).toBe(404);
    const res2 = await handleIngest('GET', '/', '', store);
    expect(res2.status).toBe(404);
  });
});

describe('ingest: node:http glue', () => {
  // Drive requestListener with a fake request (a Readable-ish emitter) and a
  // fake response capturing status/body — the wiring, without binding a port.
  function driveHttp(store: IngestStore, method: string, url: string, body: string) {
    return new Promise<{ status: number; body: string }>((resolve) => {
      const req = Object.assign(new EventEmitter(), { method, url });
      const res = {
        statusCode: 0,
        writeHead(status: number) {
          this.statusCode = status;
        },
        end(payload: string) {
          resolve({ status: this.statusCode, body: payload });
        },
      };
      requestListener(store)(req as never, res as never);
      if (body) req.emit('data', Buffer.from(body, 'utf8'));
      req.emit('end');
    });
  }

  it('routes a POST through to an append and answers 200', async () => {
    const store = memStore();
    const out = await driveHttp(store, 'POST', '/v1/events', JSON.stringify({ kind: 'session_start' }));
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body).ok).toBe(true);
    expect(store.lines).toHaveLength(1);
  });

  it('routes a health GET through to 200', async () => {
    const store = memStore();
    const out = await driveHttp(store, 'GET', '/health', '');
    expect(out.status).toBe(200);
    expect(JSON.parse(out.body).status).toBe('ok');
  });
});

describe('resolveAuditPath', () => {
  it('defaults to the audit volume and honours AUDIT_LOG_PATH', () => {
    expect(resolveAuditPath({} as NodeJS.ProcessEnv)).toBe('/var/lib/docbox-audit/events.jsonl');
    expect(resolveAuditPath({ AUDIT_LOG_PATH: '/tmp/a.jsonl' } as NodeJS.ProcessEnv)).toBe('/tmp/a.jsonl');
  });
});
