// The audit hash chain (PRD-006). Pure functions only — no I/O, no state — so
// the integrity property is provable in isolation and reused by the ingest
// sidecar, the anchor job, and the verify CLI alike.
//
// Each record links to the one before it: hash = SHA256(prevHash ‖ canonical(event)).
// A retroactive edit changes the record's hash, which breaks the next record's
// prevHash, so tampering with any line is detectable from the chain alone —
// before you even reach the off-box Ed25519 anchor. By design this module is
// write/verify only: it appends and it checks. There is no read or query API,
// so the trail can never become a prompt-injection feedback surface.
import { createHash } from 'node:crypto';

/** The chain's fixed root. 64 hex zeros so it reads like any other SHA-256. */
export const GENESIS_HASH = '0'.repeat(64);

/** An audit event is an arbitrary JSON object; the chain is agnostic to its
 *  shape and only hashes its canonical form. */
export type AuditEvent = Record<string, unknown>;

/** One line of the append-only JSONL log: the event plus its chain links. */
export interface ChainRecord {
  event: AuditEvent;
  prevHash: string;
  hash: string;
}

// Canonical JSON: keys sorted at every depth so two logically-equal events hash
// identically regardless of key insertion order. Without this, re-serialising an
// event in a different order would look like tampering.
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = sortDeep(o[k]);
    return out;
  }
  return v;
}

/** Deterministic serialisation of an event for hashing. */
export function canonical(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

/** hash = SHA256(prevHash ‖ canonical(event)), hex. */
export function hashEvent(prevHash: string, event: AuditEvent): string {
  return createHash('sha256').update(prevHash + canonical(event)).digest('hex');
}

/** Link one event onto the chain. Returns the JSONL line to append and the new
 *  head hash to carry into the next append. */
export function appendEvent(prevHash: string, event: AuditEvent): { line: string; hash: string } {
  const hash = hashEvent(prevHash, event);
  const record: ChainRecord = { event, prevHash, hash };
  return { line: JSON.stringify(record), hash };
}

/** Recompute the chain over a set of JSONL lines. `ok` is true only if every
 *  link is intact and in order; `brokenAt` is the index of the first line that
 *  fails (a bad hash, a broken prevHash link, or unparseable), or null if clean.
 *  This is what the verify CLI runs and what detects tampering or reordering. */
export function verifyChain(
  lines: string[],
  genesis: string = GENESIS_HASH,
): { ok: boolean; brokenAt: number | null } {
  let prev = genesis;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue; // tolerate a trailing blank line from the file split
    let rec: ChainRecord;
    try {
      rec = JSON.parse(raw) as ChainRecord;
    } catch {
      return { ok: false, brokenAt: i };
    }
    if (typeof rec?.prevHash !== 'string' || typeof rec?.hash !== 'string' || rec.event == null) {
      return { ok: false, brokenAt: i };
    }
    if (rec.prevHash !== prev) return { ok: false, brokenAt: i }; // reordered or spliced
    if (hashEvent(rec.prevHash, rec.event) !== rec.hash) return { ok: false, brokenAt: i }; // edited
    prev = rec.hash;
  }
  return { ok: true, brokenAt: null };
}
