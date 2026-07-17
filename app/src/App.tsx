import { useState, useEffect, useRef } from 'react';
import { store, applyClassHelp } from './data/adapter';
import { liveStatus, subscribeActions } from './data/live';
import { OwnerTag, StatusPip, fmtAgo } from './ui/primitives';
import { PanelBoundary } from './ui/PanelBoundary';
import { useUiState } from './ui/uiState';
// The tab set is the validated panel registry (ADR-010), not an inline literal:
// one typed, agent-editable source of truth, checked at compile time (a missing
// component fails tsc) and at load time (a malformed manifest is rejected).
import { PANELS, type PanelId } from './ui/panels';

export function App() {
  // Active tab persists across HMR and reloads (ADR-008): an agent editing a
  // live panel, or a hot reload, never bumps the user off what they were viewing.
  const [tab, setTab] = useUiState<PanelId>('activeTab', 'overview');
  // In live mode, new actions arriving over SSE bump this counter, which
  // re-renders the active tab so it re-reads the store and shows the arrival.
  const [, setLiveTick] = useState(0);
  useEffect(() => subscribeActions(() => setLiveTick((n) => n + 1)), []);
  const active = PANELS.find((t) => t.id === tab) ?? PANELS[0];

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Explicit activation (click / Enter / Space): select the tab and move focus
  // into the panel so a screen reader announces the new content. The panel div
  // is a stable node across tab swaps, so focusing it now survives the re-render.
  const activate = (id: PanelId): void => {
    setTab(id);
    panelRef.current?.focus();
  };

  // Roving-tabindex keyboard model on the tablist: arrows move selection and
  // keep focus on the tabs (exploratory), Home/End jump to the ends.
  const onTablistKeyDown = (e: React.KeyboardEvent): void => {
    const idx = PANELS.findIndex((t) => t.id === tab);
    let next = idx;
    switch (e.key) {
      case 'ArrowRight': next = (idx + 1) % PANELS.length; break;
      case 'ArrowLeft':  next = (idx - 1 + PANELS.length) % PANELS.length; break;
      case 'Home':       next = 0; break;
      case 'End':        next = PANELS.length - 1; break;
      default: return;
    }
    e.preventDefault();
    setTab(PANELS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto auto 1fr', height: '100%' }}>
      <TopBar />
      {/* <nav> stays a real navigation landmark; the tablist role lives on an
          inner div so it does not clobber the landmark (ADR: a11y contract). */}
      <nav aria-label="Sections" style={{
        padding: '0 var(--s-5)', background: 'var(--bg-1)',
        borderBottom: '1px solid var(--line)', overflowX: 'auto',
      }}>
        <div role="tablist" aria-label="Control plane sections" aria-orientation="horizontal"
          onKeyDown={onTablistKeyDown} style={{ display: 'flex', gap: 2 }}>
          {PANELS.map((t, i) => {
            const selected = t.id === tab;
            return (
              <button key={t.id} ref={(el) => { tabRefs.current[i] = el; }}
                id={`tab-${t.id}`} role="tab" aria-selected={selected}
                aria-controls={`panel-${t.id}`} tabIndex={selected ? 0 : -1}
                title={t.hint} onClick={() => activate(t.id)}
                style={{
                  padding: 'var(--s-3) var(--s-4)', background: 'transparent',
                  border: 'none', borderBottom: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                  color: selected ? 'var(--fg-0)' : 'var(--fg-2)',
                  fontSize: 'var(--fs-sm)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
      {/* <main> stays a real main landmark; the tabpanel role lives on the inner
          div, labelled by the active tab and focusable so activation announces it. */}
      <main style={{ overflow: 'auto', padding: 'var(--s-5)', background: 'var(--bg-0)' }}>
        <div ref={panelRef} role="tabpanel" id={`panel-${active.id}`}
          aria-labelledby={`tab-${active.id}`} tabIndex={-1}
          style={{ maxWidth: 1400, margin: '0 auto', outline: 'none' }}>
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

// Header badge states: the truth about which data plane is live, not the
// compile-time flag. 'live' → real control-plane data; 'degraded' → live was
// requested but the server was unreachable so we are showing mock data; 'mock'
// → offline deterministic world.
const BADGE: Record<'live' | 'degraded' | 'mock', { text: string; colour: string; title: string }> = {
  live:     { text: 'live',    colour: 'var(--green)',       title: 'Live data from the control-plane server' },
  degraded: { text: 'offline', colour: 'var(--amber)',       title: 'Showing mock data — control-plane unreachable' },
  mock:     { text: 'mock',    colour: 'var(--line-strong)', title: 'Deterministic mock world (offline)' },
};

function TopBar() {
  const sys = store.system();
  const now = store.now();
  const badge = BADGE[liveStatus()];
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
          {/* Top-level page heading. Styled inline so it reads as a wordmark,
              not a giant H1, but the document still has an h1 landmark. */}
          <h1 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 700, display: 'inline' }}>Foreman</h1>
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
        <span title={badge.title} className="badge"
          style={{ borderColor: badge.colour, color: badge.colour }}>
          {badge.text}
        </span>
      </div>
    </header>
  );
}
