// The live engine: drive `pi` (MIT, earendil-works) over its RPC mode —
// newline-delimited JSON over stdio (PRD-003). We write one JSON request line
// to the engine's stdin and read newline-JSON responses back off its stdout,
// mapping each response to the shared EngineEvent model. The framing/parsing is
// factored into pure functions so it is tested without a live process; the
// process boundary itself is injectable (the `spawn` seam), so the driver is
// exercised end-to-end against an in-memory stand-in as well.
//
// `pi` is not present in this dev box, and that is fine: the engine is a host
// runtime concern. Constructing this driver never spawns — the subprocess is
// created lazily on first use — so choosing it offline is safe.
import { spawn as nodeSpawn } from 'node:child_process';
import type {
  EngineClient, EngineEvent, EngineEventKind, EngineHealth, IdentityTuple, PromptRequest, PromptResult,
} from './client';

// ── RPC wire types ───────────────────────────────────────────────────────────

/** One request line written to the engine's stdin. The verbs mirror pi's RPC
 *  drive surface: prompt / steer / follow-up / abort / model-switch / compact /
 *  fork, plus a health probe. */
export interface EngineRpcRequest {
  id: number;
  method: 'prompt' | 'steer' | 'followUp' | 'abort' | 'switchModel' | 'compact' | 'fork' | 'health';
  params: Record<string, unknown>;
}

/** One response line read off the engine's stdout. Streaming events and the
 *  terminal result all carry the originating request `id` so the driver can
 *  route them to the right caller. */
export interface EngineRpcResponse {
  id?: number;
  type: 'ack' | 'event' | 'result' | 'error';
  event?: {
    kind: string;
    text?: string;
    tool?: string;
    args?: unknown;
    status?: string;
    ts?: number;
    seq?: number;
  };
  result?: unknown;
  error?: string;
}

// ── Pure framing / parsing (unit-tested in isolation) ────────────────────────

/** Encode a request as exactly one newline-terminated JSON line. */
export function encodeRpcLine(req: EngineRpcRequest): string {
  return JSON.stringify(req) + '\n';
}

/** Build the prompt request. Identity is forwarded so pi's hooks stamp it onto
 *  tool calls; it originates from the spawner's environment, not the prompt. */
export function promptToRpc(req: PromptRequest, id: number): EngineRpcRequest {
  return {
    id,
    method: 'prompt',
    params: {
      sessionId: req.sessionId,
      prompt: req.prompt,
      model: req.model,
      identity: req.identity,
    },
  };
}

export interface NdjsonParser {
  /** Feed a chunk (possibly a partial line); return whatever complete lines it
   *  completed. A line split across chunks is buffered until its newline. */
  push(chunk: string | Buffer): EngineRpcResponse[];
  /** Emit any trailing buffered line that had no closing newline. */
  flush(): EngineRpcResponse[];
}

function tryParse(line: string): EngineRpcResponse | null {
  try {
    return JSON.parse(line) as EngineRpcResponse;
  } catch {
    return null; // a malformed line is dropped, never allowed to derail the stream
  }
}

/** A stateful newline-delimited-JSON decoder. Handles multiple lines per chunk,
 *  a single line split across chunks, blank lines, and a trailing partial line. */
export function createNdjsonParser(): NdjsonParser {
  let buf = '';
  const drain = (final: boolean): EngineRpcResponse[] => {
    const out: EngineRpcResponse[] = [];
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        const parsed = tryParse(line);
        if (parsed) out.push(parsed);
      }
    }
    if (final && buf.trim()) {
      const parsed = tryParse(buf.trim());
      if (parsed) out.push(parsed);
      buf = '';
    }
    return out;
  };
  return {
    push(chunk) {
      buf += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      return drain(false);
    },
    flush() {
      return drain(true);
    },
  };
}

const EVENT_KINDS: EngineEventKind[] = [
  'session_start', 'agent_message', 'tool_call', 'tool_result', 'session_end', 'error',
];

