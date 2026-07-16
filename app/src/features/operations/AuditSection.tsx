// Audit trail: the append-only record, rendered as a hash chain. Each record
// links to the one before via prevHash; the rail down the left draws that link,
// and "Verify chain" walks every record for real (see chain.ts) to confirm the
// links hold. Anchored records carry a signed off-box anchor marker. Filtering
// by owner is a view only — verification always runs over the whole trail.
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuditRecord } from '../../domain/types';
import { store } from '../../data/adapter';
import { Panel, OwnerTag, fmtTime } from '../../ui/primitives';
import { verifyChain, type ChainResult } from './chain';

type OwnerFilter = 'all' | string;

const KIND_LABEL: Record<string, string> = {
  tool_call: 'tool call',
  file_change: 'file change',
  snapshot: 'snapshot',
  rollback: 'rollback',
  gate_approval: 'gate approval',
  provision: 'provision',
  policy_deny: 'policy deny',
  session_start: 'session start',
  agent_spawn: 'agent spawn',
  config_change: 'config change',
};

function kindColour(kind: string): string {
  if (kind === 'policy_deny') return 'var(--amber)';
  if (kind === 'rollback') return 'var(--rose)';
  if (kind === 'gate_approval') return 'var(--green)';
  return 'var(--fg-1)';
}

const COLS = '30px 92px 172px 132px minmax(240px, 1fr) 176px 104px';

