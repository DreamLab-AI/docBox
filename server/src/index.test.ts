// Server suite for the docBox control-plane. Drives the exported Hono app via
// app.request() so nothing binds a port. Env is set BEFORE the module is
// evaluated (dynamic import in beforeAll) so TOML_PATH resolves to a throwaway
// temp file — the persisted-write test must never touch docker/foreman.toml.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import type { Hono } from 'hono';

// Stub the node-server bind so the "run directly" branch can be exercised
// without ever opening a real socket (no port, no hang, no leaked handle).
// serveStatic lives on a different subpath and stays real.
vi.mock('@hono/node-server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hono/node-server')>();
  return {
    ...actual,
    serve: (opts: { port?: number }, cb?: (info: { port: number }) => void) => {
      cb?.({ port: opts?.port ?? 0 });
      return { close() {} };
    },
  };
});

// Single source of truth for expected shapes/lengths: the same mock the server reads.
import {
  owners, agents, actions, configOptions, snapshots, beads, vaults,
  documents, modules, systemStatus, NOW,
} from '../../app/src/data/mock.ts';

const TMP_TOML = join(tmpdir(), 'docbox-server-test-config.toml');
const HERE = dirname(fileURLToPath(import.meta.url));
const APP_DIST = join(HERE, '../../app/dist');

// Set env before the server module is ever evaluated.
process.env.DOCBOX_NO_LISTEN = '1';
process.env.DOCBOX_TOML = TMP_TOML;
delete process.env.DOCBOX_CONFIG_WRITABLE;

let app: Hono;
let createdDist = false;

beforeAll(async () => {
  if (existsSync(TMP_TOML)) rmSync(TMP_TOML);
  // Materialise a throwaway dist so the production static-hosting branch
  // registers. Specific /api handlers still win (earlier registration), so
  // this does not shadow the API. Removed again in afterAll.
  if (!existsSync(APP_DIST)) {
    mkdirSync(APP_DIST, { recursive: true });
    writeFileSync(join(APP_DIST, 'index.html'), '<!doctype html><title>docBox</title>');
    createdDist = true;
  }
  // Dynamic import guarantees the env vars above are in place when the module
  // top-level reads them (a static import would hoist above them).
  ({ app } = await import('./index'));
});

afterAll(() => {
  if (existsSync(TMP_TOML)) rmSync(TMP_TOML);
  if (createdDist) rmSync(APP_DIST, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('returns 200 with ok status, active stack and the fixed clock', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok', stack: systemStatus.activeStack, ts: NOW });
  });
});

