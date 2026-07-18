// The clinical corpus wired into the control plane: the record serves from the
// seeded synthetic corpus, a Question returns a fully-cited ReadingSession, and
// both halves of the exchange land in the audit chain, attributed to the asker.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from './index';
import { setAuditEmitter, createLocalEmitter, type LocalSink } from './audit/emit';
import { verifyChain, GENESIS_HASH } from './audit/chain';
import { setStore } from './corpus/store';
import { CORPUS_DOCUMENTS } from '../../app/src/data/corpus.ts';

describe('control-plane corpus routes (PRD-010/011)', () => {
  let sink: LocalSink;
  beforeEach(() => {
    sink = { prevHash: GENESIS_HASH, lines: [] };
    setAuditEmitter(createLocalEmitter(sink));
    setStore(undefined); // fresh store, re-seeded lazily per test
  });
  afterEach(() => {
    setAuditEmitter(undefined);
    setStore(undefined);
  });

  it('serves the seeded documents and the grounded record', async () => {
    const docs = await (await app.request('/api/corpus/documents')).json();
    expect(docs).toHaveLength(CORPUS_DOCUMENTS.length);
    const record = await (await app.request('/api/corpus/record')).json();
    expect(record.claims.length).toBeGreaterThan(0);
    expect(record.contradictions.length).toBeGreaterThan(0);
  });

  it('answers a medications Question with the worked, fully-cited session', async () => {
    const res = await app.request('/api/corpus/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'dr-shah' },
      body: JSON.stringify({ question: 'What is this patient taking, and since when?' }),
    });
    expect(res.status).toBe(200);
    const { ok, session } = await res.json();
    expect(ok).toBe(true);
    for (const s of session.answer.sentences) {
      expect(s.evidence.length).toBeGreaterThanOrEqual(1);
    }
    expect(session.answer.sentences.some((s: { contradictionId?: string }) => s.contradictionId)).toBe(true);
  });

  it('audits the exchange as question_asked then answer_cited, chain-verifiable', async () => {
    await app.request('/api/corpus/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-auth-request-user': 'dr-shah' },
      body: JSON.stringify({ question: 'What is she taking?' }),
    });
    const kinds = sink.lines.map((l) => JSON.parse(l).event.kind);
    expect(kinds).toEqual(['question_asked', 'answer_cited']);
    const cited = JSON.parse(sink.lines[1]).event;
    expect(cited.actor.ownerId).toBe('dr-shah');
    expect(cited.sentences).toBeGreaterThan(0);
    expect(verifyChain(sink.lines).ok).toBe(true);
  });

  it('rejects an empty Question and records nothing', async () => {
    const res = await app.request('/api/corpus/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect(sink.lines).toHaveLength(0);
  });
});
