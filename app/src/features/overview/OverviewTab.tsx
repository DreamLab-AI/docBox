import { store } from '../../data/adapter';
import { Panel, OwnerTag, StatusPip, WhenToUse, fmtAgo } from '../../ui/primitives';
import { LiveStart } from '../../ui/liveStart';
import type { ActionKind } from '../../domain/types';

// Overview: the at-a-glance surface. Reads the same store as every other tab;
// its job is orientation, not control — deep actions live in their own tabs.
export default function OverviewTab() {
  const sys = store.system();
  const now = store.now();
  const owners = store.owners();
  const agents = store.agents();
  const actions = store.actions();
  const sessions = store.sessions();
  const snapshots = store.snapshots();
  const beads = store.beads();

  const runningAgents = agents.filter((a) => a.status === 'running').length;
  const openSessions = sessions.filter((s) => !s.endedAt).length;
  const blocked = actions.filter((a) => a.status === 'blocked').length;
  const failed = actions.filter((a) => a.status === 'failed').length;
  const candidate = snapshots.find((s) => s.status === 'candidate');
  const openBeads = beads.filter((b) => b.status !== 'closed').length;
  const gatedBeads = beads.filter((b) => b.gate === 'human' && b.status !== 'closed');

  // Per-owner action counts for the mini activity bars.
  const perOwner = owners.map((o) => ({
    owner: o,
    count: actions.filter((a) => a.ownerId === o.id).length,
  }));
  const maxOwner = Math.max(...perOwner.map((p) => p.count), 1);

  // Action-kind mix for the last hour.
  const recent = actions.filter((a) => a.ts > now - 3600_000);
  const kinds: ActionKind[] = ['tool_call', 'file_change', 'gate_approval', 'provision', 'snapshot', 'rollback', 'policy_deny'];
  const kindCount = (k: ActionKind) => recent.filter((a) => a.kind === k).length;

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <LiveStart />
      <WhenToUse>
        Start here to see whether the sandbox is healthy and busy. Use the stat row to spot trouble
        fast (blocked writes, a failed overhaul, an overhaul waiting on your sign-off), then open the
        named tab to act on it.
      </WhenToUse>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 'var(--s-3)' }}>
        <Stat label="Open sessions" value={openSessions} sub={`${sessions.length} today`} />
        <Stat label="Agents running" value={runningAgents} sub={`${agents.length} spawned`} tone={runningAgents > 0 ? 'accent' : undefined} />
        <Stat label="Open work items" value={openBeads} sub={`${beads.length} total`} />
        <Stat label="Blocked writes" value={blocked} sub="policy denied" tone={blocked > 0 ? 'amber' : undefined} />
        <Stat label="Failed actions" value={failed} sub="last window" tone={failed > 0 ? 'rose' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 'var(--s-4)', alignItems: 'start' }}>
        <Panel title="Overhaul in flight" hint="A rebuild is bracketed by a snapshot and can auto-roll-back">
          {candidate ? (
            <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
                <StatusPip status="candidate" />
                <strong>{candidate.label}</strong>
                <span className="badge badge-rebuild">rebuild</span>
              </div>
              <p className="secondary" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>{candidate.proposalSummary}</p>
              <div className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                Requested by <OwnerTag ownerId={candidate.initiatorOwnerId} /> · healthcheck {candidate.healthcheck} ·
                the current stack keeps serving until the new one passes.
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>No overhaul running. The system definition is stable.</p>
          )}
          {gatedBeads.length > 0 && (
            <div style={{ marginTop: 'var(--s-4)', paddingTop: 'var(--s-3)', borderTop: '1px solid var(--line)' }}>
              <div className="secondary" style={{ fontSize: 'var(--fs-sm)', marginBottom: 'var(--s-2)' }}>
                Waiting on human approval ({gatedBeads.length})
              </div>
              {gatedBeads.map((b) => (
                <div key={b.id} style={{ display: 'flex', gap: 'var(--s-2)', alignItems: 'center', fontSize: 'var(--fs-sm)', padding: '3px 0' }}>
                  <span className="mono muted">{b.id}</span> {b.title}
                  <span className="badge" style={{ marginLeft: 'auto' }}>human gate</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Last hour" hint="Action mix across the sandbox">
          <div style={{ display: 'grid', gap: 'var(--s-2)' }}>
            {kinds.map((k) => {
              const c = kindCount(k);
              const max = Math.max(...kinds.map(kindCount), 1);
              return (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 28px', alignItems: 'center', gap: 'var(--s-2)', fontSize: 'var(--fs-sm)' }}>
                  <span className="muted">{k.replace('_', ' ')}</span>
                  <span style={{ height: 6, borderRadius: 3, background: 'var(--bg-3)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', height: '100%', width: `${(c / max) * 100}%`, background: kindColour(k) }} />
                  </span>
                  <span className="mono" style={{ textAlign: 'right', color: c ? 'var(--fg-1)' : 'var(--fg-2)' }}>{c}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--s-4)', alignItems: 'start' }}>
        <Panel title="People at work" hint="Actions attributed per owner">
          <div style={{ display: 'grid', gap: 'var(--s-2)' }}>
            {perOwner.sort((a, b) => b.count - a.count).map(({ owner, count }) => (
              <div key={owner.id} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 32px', alignItems: 'center', gap: 'var(--s-2)' }}>
                <span style={{ fontSize: 'var(--fs-sm)' }}><OwnerTag ownerId={owner.id} /></span>
                <span style={{ height: 8, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: `${(count / maxOwner) * 100}%`, background: owner.colour }} />
                </span>
                <span className="mono" style={{ textAlign: 'right', fontSize: 'var(--fs-sm)' }}>{count}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="System" hint="What is provisioned right now">
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--s-2) var(--s-4)', margin: 0, fontSize: 'var(--fs-sm)' }}>
            <dt className="muted">Active stack</dt><dd style={{ margin: 0 }} className="mono">{sys.activeStack} · {sys.imageTag}</dd>
            <dt className="muted">Uptime</dt><dd style={{ margin: 0 }}>{sys.uptimeHours < 1 ? '<1' : Math.round(sys.uptimeHours)}h</dd>
            <dt className="muted">Local model</dt><dd style={{ margin: 0 }} className="mono">{sys.localModel}</dd>
            <dt className="muted">Providers online</dt><dd style={{ margin: 0 }}>{sys.providersOnline.join(', ')}</dd>
            <dt className="muted">Audit verified</dt><dd style={{ margin: 0 }}>{sys.auditChainVerifiedAt > 0 ? fmtAgo(sys.auditChainVerifiedAt, now) : 'never'}</dd>
            <dt className="muted">Pending rebuilds</dt><dd style={{ margin: 0 }}>{sys.pendingRebuildChanges}</dd>
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: 'accent' | 'amber' | 'rose' }) {
  const colour = tone === 'accent' ? 'var(--accent)' : tone === 'amber' ? 'var(--amber)' : tone === 'rose' ? 'var(--rose)' : 'var(--fg-0)';
  return (
    <div className="card" style={{ padding: 'var(--s-3) var(--s-4)' }}>
      <div style={{ fontSize: 'var(--fs-2xl)', fontWeight: 700, color: colour, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 'var(--fs-sm)', marginTop: 2 }}>{label}</div>
      {sub && <div className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{sub}</div>}
    </div>
  );
}

function kindColour(k: ActionKind): string {
  const map: Record<ActionKind, string> = {
    tool_call: 'var(--accent)', file_change: 'var(--teal)', snapshot: 'var(--violet)',
    rollback: 'var(--rose)', gate_approval: 'var(--green)', provision: 'var(--amber)', policy_deny: 'var(--rose)',
  };
  return map[k];
}
