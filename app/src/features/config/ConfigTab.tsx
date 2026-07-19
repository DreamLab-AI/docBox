// Configuration tab. Everything the sandbox exposes as a setting, organised by
// section and sub-group. The spine of the page is the apply-class distinction:
// every control carries an ApplyBadge so the operator always knows whether a
// change is instant (live), takes hold next session, or triggers a rebuild.
//
// All editing is local. store.config() is never mutated; edits stage into local
// React state as PendingChange rows, and "applying" moves them into a local
// `applied` overlay that stands in for the effective running config.
import { useMemo, useState } from 'react';
import type { ConfigOption, ConfigTabId, PendingChange, ApplyClass } from '../../domain/types';
import { store, applyClassHelp } from '../../data/adapter';
import { Panel, ApplyBadge, WhenToUse, EmptyState } from '../../ui/primitives';
import { isDemo, DemoTag, SIMULATED_NOTE } from '../../ui/demo';
import { ConfigRow } from './controls';
import { RebuildPlan } from './RebuildPlan';
import {
  type OptValue, effectiveValue, displayValue, derivePending, valueEquals,
  groupByHeading, TAB_ORDER, TAB_LABEL, APPLY_ORDER,
} from './pending';

export default function ConfigTab() {
  const options = store.config();
  const presentTabs = useMemo(
    () => TAB_ORDER.filter((id) => options.some((o) => o.tab === id)),
    [options],
  );

  const [activeTab, setActiveTab] = useState<ConfigTabId>(presentTabs[0] ?? 'providers');
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState<Map<string, OptValue>>(() => new Map());
  const [edits, setEdits] = useState<Map<string, OptValue>>(() => new Map());
  const [showPlan, setShowPlan] = useState(false);

  const pending = derivePending(options, applied, edits);
  const rebuildPending = pending.filter((p) => p.applyClass === 'rebuild');
  const liveSessionPending = pending.filter((p) => p.applyClass !== 'rebuild');

  const stageEdit = (opt: ConfigOption, v: OptValue) => {
    setEdits((prev) => {
      const next = new Map(prev);
      if (valueEquals(effectiveValue(opt, applied), v)) next.delete(opt.key);
      else next.set(opt.key, v);
      return next;
    });
  };

  const resetEdit = (key: string) => setEdits((prev) => {
    const next = new Map(prev);
    next.delete(key);
    return next;
  });

  const commit = (changes: PendingChange[]) => {
    setApplied((prev) => {
      const next = new Map(prev);
      for (const c of changes) next.set(c.key, c.to);
      return next;
    });
    setEdits((prev) => {
      const next = new Map(prev);
      for (const c of changes) next.delete(c.key);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const matches = searching
    ? options.filter((o) => o.key.toLowerCase().includes(q) || o.label.toLowerCase().includes(q))
    : [];
  const matchTabs = TAB_ORDER.filter((id) => matches.some((m) => m.tab === id));

  const renderRow = (opt: ConfigOption) => {
    const row = (
      <ConfigRow
        key={opt.key}
        opt={opt}
        value={displayValue(opt, applied, edits)}
        dirty={edits.has(opt.key) && !valueEquals(effectiveValue(opt, applied), edits.get(opt.key)!)}
        onChange={(v) => stageEdit(opt, v)}
        onReset={() => resetEdit(opt.key)}
      />
    );
    // Seeded secrets and identity strings (the masked sk-ant key, the Entra tenant
    // id) must not read as the box's real provisioned values — flag them 'example'.
    const seeded = opt.type === 'secret' || (opt.tab === 'identity' && opt.type === 'string');
    if (!isDemo() || !seeded) return row;
    return (
      <div key={opt.key}>
        {row}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: 'var(--s-2)' }}>
          <DemoTag variant="example" />
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <WhenToUse>
        Everything the sandbox exposes as a setting lives here — use it when provisioning a new client,
        or adjusting one day to day. The badge on every control tells you how a change lands:{' '}
        <ApplyBadge cls="live" /> takes effect on the running sandbox now,{' '}
        <ApplyBadge cls="session" /> applies to sessions started after you save, and{' '}
        <ApplyBadge cls="rebuild" /> changes the system definition — you review a plan first, and the
        current stack keeps serving until the new one passes its checks. Swapping a provider or a default
        route is quick and reversible; a rebuild is the safe path for the changes that are not.
      </WhenToUse>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter settings by name or key…"
          aria-label="Filter settings"
          style={{
            flex: '1 1 280px', padding: '8px 12px', background: 'var(--bg-2)', color: 'var(--fg-0)',
            border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)',
          }}
        />
        {searching && (
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            {matches.length} match{matches.length === 1 ? '' : 'es'} across all sections
            {' · '}
            <button
              type="button" onClick={() => setQuery('')}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', font: 'inherit', padding: 0 }}
            >
              clear
            </button>
          </span>
        )}
      </div>

      {/* Sub-tab strip (hidden while searching, since results span all sections) */}
      {!searching && (
        <nav role="tablist" aria-label="Configuration sections" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {presentTabs.map((id) => {
            const on = id === activeTab;
            const staged = pending.filter((p) => options.find((o) => o.key === p.key)?.tab === id).length;
            return (
              <button
                key={id} role="tab" aria-selected={on}
                onClick={() => setActiveTab(id)}
                style={{
                  padding: '6px 13px', borderRadius: 100, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--line-strong)'}`,
                  background: on ? 'var(--accent-dim)' : 'var(--bg-2)',
                  color: on ? 'var(--fg-0)' : 'var(--fg-1)',
                  fontSize: 'var(--fs-sm)', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}
              >
                {TAB_LABEL[id]}
                {staged > 0 && (
                  <span aria-label={`${staged} staged`} style={{
                    fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--amber)',
                    background: 'color-mix(in srgb, var(--amber) 18%, transparent)',
                    borderRadius: 100, padding: '0 6px',
                  }}>
                    {staged}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Body: search results, or the active section's grouped panels */}
      {searching ? (
        matches.length === 0 ? (
          <Panel><EmptyState>No settings match “{query}”.</EmptyState></Panel>
        ) : (
          matchTabs.map((id) => (
            <Panel key={id} title={TAB_LABEL[id]} hint="matching settings">
              {matches.filter((m) => m.tab === id).map(renderRow)}
            </Panel>
          ))
        )
      ) : (
        groupByHeading(options, activeTab).map(([group, opts]) => (
          <Panel key={group} title={group}>
            {opts.map(renderRow)}
          </Panel>
        ))
      )}

      {/* Sticky pending drawer */}
      {pending.length > 0 && (
        <PendingDrawer
          pending={pending}
          liveSessionCount={liveSessionPending.length}
          rebuildCount={rebuildPending.length}
          onApplyLiveSession={() => commit(liveSessionPending)}
          onReviewRebuild={() => setShowPlan(true)}
          onDiscard={() => setEdits(new Map())}
        />
      )}

      {showPlan && rebuildPending.length > 0 && (
        <RebuildPlan
          changes={rebuildPending}
          onClose={() => setShowPlan(false)}
          onComplete={() => { commit(rebuildPending); setShowPlan(false); }}
        />
      )}
    </div>
  );
}

function PendingDrawer({ pending, liveSessionCount, rebuildCount, onApplyLiveSession, onReviewRebuild, onDiscard }: {
  pending: PendingChange[];
  liveSessionCount: number;
  rebuildCount: number;
  onApplyLiveSession: () => void;
  onReviewRebuild: () => void;
  onDiscard: () => void;
}) {
  const counts: Record<ApplyClass, number> = { hot: 0, live: 0, session: 0, rebuild: 0 };
  for (const p of pending) counts[p.applyClass] += 1;

  return (
    <div style={{
      position: 'sticky', bottom: 0, zIndex: 20, marginTop: 'var(--s-2)',
      background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
      borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 'var(--s-3) var(--s-4)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-4)', flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 'var(--fs-sm)' }}>
          {pending.length} staged change{pending.length === 1 ? '' : 's'}
        </strong>
        <div style={{ display: 'flex', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          {APPLY_ORDER.filter((c) => counts[c] > 0).map((c) => (
            <span key={c} title={applyClassHelp[c]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ApplyBadge cls={c} />
              <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>× {counts[c]}</span>
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
        <button type="button" onClick={onDiscard} style={{ background: 'none', border: 'none', color: 'var(--fg-2)', cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-sm)' }}>
          Discard
        </button>
        <button type="button" className="btn btn-primary" onClick={onApplyLiveSession} disabled={liveSessionCount === 0}
          style={liveSessionCount === 0 ? { opacity: 0.5, cursor: 'default' } : undefined}>
          Apply live + session changes{liveSessionCount > 0 ? ` (${liveSessionCount})` : ''}
        </button>
        {rebuildCount > 0 && (
          <button type="button" className="btn btn-danger" onClick={onReviewRebuild}>
            Review rebuild plan ({rebuildCount})
          </button>
        )}
      </div>
      {/* Applying and rebuilding are simulated against the demo world — no config
          is written and no image is built. Say so where the operator acts. */}
      {isDemo() && (
        <p className="muted" style={{ flexBasis: '100%', margin: 0, fontSize: 'var(--fs-xs)' }}>{SIMULATED_NOTE}</p>
      )}
    </div>
  );
}
