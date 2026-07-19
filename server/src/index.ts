// docBox control-plane server.
// Serves the domain world and a live event stream to the Foreman UI.
// The world comes through ONE seam — getWorldStore() — with two impls behind it,
// chosen by DOCBOX_DATA: the seeded store (the app's mock module, the offline
// default, byte-identical to before the store existed) and the real JSON-file
// store (an initially empty datastore that a first provision brings to life).
// The routes and the UI stay put across the swap; only the seam knows which.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';

// The seeded world's static pieces the routes still reference directly: the
// config option schema (its values govern the OCR route and the derived TOML) and
// the seeded entities + demo clock the synthetic SSE tick invents events from.
// The world DATA now flows through the store seam below, not these imports.
import {
  agents, elements, actions, configOptions, NOW,
} from '../../app/src/data/mock.ts';
import type { ActionEvent, ActionKind, DocumentInfo } from '../../app/src/domain/types.ts';
import { getEngine, type IdentityTuple } from './engine/client';
import { getAuditEmitter, identityFromHeaders, tupleFor, auditEvent } from './audit/emit';
import { CORPUS_DOCUMENTS } from '../../app/src/data/corpus.ts';
import { getStore } from './corpus/store';
import { getGrounding } from './corpus/grounding';
import { getMesh } from './corpus/mesh';
import { getWorldStore } from './world/store';

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
// The store carries dataSource ('seeded' by default, 'real' behind DOCBOX_DATA)
// so the UI's live strip stays honest — a green 'live' badge over seeded data
// reads as seeded — and a fresh real world reports a finite [now, now] window
// even with no actions yet.
app.get('/api/world', (c) => c.json(getWorldStore().world()));

// ── Documents ────────────────────────────────────────────────────────────────
// List uploaded documents and accept new uploads. Upload records the document
// and queues OCR; the route (local vs a cloud provider) comes from config, so
// the per-feature privacy switch decides where the page image is processed.
app.get('/api/documents', (c) => c.json(getWorldStore().documents()));

app.post('/api/documents', async (c) => {
  const store = getWorldStore();
  const body = await c.req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name : 'upload.bin';
  const route = (configOptions.find((o) => o.key === 'ocr.route')?.value as string) ?? 'local';
  // The default owner/id/clock come from the store, not the seeded arrays, so an
  // upload to a real (empty) box attributes to the box's owner (or anonymous) and
  // ids stay unique per store. A real deployment writes the page to the project's
  // user-data plane and the OCR service processes it asynchronously.
  const existing = store.documents();
  const doc: DocumentInfo = {
    id: `doc-${existing.length + 1}`, name,
    ownerId: (body.ownerId as string) ?? store.world().owners[0]?.id ?? 'anonymous',
    project: (body.project as string) ?? 'project-aurora',
    sizeKb: Number(body.sizeKb) || 100, pages: Number(body.pages) || 1,
    mime: (body.mime as string) ?? 'application/pdf',
    uploadedAt: store.world().now, ocr: 'pending' as const,
    ocrRoute: route as DocumentInfo['ocrRoute'],
    handwriting: Boolean(body.handwriting),
  };
  store.addDocument(doc);
  const uploader = identityFromHeaders((n) => c.req.header(n));
  await getAuditEmitter().emit(auditEvent('document_upload',
    tupleFor(uploader, { sessionId: 'control-plane', agentId: 'foreman', actionId: doc.id }),
    { name: doc.name, project: doc.project, route: doc.ocrRoute }));
  return c.json({ ok: true, document: doc });
});

// ── Provision a first project ─────────────────────────────────────────────────
// The "initialise a new live project" action, the moment a real box stops being
// empty and the demo world is gone for good. Acting identity comes from the
// oauth2-proxy forward-auth headers (never the body): if the box has no owner
// with that id yet, the first provision creates the first owner. The store creates
// a locked vault for the project, a session for the provisioning act and a
// 'provision' action attributed to the acting owner, then returns a fresh world so
// the UI hydrates without a second fetch. 400 on a missing/invalid name; 409 if
// the project already exists.
app.post('/api/provision', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const project = typeof body.project === 'string' ? body.project : '';
  const vault = body.vault !== false; // default: create the project's vault
  const identity = identityFromHeaders((n) => c.req.header(n));
  const result = getWorldStore().provision({ project, vault, identity });
  if (!result.ok) return c.json({ ok: false, error: result.error }, result.status);
  // Attributed + audited: one 'provision' event, actor from the headers, session
  // and action ids from the records the store just created.
  await getAuditEmitter().emit(auditEvent('provision',
    tupleFor(identity, { sessionId: result.sessionId, agentId: 'foreman', actionId: result.action.id }),
    { project: result.action.label.replace(/^Provision /, ''), vault, ownerId: result.owner.id }));
  return c.json({ ok: true, world: result.world });
});

