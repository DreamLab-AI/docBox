// Vaults: per-project encrypted workspaces, one card each. Locked vaults can be
// unlocked (the wrapped key is released via the operator's Entra session and the
// workspace is decrypted); unlocked vaults can be locked (the plaintext and the
// in-memory key are shredded). Lock state is held locally here and never written
// back to the store.
import { useState } from 'react';
import type { VaultInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { OwnerTag, fmtTime, fmtAgo } from '../../ui/primitives';
import { ConfirmDialog } from './ConfirmDialog';

/** The part of a vault this UI owns locally: lock state and who/when unlocked. */
interface VaultLocal {
  state: VaultInfo['state'];
  unlockedBy?: string;
  unlockedAt?: number;
}

type Pending = { vault: VaultInfo; action: 'unlock' | 'lock' } | null;

export function VaultsSection() {
  const now = store.now();
  const vaults = store.vaults();
  // The operator acting from this control plane: the first admin owner.
  const actingOwnerId = (store.owners().find((o) => o.role === 'admin') ?? store.owners()[0]).id;

  // Local overrides keyed by vault id; absent means "use the store value".
  const [overrides, setOverrides] = useState<Record<string, VaultLocal>>({});
  const [pending, setPending] = useState<Pending>(null);

  const view = (v: VaultInfo): VaultLocal => overrides[v.id] ?? { state: v.state, unlockedBy: v.unlockedBy, unlockedAt: v.unlockedAt };

  function commit(v: VaultInfo, action: 'unlock' | 'lock') {
    setOverrides((prev) => ({
      ...prev,
      [v.id]: action === 'unlock'
        ? { state: 'unlocked', unlockedBy: actingOwnerId, unlockedAt: now }
        : { state: 'locked' },
    }));
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <p className="secondary" style={{ margin: 0, fontSize: 'var(--fs-sm)', maxWidth: 760 }}>
        Each project is a separate encrypted workspace. Unlocking decrypts it in place for this session; locking shreds
        the plaintext and the in-memory key, leaving only the ciphertext at rest. A vault is readable only while unlocked.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--s-4)' }}>
        {vaults.map((v) => (
          <VaultCard key={v.id} vault={v} local={view(v)} now={now} onAct={(action) => setPending({ vault: v, action })} />
        ))}
      </div>

      {pending?.action === 'unlock' && (
        <ConfirmDialog
          open
          title={`Unlock ${pending.vault.project}`}
          confirmLabel="Unlock"
          onClose={() => setPending(null)}
          onConfirmed={() => commit(pending.vault, 'unlock')}
          steps={[
            'Authorising against your Entra session',
            'Releasing the wrapped key from the key source',
            `Decrypting ${pending.vault.project} (${pending.vault.sizeMb} MB)`,
          ]}
          doneMessage={`${pending.vault.project} is unlocked and readable for this session.`}
        >
          <p style={{ margin: 0 }}>
            This releases the vault's wrapped key via your Entra session and decrypts the workspace in place. It stays
            readable until you lock it again or it auto-locks on idle.
          </p>
        </ConfirmDialog>
      )}

      {pending?.action === 'lock' && (
        <ConfirmDialog
          open
          tone="danger"
          title={`Lock ${pending.vault.project}`}
          confirmLabel="Lock"
          onClose={() => setPending(null)}
          onConfirmed={() => commit(pending.vault, 'lock')}
          steps={[
            'Flushing pending writes',
            'Shredding the plaintext',
            'Wiping the in-memory key',
          ]}
          doneMessage={`${pending.vault.project} is locked. Only the ciphertext remains at rest.`}
        >
          <p style={{ margin: 0 }}>
            Locking shreds the decrypted files and the in-memory key. Anything unsaved is flushed first; the encrypted
            data at rest is left in place and needs unlocking again to read.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function VaultCard({ vault, local, now, onAct }: {
  vault: VaultInfo;
  local: VaultLocal;
  now: number;
  onAct: (action: 'unlock' | 'lock') => void;
}) {
  const locked = local.state === 'locked';
  const accent = locked ? 'var(--amber)' : 'var(--green)';

  return (
    <div className="card" style={{ padding: 'var(--s-4)', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
        <span aria-hidden style={{
          width: 34, height: 34, flex: 'none', borderRadius: 'var(--radius-sm)',
          display: 'grid', placeItems: 'center', color: accent,
          background: `color-mix(in srgb, ${accent} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`,
        }}>
          <LockIcon locked={locked} />
        </span>
        <div style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 'var(--fs-md)' }}>{vault.project}</strong>
          <div style={{ fontSize: 'var(--fs-xs)', color: accent, fontWeight: 600 }}>{locked ? 'Locked' : 'Unlocked'}</div>
        </div>
      </header>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px var(--s-3)', fontSize: 'var(--fs-sm)' }}>
        <dt className="muted">Size</dt>
        <dd style={{ margin: 0 }} className="mono">{vault.sizeMb} MB</dd>

        {!locked && (
          <>
            <dt className="muted">Unlocked by</dt>
            <dd style={{ margin: 0 }}>{local.unlockedBy ? <OwnerTag ownerId={local.unlockedBy} /> : <span className="muted">—</span>}</dd>
            <dt className="muted">When</dt>
            <dd style={{ margin: 0 }}>
              {local.unlockedAt ? <>{fmtTime(local.unlockedAt)} <span className="muted">· {fmtAgo(local.unlockedAt, now)}</span></> : <span className="muted">—</span>}
            </dd>
          </>
        )}
      </dl>

      <div style={{ marginTop: 'auto', paddingTop: 'var(--s-2)' }}>
        {locked
          ? <button className="btn btn-primary" onClick={() => onAct('unlock')} style={{ width: '100%', justifyContent: 'center' }}>Unlock</button>
          : <button className="btn" onClick={() => onAct('lock')} style={{ width: '100%', justifyContent: 'center' }}>Lock</button>}
      </div>
    </div>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      {locked
        ? <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
        : <path d="M8 10.5V7a4 4 0 0 1 7.7-1.5" />}
    </svg>
  );
}