export function AuditSection() {
  const records = store.audit();
  const owners = store.owners();
  const [owner, setOwner] = useState<OwnerFilter>('all');
  const [result, setResult] = useState<ChainResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of records) m.set(r.userId, (m.get(r.userId) ?? 0) + 1);
    return m;
  }, [records]);

  const shown = owner === 'all' ? records : records.filter((r) => r.userId === owner);
  const showConnectors = owner === 'all';

  function runVerify() {
    setVerifying(true);
    setResult(null);
    // Real computation over the full trail, run behind a short beat so the
    // walk reads as a deliberate check rather than an instant flash.
    window.setTimeout(() => {
      setResult(verifyChain(store.audit()));
      setVerifying(false);
    }, 460);
  }

  return (
    <Panel
      title="Audit trail"
      hint="Append-only. The agent can add to it; it cannot alter or delete a record."
      right={
        <button className="btn btn-primary" onClick={runVerify} disabled={verifying}>
          {verifying ? <><span className="ops-spin" aria-hidden /> Walking {records.length} records…</> : '⛓ Verify chain'}
        </button>
      }
    >
      {result && !verifying && <VerifyBanner result={result} />}

      {/* Owner filter — a view over the trail; the check always covers all of it. */}
      <div style={{ display: 'flex', gap: 'var(--s-2)', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 var(--s-3)' }}>
        <span className="muted" style={{ fontSize: 'var(--fs-xs)', marginRight: 4 }}>Filter by owner</span>
        <button className="ops-chip" aria-pressed={owner === 'all'} onClick={() => setOwner('all')}>
          All <span className="muted">{records.length}</span>
        </button>
        {owners.map((o) => (
          <button key={o.id} className="ops-chip" aria-pressed={owner === o.id} onClick={() => setOwner(o.id)}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: o.colour }} />
            {o.name} <span className="muted">{counts.get(o.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {owner !== 'all' && (
        <p className="muted" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-xs)' }}>
          Filtered view: these records are not adjacent in the chain, so the link rail is hidden. Verification still runs
          over all {records.length} records.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <div role="table" aria-label="Audit records" style={{ minWidth: 920 }}>
          {/* Header */}
          <div role="row" style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', padding: '0 0 var(--s-2)', borderBottom: '1px solid var(--line-strong)' }}>
            <HeaderCell />
            <HeaderCell>#</HeaderCell>
            <HeaderCell>Owner</HeaderCell>
            <HeaderCell>Action</HeaderCell>
            <HeaderCell>Summary</HeaderCell>
            <HeaderCell>prevHash → hash</HeaderCell>
            <HeaderCell>Anchor</HeaderCell>
          </div>

          {shown.map((r, i) => (
            <Row
              key={r.seq}
              rec={r}
              showConnectors={showConnectors}
              isFirst={i === 0}
              isLast={i === shown.length - 1}
            />
          ))}
        </div>
      </div>

      <p className="muted" style={{ margin: 'var(--s-4) 0 0', fontSize: 'var(--fs-xs)', maxWidth: 760 }}>
        Records are written to a separate write-only sidecar and periodically signed into an off-box anchor (⚓). Because
        each record commits the hash of the one before it, altering any past record would break every link after it — which
        the check above would catch.
      </p>
    </Panel>
  );
}

function VerifyBanner({ result }: { result: ChainResult }) {
  const ok = result.ok;
  const colour = ok ? 'var(--green)' : 'var(--rose)';
  const pending = result.count - result.anchoredCount;
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'flex-start', gap: 'var(--s-3)', marginBottom: 'var(--s-4)',
      padding: 'var(--s-3) var(--s-4)', borderRadius: 'var(--radius-sm)',
      background: `color-mix(in srgb, ${colour} 10%, transparent)`,
      border: `1px solid color-mix(in srgb, ${colour} 40%, transparent)`,
    }}>
      <span aria-hidden style={{
        width: 20, height: 20, flex: 'none', marginTop: 1, borderRadius: '50%',
        display: 'grid', placeItems: 'center', color: colour,
        border: `1px solid ${colour}`, background: `color-mix(in srgb, ${colour} 18%, transparent)`,
        fontSize: 12, fontWeight: 800,
      }}>{ok ? '✓' : '!'}</span>
      <div style={{ fontSize: 'var(--fs-sm)' }}>
        {ok ? (
          <>
            <strong style={{ color: 'var(--green)' }}>Chain intact.</strong>{' '}
            {result.count} records verified, every prevHash matched the record before it.{' '}
            {result.lastAnchorTs !== null
              ? <>Last off-box anchor at <strong>{fmtTime(result.lastAnchorTs)}</strong> ({result.anchoredCount} anchored, {pending} awaiting the next anchor).</>
              : <>No records are anchored yet.</>}
          </>
        ) : (
          <>
            <strong style={{ color: 'var(--rose)' }}>Chain broken.</strong>{' '}
            Verified {result.brokenAtSeq !== null ? result.brokenAtSeq - 1 : 0} of {result.count} records before a mismatch: {result.reason}.
          </>
        )}
      </div>
    </div>
  );
}

function Row({ rec, showConnectors, isFirst, isLast }: {
  rec: AuditRecord;
  showConnectors: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const drawLine = showConnectors && !(isFirst && isLast);
  return (
    <div role="row" className="ops-audit-row" style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'stretch', borderBottom: '1px solid var(--line)' }}>
      {/* Chain rail: vertical link line + a node per record. */}
      <div style={{
        position: 'relative',
        backgroundImage: drawLine ? 'linear-gradient(var(--line-strong), var(--line-strong))' : 'none',
        backgroundRepeat: 'no-repeat',
        backgroundPositionX: 'center',
        backgroundPositionY: isFirst ? 'bottom' : isLast ? 'top' : 'center',
        backgroundSize: isFirst || isLast ? '2px 50%' : '2px 100%',
      }}>
        <span aria-hidden style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: rec.anchored ? 12 : 9, height: rec.anchored ? 12 : 9, borderRadius: '50%',
          background: rec.anchored ? 'color-mix(in srgb, var(--green) 25%, var(--bg-1))' : 'var(--bg-3)',
          border: `1.5px solid ${rec.anchored ? 'var(--green)' : 'var(--line-strong)'}`,
          boxShadow: rec.anchored ? '0 0 8px color-mix(in srgb, var(--green) 45%, transparent)' : 'none',
        }} />
      </div>

      <Cell>
        <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)' }}>{rec.seq}</div>
        <div className="muted mono" style={{ fontSize: 'var(--fs-xs)' }}>{fmtTime(rec.ts)}</div>
      </Cell>

      <Cell><OwnerTag ownerId={rec.userId} /></Cell>

      <Cell>
        <span className="badge" style={{ color: kindColour(rec.kind), borderColor: `color-mix(in srgb, ${kindColour(rec.kind)} 40%, transparent)` }}>
          {KIND_LABEL[rec.kind] ?? rec.kind}
        </span>
      </Cell>

      <Cell>
        <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-0)' }}>{rec.summary}</div>
        {rec.agentId && <div className="muted mono" style={{ fontSize: 'var(--fs-xs)' }}>{rec.agentId}</div>}
      </Cell>

      <Cell>
        <span className="mono" style={{ fontSize: 'var(--fs-xs)' }} title={`prevHash ${rec.prevHash} → hash ${rec.hash}`}>
          <span className="muted">{rec.prevHash}</span>
          <span aria-hidden style={{ margin: '0 5px', color: 'var(--fg-2)' }}>→</span>
          <span style={{ color: 'var(--accent)' }}>{rec.hash}</span>
        </span>
      </Cell>

      <Cell>
        {rec.anchored ? (
          <span title="Included in a signed off-box anchor" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: 'var(--fs-xs)', fontWeight: 600 }}>
            ⚓ anchored
          </span>
        ) : (
          <span title="Not yet in an anchor" className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)' }}>
            <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', border: '1px solid var(--line-strong)' }} /> pending
          </span>
        )}
      </Cell>
    </div>
  );
}

function HeaderCell({ children }: { children?: ReactNode }) {
  return (
    <div role="columnheader" className="muted" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', padding: '0 var(--s-3)' }}>
      {children}
    </div>
  );
}

function Cell({ children }: { children: ReactNode }) {
  return <div role="cell" style={{ padding: '10px var(--s-3)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0 }}>{children}</div>;
}
