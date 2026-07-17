// docBox control-plane server.
// Serves the domain world and a live event stream to the Foreman UI.
// The world comes from ONE source of truth — the app's mock module — so the
// server and the offline mock never drift. Swapping to a real datastore later
// means replacing the imports below; the routes and the UI stay put.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

// Single source of truth: the app's deterministic mock world.
import {
  owners, sessions, agents, elements, actions, configOptions,
  snapshots, beads, audit, vaults, documents, modules, systemStatus, NOW,
} from '../../app/src/data/mock.ts';
import type { ActionEvent, ActionKind } from '../../app/src/domain/types.ts';
import { getEngine, type IdentityTuple } from './engine/client';

const here = dirname(fileURLToPath(import.meta.url));
const TOML_PATH = process.env.DOCBOX_TOML ?? join(here, '../../docker/foreman.toml');
const APP_DIST = join(here, '../../app/dist');
const PORT = Number(process.env.PORT ?? 8787);

const app = new Hono();
// Restrict cross-origin access to a single known origin instead of reflecting
// any caller. Defaults to the Vite dev app origin so the dev proxy keeps working;
// a deployment sets DOCBOX_ALLOWED_ORIGIN to the real UI origin.
const ALLOWED_ORIGIN = process.env.DOCBOX_ALLOWED_ORIGIN ?? 'http://localhost:5173';
app.use('/api/*', cors({ origin: ALLOWED_ORIGIN }));

// ── World snapshot ─────────────────────────────────────────────────────────
// One call hydrates the whole UI. The adapter reads this at boot in live mode.
app.get('/api/world', (c) =>
  c.json({
    now: NOW,
    owners, sessions, agents, elements, actions,
    config: configOptions, snapshots, beads, audit, vaults, documents, modules,
    system: systemStatus,
    timeWindow: [Math.min(...actions.map((a) => a.ts)), Math.max(...actions.map((a) => a.ts), NOW)],
  }),
);

// ── Documents ────────────────────────────────────────────────────────────────
// List uploaded documents and accept new uploads. Upload records the document
// and queues OCR; the route (local vs a cloud provider) comes from config, so
// the per-feature privacy switch decides where the page image is processed.
app.get('/api/documents', (c) => c.json(documents));

app.post('/api/documents', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name : 'upload.bin';
  const route = (configOptions.find((o) => o.key === 'ocr.route')?.value as string) ?? 'local';
  // In this milestone the store is in-memory; a real deployment writes to the
  // project's user-data plane and the OCR service processes asynchronously.
  const doc = {
    id: `doc-${documents.length + 1}`, name,
    ownerId: (body.ownerId as string) ?? owners[0].id,
    project: (body.project as string) ?? 'project-aurora',
    sizeKb: Number(body.sizeKb) || 100, pages: Number(body.pages) || 1,
    mime: (body.mime as string) ?? 'application/pdf',
    uploadedAt: NOW, ocr: 'pending' as const,
    ocrRoute: route as 'local' | 'openai' | 'mistral' | 'gemini' | 'anthropic',
    handwriting: Boolean(body.handwriting),
  };
  documents.unshift(doc);
  return c.json({ ok: true, document: doc });
});

app.get('/api/health', (c) => c.json({ status: 'ok', stack: systemStatus.activeStack, ts: NOW }));

// ── Agent engine (PRD-003) ────────────────────────────────────────────────────
// The control plane drives the agent engine through one seam. By default a
// deterministic in-process mock answers so the plane works with no `pi` present;
// DOCBOX_ENGINE=live swaps in the pi RPC driver behind the same routes — the same
// mock/live pattern as the data adapter.
function asIdentity(v: unknown): IdentityTuple | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (
    typeof o.ownerId === 'string' && typeof o.sessionId === 'string' &&
    typeof o.agentId === 'string' && typeof o.actionId === 'string'
  ) {
    return { ownerId: o.ownerId, sessionId: o.sessionId, agentId: o.agentId, actionId: o.actionId };
  }
  return undefined;
}

app.get('/api/engine/health', async (c) => c.json(await getEngine().health()));

app.post('/api/engine/prompt', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  if (!prompt) return c.json({ ok: false, error: 'prompt is required' }, 400);
  const result = await getEngine().submitPrompt({
    sessionId: typeof body.sessionId === 'string' ? body.sessionId : `sess-${liveSeq}`,
    prompt,
    model: typeof body.model === 'string' ? body.model : undefined,
    // Identity is accepted from the orchestrator only in structured form; it is
    // never inferred from prompt text (PRD-003 / PRD-006).
    identity: asIdentity(body.identity),
  });
  return c.json(result);
});

