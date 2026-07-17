// The audit producer wired into the control plane: each mutating route emits an
// attributed, chain-verifiable event. An injected local emitter captures them so
// the wire is asserted without a running sidecar.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from './index';
import { setAuditEmitter, createLocalEmitter, type LocalSink } from './audit/emit';
import { verifyChain, GENESIS_HASH } from './audit/chain';

describe('control-plane emits audit events for mutating actions', () => {
  let sink: LocalSink;
  beforeEach(() => {
    sink = { prevHash: GENESIS_HASH, lines: [] };
    setAuditEmitter(createLocalEmitter(sink));
  });
  afterEach(() => setAuditEmitter(undefined));

  it('records a config write, attributed to the auth-header user', async () => {
    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'x-auth-request-user': 'dana', 'x-auth-request-email': 'dana@client.co' },
      body: 'valid = true',
    });
    expect(res.status).toBe(200);
    expect(sink.lines).toHaveLength(1);
    const rec = JSON.parse(sink.lines[0]);
    expect(rec.event.kind).toBe('config_write');
    expect(rec.event.actor.ownerId).toBe('dana');
    expect(rec.event.actor.agentId).toBe('foreman');
  });

  it('attributes to anonymous when no auth headers are present', async () => {
    await app.request('/api/config', { method: 'PUT', body: 'x = 1' });
    expect(JSON.parse(sink.lines[0]).event.actor.ownerId).toBe('anonymous');
  });

  it('does not record a rejected (malformed) config write', async () => {
    const res = await app.request('/api/config', { method: 'PUT', body: 'this is = = not toml' });
    expect(res.status).toBe(400);
    expect(sink.lines).toHaveLength(0);
  });

  it('records a prompt with the engine outcome and the acting owner', async () => {
    const res = await app.request('/api/engine/prompt', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'ravi' },
      body: JSON.stringify({ prompt: 'summarise the billing module' }),
    });
    expect(res.status).toBe(200);
    const rec = JSON.parse(sink.lines.at(-1)!);
    expect(rec.event.kind).toBe('prompt');
    expect(rec.event.actor.ownerId).toBe('ravi');
    expect(typeof rec.event.ok).toBe('boolean');
  });

  it('records a document upload', async () => {
    await app.request('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'lena' },
      body: JSON.stringify({ name: 'scan.pdf' }),
    });
    const rec = JSON.parse(sink.lines.at(-1)!);
    expect(rec.event.kind).toBe('document_upload');
    expect(rec.event.actor.ownerId).toBe('lena');
  });

  it('forms one verifiable chain across several actions', async () => {
    await app.request('/api/config', { method: 'PUT', body: 'a = 1' });
    await app.request('/api/documents', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x.pdf' }),
    });
    expect(sink.lines).toHaveLength(2);
    expect(verifyChain(sink.lines).ok).toBe(true);
  });
});
