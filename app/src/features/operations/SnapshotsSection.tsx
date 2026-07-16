// Snapshots & rollback: a vertical timeline of restore points, newest first.
// The active one (newest promoted) is marked "serving now". Any other promoted
// point can be rolled back to — a simulated action that reverts only the
// system-definition plane. The candidate is an in-flight overhaul mid-healthcheck.
import { useState } from 'react';
import type { SnapshotInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { OwnerTag, StatusPip, fmtTime, fmtAgo } from '../../ui/primitives';
import { ConfirmDialog } from './ConfirmDialog';

const STATUS_TEXT: Record<SnapshotInfo['status'], string> = {
  promoted: 'Promoted',
  auto_rolled_back: 'Auto-rolled back',
  candidate: 'Candidate · in-flight',
};

const HEALTH_TEXT: Record<SnapshotInfo['healthcheck'], string> = {
  pass: 'Healthcheck passed',
  fail: 'Healthcheck failed',
  running: 'Healthcheck running',
};

export function SnapshotsSection() {
  const now = store.now();
  const snaps = store.snapshots(); // already newest-first
  const defaultActiveId = snaps.find((s) => s.status === 'promoted')?.id ?? null;

  // Local-only: which restore point is serving. A successful rollback moves it.
  const [activeId, setActiveId] = useState<string | null>(defaultActiveId);
  const [rollbackTarget, setRollbackTarget] = useState<SnapshotInfo | null>(null);

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <p className="secondary" style={{ margin: 0, fontSize: 'var(--fs-sm)', maxWidth: 720 }}>
        Every overhaul that rebuilds the system takes a restore point first. Rolling back to one reverts the
        system-definition plane only — the image and its tooling. User data and the audit trail sit on separate
        planes and are left exactly as they are.
      </p>

      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {snaps.map((s, i) => (
          <TimelineRow
            key={s.id}
            snap={s}
            now={now}
            isActive={s.id === activeId}
            isLast={i === snaps.length - 1}
            onRollback={() => setRollbackTarget(s)}
          />
        ))}
      </ol>

      {rollbackTarget && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Roll back to “${rollbackTarget.label}”`}
          confirmLabel="Roll back the tooling"
          onClose={() => setRollbackTarget(null)}
          onConfirmed={() => setActiveId(rollbackTarget.id)}
          steps={[
            'Freezing writes to the definition plane',
            `Restoring image ${rollbackTarget.shaAfter ?? rollbackTarget.shaBefore}`,
            'Blue/green swap to the restored stack',
            'Healthcheck on the restored stack',
          ]}
          doneMessage="Rolled back. User data and the audit trail were not touched."
        >
          <p style={{ margin: '0 0 var(--s-3)' }}>
            This reverts the system-definition plane to the state captured at{' '}
            <strong>{fmtTime(rollbackTarget.ts)}</strong> — image{' '}
            <span className="mono">{rollbackTarget.shaAfter ?? rollbackTarget.shaBefore}</span> and the tooling that
            shipped with it.
          </p>
          <p style={{
            margin: 0, padding: 'var(--s-3)', borderRadius: 'var(--radius-sm)',
            background: 'color-mix(in srgb, var(--green) 9%, transparent)',
            border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)',
          }}>
            <strong style={{ color: 'var(--green)' }}>Left untouched:</strong> project vault data and the
            append-only audit trail. Rolling back the tooling can never rewrite what users did or what the record says
            was done.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function TimelineRow({ snap, now, isActive, isLast, onRollback }: {
  snap: SnapshotInfo;
  now: number;
  isActive: boolean;
  isLast: boolean;
  onRollback: () => void;
}) {
  const canRollBack = snap.status === 'promoted' && !isActive;

  return (
    <li style={{ display: 'grid', gridTemplateColumns: '26px 1fr', gap: 'var(--s-3)', alignItems: 'stretch' }}>
      {/* Rail: a node coloured by status, with a connector to the next point. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{
          width: 20, height: 20, marginTop: 4, borderRadius: '50%', flex: 'none',
          display: 'grid', placeItems: 'center',
          background: 'var(--bg-2)',
          border: `1px solid ${isActive ? 'var(--green)' : 'var(--line-strong)'}`,
          boxShadow: isActive ? '0 0 0 3px color-mix(in srgb, var(--green) 20%, transparent)' : 'none',
        }}>
          <StatusPip status={snap.status} />
        </span>
        {!isLast && <span style={{ flex: 1, width: 2, background: 'var(--line)', margin: '4px 0' }} />}
      </div>

      {/* Card */}
      <div className="card" style={{ padding: 'var(--s-4)', marginBottom: 'var(--s-4)' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--fs-md)' }}>{snap.label}</strong>
            {isActive && (
              <span className="badge" style={{ color: 'var(--green)', borderColor: 'color-mix(in srgb, var(--green) 45%, transparent)', background: 'color-mix(in srgb, var(--green) 12%, transparent)' }}>
                serving now
              </span>
            )}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--fs-sm)', color: 'var(--fg-1)' }}>
            <StatusPip status={snap.status} /> {STATUS_TEXT[snap.status]}
          </span>
        </header>

        <div className="muted" style={{ fontSize: 'var(--fs-xs)', margin: '4px 0 var(--s-3)', display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap' }}>
          <span>{fmtTime(snap.ts)}</span><span aria-hidden>·</span><span>{fmtAgo(snap.ts, now)}</span>
          <span aria-hidden>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>by <OwnerTag ownerId={snap.initiatorOwnerId} /></span>
        </div>

        <p className="secondary" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)' }}>{snap.proposalSummary}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)', flexWrap: 'wrap', fontSize: 'var(--fs-sm)' }}>
          <span className="mono" style={{ color: 'var(--fg-1)' }}>
            {snap.shaBefore}
            <span className="muted" style={{ margin: '0 6px' }} aria-label="to">→</span>
            {snap.shaAfter ?? <span className="muted ops-pulse">building…</span>}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--fg-1)' }}>
            <StatusPip status={snap.healthcheck} />
            {snap.healthcheck === 'running'
              ? <span className="ops-pulse">{HEALTH_TEXT[snap.healthcheck]}</span>
              : HEALTH_TEXT[snap.healthcheck]}
          </span>
        </div>

        <div style={{ marginTop: 'var(--s-3)', display: 'flex', alignItems: 'center', gap: 'var(--s-3)', flexWrap: 'wrap' }}>
          {canRollBack && (
            <button className="btn" onClick={onRollback}>↩ Roll back to here</button>
          )}
          {snap.status === 'candidate' && (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Mid-healthcheck. The current stack keeps serving until this one passes; nothing cuts over early.
            </span>
          )}
          {snap.status === 'auto_rolled_back' && (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              Healthcheck failed, so this stack was never promoted — the previous one carried on without interruption.
            </span>
          )}
          {isActive && (
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>
              This is the live definition. Roll back to an earlier promoted point to revert the tooling.
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