/** Map an RPC event response to a shared EngineEvent, stamping identity from the
 *  routing context. Returns null for anything that is not an event. */
export function rpcResponseToEvent(
  resp: EngineRpcResponse,
  ctx: { sessionId: string; seq: number; identity?: IdentityTuple },
): EngineEvent | null {
  if (resp.type !== 'event' || !resp.event) return null;
  const kind: EngineEventKind = (EVENT_KINDS as string[]).includes(resp.event.kind)
    ? (resp.event.kind as EngineEventKind)
    : 'agent_message';
  const seq = resp.event.seq ?? ctx.seq;
  const e: EngineEvent = {
    kind,
    sessionId: ctx.sessionId,
    seq,
    ts: resp.event.ts ?? 0,
    text: resp.event.text,
    tool: resp.event.tool,
    args: resp.event.args,
    status: resp.event.status as EngineEvent['status'] | undefined,
  };
  if (ctx.identity) e.identity = { ...ctx.identity, actionId: `${ctx.identity.actionId}.${seq}` };
  return e;
}

// ── Process boundary (injectable so the driver is testable offline) ──────────

interface WritableLike {
  write(chunk: string): unknown;
}
interface ReadableLike {
  on(ev: 'data', cb: (c: string | Buffer) => void): void;
  setEncoding?(enc: string): void;
}
export interface ChildLike {
  stdin: WritableLike;
  stdout: ReadableLike;
  stderr?: ReadableLike;
  on(ev: 'exit' | 'error' | 'close', cb: (...a: unknown[]) => void): void;
  kill(): void;
  killed?: boolean;
}
export type SpawnFn = (cmd: string, args: string[]) => ChildLike;

const defaultSpawn: SpawnFn = (cmd, args) =>
  nodeSpawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] }) as unknown as ChildLike;

export interface PiEngineOptions {
  bin?: string;
  args?: string[];
  model?: string;
  spawn?: SpawnFn;
}

// A minimal async queue: producers push() events as RPC responses arrive; the
// consumer iterates. end() closes it so the async iterator completes.
class EventQueue {
  private items: EngineEvent[] = [];
  private waiters: ((r: IteratorResult<EngineEvent>) => void)[] = [];
  private ended = false;
  push(e: EngineEvent): void {
    const w = this.waiters.shift();
    if (w) w({ value: e, done: false });
    else this.items.push(e);
  }
  end(): void {
    this.ended = true;
    let w: ((r: IteratorResult<EngineEvent>) => void) | undefined;
    while ((w = this.waiters.shift())) w({ value: undefined as unknown as EngineEvent, done: true });
  }
  async *iterate(): AsyncGenerator<EngineEvent> {
    for (;;) {
      if (this.items.length) {
        yield this.items.shift()!;
        continue;
      }
      if (this.ended) return;
      const r = await new Promise<IteratorResult<EngineEvent>>((res) => this.waiters.push(res));
      if (r.done) return;
      yield r.value;
    }
  }
}

interface Pending {
  sessionId: string;
  identity?: IdentityTuple;
  seq: number;
  queue?: EventQueue; // set for streaming prompts
  resolve?: (v: unknown) => void; // set for request/result calls (health)
  reject?: (e: Error) => void;
}

/** The live pi driver. One long-lived subprocess, request ids correlate the
 *  streaming responses back to each caller. */
export class PiEngine implements EngineClient {
  readonly kind = 'pi' as const;
  private bin: string;
  private args: string[];
  private model: string;
  private spawnFn: SpawnFn;
  private proc?: ChildLike;
  private parser = createNdjsonParser();
  private pending = new Map<number, Pending>();
  private seq = 0;

  constructor(opts: PiEngineOptions = {}) {
    this.bin = opts.bin ?? process.env.DOCBOX_PI_BIN ?? 'pi';
    this.args = opts.args
      ?? (process.env.DOCBOX_PI_ARGS ? process.env.DOCBOX_PI_ARGS.split(' ').filter(Boolean) : ['--rpc']);
    this.model = opts.model ?? process.env.DOCBOX_PI_MODEL ?? 'claude-sonnet';
    this.spawnFn = opts.spawn ?? defaultSpawn;
  }

