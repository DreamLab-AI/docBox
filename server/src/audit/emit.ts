// The audit PRODUCER (PRD-006). The receiver (ingest.ts) owns the hash chain and
// is write-only; this is the other half — the control plane records each mutating
// action by emitting a structured, identity-stamped event to that sidecar.
//
// Two transports behind one interface, chosen like getEngine() is:
//   * http  — POST each event to AUDIT_INGEST_URL; the sidecar chains and persists.
//   * local — no sidecar configured (offline/dev): append to an in-process chain
//             of the same shape, so a stand-alone box still forms a verifiable
//             trail and tests can read it back.
//
// Emission must never break the action it records: an audit transport failure is
// logged, not thrown. The action already happened; losing the record has to be
// visible in logs but must not turn a user's write into a 500.
import { appendEvent, GENESIS_HASH, type AuditEvent } from './chain.js';

export interface AuditEmitter {
  emit(event: AuditEvent): Promise<void>;
}

// ── Identity from the oauth2-proxy forward-auth headers ──────────────────────
// oauth2-proxy sets X-Auth-Request-User / -Email / -Groups on every proxied
// request (compose: OAUTH2_PROXY_SET_XAUTHREQUEST). We derive the acting owner
// from them; identity is never inferred from a request body's free text.
export interface RequestIdentity {
  ownerId: string;
  upn?: string;
  groups: string[];
}

/** The attribution tuple stamped on every event: who (owner), in which session,
 *  as which agent, for which action. Structurally identical to the engine's
 *  IdentityTuple, so the two interchange freely without coupling the audit build
 *  to the engine. */
export interface ActorTuple {
  ownerId: string;
  sessionId: string;
  agentId: string;
  actionId: string;
}

type HeaderGetter = (name: string) => string | undefined | null;

export function identityFromHeaders(get: HeaderGetter): RequestIdentity | undefined {
  const user = get('x-auth-request-user') || get('x-auth-request-preferred-username');
  const email = get('x-auth-request-email') || undefined;
  if (!user && !email) return undefined;
  const groups = (get('x-auth-request-groups') || '')
    .split(',')
    .map((g) => g.trim())
    .filter(Boolean);
  return { ownerId: (user || email) as string, upn: email || undefined, groups };
}

/** Build a full identity tuple for an action from the request owner plus the
 *  action's session/agent/action ids. An unauthenticated request records as
 *  `anonymous` rather than being dropped — an unattributed action is still a
 *  recorded action. */
export function tupleFor(
  owner: RequestIdentity | undefined,
  parts: { sessionId: string; agentId: string; actionId: string },
): ActorTuple {
  return { ownerId: owner?.ownerId ?? 'anonymous', ...parts };
}

/** A recordable event: a kind, a timestamp, the actor tuple, and free details. */
export function auditEvent(kind: string, actor: ActorTuple, details: Record<string, unknown> = {}): AuditEvent {
  return { kind, ts: Date.now(), actor, ...details };
}

// ── Transports ───────────────────────────────────────────────────────────────

interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body: string;
}
type FetchLike = (url: string, init: FetchInit) => Promise<{ ok: boolean; status: number }>;

/** POST each event to the ingest sidecar; it computes and persists the chain. */
export function createHttpEmitter(url: string, fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike): AuditEmitter {
  return {
    async emit(event) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
        });
        if (!res.ok) console.warn(`[docBox] audit emit rejected (${res.status}) by ${url}`);
      } catch (err) {
        console.warn(`[docBox] audit emit failed: ${String(err)}`);
      }
    },
  };
}

export interface LocalSink {
  prevHash: string;
  lines: string[];
}

/** Append to an in-process hash chain when no sidecar is configured. The sink is
 *  the same JSONL shape ingest writes, so verifyChain() checks it identically. */
export function createLocalEmitter(sink: LocalSink = { prevHash: GENESIS_HASH, lines: [] }): AuditEmitter & { sink: LocalSink } {
  return {
    sink,
    async emit(event) {
      const { line, hash } = appendEvent(sink.prevHash, event);
      sink.lines.push(line);
      sink.prevHash = hash;
    },
  };
}

// Module singleton chosen by env, mirroring getEngine(). Overridable for tests.
let emitter: AuditEmitter | undefined;

export function getAuditEmitter(): AuditEmitter {
  if (!emitter) {
    const url = process.env.AUDIT_INGEST_URL;
    emitter = url ? createHttpEmitter(url) : createLocalEmitter();
  }
  return emitter;
}

/** Replace the singleton (tests inject an inspectable local emitter; pass
 *  undefined to reset so the next getAuditEmitter() re-reads the environment). */
export function setAuditEmitter(e: AuditEmitter | undefined): void {
  emitter = e;
}
