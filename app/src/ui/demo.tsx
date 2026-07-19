// The first-run honesty layer. ADR-001 boots a deterministic mock world and only
// the adapter seam knows mock-vs-live; the runtime never said so. This module is
// the single home for every demo tell, so the copy lives once and docs quote it.
//
// The gating invariant: everything keys off liveStatus() via isDemo(). When
// hydration truly succeeds every demo surface self-erases — the layer can never
// claim 'live' while showing the mock world. The one exception is the live strip,
// which stays honest about SEEDED live data (the dev server re-serves the mock
// module) by branching on the server's dataSource() flag, not on copy alone.
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { liveStatus, dataSource } from '../data/live';
import { useUiState } from './uiState';

/** True whenever the UI is not showing real control-plane data (mock or degraded). */
export function isDemo(): boolean {
  return liveStatus() !== 'live';
}

// ── Canonical demo copy (docs quote these verbatim) ──────────────────────────
export const SIMULATED_NOTE =
  'Simulated — this ran against the fabricated demo world. Nothing on a real system changed.';

const MOCK_BANNER =
  'Demo world — every owner, agent, action, document and patient record below is fabricated (ADR-001; the patient is wholly synthetic, PRD-009). Nothing here is real until you go live.';
const DEGRADED_BANNER =
  'Live requested but the control plane is unreachable — still showing demo data.';
const SEEDED_BANNER =
  'Seeded: the dev server serves the mock world (server/src/index.ts:39-47) — live-transported, not yet a real datastore.';

const WELCOME_TITLE = 'You are looking at a fabricated demo world';

// Visually-hidden text: present for assistive tech, so a tell is never colour-only
// (the StatusPip rule — see primitives.tsx). Mirrors that technique inline.
const srOnly: CSSProperties = {
  position: 'absolute', width: 1, height: 1, padding: 0, margin: -1,
  overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
};

const demoTint: CSSProperties = {
  color: 'var(--demo)',
  borderColor: 'color-mix(in srgb, var(--demo) 45%, transparent)',
  background: 'color-mix(in srgb, var(--demo) 12%, transparent)',
  fontWeight: 700,
};

// ── DemoChip ─────────────────────────────────────────────────────────────────
// One small 'DEMO DATA' pill next to the active panel heading. A single insertion
// flags all eight panels at once — the end of the 1-of-8 inconsistency. Renders
// only while not live, so real data carries no chip.
export function DemoChip() {
  if (!isDemo()) return null;
  return (
    <span
      className="badge"
      title="Every figure on this panel comes from the seeded mock world (ADR-001), not a real datastore."
      style={{ ...demoTint, verticalAlign: 'middle' }}
    >
      DEMO DATA
    </span>
  );
}

// ── DemoTag ──────────────────────────────────────────────────────────────────
// A muted tag paired with the literal word, threaded into any success UX that
// would otherwise read as a real operation ('simulated') or a real value
// ('example'). Never colour-only: the word is visible and an SR label spells it out.
export function DemoTag({ variant = 'simulated', style }: {
  variant?: 'simulated' | 'example';
  style?: CSSProperties;
}) {
  const word = variant === 'example' ? 'example' : 'Simulated';
  const sr = variant === 'example'
    ? 'example value from the demo world, not a real secret'
    : 'simulated action against the demo world, not a real operation';
  return (
    <span className="badge" title={sr} style={{ ...demoTint, ...style }}>
      {word}
      <span style={srOnly}>{sr}</span>
    </span>
  );
}

// ── DemoBanner ───────────────────────────────────────────────────────────────
// The persistent full-width strip. Three branches on the REAL data plane:
//   mock      → the world is fabricated; offer 'How to go live'.
//   degraded  → live was requested but the control plane is unreachable (this is
//               the first time live.ts's degraded warning becomes visible in-app).
//   live      → honest about SEEDED live data (dataSource()==='seeded'); erases
//               entirely once a real datastore answers (dataSource()==='real').
// Dismissal is per-branch (ruling 5): 'degraded' surfaces a real fault and is not
// dismissible; 'mock' and 'live-seeded' collapse to a pill via distinct keys, so
// collapsing one branch never suppresses another. The wrapper node always renders
// so the App grid keeps <main> in its 1fr track even when the strip is empty.
export function DemoBanner({ onHowToGoLive }: { onHowToGoLive?: () => void }) {
  const status = liveStatus();
  const [mockCollapsed, setMockCollapsed] = useUiState('demoBannerCollapsed.mock', false);
  const [seededCollapsed, setSeededCollapsed] = useUiState('demoBannerCollapsed.seeded', false);

  let inner: ReactNode = null;

  if (status === 'mock') {
    inner = mockCollapsed ? (
      <Pill accent="var(--demo)" label="Demo world" onExpand={() => setMockCollapsed(false)} />
    ) : (
      <Strip accent="var(--demo)" onCollapse={() => setMockCollapsed(true)}>
        {MOCK_BANNER}{' '}
        <button type="button" onClick={onHowToGoLive} style={linkBtn}>How to go live</button>
      </Strip>
    );
  } else if (status === 'degraded') {
    inner = (
      <Strip accent="var(--amber)" role="alert">
        {DEGRADED_BANNER}
      </Strip>
    );
  } else if (dataSource() === 'seeded') {
    // ACCEPTED TENSION (queen ruling #5, by design): in live-seeded mode isDemo()
    // is false, so DemoChip and the per-panel DemoTags disappear — this strip (and
    // its collapsed 'Seeded live data · show' pill) is the ONLY remaining tell, sat
    // beside a green 'live' badge. The invariant holds because the pill can never be
    // fully dismissed and no copy here says 'real'; the residual honesty signal is
    // deliberately this one strip, not a per-panel chip. If a future call wants a
    // per-panel tell in seeded mode too, gate DemoChip on dataSource()!=='real'
    // rather than isDemo() — not done here, to keep the self-erase invariant crisp.
    inner = seededCollapsed ? (
      <Pill accent="var(--demo)" label="Seeded live data" onExpand={() => setSeededCollapsed(false)} />
    ) : (
      <Strip accent="var(--demo)" onCollapse={() => setSeededCollapsed(true)}>
        {SEEDED_BANNER}
      </Strip>
    );
  }
  // status==='live' && dataSource()==='real' → inner stays null; genuinely real
  // data needs no tell, and the layer erases.

  return <div>{inner}</div>;
}

