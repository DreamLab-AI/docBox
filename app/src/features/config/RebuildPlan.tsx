// The rebuild plan. Shown before any 'rebuild' change lands, because a rebuild
// changes the system definition: it writes the TOML, builds a fresh image and
// swaps stacks. The plan makes the sequence explicit and stresses the safety
// property — the current stack keeps serving until the new one passes its
// checks, and cutover is abandoned (auto-rollback) on any failure.
//
// "Start rebuild" runs a simulated progress sequence only. No backend.
import { useEffect, useRef, useState } from 'react';
import type { PendingChange } from '../../domain/types';
import { formatValue } from './pending';

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab-order focusable descendants of a dialog root (visibility-agnostic for jsdom). */
function focusables(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
}

const STEPS: { label: string; detail: string }[] = [
  { label: 'Write configuration', detail: 'Commit the changed keys to sandbox.toml.' },
  { label: 'Build image', detail: 'Assemble a candidate image from the updated definition.' },
  { label: 'Healthcheck + data probe', detail: 'Start the candidate, confirm it answers and can read existing user data.' },
  { label: 'Blue/green cutover', detail: 'Point traffic at the candidate once it has passed.' },
];

const DOT_DONE = 'var(--green)';
const DOT_ACTIVE = 'var(--accent)';
const DOT_PENDING = 'var(--fg-2)';

export function RebuildPlan({ changes, onClose, onComplete }: {
  changes: PendingChange[];
  onClose: () => void;
  onComplete: () => void;
}) {
  // step: -1 idle · 0..n-1 that step running · n complete
  const [step, setStep] = useState(-1);
  const n = STEPS.length;
  const running = step >= 0 && step < n;
  const done = step === n;

  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Advance the simulated sequence one step at a time.
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setStep((s) => s + 1), 950);
    return () => clearTimeout(t);
  }, [step, running]);

  // Remember the trigger, move focus into the plan on open, and restore it on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    focusables(dialogRef.current)[0]?.focus();
    return () => restoreFocusRef.current?.focus?.();
  }, []);

  // Escape closes, but only when nothing is mid-flight. Tab is trapped inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) { onClose(); return; }
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running, onClose]);

  return (
    <div
      role="dialog" aria-modal="true" aria-label="Rebuild plan"
      onClick={() => { if (!running) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 50, display: 'grid', placeItems: 'center',
        background: 'rgba(0,0,0,0.55)', padding: 'var(--s-4)',
      }}
    >
      <div
        ref={dialogRef}
        className="card" onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
          padding: 'var(--s-5)', background: 'var(--bg-1)', boxShadow: 'var(--shadow)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--fs-xl)', fontWeight: 680 }}>Rebuild plan</h3>
          <span className="badge badge-rebuild">Rebuild</span>
        </header>
        <p className="secondary" style={{ margin: '6px 0 var(--s-4)', fontSize: 'var(--fs-sm)' }}>
          These changes alter the system definition, so they need a rebuild. The current stack keeps
          serving throughout. If the candidate fails any check, cutover is abandoned and nothing changes.
        </p>

        {/* Key diffs */}
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, marginBottom: 'var(--s-2)' }}>
          Keys to change ({changes.length})
        </div>
        <div className="card" style={{ background: 'var(--bg-2)', padding: 'var(--s-3)', marginBottom: 'var(--s-4)' }}>
          {changes.map((c) => (
            <div key={c.key} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', padding: '3px 0' }}>
              <span className="mono" style={{ fontSize: 'var(--fs-xs)', flex: '1 1 220px' }}>{c.key}</span>
              <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>{formatValue(c.from)}</span>
              <span aria-hidden style={{ color: 'var(--fg-2)' }}>→</span>
              <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--apply-rebuild)' }}>{formatValue(c.to)}</span>
            </div>
          ))}
        </div>

        {/* Sequence */}
        <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 650, marginBottom: 'var(--s-2)' }}>Sequence</div>
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 'var(--s-3)' }}>
          {STEPS.map((s, i) => {
            const state = i < step || done ? 'done' : i === step ? 'active' : 'pending';
            const dot = state === 'done' ? DOT_DONE : state === 'active' ? DOT_ACTIVE : DOT_PENDING;
            return (
              <li key={s.label} style={{ display: 'flex', gap: 'var(--s-3)', alignItems: 'flex-start' }}>
                <span aria-hidden style={{
                  width: 9, height: 9, marginTop: 5, borderRadius: '50%', flex: 'none', background: dot,
                  boxShadow: state === 'pending' ? 'none' : `0 0 8px ${dot}`,
                }} />
                <div>
                  <div style={{ fontWeight: 600, color: state === 'pending' ? 'var(--fg-1)' : 'var(--fg-0)' }}>
                    {s.label}
                    {state === 'active' && <span className="muted" style={{ fontWeight: 400 }}> · running…</span>}
                    {state === 'done' && <span style={{ color: 'var(--green)', fontWeight: 400 }}> · done</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>{s.detail}</div>
                </div>
              </li>
            );
          })}
        </ol>

        <p className="muted" style={{ fontSize: 'var(--fs-xs)', margin: 'var(--s-3) 0 var(--s-4)' }}>
          On any failed check the candidate is discarded and the live stack is untouched — the rollback
          is automatic, not a manual step.
        </p>

        {done && (
          <div className="card" style={{
            background: 'color-mix(in srgb, var(--green) 12%, transparent)',
            borderColor: 'color-mix(in srgb, var(--green) 45%, transparent)',
            padding: 'var(--s-3)', marginBottom: 'var(--s-4)', fontSize: 'var(--fs-sm)', color: 'var(--green)',
          }}>
            Cutover complete — the new stack is live. The previous image is kept as a restore point.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--s-3)' }}>
          {step === -1 && (
            <>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(0)}>Start rebuild</button>
            </>
          )}
          {running && <button type="button" className="btn" disabled style={{ opacity: 0.6, cursor: 'default' }}>Rebuilding…</button>}
          {done && <button type="button" className="btn btn-primary" onClick={onComplete}>Apply and close</button>}
        </div>
      </div>
    </div>
  );
}