// ── Configuration as TOML ────────────────────────────────────────────────────
// The TOML file is the source of truth (ADR-004). If it is not on disk yet,
// derive a starting document from the option defaults so the UI has something
// to show. Reads and writes are the seam the Configuration tab will use.
function configToToml(): string {
  const doc: Record<string, Record<string, unknown>> = {};
  for (const opt of configOptions) {
    const [head] = opt.key.split('.');
    (doc[head] ??= {})[opt.key.slice(head.length + 1)] = opt.value;
  }
  return stringifyToml(doc);
}

app.get('/api/config', (c) => {
  const toml = existsSync(TOML_PATH) ? readFileSync(TOML_PATH, 'utf8') : configToToml();
  return c.text(toml, 200, { 'content-type': 'text/plain; charset=utf-8' });
});

app.put('/api/config', async (c) => {
  const body = await c.req.text();
  try {
    parseToml(body); // reject malformed TOML before writing
  } catch (err) {
    return c.json({ ok: false, error: `invalid TOML: ${(err as Error).message}` }, 400);
  }
  // In this milestone the write is gated: live/session changes could persist,
  // but a rebuild-class change must go through the overhaul flow, not a raw write.
  if (process.env.DOCBOX_CONFIG_WRITABLE === '1') {
    writeFileSync(TOML_PATH, body, 'utf8');
    return c.json({ ok: true, persisted: TOML_PATH });
  }
  return c.json({ ok: true, persisted: false, note: 'read-only in this milestone; set DOCBOX_CONFIG_WRITABLE=1 to persist' });
});

// ── Live event stream (SSE) ──────────────────────────────────────────────────
// The visualiser and activity feed can subscribe to see new actions arrive.
// Here we replay plausible new events off the existing agents/elements so the
// UI has live motion without a backend. A real deployment emits from pi's hooks.
const RUNNING_AGENTS = agents.filter((a) => a.status === 'running');
const KINDS: ActionKind[] = ['tool_call', 'file_change', 'provision', 'gate_approval'];
let liveSeq = actions.length;

function nextLiveEvent(atMs: number): ActionEvent {
  // Deterministic-ish rotation so the stream is stable and cheap.
  const agent = RUNNING_AGENTS.length ? RUNNING_AGENTS[liveSeq % RUNNING_AGENTS.length] : agents[0];
  const el = elements[liveSeq % elements.length];
  const kind = KINDS[liveSeq % KINDS.length];
  liveSeq += 1;
  return {
    id: `live-${liveSeq}`, ts: atMs, kind,
    ownerId: agent.ownerId, agentId: agent.id, sessionId: agent.sessionId,
    elementId: el.id, label: `${kind === 'tool_call' ? 'Edit' : kind} ${el.path}`,
    status: 'ok', durationMs: kind === 'tool_call' ? 200 + (liveSeq % 800) : undefined,
  };
}

app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    let tick = 0;
    // Clock advances from NOW; the UI treats these as fresh arrivals.
    while (!stream.closed && tick < 10_000) {
      const at = NOW + tick * 4000;
      await stream.writeSSE({ event: 'action', data: JSON.stringify(nextLiveEvent(at)) });
      tick += 1;
      await stream.sleep(4000);
    }
  }),
);

// ── Static UI (production) ───────────────────────────────────────────────────
// In dev, Vite serves the app and proxies /api here. In a built image the
// server hosts the compiled UI so the container exposes one port.
if (existsSync(APP_DIST)) {
  app.use('/*', serveStatic({ root: APP_DIST }));
  app.get('/*', serveStatic({ path: join(APP_DIST, 'index.html') }));
}

// Export the app so tests can drive it via app.request() without binding a port.
export { app };

// Only bind a port when run directly, not when imported by a test.
if (process.env.DOCBOX_NO_LISTEN !== '1') {
  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`docBox control-plane server on http://127.0.0.1:${info.port}`);
    console.log(`  world:  GET  /api/world`);
    console.log(`  config: GET/PUT /api/config   (toml: ${TOML_PATH})`);
    console.log(`  events: GET  /api/events (SSE)`);
  });
}
