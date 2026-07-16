import { useState, useEffect } from 'react';
import { store, applyClassHelp } from './data/adapter';
import { IS_LIVE, subscribeActions } from './data/live';
import { OwnerTag, StatusPip, fmtAgo } from './ui/primitives';
import { PanelBoundary } from './ui/PanelBoundary';
import { useUiState } from './ui/uiState';
import OverviewTab from './features/overview/OverviewTab';
import VisualiserTab from './features/visualiser/VisualiserTab';
import ActivityTab from './features/activity/ActivityTab';
import WorkTab from './features/work/WorkTab';
import DocumentsTab from './features/documents/DocumentsTab';
import ConfigTab from './features/config/ConfigTab';
import OperationsTab from './features/operations/OperationsTab';

type TabId = 'overview' | 'visualiser' | 'activity' | 'work' | 'documents' | 'config' | 'ops';

const TABS: { id: TabId; label: string; hint: string; render: () => JSX.Element }[] = [
  { id: 'overview',   label: 'Overview',      hint: 'System at a glance',            render: () => <OverviewTab /> },
  { id: 'visualiser', label: 'Visualiser',    hint: 'Who did what, to what, when',   render: () => <VisualiserTab /> },
  { id: 'activity',   label: 'Activity',      hint: 'Action feed and agent tree',    render: () => <ActivityTab /> },
  { id: 'work',       label: 'Work',          hint: 'The agent work ledger',         render: () => <WorkTab /> },
  { id: 'documents',  label: 'Documents',     hint: 'Uploads and OCR',               render: () => <DocumentsTab /> },
  { id: 'config',     label: 'Configuration', hint: 'Everything you can change',     render: () => <ConfigTab /> },
  { id: 'ops',        label: 'Operations',    hint: 'Snapshots, audit, vaults',      render: () => <OperationsTab /> },
];

export function App() {
  // Active tab persists across HMR and reloads (ADR-008): an agent editing a
  // live panel, or a hot reload, never bumps the user off what they were viewing.
  const [tab, setTab] = useUiState<TabId>('activeTab', 'overview');
  // In live mode, new actions arriving over SSE bump this counter, which
  // re-renders the active tab so it re-reads the store and shows the arrival.
  const [, setLiveTick] = useState(0);
  useEffect(() => subscribeActions(() => setLiveTick((n) => n + 1)), []);
  const sys = store.system();
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100%' }}>
      <TopBar />
      <nav role="tablist" aria-label="Control plane sections" style={{
        display: 'flex', gap: 2, padding: '0 var(--s-5)', background: 'var(--bg-1)',
        borderBottom: '1px solid var(--line)', overflowX: 'auto',
      }}>
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={t.id === tab} title={t.hint}
            onClick={() => setTab(t.id)}
            style={{
              padding: 'var(--s-3) var(--s-4)', background: 'transparent',
              border: 'none', borderBottom: `2px solid ${t.id === tab ? 'var(--accent)' : 'transparent'}`,
              color: t.id === tab ? 'var(--fg-0)' : 'var(--fg-2)',
              fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
            }}>
            {t.label}
          </button>
        ))}
      </nav>
      <main role="tabpanel" style={{ overflow: 'auto', padding: 'var(--s-5)', background: 'var(--bg-0)' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <div style={{ marginBottom: 'var(--s-4)' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--fs-2xl)', fontWeight: 680, letterSpacing: '-0.01em' }}>{active.label}</h2>
            <p className="muted" style={{ margin: '2px 0 0' }}>{active.hint}</p>
          </div>
          {/* Each panel is functionally isolated: a fault here is contained to
              this panel and never blanks the interface (ADR-008). */}
          <PanelBoundary name={active.label}>{active.render()}</PanelBoundary>
        </div>
      </main>
    </div>
  );
}

function TopBar() {
  const sys = store.system();
  const now = store.now();
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: 'var(--s-3) var(--s-5)', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <div aria-hidden style={{
          width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center',
          background: 'linear-gradient(135deg, var(--accent), var(--violet))', fontWeight: 800, fontSize: 14,
        }}>F</div>
        <div>
          <strong style={{ fontSize: 'var(--fs-md)' }}>Foreman</strong>
          <span className="muted" style={{ fontSize: 'var(--fs-xs)', marginLeft: 8 }}>sandbox control plane</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-5)', fontSize: 'var(--fs-sm)' }}>
        <span title="Active blue/green stack and image tag" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <StatusPip status="ok" />
          <span className="muted">stack</span> <span className="mono">{sys.activeStack}</span>
          <span className="mono muted">· {sys.imageTag}</span>
        </span>
        <span title="Audit hash-chain last verified" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <StatusPip status="pass" />
          <span className="muted">audit verified</span> {fmtAgo(sys.auditChainVerifiedAt, now)}
        </span>
        <span title="Embedded local model" className="muted">model <span className="mono" style={{ color: 'var(--fg-1)' }}>{sys.localModel}</span></span>
        <span title={IS_LIVE ? 'Live data from the control-plane server' : 'Deterministic mock world (offline)'}
          className="badge" style={{ borderColor: IS_LIVE ? 'var(--green)' : 'var(--line-strong)', color: IS_LIVE ? 'var(--green)' : 'var(--fg-2)' }}>
          {IS_LIVE ? 'live' : 'mock'}
        </span>
      </div>
    </header>
  );
}
