// The action feed: reverse-chronological list of everything agents did, with a
// filter bar and removable active-filter chips. Reads nothing directly from the
// store beyond lookups; the parent passes the already-filtered slice.
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActionEvent, Owner } from '../../domain/types';
import { store } from '../../data/adapter';
import { StatusPip, OwnerDot, EmptyState, fmtTime, fmtAgo } from '../../ui/primitives';
import {
  ACTION_KINDS, ACTION_STATUSES, KIND_META, emphasisColour, toggleKind,
  hasAnyFilter,
} from './activity.helpers';
import type { Filters } from './activity.helpers';

const PAGE = 120; // cap the initial render; a plain scroll list past this is wasteful

export function ActionFeed({ visible, total, filters, owners, now, update, clearAll }: {
  visible: ActionEvent[];   // already filtered, ascending by time
  total: number;
  filters: Filters;
  owners: Owner[];
  now: number;
  update: (patch: Partial<Filters>) => void;
  clearAll: () => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const filterKey = JSON.stringify(filters);
  useEffect(() => { setLimit(PAGE); }, [filterKey]); // reset paging when the filter changes

  // Newest first for display; the store hands us ascending time order.
  const rows = useMemo(() => [...visible].reverse(), [visible]);
  const shown = rows.slice(0, limit);
  const hidden = rows.length - shown.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <FilterBar filters={filters} owners={owners} update={update} />
      <ActiveChips filters={filters} owners={owners} update={update} clearAll={clearAll} />

      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        margin: 'var(--s-2) 0', gap: 'var(--s-3)',
      }}>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
          <strong style={{ color: 'var(--fg-1)' }}>{visible.length}</strong> of {total} events
        </span>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>newest first</span>
      </div>

      <div className="act-scroll" style={{
        overflowY: 'auto', maxHeight: '64vh',
        border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-0)',
      }}>
        {rows.length === 0 ? (
          <EmptyState>
            No events match these filters.{' '}
            {hasAnyFilter(filters) && (
              <button className="act-link" onClick={clearAll}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit' }}>
                Clear filters
              </button>
            )}
          </EmptyState>
        ) : (
          shown.map((a) => <Row key={a.id} a={a} now={now} onAgent={() => update({ agentId: a.agentId, sessionId: null })} />)
        )}
        {hidden > 0 && (
          <button className="act-more" onClick={() => setLimit((l) => l + PAGE)}
            style={{
              display: 'block', width: '100%', padding: 'var(--s-3)', background: 'var(--bg-1)',
              border: 'none', borderTop: '1px solid var(--line)', color: 'var(--fg-1)',
              fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer',
            }}>
            Show {Math.min(hidden, PAGE)} more · {hidden} hidden
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ a, now, onAgent }: { a: ActionEvent; now: number; onAgent: () => void }) {
  const kind = KIND_META[a.kind];
  const agent = store.agentById(a.agentId);
  const owner = store.ownerById(a.ownerId);
  const element = a.elementId ? store.elementById(a.elementId) : undefined;
  const emphasis = emphasisColour(a.kind);

  return (
    <div className="act-row" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--s-2)',
      padding: '5px var(--s-3)', borderBottom: '1px solid var(--line)',
      borderLeft: `2px solid ${emphasis ?? 'transparent'}`,
      background: emphasis ? `color-mix(in srgb, ${emphasis} 7%, transparent)` : 'transparent',
      fontSize: 'var(--fs-sm)', lineHeight: 1.4,
    }}>
      <time className="mono muted" title={fmtAgo(a.ts, now)}
        style={{ fontSize: 'var(--fs-xs)', flex: 'none', width: 42 }}>{fmtTime(a.ts)}</time>

      <span title={owner?.name ?? 'unknown'} style={{ flex: 'none' }}>
        {owner ? <OwnerDot owner={owner} size={8} /> : null}
      </span>

      <button className="act-agent" onClick={onAgent} title="Filter the feed to this agent"
        style={{
          flex: 'none', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--fg-1)', font: 'inherit', textAlign: 'left',
        }}>
        {agent?.name ?? a.agentId}
      </button>

      <KindChip kind={a.kind} />

      <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {a.label}
      </span>

      {element && (
        <span className="mono muted" title={element.path}
          style={{ flex: '0 1 auto', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-xs)' }}>
          {element.path}
        </span>
      )}

      <span title={`status: ${a.status}`} style={{ flex: 'none', display: 'inline-flex' }}>
        <StatusPip status={a.status} />
      </span>
    </div>
  );
}

function KindChip({ kind }: { kind: ActionEvent['kind'] }) {
  const meta = KIND_META[kind];
  return (
    <span style={{
      flex: 'none', display: 'inline-flex', alignItems: 'center',
      padding: '1px 7px', borderRadius: 100, fontSize: 'var(--fs-xs)', fontWeight: 600,
      color: meta.colour, background: `color-mix(in srgb, ${meta.colour} 14%, transparent)`,
      border: `1px solid color-mix(in srgb, ${meta.colour} 40%, transparent)`,
    }}>{meta.label}</span>
  );
}

