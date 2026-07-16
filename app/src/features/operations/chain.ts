// Audit hash-chain verification. This is the one piece of real computation in
// the Operations module: it walks the records in sequence and checks that each
// record's prevHash equals the previous record's hash, with a fixed genesis at
// the head. Nothing here mutates the store; it reads AuditRecord[] and returns a
// verdict the UI renders.
import type { AuditRecord } from '../../domain/types';

/** The head of every chain links back to this fixed genesis value. */
export const GENESIS_HASH = '000000';

export interface ChainResult {
  ok: boolean;
  count: number;
  /** seq of the first record whose link does not match, or null if intact. */
  brokenAtSeq: number | null;
  /** Human line describing the break, or null if intact. */
  reason: string | null;
  /** Timestamp of the newest anchored record, or null if none are anchored. */
  lastAnchorTs: number | null;
  anchoredCount: number;
}

/**
 * Walk the chain in seq order and confirm every link.
 * @param records the full audit trail (order-independent; sorted here by seq)
 */
export function verifyChain(records: AuditRecord[]): ChainResult {
  const ordered = [...records].sort((a, b) => a.seq - b.seq);
  const count = ordered.length;

  let lastAnchorTs: number | null = null;
  let anchoredCount = 0;

  for (let i = 0; i < ordered.length; i++) {
    const rec = ordered[i];

    if (rec.anchored) {
      anchoredCount += 1;
      lastAnchorTs = lastAnchorTs === null ? rec.ts : Math.max(lastAnchorTs, rec.ts);
    }

    const expectedPrev = i === 0 ? GENESIS_HASH : ordered[i - 1].hash;
    if (rec.prevHash !== expectedPrev) {
      return {
        ok: false,
        count,
        brokenAtSeq: rec.seq,
        reason:
          i === 0
            ? `record 1 does not start from genesis (${rec.prevHash} ≠ ${GENESIS_HASH})`
            : `record ${rec.seq} prevHash ${rec.prevHash} does not match record ${ordered[i - 1].seq} hash ${ordered[i - 1].hash}`,
        lastAnchorTs,
        anchoredCount,
      };
    }
  }

  return { ok: true, count, brokenAtSeq: null, reason: null, lastAnchorTs, anchoredCount };
}
