// The agent spawn tree: one block per session, orchestrator at the root with its
// spawned children nested underneath. Clicking a session header filters the feed
// to that session; clicking an agent filters to that agent. Selection is
// reflected back from the shared Filters so the two views stay in step.
import type { AgentInfo, SessionInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { StatusPip, OwnerDot, EmptyState, fmtAgo } from '../../ui/primitives';
import { buildAgentTree, orderSessions } from './activity.helpers';
import type { AgentNode, Filters } from './activity.helpers';

export function AgentTree({ sessions, agents, actionCounts, filters, now, update }: {
  sessions: SessionInfo[];
  agents: AgentInfo[];
  actionCounts: Map<string, number>;
  filters: Filters;
  now: number;
  update: (patch: Partial<Filters>) => void;
}) {
  const ordered = orderSessions(sessions);
  if (ordered.length === 0) return <EmptyState>No sessions yet.</EmptyState>;

  return (
    <div className="act-scroll" style={{
      overflowY: 'auto', maxHeight: '64vh', display: 'flex', flexDirection: 'column', gap: 'var(--s-3)',
    }}>
      {ordered.map((s) => {
        const roots = buildAgentTree(agents, s.id);
        const live = !s.endedAt;
        const selected = filters.sessionId === s.id;
        return (
          <div key={s.id} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
            <button className="act-node" onClick={() => update({ sessionId: selected ? null : s.id, agentId: null })}
              title="Filter the feed to this session"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-2)', width: '100%', textAlign: 'left',
                padding: '7px var(--s-3)', cursor: 'pointer', font: 'inherit',
                background: selected ? 'color-mix(in srgb, var(--accent) 16%, var(--bg-2))' : 'var(--bg-2)',
                border: 'none', borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
              }}>
              <OwnerDot owner={store.ownerById(s.ownerId)!} size={8} />
              <span style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 'var(--fs-sm)' }}>
                {s.title}
              </span>
              <span className="badge" style={{
                padding: '0 6px', flex: 'none',
                color: live ? 'var(--accent)' : 'var(--fg-2)',
                borderColor: live ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : 'var(--line-strong)',
              }}>{live ? 'live' : 'ended'}</span>
              <span className="muted" style={{ fontSize: 'var(--fs-xs)', flex: 'none' }}>{fmtAgo(s.startedAt, now)}</span>
            </button>

            <div style={{ padding: '4px 0' }}>
              {roots.length === 0
                ? <div className="muted" style={{ padding: '4px var(--s-4)', fontSize: 'var(--fs-xs)' }}>No agents spawned.</div>
                : roots.map((n) => <Node key={n.agent.id} node={n} actionCounts={actionCounts} filters={filters} update={update} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Node({ node, actionCounts, filters, update }: {
  node: AgentNode;
  actionCounts: Map<string, number>;
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
}) {
  const { agent, depth, children } = node;
  const selected = filters.agentId === agent.id;
  const count = actionCounts.get(agent.id) ?? 0;

  return (
    <>
      <button className="act-node" onClick={() => update({ agentId: selected ? null : agent.id, sessionId: null })}
        title={`Filter the feed to ${agent.name}`}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--s-2)', width: '100%', textAlign: 'left',
          padding: `3px var(--s-3) 3px ${12 + depth * 16}px`, cursor: 'pointer', font: 'inherit',
          background: selected ? 'color-mix(in srgb, var(--accent) 16%, transparent)' : 'transparent',
          border: 'none', borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
        }}>
        {depth > 0 && <span aria-hidden className="muted" style={{ flex: 'none', fontSize: 'var(--fs-xs)' }}>↳</span>}
        <StatusPip status={agent.status} />
        <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-sm)', fontWeight: depth === 0 ? 600 : 500 }}>
          {agent.name}
        </span>
        <span className="muted mono" style={{ flex: 'none', fontSize: 'var(--fs-xs)' }}>{agent.kind}</span>
        <span style={{ flex: '1 1 auto' }} />
        <span className="muted" title={`${count} actions performed`}
          style={{ flex: 'none', fontSize: 'var(--fs-xs)', fontVariantNumeric: 'tabular-nums' }}>
          {count} act{count === 1 ? '' : 's'}
        </span>
      </button>
      {children.map((c) => <Node key={c.agent.id} node={c} actionCounts={actionCounts} filters={filters} update={update} />)}
    </>
  );
}
