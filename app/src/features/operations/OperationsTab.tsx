// Operations: the trust surface. Three things you do to the system's history
// rather than its settings — roll back a bad overhaul, read the audit trail, and
// unlock/lock project vaults. Each is a sub-section below. All interactions are
// local and simulated; the store is read-only and never mutated here.
import { useState } from 'react';
import { WhenToUse } from '../../ui/primitives';
import { SnapshotsSection } from './SnapshotsSection';
import { AuditSection } from './AuditSection';
import { VaultsSection } from './VaultsSection';
import './operations.css';

type SubTab = 'snapshots' | 'audit' | 'vaults';

const SUBTABS: { id: SubTab; label: string; blurb: string }[] = [
  { id: 'snapshots', label: 'Snapshots & rollback', blurb: 'Restore points around each overhaul' },
  { id: 'audit', label: 'Audit trail', blurb: 'The append-only hash-chained record' },
  { id: 'vaults', label: 'Vaults', blurb: 'Per-project encrypted workspaces' },
];

export default function OperationsTab() {
  const [sub, setSub] = useState<SubTab>('snapshots');
  const active = SUBTABS.find((t) => t.id === sub)!;

  return (
    <div>
      <WhenToUse>
        <strong>When to use Operations.</strong> Act on what the system has already done, not on its settings. Roll back
        to a known-good restore point after an overhaul goes wrong; read the audit trail to answer who asked for a change
        and what the agent did; unlock a project to work on it, and lock it again when you are finished. Snapshots, the
        audit trail and vault data sit on separate planes — rolling back the tooling never touches user data or the record.
      </WhenToUse>

      <div role="tablist" aria-label="Operations sections" style={{ display: 'flex', gap: 'var(--s-2)', marginBottom: 'var(--s-4)', flexWrap: 'wrap' }}>
        {SUBTABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === sub}
            title={t.blurb}
            className="ops-chip"
            onClick={() => setSub(t.id)}
            style={{ padding: '6px 14px' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={active.label}>
        {sub === 'snapshots' && <SnapshotsSection />}
        {sub === 'audit' && <AuditSection />}
        {sub === 'vaults' && <VaultsSection />}
      </div>
    </div>
  );
}