app.get('/api/health', (c) => {
  // Health reads the active store, not the mock module: in real mode the stack
  // and clock are the live values, in seeded mode they are the demo ones.
  const w = getWorldStore().world();
  return c.json({ status: 'ok', stack: w.system.activeStack, ts: w.now });
});

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
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : `sess-${liveSeq}`;
  // Identity is accepted from the orchestrator in structured form (never inferred
  // from prompt text); a user-initiated prompt is attributed from the auth headers.
  const owner = identityFromHeaders((n) => c.req.header(n));
  const identity = asIdentity(body.identity)
    ?? tupleFor(owner, { sessionId, agentId: 'foreman', actionId: `prompt-${sessionId}` });
  const result = await getEngine().submitPrompt({
    sessionId, prompt,
    model: typeof body.model === 'string' ? body.model : undefined,
    identity,
  });
  // Fold the trajectory into the world (real mode only, via the store's own
  // no-op): consequential tool steps become attributed actions the live
  // /api/events stream carries into Foreman's Activity. Seeded mode returns [].
  getWorldStore().recordEngineTurn({ sessionId, identity, prompt, events: result.events });
  await getAuditEmitter().emit(auditEvent('prompt', identity,
    { sessionId, ok: result.ok, chars: result.text.length }));
  return c.json(result);
});

// ── Clinical corpus (doctorBox demonstrator: PRD-010 grounding, PRD-011 mesh) ─
// The corpus seams mirror the engine seam: deterministic mocks by default, live
// implementations behind env switches. The store seeds lazily from the synthetic
// corpus on first touch, so the demo works offline with no ingestion step.
async function ensureCorpus() {
  const store = getStore();
  if (!store.getRecord()) {
    store.putDocuments(CORPUS_DOCUMENTS);
    store.putRecord(await getGrounding().ground(CORPUS_DOCUMENTS));
  }
  return store;
}

app.get('/api/corpus/documents', async (c) => c.json((await ensureCorpus()).getDocuments()));

app.get('/api/corpus/record', async (c) => c.json((await ensureCorpus()).getRecord()));

app.post('/api/corpus/ask', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question) return c.json({ ok: false, error: 'question is required' }, 400);
  const store = await ensureCorpus();
  const record = store.getRecord()!;
  // A Question and its CitedAnswer are one ReadingSession — the query-time unit
  // of audit (DDD-004): both events attribute to the asking owner.
  const owner = identityFromHeaders((n) => c.req.header(n));
  const asked = tupleFor(owner, { sessionId: 'clinician', agentId: 'reading-mesh', actionId: 'question' });
  await getAuditEmitter().emit(auditEvent('question_asked', asked, { chars: question.length }));
  const session = await getMesh().ask(question, asked.ownerId, record, store);
  await getAuditEmitter().emit(auditEvent('answer_cited',
    { ...asked, actionId: session.id },
    { sentences: session.answer.sentences.length, gaps: session.answer.gaps.length }));
  return c.json({ ok: true, session });
});