// ── Filter bar ───────────────────────────────────────────────────────────────
function FilterBar({ filters, owners, update }: {
  filters: Filters; owners: Owner[]; update: (patch: Partial<Filters>) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
      <Field label="Owner">
        <Segment active={!filters.ownerId} onClick={() => update({ ownerId: null })}>All</Segment>
        {owners.map((o) => (
          <Segment key={o.id} active={filters.ownerId === o.id} onClick={() => update({ ownerId: o.id })}>
            <OwnerDot owner={o} size={7} /> {o.name.split(' ')[0]}
          </Segment>
        ))}
      </Field>

      <Field label="Kind">
        {ACTION_KINDS.map((k) => {
          const on = filters.kinds.includes(k);
          const meta = KIND_META[k];
          return (
            <button key={k} className="act-chip" onClick={() => update({ kinds: toggleKind(filters.kinds, k) })}
              aria-pressed={on}
              style={{
                display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 100,
                fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer',
                color: on ? meta.colour : 'var(--fg-2)',
                background: on ? `color-mix(in srgb, ${meta.colour} 16%, transparent)` : 'transparent',
                border: `1px solid ${on ? `color-mix(in srgb, ${meta.colour} 50%, transparent)` : 'var(--line)'}`,
              }}>{meta.label}</button>
          );
        })}
      </Field>

      <Field label="Status">
        <Segment active={!filters.status} onClick={() => update({ status: null })}>All</Segment>
        {ACTION_STATUSES.map((s) => (
          <Segment key={s} active={filters.status === s} onClick={() => update({ status: s })}>
            <StatusPip status={s} /> {s}
          </Segment>
        ))}
      </Field>

      <Field label="Label">
        <input value={filters.text} onChange={(e) => update({ text: e.target.value })}
          placeholder="Filter on label text…" spellCheck={false}
          style={{
            flex: '1 1 180px', minWidth: 140, padding: '4px var(--s-2)', background: 'var(--bg-3)',
            border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)',
            color: 'var(--fg-0)', font: 'inherit', fontSize: 'var(--fs-sm)',
          }} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 'var(--fs-xs)', width: 44, flex: 'none' }}>{label}</span>
      {children}
    </div>
  );
}

function Segment({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button className="act-seg" onClick={onClick} aria-pressed={active}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 100,
        fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        color: active ? 'var(--fg-0)' : 'var(--fg-2)',
        background: active ? 'var(--bg-3)' : 'transparent',
        border: `1px solid ${active ? 'var(--line-strong)' : 'var(--line)'}`,
      }}>{children}</button>
  );
}

// ── Active-filter chips (removable) ──────────────────────────────────────────
function ActiveChips({ filters, owners, update, clearAll }: {
  filters: Filters; owners: Owner[]; update: (patch: Partial<Filters>) => void; clearAll: () => void;
}) {
  if (!hasAnyFilter(filters)) return null;
  const chips: { key: string; label: ReactNode; clear: () => void }[] = [];

  if (filters.sessionId) {
    const s = store.sessions().find((x) => x.id === filters.sessionId);
    chips.push({ key: 'session', label: <>session: {s?.title ?? filters.sessionId}</>, clear: () => update({ sessionId: null }) });
  }
  if (filters.agentId) {
    const a = store.agentById(filters.agentId);
    chips.push({ key: 'agent', label: <>agent: {a?.name ?? filters.agentId}</>, clear: () => update({ agentId: null }) });
  }
  if (filters.ownerId) {
    const o = owners.find((x) => x.id === filters.ownerId);
    chips.push({ key: 'owner', label: <>owner: {o?.name ?? filters.ownerId}</>, clear: () => update({ ownerId: null }) });
  }
  if (filters.status) {
    chips.push({ key: 'status', label: <>status: {filters.status}</>, clear: () => update({ status: null }) });
  }
  for (const k of filters.kinds) {
    chips.push({ key: `kind:${k}`, label: <>{KIND_META[k].label}</>, clear: () => update({ kinds: filters.kinds.filter((x) => x !== k) }) });
  }
  if (filters.text.trim()) {
    chips.push({ key: 'text', label: <>“{filters.text.trim()}”</>, clear: () => update({ text: '' }) });
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-2)', marginTop: 'var(--s-3)' }}>
      <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>Active:</span>
      {chips.map((c) => (
        <button key={c.key} className="act-remove" onClick={c.clear} title="Remove this filter"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px 2px 9px', borderRadius: 100,
            fontSize: 'var(--fs-xs)', fontWeight: 600, cursor: 'pointer', color: 'var(--fg-1)',
            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          }}>
          {c.label} <span aria-hidden style={{ color: 'var(--fg-2)', fontSize: 13, lineHeight: 1 }}>×</span>
        </button>
      ))}
      <button onClick={clearAll} className="act-link"
        style={{ background: 'none', border: 'none', color: 'var(--fg-2)', cursor: 'pointer', fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '2px 4px' }}>
        Clear all
      </button>
    </div>
  );
}