describe('CORS', () => {
  it('does not grant a hostile origin: no Access-Control-Allow-Origin header', async () => {
    // No DOCBOX_ALLOWED_ORIGIN in the env, so the server defaults to the Vite
    // dev app origin. A cross-origin caller is DENIED — no ACAO header is set,
    // so the browser blocks it. The old bare cors() reflected '*' to everyone.
    const res = await app.request('/api/world', { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
    const acao = res.headers.get('access-control-allow-origin');
    expect(acao).toBeNull();
    expect(acao).not.toBe('*');
    expect(acao).not.toBe('https://evil.example');
  });

  it('honours DOCBOX_ALLOWED_ORIGIN when set (dev proxy origin still works)', async () => {
    const res = await app.request('/api/world', { headers: { Origin: 'http://localhost:5173' } });
    expect(res.status).toBe(200);
    // The dev app origin is the default, so its own requests are always allowed.
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
  });
});

describe('GET /api/world', () => {
  it('hydrates the whole world in one call with correct collection lengths', async () => {
    const res = await app.request('/api/world');
    expect(res.status).toBe(200);
    const body = await res.json();

    // Every collection the UI hydrates from is present…
    for (const key of [
      'owners', 'agents', 'actions', 'config', 'snapshots', 'beads',
      'vaults', 'documents', 'modules', 'system', 'timeWindow',
    ]) {
      expect(body).toHaveProperty(key);
    }

    // …and each matches the mock it is served from (robust to later mutation
    // because we compare against the same live array instances).
    expect(body.owners).toHaveLength(owners.length);
    expect(body.agents).toHaveLength(agents.length);
    expect(body.actions).toHaveLength(actions.length);
    expect(body.config).toHaveLength(configOptions.length);
    expect(body.snapshots).toHaveLength(snapshots.length);
    expect(body.beads).toHaveLength(beads.length);
    expect(body.vaults).toHaveLength(vaults.length);
    expect(body.documents).toHaveLength(documents.length);
    expect(body.modules).toHaveLength(modules.length);

    expect(body.system).toMatchObject({ activeStack: systemStatus.activeStack });
    expect(body.now).toBe(NOW);

    // The world is the mock module, so the server declares its provenance as
    // seeded. The UI's live strip branches on this to stay honest — a green
    // 'live' badge over seeded data must read as seeded, not real.
    expect(body.dataSource).toBe('seeded');

    // timeWindow is [minActionTs, max(maxActionTs, NOW)].
    expect(body.timeWindow).toHaveLength(2);
    const [lo, hi] = body.timeWindow;
    expect(lo).toBe(Math.min(...actions.map((a) => a.ts)));
    expect(hi).toBe(Math.max(...actions.map((a) => a.ts), NOW));
    expect(hi).toBeGreaterThanOrEqual(lo);
  });
});

describe('GET /api/documents', () => {
  it('returns the document list as an array', async () => {
    const res = await app.request('/api/documents');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(documents.length);
  });
});

describe('POST /api/documents', () => {
  it('records an upload, applying the OCR route from config', async () => {
    const before = documents.length;
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'report.pdf', ownerId: 'entra:test:owner', project: 'project-test',
        sizeKb: 200, pages: 3, mime: 'text/plain', handwriting: true,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const doc = body.document;
    expect(doc.name).toBe('report.pdf');
    expect(doc.ownerId).toBe('entra:test:owner');
    expect(doc.project).toBe('project-test');
    expect(doc.sizeKb).toBe(200);
    expect(doc.pages).toBe(3);
    expect(doc.mime).toBe('text/plain');
    expect(doc.handwriting).toBe(true);
    expect(doc.ocr).toBe('pending');
    // ocrRoute is sourced from the ocr.route config option (default 'local').
    const ocrRoute = configOptions.find((o) => o.key === 'ocr.route')?.value ?? 'local';
    expect(doc.ocrRoute).toBe(ocrRoute);
    expect(doc.id).toMatch(/^doc-/);
    expect(doc.uploadedAt).toBe(NOW);
    // The store grew and the new doc is at the front.
    expect(documents.length).toBe(before + 1);
    expect(documents[0].id).toBe(doc.id);
  });

  it('falls back to defaults when the body is empty or unparseable', async () => {
    const res = await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '}{ not valid json at all',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const doc = body.document;
    expect(doc.name).toBe('upload.bin');
    expect(doc.ownerId).toBe(owners[0].id);
    expect(doc.project).toBe('project-aurora');
    expect(doc.sizeKb).toBe(100);
    expect(doc.pages).toBe(1);
    expect(doc.mime).toBe('application/pdf');
    expect(doc.handwriting).toBe(false);
    expect(doc.ocr).toBe('pending');
  });

  it('defaults the OCR route to local when the ocr.route option is absent', async () => {
    const idx = configOptions.findIndex((o) => o.key === 'ocr.route');
    const [removed] = configOptions.splice(idx, 1); // temporarily drop the option
    try {
      const res = await app.request('/api/documents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'no-route.pdf' }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      // With no ocr.route option, the handler falls back to 'local'.
      expect(body.document.ocrRoute).toBe('local');
    } finally {
      configOptions.splice(idx, 0, removed); // restore the frozen world
    }
  });
});

describe('GET /api/config', () => {
  it('serves valid TOML as text/plain with the expected sections', async () => {
    const res = await app.request('/api/config');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');

    const text = await res.text();
    const parsed = parseToml(text) as Record<string, unknown>;
    // Derived-from-options document groups every key under its head section.
    expect(parsed).toHaveProperty('providers');
    expect(typeof parsed.providers).toBe('object');
  });
});

describe('PUT /api/config', () => {
  it('rejects malformed TOML with 400 and an error message', async () => {
    const res = await app.request('/api/config', {
      method: 'PUT',
      body: 'this is = = not [[ valid toml',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/invalid TOML/i);
  });

  it('accepts valid TOML but does not persist by default', async () => {
    const res = await app.request('/api/config', {
      method: 'PUT',
      body: '[providers]\nanthropic = true\n',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.persisted).toBe(false);
    expect(body.note).toMatch(/read-only/i);
    // Nothing was written to disk.
    expect(existsSync(TMP_TOML)).toBe(false);
  });

  it('writes the file when DOCBOX_CONFIG_WRITABLE=1', async () => {
    const prev = process.env.DOCBOX_CONFIG_WRITABLE;
    process.env.DOCBOX_CONFIG_WRITABLE = '1';
    try {
      const toml = '[providers]\nanthropic = true\nopenai = false\n';
      const res = await app.request('/api/config', { method: 'PUT', body: toml });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.persisted).toBe(TMP_TOML);
      // The bytes actually landed on disk.
      expect(existsSync(TMP_TOML)).toBe(true);
      expect(readFileSync(TMP_TOML, 'utf8')).toBe(toml);
    } finally {
      if (prev === undefined) delete process.env.DOCBOX_CONFIG_WRITABLE;
      else process.env.DOCBOX_CONFIG_WRITABLE = prev;
    }
  });
});

describe('GET /api/events (SSE)', () => {
  it('opens an event-stream and delivers one action frame, then aborts cleanly', async () => {
    const controller = new AbortController();
    const res = await app.request('/api/events', { signal: controller.signal });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.body).toBeTruthy();

    // Read exactly ONE frame. The stream would otherwise emit every 4s up to
    // 10_000 ticks — we never let it get past the first.
    const reader = res.body!.getReader();
    const { value, done } = await reader.read();
    expect(done).toBe(false);

    const frame = new TextDecoder().decode(value);
    expect(frame).toContain('event: action');
    expect(frame).toContain('data:');
    // The payload is a JSON ActionEvent with a live id.
    const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))!;
    const event = JSON.parse(dataLine.slice('data:'.length).trim());
    expect(event.id).toMatch(/^live-/);
    expect(event.kind).toBeTruthy();

    // Tear down: cancel the reader and abort the request so the loop stops.
    await reader.cancel();
    controller.abort();
  }, 5000);
});

describe('GET /api/engine/health', () => {
  it('reports the deterministic mock engine by default', async () => {
    const res = await app.request('/api/engine/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.engine).toBe('mock');
    expect(body.ready).toBe(true);
    expect(body.protocol).toBe('in-process-deterministic');
  });
});

describe('POST /api/engine/prompt', () => {
  it('runs a mock trajectory and returns an ordered event list', async () => {
    const res = await app.request('/api/engine/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', prompt: 'add an export endpoint' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessionId).toBe('s1');
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events[0].kind).toBe('session_start');
    expect(body.events[body.events.length - 1].kind).toBe('session_end');
  });

  it('is deterministic: the same prompt yields identical events', async () => {
    const post = () =>
      app
        .request('/api/engine/prompt', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId: 's', prompt: 'same input' }),
        })
        .then((r) => r.json());
    const [a, b] = await Promise.all([post(), post()]);
    expect(a.events).toEqual(b.events);
  });

  it('rejects an empty or unparseable body with 400', async () => {
    const empty = await app.request('/api/engine/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(empty.status).toBe(400);
    const garbage = await app.request('/api/engine/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '}{ not json',
    });
    expect(garbage.status).toBe(400);
  });
});

describe('module entrypoint', () => {
  it('binds via serve() when not imported by a test (DOCBOX_NO_LISTEN unset)', async () => {
    vi.resetModules();
    const prev = {
      noListen: process.env.DOCBOX_NO_LISTEN,
      toml: process.env.DOCBOX_TOML,
      port: process.env.PORT,
    };
    // Enable the serve() path; drop DOCBOX_TOML to exercise the default TOML
    // path join; set PORT to exercise its env branch. serve() is mocked, so
    // nothing actually listens.
    delete process.env.DOCBOX_NO_LISTEN;
    delete process.env.DOCBOX_TOML;
    process.env.PORT = '9999';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const mod = await import('./index');
      expect(mod.app).toBeTruthy();
      // The serve() callback ran and logged the startup banner.
      expect(logSpy).toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      if (prev.noListen === undefined) delete process.env.DOCBOX_NO_LISTEN;
      else process.env.DOCBOX_NO_LISTEN = prev.noListen;
      if (prev.toml === undefined) delete process.env.DOCBOX_TOML;
      else process.env.DOCBOX_TOML = prev.toml;
      if (prev.port === undefined) delete process.env.PORT;
      else process.env.PORT = prev.port;
      vi.resetModules();
    }
  });
});
