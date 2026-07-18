// NER client suite: payload coercion (pure) and the never-throw HTTP path
// (injected fetch), mirroring audit/emit.ts createHttpEmitter's error discipline.
import { describe, it, expect, vi } from 'vitest';
import { createNerClient, parseNerEntities, type NerEntity } from './ner-client';

const OK = (data: unknown) => ({ ok: true, status: 200, json: async () => data });

describe('parseNerEntities', () => {
  it('accepts an { entities: [...] } envelope and defaults a missing score', () => {
    const out = parseNerEntities({ entities: [{ text: 'amlodipine', label: 'MEDICATION', start: 0, end: 10 }] });
    expect(out).toEqual([{ text: 'amlodipine', label: 'MEDICATION', start: 0, end: 10, score: 1 }]);
  });

  it('accepts a bare array and keeps a provided score', () => {
    const out = parseNerEntities([{ text: 'K', label: 'LAB', start: 2, end: 3, score: 0.8 }]);
    expect(out).toEqual([{ text: 'K', label: 'LAB', start: 2, end: 3, score: 0.8 }]);
  });

  it('drops malformed rows and non-array payloads', () => {
    const out = parseNerEntities({
      entities: [
        null,
        'not-an-object',
        { text: 'ok', label: 'MEDICATION', start: 0, end: 2, score: 0.5 },
        { text: 'no-offsets', label: 'MEDICATION' }, // missing start/end
        { label: 'MEDICATION', start: 0, end: 1 }, // missing text
      ],
    });
    expect(out).toEqual([{ text: 'ok', label: 'MEDICATION', start: 0, end: 2, score: 0.5 }]);
    expect(parseNerEntities({ nope: true })).toEqual([]);
    expect(parseNerEntities(null)).toEqual([]);
  });
});

describe('createNerClient.annotate', () => {
  it('POSTs the text and returns parsed entities on success', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string }) => {
      expect(JSON.parse(init.body)).toEqual({ text: 'hello' });
      return OK({ entities: [{ text: 'hello', label: 'MEDICATION', start: 0, end: 5, score: 0.9 }] });
    });
    const client = createNerClient('http://ner', fetchImpl);
    const entities = await client.annotate('hello');
    expect(entities).toEqual<NerEntity[]>([{ text: 'hello', label: 'MEDICATION', start: 0, end: 5, score: 0.9 }]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('resolves [] and warns on a non-ok response (never throws)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createNerClient('http://ner', async () => ({ ok: false, status: 503, json: async () => ({}) }));
    expect(await client.annotate('x')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('503'));
    warn.mockRestore();
  });

  it('resolves [] and warns when the transport rejects (never throws)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = createNerClient('http://ner', async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(await client.annotate('x')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('failed'));
    warn.mockRestore();
  });
});
