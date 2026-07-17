// A confirm dialog that then runs a simulated multi-step operation and reports
// success. Used for rollback and for vault lock/unlock. It never touches the
// store: the caller passes `onConfirmed`, which fires once the simulated run
// completes so the caller can commit its own local state.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Phase = 'confirm' | 'running' | 'done';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 'danger' tints the confirm button red for reverting/destructive actions. */
  tone?: 'default' | 'danger';
  confirmLabel: string;
  /** Ordered progress lines shown while the simulated operation runs. */
  steps: string[];
  /** Line shown on success. */
  doneMessage: string;
  /** The explanatory body: what this action does and what it leaves alone. */
  children: ReactNode;
  /** Fired once, when the simulated run finishes, so the caller commits state. */
  onConfirmed?: () => void;
}

const STEP_MS = 520;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab-order focusable descendants of a dialog root (visibility-agnostic for jsdom). */
function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

export function ConfirmDialog({
  open, onClose, title, tone = 'default', confirmLabel, steps, doneMessage, children, onConfirmed,
}: ConfirmDialogProps) {
  const [phase, setPhase] = useState<Phase>('confirm');
  const [done, setDone] = useState(0); // completed step count
  const timers = useRef<number[]>([]);
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Reset to a clean confirm state each time the dialog opens; clear any timers
  // on close/unmount so a dismissed run never fires a late callback.
  useEffect(() => {
    if (open) {
      setPhase('confirm');
      setDone(0);
    }
    return () => {
      timers.current.forEach((t) => clearTimeout(t));
      timers.current = [];
    };
  }, [open]);

  // Remember what was focused before we opened, and hand focus back on close so
  // keyboard users are not dropped at the top of the page.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => restoreFocusRef.current?.focus?.();
  }, [open]);

  useEffect(() => {
    if (open && phase === 'confirm') confirmBtn.current?.focus();
  }, [open, phase]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && phase !== 'running') { onClose(); return; }
      // Trap Tab: cycle focus among the dialog's focusable elements.
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
  }, [open, phase, onClose]);

  if (!open) return null;

  function run() {
    setPhase('running');
    setDone(0);
    steps.forEach((_, i) => {
      timers.current.push(window.setTimeout(() => setDone(i + 1), STEP_MS * (i + 1)));
    });
    timers.current.push(window.setTimeout(() => {
      setPhase('done');
      onConfirmed?.();
    }, STEP_MS * (steps.length + 1)));
  }

  const accent = tone === 'danger' ? 'var(--rose)' : 'var(--accent)';

  return (
    <div
      className="ops-backdrop"
      onMouseDown={() => { if (phase !== 'running') onClose(); }}
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
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 'min(460px, 100%)', padding: 'var(--s-5)', boxShadow: 'var(--shadow)' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)', marginBottom: 'var(--s-3)' }}>
          <span aria-hidden style={{
            width: 8, height: 8, borderRadius: '50%', background: accent,
            boxShadow: `0 0 10px ${accent}`,
          }} />
          <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 650 }}>{title}</h3>
        </header>

        {phase === 'confirm' && (
          <>
            <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-1)', lineHeight: 1.55 }}>{children}</div>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-2)', marginTop: 'var(--s-5)' }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                ref={confirmBtn}
                className={tone === 'danger' ? 'btn btn-danger' : 'btn btn-primary'}
                onClick={run}
              >
                {confirmLabel}
              </button>
            </footer>
          </>
        )}

        {phase === 'running' && (
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
            {steps.map((s, i) => {
              const state = i < done ? 'done' : i === done ? 'active' : 'pending';
              return (
                <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', fontSize: 'var(--fs-sm)' }}>
                  <StepMark state={state} />
                  <span style={{ color: state === 'pending' ? 'var(--fg-2)' : 'var(--fg-0)' }}>{s}</span>
                </li>
              );
            })}
          </ol>
        )}

        {phase === 'done' && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
              <span aria-hidden style={{
                width: 22, height: 22, flex: 'none', borderRadius: '50%',
                background: 'color-mix(in srgb, var(--green) 20%, transparent)',
                border: '1px solid var(--green)', color: 'var(--green)',
                display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800,
              }}>✓</span>
              <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-0)' }}>{doneMessage}</span>
            </div>
            <footer style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--s-5)' }}>
              <button className="btn btn-primary" onClick={onClose} autoFocus>Done</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

function StepMark({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'active') return <span className="ops-spin" aria-hidden style={{ flex: 'none' }} />;
  return (
    <span aria-hidden style={{
      width: 13, height: 13, flex: 'none', borderRadius: '50%',
      display: 'grid', placeItems: 'center',
      border: `1px solid ${state === 'done' ? 'var(--green)' : 'var(--line-strong)'}`,
      color: state === 'done' ? 'var(--green)' : 'var(--fg-2)', fontSize: 9, fontWeight: 800,
      background: state === 'done' ? 'color-mix(in srgb, var(--green) 18%, transparent)' : 'transparent',
    }}>
      {state === 'done' ? '✓' : ''}
      {state === 'pending' && <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-2)' }} />}
    </span>
  );
}