// ── Companion chat (ADR-007, ADR-005) ────────────────────────────────────────
// The primary user's chat: a thin relay onto the same engine seam as
// /api/engine/prompt, shaped for the Companion's Chat view. Attribution comes
// from the auth headers (the primary user), never the body; the turn is folded
// into the world and audited exactly once, regardless of transport.
//
// Two transports, chosen by the Accept header — the engine call, recordEngineTurn
// and the audit event all fire once BEFORE the transport branch:
//   * Accept: text/event-stream — stream the trajectory as SSE data frames the
//     Companion's chatView renders (each agent_message a delta), closed by the
//     [DONE] sentinel its pipeStream reader expects (ADR-005, PRD-003).
//   * otherwise (curl, tests) — the unchanged single JSON body { ok, reply }.
app.post('/api/chat', async (c) => {
  const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return c.json({ ok: false, error: 'prompt is required' }, 400);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : 'companion';
  const owner = identityFromHeaders((n) => c.req.header(n));
  const identity = tupleFor(owner, { sessionId, agentId: 'companion-chat', actionId: `chat-${sessionId}` });
  const result = await getEngine().submitPrompt({ sessionId, prompt, identity });
  // Record + audit fire exactly once, before the transport branches below.
  getWorldStore().recordEngineTurn({ sessionId, identity, prompt, events: result.events });
  await getAuditEmitter().emit(auditEvent('prompt', identity,
    { sessionId, surface: 'companion', ok: result.ok, chars: result.text.length }));

  const accept = c.req.header('accept') ?? '';
  if (accept.includes('text/event-stream')) {
    return streamSSE(c, async (stream) => {
      // Emit the trajectory in order as data frames the view appends verbatim:
      // each assistant message is one delta. The mock joins these into its reply,
      // so the streamed turn reads as the reply built incrementally. Close with
      // the [DONE] sentinel chatView's pipeStream stops on.
      for (const e of result.events) {
        if (e.kind === 'agent_message' && e.text) {
          await stream.writeSSE({ data: e.text });
        }
      }
      await stream.writeSSE({ data: '[DONE]' });
    });
  }
  return c.json({ ok: result.ok, reply: result.text });
});

// ── Chat bubble (M7, embeddable widget) ──────────────────────────────────────
// The control plane serves a dependency-free chat-bubble widget and its demo
// page from server/public (the assets ship separately). Both are same-origin
// static reads: an external dashboard that embeds bubble.js sets
// DOCBOX_ALLOWED_ORIGIN so its /api/chat POSTs pass the /api/* CORS above; the
// demo page here is same-origin so it needs no CORS change. The public dir is
// resolved at request time (DOCBOX_PUBLIC_DIR overrides the default) and read
// fresh from disk, 404 with a plain message when an asset is absent.
function publicDir(): string {
  return process.env.DOCBOX_PUBLIC_DIR ?? join(here, '../public');
}

app.get('/bubble', (c) => {
  const file = join(publicDir(), 'bubble.html');
  if (!existsSync(file)) return c.text('bubble.html not found', 404);
  return c.body(readFileSync(file, 'utf8'), 200, { 'content-type': 'text/html; charset=utf-8' });
});

app.get('/bubble.js', (c) => {
  const file = join(publicDir(), 'bubble.js');
  if (!existsSync(file)) return c.text('bubble.js not found', 404);
  return c.body(readFileSync(file, 'utf8'), 200, { 'content-type': 'text/javascript; charset=utf-8' });
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
  const persisted = process.env.DOCBOX_CONFIG_WRITABLE === '1';
  if (persisted) writeFileSync(TOML_PATH, body, 'utf8');
  // A config change is auditable whether or not it persisted in this milestone —
  // the intent and the actor are recorded either way.
  const owner = identityFromHeaders((n) => c.req.header(n));
  await getAuditEmitter().emit(auditEvent('config_write',
    tupleFor(owner, { sessionId: 'control-plane', agentId: 'foreman', actionId: 'config' }),
    { persisted, bytes: body.length }));
  if (persisted) return c.json({ ok: true, persisted: TOML_PATH });
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
    const store = getWorldStore();
    if (store.dataSource === 'seeded') {
      // Seeded: the synthetic tick gives the demo UI live motion off the mock
      // world, exactly as before the store existed.
      let tick = 0;
      // Clock advances from NOW; the UI treats these as fresh arrivals.
      while (!stream.closed && tick < 10_000) {
        const at = NOW + tick * 4000;
        await stream.writeSSE({ event: 'action', data: JSON.stringify(nextLiveEvent(at)) });
        tick += 1;
        await stream.sleep(4000);
      }
      return;
    }
    // Real: NEVER fabricate. Stream only genuinely appended actions (a provision,
    // an upload). Baseline is the action count at connect, so history is not
    // replayed; new actions are polled by index and emitted as they land.
    let sent = store.world().actions.length;
    while (!stream.closed) {
      const current = store.world().actions;
      while (sent < current.length) {
        await stream.writeSSE({ event: 'action', data: JSON.stringify(current[sent]) });
        sent += 1;
      }
      await stream.sleep(1000);
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
