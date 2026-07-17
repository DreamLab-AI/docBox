import { describe, it, expect } from 'vitest';
import { verifyChain, GENESIS_HASH, type ChainResult } from './chain';
import { audit } from '../../test/world';

// A well-formed chain: rec[0].prevHash = GENESIS, each subsequent prevHash = the
// previous record's hash. Factory default hash is `h{seq}`.
function goodChain(n: number) {
  return Array.from({ length: n }, (_, i) =>
    audit({ seq: i + 1, hash: `h${i + 1}`, prevHash: i === 0 ? GENESIS_HASH : `h${i}`, ts: (i + 1) * 100 }),
  );
}

describe('verifyChain', () => {
  it('passes a valid multi-record chain and reports the exact shape', () => {
    const r = verifyChain(goodChain(4));
    expect(r).toEqual<ChainResult>({
      ok: true,
      count: 4,
      brokenAtSeq: null,
      reason: null,
      lastAnchorTs: null,
      anchoredCount: 0,
    });
  });

  it('treats empty input as an intact (vacuously true) chain', () => {
    expect(verifyChain([])).toEqual<ChainResult>({
      ok: true, count: 0, brokenAtSeq: null, reason: null, lastAnchorTs: null, anchoredCount: 0,
    });
  });

  it('accepts a single record that starts from genesis', () => {
    const r = verifyChain([audit({ seq: 1, hash: 'h1', prevHash: GENESIS_HASH })]);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.brokenAtSeq).toBeNull();
  });

  it('fails a single record whose prevHash is not genesis (genesis branch)', () => {
    const r = verifyChain([audit({ seq: 1, hash: 'h1', prevHash: 'deadbe' })]);
    expect(r.ok).toBe(false);
    expect(r.brokenAtSeq).toBe(1);
    expect(r.reason).toContain('does not start from genesis');
    expect(r.reason).toContain('deadbe');
    expect(r.reason).toContain(GENESIS_HASH);
    expect(r.count).toBe(1);
  });

  it('fails at the exact seq where a prevHash link is broken (mid-chain branch)', () => {
    const chain = goodChain(5);
    chain[3].prevHash = 'tampered'; // seq 4 no longer links to seq 3
    const r = verifyChain(chain);
    expect(r.ok).toBe(false);
    expect(r.brokenAtSeq).toBe(4);
    expect(r.reason).toContain('record 4 prevHash tampered');
    expect(r.reason).toContain('record 3 hash h3');
  });

  it('sorts by seq before walking, so unordered input verifies correctly', () => {
    const shuffled = [goodChain(3)[2], goodChain(3)[0], goodChain(3)[1]];
    const r = verifyChain(shuffled);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(3);
  });

  it('counts anchored records and tracks the newest anchored timestamp', () => {
    const chain = goodChain(4);
    chain[0].anchored = true; chain[0].ts = 100;
    chain[2].anchored = true; chain[2].ts = 300;
    const r = verifyChain(chain);
    expect(r.anchoredCount).toBe(2);
    expect(r.lastAnchorTs).toBe(300); // max of anchored ts, not merely the last seen
  });

  it('keeps lastAnchorTs monotonic when a later anchor has an earlier ts', () => {
    const chain = goodChain(3);
    chain[0].anchored = true; chain[0].ts = 500;
    chain[1].anchored = true; chain[1].ts = 200; // earlier than the prior anchor
    const r = verifyChain(chain);
    expect(r.lastAnchorTs).toBe(500);
    expect(r.anchoredCount).toBe(2);
  });

  it('reports anchors accumulated before a mid-chain break', () => {
    const chain = goodChain(4);
    chain[0].anchored = true; chain[0].ts = 100;
    chain[2].prevHash = 'x'; // break at seq 3, before the seq-4 anchor
    chain[3].anchored = true; chain[3].ts = 999;
    const r = verifyChain(chain);
    expect(r.ok).toBe(false);
    expect(r.brokenAtSeq).toBe(3);
    expect(r.anchoredCount).toBe(1); // only seq 1's anchor was reached
    expect(r.lastAnchorTs).toBe(100);
  });

  it('exposes the fixed genesis constant', () => {
    expect(GENESIS_HASH).toBe('000000');
  });
});
