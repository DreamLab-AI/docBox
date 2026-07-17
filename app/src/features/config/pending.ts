// Pure helpers for the Configuration module's local edit model.
// Nothing here mutates store.config(); the store is the frozen baseline.
//
// Two local maps drive the whole tab:
//   applied — values the operator has locally applied (simulates the effective
//             running config after "Apply" or a completed rebuild).
//   edits   — in-progress control changes not yet applied.
// A key's effective value is applied[key] if present, else the store baseline.
// A key's displayed value is edits[key] if present, else its effective value.
// A pending change exists where a staged edit differs from the effective value.
import type { ConfigOption, PendingChange, ApplyClass, ConfigTabId } from '../../domain/types';

export type OptValue = ConfigOption['value'];

/** Value equality that understands the list (string[]) case. */
export function valueEquals(a: OptValue, b: OptValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return a === b;
}

/** The value the running sandbox would hold now: local applied override or baseline. */
export function effectiveValue(opt: ConfigOption, applied: Map<string, OptValue>): OptValue {
  return applied.has(opt.key) ? applied.get(opt.key)! : opt.value;
}

/** What the control should show: a staged edit if any, otherwise the effective value. */
export function displayValue(
  opt: ConfigOption,
  applied: Map<string, OptValue>,
  edits: Map<string, OptValue>,
): OptValue {
  return edits.has(opt.key) ? edits.get(opt.key)! : effectiveValue(opt, applied);
}

/** Staged edits that genuinely differ from the effective value, as PendingChange rows. */
export function derivePending(
  options: ConfigOption[],
  applied: Map<string, OptValue>,
  edits: Map<string, OptValue>,
): PendingChange[] {
  const out: PendingChange[] = [];
  for (const opt of options) {
    if (!edits.has(opt.key)) continue;
    const to = edits.get(opt.key)!;
    const from = effectiveValue(opt, applied);
    if (!valueEquals(from, to)) out.push({ key: opt.key, from, to, applyClass: opt.applyClass });
  }
  return out;
}

/** Human-readable value for drawers and the rebuild plan. */
export function formatValue(v: OptValue): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(none)';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (v === '') return '(empty)';
  return String(v);
}

/** Group options by their `group` field, preserving first-seen order. */
export function groupByHeading(options: ConfigOption[], tab: ConfigTabId): [string, ConfigOption[]][] {
  const map = new Map<string, ConfigOption[]>();
  for (const o of options) {
    if (o.tab !== tab) continue;
    const bucket = map.get(o.group);
    if (bucket) bucket.push(o);
    else map.set(o.group, [o]);
  }
  return [...map.entries()];
}

export const TAB_ORDER: ConfigTabId[] = [
  'providers', 'toolchain', 'identity', 'network', 'vaults', 'audit', 'snapshots', 'agents', 'interface',
];

export const TAB_LABEL: Record<ConfigTabId, string> = {
  providers: 'Providers',
  toolchain: 'Toolchain',
  identity: 'Identity',
  network: 'Network',
  vaults: 'Vaults',
  audit: 'Audit',
  snapshots: 'Snapshots',
  agents: 'Agents',
  interface: 'Interface',
};

// 'hot' leads: a staged hot-class change (interface density/panels) must show
// its own class breakdown in the pending drawer rather than an empty group.
export const APPLY_ORDER: ApplyClass[] = ['hot', 'live', 'session', 'rebuild'];
