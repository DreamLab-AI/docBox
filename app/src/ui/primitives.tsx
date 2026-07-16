// Shared UI primitives. FROZEN: feature modules import from here for visual consistency.
import type { ReactNode, CSSProperties } from 'react';
import type { ApplyClass, Owner } from '../domain/types';
import { applyClassLabel, applyClassHelp, store } from '../data/adapter';

export function Panel({ title, hint, right, children, style }: {
  title?: string; hint?: string; right?: ReactNode; children: ReactNode; style?: CSSProperties;
}) {
  return (
    <section className="card" style={{ padding: 'var(--s-4)', ...style }}>
      {(title || right) && (
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 'var(--s-3)', gap: 'var(--s-3)' }}>
          <div>
            {title && <h3 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 650 }}>{title}</h3>}
            {hint && <p className="muted" style={{ margin: '2px 0 0', fontSize: 'var(--fs-sm)' }}>{hint}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** The product's core signifier: how a change lands. Use next to any config control. */
export function ApplyBadge({ cls, showHelp }: { cls: ApplyClass; showHelp?: boolean }) {
  const map: Record<ApplyClass, string> = { live: 'badge-live', session: 'badge-session', rebuild: 'badge-rebuild' };
  return (
    <span className={`badge ${map[cls]}`} title={applyClassHelp[cls]}>
      {applyClassLabel[cls]}
      {showHelp && <span className="muted" style={{ fontWeight: 400, marginLeft: 4 }}>· {applyClassHelp[cls]}</span>}
    </span>
  );
}

export function OwnerDot({ owner, size = 10 }: { owner: Owner; size?: number }) {
  return <span title={owner.name} style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: owner.colour, flex: 'none' }} />;
}

export function OwnerTag({ ownerId }: { ownerId: string }) {
  const o = store.ownerById(ownerId);
  if (!o) return <span className="muted">unknown</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)' }}>
      <OwnerDot owner={o} /> {o.name}
      {o.role === 'admin' && <span className="badge" style={{ padding: '0 5px' }}>admin</span>}
    </span>
  );
}

export function StatusPip({ status }: { status: 'ok' | 'blocked' | 'failed' | 'running' | 'idle' | 'done' | 'pass' | 'fail' | 'promoted' | 'auto_rolled_back' | 'candidate' }) {
  const colour =
    status === 'ok' || status === 'pass' || status === 'promoted' || status === 'done' ? 'var(--green)' :
    status === 'failed' || status === 'fail' || status === 'auto_rolled_back' ? 'var(--rose)' :
    status === 'blocked' ? 'var(--amber)' :
    status === 'running' || status === 'candidate' ? 'var(--accent)' :
    'var(--fg-2)';
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: colour, boxShadow: `0 0 8px ${colour}` }} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="muted" style={{ padding: 'var(--s-6)', textAlign: 'center', fontSize: 'var(--fs-sm)' }}>{children}</div>;
}

/** Feature-level guidance block. Every feature set opens with one: when and why to use it. */
export function WhenToUse({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--s-2)', padding: 'var(--s-3)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)', color: 'var(--fg-1)', marginBottom: 'var(--s-4)' }}>
      <span aria-hidden style={{ color: 'var(--accent)' }}>▸</span>
      <div>{children}</div>
    </div>
  );
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
export function fmtAgo(ts: number, now: number): string {
  const m = Math.round((now - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}
