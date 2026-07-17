// The audit ingest sidecar (PRD-006). A minimal node:http server with ZERO
// framework dependency, so the audit image is the smallest privileged surface it
// can be. It exposes exactly two things:
//
//   POST /v1/events   append a hash-chained line to the append-only JSONL log
//   GET  /health      liveness (no event data)
//
// There is deliberately NO read path for events. The write-only property PRD-006
// requires is topological here too: no handler is bound that returns the trail,
// so an agent on the ingest network has a write path and no read path. A GET on
// /v1/events is answered 405, not with data.
//
// The file sink is injectable (the same adapter seam the rest of the box uses),
// so ingest is driven in tests with an in-memory store and no port or volume.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { appendFile, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { appendEvent, GENESIS_HASH, type AuditEvent } from './chain.js';

/** Where appended lines land, and the current chain head. `append` is O_APPEND
 *  (flag 'a'): a compromised sidecar can add lines but not rewrite existing ones. */
export interface IngestStore {
  prevHash: string;
  append(line: string): Promise<void>;
}

export interface IngestResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };
const BODY_LIMIT = 1_000_000; // 1 MB; audit events are small, cap to bound memory

/** The append target: AUDIT_LOG_PATH or the volume default. */
export function resolveAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.AUDIT_LOG_PATH ?? '/var/lib/docbox-audit/events.jsonl';
}

/** The real append-only file sink. Resumes the chain from the file's tail so a
 *  restart keeps one unbroken chain. It reads the file only to recover its own
 *  head hash at startup — it exposes no read path to any caller. */
export function createFileStore(path: string): IngestStore {
  mkdirSync(dirname(path), { recursive: true });
  let prevHash = GENESIS_HASH;
  if (existsSync(path)) {
    const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim());
    if (lines.length) {
      try {
        prevHash = (JSON.parse(lines[lines.length - 1]) as { hash?: string }).hash ?? GENESIS_HASH;
      } catch {
        prevHash = GENESIS_HASH;
      }
    }
  }
  return {
    prevHash,
    append(line) {
      return new Promise((resolve, reject) => {
        appendFile(path, line, { flag: 'a' }, (err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// Serialise appends per store so two concurrent POSTs cannot both read the same
// prevHash and fork the chain. A tiny promise-chain mutex ordered per store.
async function withLock<T>(store: IngestStore, fn: () => Promise<T>): Promise<T> {
  const s = store as IngestStore & { __lock?: Promise<void> };
  const prev = s.__lock ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  s.__lock = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

/** The whole ingest contract as one function over (method, url, body, store),
 *  so it is driven directly in tests with no socket. The node:http glue below is
 *  a thin wrapper around this. */
export async function handleIngest(
  method: string | undefined,
  url: string | undefined,
  body: string,
  store: IngestStore,
): Promise<IngestResult> {
  const path = (url ?? '/').split('?')[0];

  if (method === 'GET' && path === '/health') {
    return { status: 200, body: JSON.stringify({ status: 'ok', chain: store.prevHash }), headers: JSON_HEADERS };
  }

  if (path === '/v1/events') {
    if (method !== 'POST') {
      // Write-only by design: no read/query verb exists here (PRD-006).
      return {
        status: 405,
        body: JSON.stringify({ ok: false, error: 'method not allowed; ingest is write-only' }),
        headers: { ...JSON_HEADERS, allow: 'POST' },
      };
    }
    let event: AuditEvent;
    try {
      const parsed = JSON.parse(body || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('event must be a JSON object');
      }
      event = parsed as AuditEvent;
    } catch (err) {
      return {
        status: 400,
        body: JSON.stringify({ ok: false, error: `invalid event: ${(err as Error).message}` }),
        headers: JSON_HEADERS,
      };
    }
    return withLock(store, async () => {
      const { line, hash } = appendEvent(store.prevHash, event);
      await store.append(line + '\n');
      store.prevHash = hash;
      return { status: 200, body: JSON.stringify({ ok: true, hash }), headers: JSON_HEADERS };
    });
  }

  return { status: 404, body: JSON.stringify({ ok: false, error: 'not found' }), headers: JSON_HEADERS };
}

/** The node:http request handler. Buffers the body under a cap, then delegates
 *  to handleIngest. Kept tiny — the logic lives in handleIngest. */
export function requestListener(store: IngestStore) {
  return (req: IncomingMessage, res: ServerResponse): void => {
    const chunks: Buffer[] = [];
    let size = 0;
    let aborted = false;
    const fail = (status: number, error: string): void => {
      if (aborted) return;
      aborted = true;
      res.writeHead(status, JSON_HEADERS);
      res.end(JSON.stringify({ ok: false, error }));
    };
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      size += c.length;
      if (size > BODY_LIMIT) {
        fail(413, 'event too large');
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      handleIngest(req.method, req.url, Buffer.concat(chunks).toString('utf8'), store)
        .then((r) => {
          res.writeHead(r.status, r.headers);
          res.end(r.body);
        })
        .catch((e) => fail(500, String(e)));
    });
    req.on('error', () => fail(400, 'bad request'));
  };
}

/** Build the ingest server. Defaults to the real file store; tests pass an
 *  in-memory store so nothing binds a port or touches a volume. */
export function createIngestServer(store: IngestStore = createFileStore(resolveAuditPath())) {
  return createServer(requestListener(store));
}

// Only bind a port when run directly (the audit image runs `node dist/audit/ingest.js`),
// not when imported by a test. Consistent with the control-plane server's guard.
if (process.env.DOCBOX_NO_LISTEN !== '1') {
  const port = Number(process.env.AUDIT_PORT ?? 9099);
  const server = createIngestServer();
  server.listen(port, () => {
    console.log(`docBox audit ingest on http://127.0.0.1:${port}`);
    console.log(`  append: POST /v1/events  ->  ${resolveAuditPath()}`);
    console.log(`  health: GET  /health     (write-only: no read path)`);
  });
}