const linkBtn: CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit',
  color: 'var(--accent)', textDecoration: 'underline', fontWeight: 600,
};

// Built from the WhenToUse formula (primitives.tsx): color-mix accent tint,
// aria-hidden marker, token spacing.
function Strip({ accent, role = 'status', onCollapse, children }: {
  accent: string; role?: 'status' | 'alert'; onCollapse?: () => void; children: ReactNode;
}) {
  return (
    <div
      role={role}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--s-3)',
        padding: 'var(--s-2) var(--s-5)', fontSize: 'var(--fs-sm)', color: 'var(--fg-1)',
        background: `color-mix(in srgb, ${accent} 10%, transparent)`,
        borderBottom: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
      }}
    >
      <span aria-hidden style={{ color: accent, fontWeight: 800, flex: 'none' }}>▸</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {onCollapse && (
        <button
          type="button" onClick={onCollapse} aria-label="Collapse demo notice"
          style={{ ...linkBtn, color: 'var(--fg-2)', textDecoration: 'none', flex: 'none' }}
        >
          Dismiss
        </button>
      )}
    </div>
  );
}

function Pill({ accent, label, onExpand }: { accent: string; label: string; onExpand: () => void }) {
  return (
    <div style={{ display: 'flex', padding: 'var(--s-1) var(--s-5)', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)' }}>
      <button
        type="button" onClick={onExpand}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: '2px 10px', borderRadius: 100, fontSize: 'var(--fs-xs)', fontWeight: 700,
          color: accent, border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
          background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        }}
      >
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
        {label} · show
      </button>
    </div>
  );
}

// ── WelcomeDialog ────────────────────────────────────────────────────────────
// One-time first-run modal. Reuses the ConfirmDialog shell idiom verbatim
// (fixed backdrop, role=dialog aria-modal, Escape-to-close, Tab focus-trap,
// restore-focus, primary-button autofocus). Controlled: the parent owns
// firstRunSeen (persisted via useUiState) and gates `open`.
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

export function WelcomeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => restoreFocusRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'Tab') {
        const nodes = focusables(dialogRef.current);
        if (nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        const active = document.activeElement;
        const inside = dialogRef.current?.contains(active) ?? false;
        if (e.shiftKey && (active === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ops-backdrop"
      onMouseDown={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'color-mix(in srgb, var(--bg-0) 72%, transparent)',
        backdropFilter: 'blur(2px)',
        display: 'grid', placeItems: 'center', padding: 'var(--s-4)',
      }}
    >
      <div
        ref={dialogRef}
        className="card ops-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={WELCOME_TITLE}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 'min(540px, 100%)', maxHeight: '90vh', overflow: 'auto', padding: 'var(--s-5)', boxShadow: 'var(--shadow)' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
          <span className="badge" style={demoTint}>DEMO</span>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 680 }}>{WELCOME_TITLE}</h3>
        </header>

        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-1)', lineHeight: 1.6, display: 'grid', gap: 'var(--s-3)' }}>
          <p style={{ margin: 0 }}>
            Nothing here is real. The four owners — <strong>Dana Okoro</strong>, <strong>Ravi Menon</strong>,{' '}
            <strong>Lena Fischer</strong> and <strong>Sam Whitfield</strong> — their agents, actions and documents are
            all invented, as is the synthetic patient whose record the <strong>Clinician</strong> tab reads (a
            demonstrator, not for clinical use), and the clock is frozen at <strong>16 July 2026</strong> so the world
            renders the same on every load.
          </p>
          <p style={{ margin: 0 }}>
            The loop across the nine tabs: start on <strong>Overview</strong>, ask the patient record in{' '}
            <strong>Clinician</strong>, act in the named tab (Work, Documents, Configuration), undo what you did in{' '}
            <strong>Operations</strong>, and see the shape of it all in <strong>System</strong>.
          </p>

          <div style={{ display: 'grid', gap: 'var(--s-1)', padding: 'var(--s-3)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 650, color: 'var(--fg-0)' }}>Mock → live, three rungs</div>
            <div><strong>Demo</strong> (now) — the fabricated world, fully offline.</div>
            <div><strong>Dev-live</strong> — set <code className="mono">VITE_DATA_MODE=live</code> and run the dev server; it re-serves the same mock module, so data is live-transported but still seeded.</div>
            <div><strong>Host</strong> — a real datastore and control plane (M3–M6); only then is the data real.</div>
          </div>
        </div>

        {/* No in-app link out: the running app only ever serves the built SPA
            (app/dist) or the Vite root — the repo docs/ dir is in neither, so a
            docs/*.md anchor 404s in dev and falls through the SPA catch-all in the
            built image. This modal reproduces the getting-started tour inline
            instead, so first-run needs nothing the app cannot serve. The full
            write-up lives in the repo docs for anyone reading on GitHub. */}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', marginTop: 'var(--s-5)' }}>
          <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
            This is your getting-started tour — the same walkthrough lives in the repo docs.
          </span>
          <button ref={primaryRef} type="button" className="btn btn-primary" onClick={onClose}>
            Explore the demo
          </button>
        </footer>
      </div>
    </div>
  );
}
