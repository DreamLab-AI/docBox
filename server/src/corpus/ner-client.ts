// HTTP client to the Python NER sidecar, built like the audit emitter
// (audit/emit.ts createHttpEmitter): the transport (fetch) is injected so the
// client is exercised offline, and a failure NEVER throws into the caller. A
// grounding step must not crash because the sidecar is down, slow, or returns
// nonsense — on any transport or shape error it warns and resolves to [], and
// extraction simply proceeds with no entities from that document.
export interface NerEntity {
  text: string;
  label: string;
  start: number;
  end: number;
  score: number;
}

export interface NerClient {
  annotate(text: string): Promise<NerEntity[]>;
}

interface NerResponseLike {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<NerResponseLike>;

/** Coerce the sidecar payload into typed entities, dropping anything malformed.
 *  Accepts `{ entities: [...] }` or a bare array, so a partial response yields the
 *  good rows rather than throwing. Exported for direct testing. */
export function parseNerEntities(data: unknown): NerEntity[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { entities?: unknown } | null)?.entities)
      ? (data as { entities: unknown[] }).entities
      : [];
  const out: NerEntity[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== 'string' || typeof r.label !== 'string') continue;
    if (typeof r.start !== 'number' || typeof r.end !== 'number') continue;
    out.push({
      text: r.text,
      label: r.label,
      start: r.start,
      end: r.end,
      score: typeof r.score === 'number' ? r.score : 1,
    });
  }
  return out;
}

/** Build a client that POSTs `{ text }` to the sidecar and returns its entities.
 *  fetch is injectable (default globalThis.fetch) exactly like createHttpEmitter. */
export function createNerClient(
  url: string,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): NerClient {
  return {
    async annotate(text) {
      try {
        const res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          console.warn(`[docBox] NER sidecar rejected (${res.status}) at ${url}`);
          return [];
        }
        return parseNerEntities(await res.json());
      } catch (err) {
        console.warn(`[docBox] NER sidecar call failed: ${String(err)}`);
        return [];
      }
    },
  };
}