  private ensureProc(): ChildLike {
    if (this.proc && !this.proc.killed) return this.proc;
    const proc = this.spawnFn(this.bin, this.args);
    proc.stdout.setEncoding?.('utf8');
    proc.stdout.on('data', (c) => this.onData(c));
    proc.stderr?.on('data', () => {
      /* engine stderr is drained, never fed back to the agent (no injection surface) */
    });
    proc.on('exit', () => this.onClose('engine process exited'));
    proc.on('error', (e) => this.onClose(`engine process error: ${String(e)}`));
    this.proc = proc;
    return proc;
  }

  private onData(chunk: string | Buffer): void {
    for (const resp of this.parser.push(chunk)) this.route(resp);
  }

  private route(resp: EngineRpcResponse): void {
    if (resp.id == null) return;
    const p = this.pending.get(resp.id);
    if (!p) return;
    if (resp.type === 'event') {
      const ev = rpcResponseToEvent(resp, { sessionId: p.sessionId, seq: p.seq, identity: p.identity });
      if (ev) {
        p.seq += 1;
        p.queue?.push(ev);
      }
      return;
    }
    if (resp.type === 'result') {
      p.queue?.end();
      p.resolve?.(resp.result);
      this.pending.delete(resp.id);
      return;
    }
    if (resp.type === 'error') {
      if (p.queue) {
        p.queue.push({
          kind: 'error', sessionId: p.sessionId, seq: p.seq, ts: 0,
          text: resp.error, status: 'failed', identity: p.identity,
        });
        p.queue.end();
      }
      p.reject?.(new Error(resp.error ?? 'engine error'));
      this.pending.delete(resp.id);
    }
    // 'ack' carries no payload the caller needs; ignore.
  }

  private onClose(reason: string): void {
    this.proc = undefined;
    for (const [id, p] of this.pending) {
      if (p.queue) {
        p.queue.push({ kind: 'error', sessionId: p.sessionId, seq: p.seq, ts: 0, text: reason, status: 'failed' });
        p.queue.end();
      }
      p.reject?.(new Error(reason));
      this.pending.delete(id);
    }
  }

  async *streamEvents(req: PromptRequest): AsyncIterable<EngineEvent> {
    const proc = this.ensureProc();
    const id = ++this.seq;
    const queue = new EventQueue();
    this.pending.set(id, { sessionId: req.sessionId, identity: req.identity, seq: 0, queue });
    proc.stdin.write(encodeRpcLine(promptToRpc(req, id)));
    try {
      for await (const e of queue.iterate()) yield e;
    } finally {
      this.pending.delete(id);
    }
  }

  async submitPrompt(req: PromptRequest): Promise<PromptResult> {
    const events: EngineEvent[] = [];
    let text = '';
    for await (const e of this.streamEvents(req)) {
      events.push(e);
      if (e.kind === 'agent_message' && e.text) text += (text ? ' ' : '') + e.text;
    }
    const ok = !events.some((e) => e.kind === 'error');
    return { sessionId: req.sessionId, ok, text, events };
  }

  async health(): Promise<EngineHealth> {
    const proc = this.ensureProc();
    const id = ++this.seq;
    const result = await new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { sessionId: '', seq: 0, resolve, reject });
      proc.stdin.write(encodeRpcLine({ id, method: 'health', params: {} }));
    });
    const model = (result as { model?: string } | undefined)?.model ?? this.model;
    return { engine: 'pi', ready: true, model, protocol: 'rpc-jsonl' };
  }

  /** Stop the subprocess. The audit and identity state lives outside it, so a
   *  restart resumes cleanly. */
  close(): void {
    if (this.proc && !this.proc.killed) this.proc.kill();
    this.proc = undefined;
  }
}

export function createPiEngine(opts?: PiEngineOptions): EngineClient {
  return new PiEngine(opts);
}
