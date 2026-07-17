import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  identityFromHeaders, tupleFor, auditEvent,
  createHttpEmitter, createLocalEmitter, getAuditEmitter, setAuditEmitter,
} from './emit';
import { verifyChain } from './chain';

const headers = (m: Record<string, string>) => (n: string) => m[n];

describe('identityFromHeaders (oauth2-proxy forward-auth)', () => {
  it('reads user, email and groups', () => {
    const id = identityFromHeaders(headers({
      'x-auth-request-user': 'dana',
      'x-auth-request-email': 'dana@client.co',
      'x-auth-request-groups': 'Sandbox.Admin, Sandbox.User',
    }));
    expect(id).toEqual({ ownerId: 'dana', upn: 'dana@client.co', groups: ['Sandbox.Admin', 'Sandbox.User'] });
  });

  it('falls back to preferred-username, then email, for the owner id', () => {
    expect(identityFromHeaders(headers({ 'x-auth-request-preferred-username': 'ravi' }))?.ownerId).toBe('ravi');
    expect(identityFromHeaders(headers({ 'x-auth-request-email': 'lena@client.co' }))?.ownerId).toBe('lena@client.co');
  });

  it('returns undefined when no auth headers are present', () => {
    expect(identityFromHeaders(() => undefined)).toBeUndefined();
  });
});

describe('tupleFor / auditEvent', () => {
  it('attributes to the owner, or anonymous when unauthenticated', () => {
    expect(tupleFor({ ownerId: 'dana', groups: [] }, { sessionId: 's', agentId: 'foreman', actionId: 'a' }).ownerId).toBe('dana');
    expect(tupleFor(undefined, { sessionId: 's', agentId: 'foreman', actionId: 'a' }).ownerId).toBe('anonymous');
  });

  it('builds an event with a kind, actor and free details', () => {
    const actor = tupleFor(undefined, { sessionId: 's', agentId: 'foreman', actionId: 'a' });
    const e = auditEvent('config_write', actor, { persisted: false });
    expect(e.kind).toBe('config_write');
    expect(e.actor).toEqual(actor);
    expect(e.persisted).toBe(false);
    expect(typeof e.ts).toBe('number');
  });
});

describe('createLocalEmitter (offline chain)', () => {
  it('appends a verifiable hash chain across events', async () => {
    const em = createLocalEmitter();
    await em.emit(auditEvent('a', tupleFor(undefined, { sessionId: 's', agentId: 'f', actionId: '1' })));
    await em.emit(auditEvent('b', tupleFor(undefined, { sessionId: 's', agentId: 'f', actionId: '2' })));
    expect(em.sink.lines).toHaveLength(2);
    expect(verifyChain(em.sink.lines).ok).toBe(true);
  });
});

describe('createHttpEmitter (sidecar transport)', () => {
  it('POSTs the event as JSON to the ingest url', async () => {
    const calls: { url: string; body: string }[] = [];
    const em = createHttpEmitter('http://audit/v1/events', async (url, init) => {
      calls.push({ url, body: init.body });
      return { ok: true, status: 200 };
    });
    await em.emit(auditEvent('x', tupleFor(undefined, { sessionId: 's', agentId: 'f', actionId: '1' })));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://audit/v1/events');
    expect(JSON.parse(calls[0].body).kind).toBe('x');
  });

  it('never throws into the caller when the sidecar rejects or is unreachable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rejecting = createHttpEmitter('http://audit/v1/events', async () => ({ ok: false, status: 503 }));
    const throwing = createHttpEmitter('http://audit/v1/events', async () => { throw new Error('ECONNREFUSED'); });
    const ev = auditEvent('x', tupleFor(undefined, { sessionId: 's', agentId: 'f', actionId: '1' }));
    await expect(rejecting.emit(ev)).resolves.toBeUndefined();
    await expect(throwing.emit(ev)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('getAuditEmitter (env-selected singleton)', () => {
  const saved = process.env.AUDIT_INGEST_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.AUDIT_INGEST_URL;
    else process.env.AUDIT_INGEST_URL = saved;
    setAuditEmitter(undefined);
  });

  it('uses a local emitter when AUDIT_INGEST_URL is unset', () => {
    delete process.env.AUDIT_INGEST_URL;
    setAuditEmitter(undefined);
    expect((getAuditEmitter() as { sink?: unknown }).sink).toBeDefined();
  });

  it('uses an http emitter when AUDIT_INGEST_URL is set', () => {
    process.env.AUDIT_INGEST_URL = 'http://audit/v1/events';
    setAuditEmitter(undefined);
    expect((getAuditEmitter() as { sink?: unknown }).sink).toBeUndefined();
  });

  it('caches the singleton until reset', () => {
    setAuditEmitter(undefined);
    expect(getAuditEmitter()).toBe(getAuditEmitter());
  });
});
