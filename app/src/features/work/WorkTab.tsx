// Work — the agent work ledger (beads). Renders the dependency graph, the ready
// queue an agent would claim from, the approval gates, and status/owner counts.
// All data comes from `store`; the only local state is the mock gate-approval.
import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BeadInfo, BeadStatus, GateKind, Owner } from '../../domain/types';
import { store } from '../../data/adapter';
import { Panel, OwnerDot, StatusPip, WhenToUse, EmptyState, fmtAgo } from '../../ui/primitives';
import {
  computeGraph, readyQueue, gatedBeads, openBlockers, isUnblocked,
  countByStatus, countByOwner, STATUS_ORDER, NODE_W, NODE_H,
  type LayoutNode,
} from './layout';

// --- small shared bits -------------------------------------------------------

type PipStatus = 'ok' | 'blocked' | 'failed' | 'running' | 'idle' | 'done' | 'pass' | 'fail' | 'promoted' | 'auto_rolled_back' | 'candidate';

const STATUS_LABEL: Record<BeadStatus, string> = {
  open: 'open', ready: 'ready', in_progress: 'in progress', blocked: 'blocked', closed: 'closed',
};
// Map bead status onto StatusPip's palette (green/accent/amber/grey). Always
// paired with a text label so the two accent-coloured states stay legible.
const STATUS_PIP: Record<BeadStatus, PipStatus> = {
  open: 'idle', ready: 'pass', in_progress: 'running', blocked: 'blocked', closed: 'done',
};
const PRIORITY_COLOUR = ['var(--rose)', 'var(--amber)', 'var(--accent)', 'var(--fg-2)'];

function BeadStatusLabel({ status }: { status: BeadStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--fg-1)' }}>
      <StatusPip status={STATUS_PIP[status]} /> {STATUS_LABEL[status]}
    </span>
  );
}

function PriorityTag({ priority }: { priority: 0 | 1 | 2 | 3 }) {
  const colour = PRIORITY_COLOUR[priority];
  return (
    <span title={`Priority ${priority} (0 is highest)`} style={{
      fontSize: 'var(--fs-xs)', fontWeight: 700, fontFamily: 'var(--font-mono)',
      color: colour, border: `1px solid color-mix(in srgb, ${colour} 45%, transparent)`,
      background: `color-mix(in srgb, ${colour} 12%, transparent)`, borderRadius: 4, padding: '0 5px',
    }}>P{priority}</span>
  );
}

/** Gate marker: a lock for the human sign-off gate, chips for CI/PR. */
function GateMarker({ gate, approved }: { gate: GateKind; approved?: boolean }) {
  if (gate === null) return null;
  if (gate === 'human') {
    return approved ? (
      <span title="Human gate approved" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--green)' }}>✓ approved</span>
    ) : (
      <span title="Held for human sign-off" style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--amber)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        <span aria-hidden>🔒</span> human
      </span>
    );
  }
  const label = gate === 'ci' ? 'CI' : 'PR';
  return (
    <span title={`Held for ${label}`} className="badge" style={{ padding: '0 6px', color: 'var(--fg-1)' }}>{label}</span>
  );
}

function ownerName(o: Owner | undefined): string {
  return o?.name ?? 'unknown';
}

// --- dependency graph --------------------------------------------------------

function DependencyGraph({ beads, approved }: { beads: BeadInfo[]; approved: Set<string> }) {
  const layout = useMemo(() => computeGraph(beads), [beads]);
  if (beads.length === 0) return <EmptyState>No beads on the ledger.</EmptyState>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: layout.width, height: layout.height, minWidth: '100%' }}>
        <svg
          width={layout.width}
          height={layout.height}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          aria-hidden
        >
          <defs>
            <marker id="wk-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--line-strong)" />
            </marker>
            <marker id="wk-arrow-active" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 Z" fill="var(--amber)" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const from = layout.byId.get(e.from)!;
            const to = layout.byId.get(e.to)!;
            const sx = from.x + NODE_W;
            const sy = from.y + NODE_H / 2;
            const tx = to.x;
            const ty = to.y + NODE_H / 2;
            const dx = Math.max(30, (tx - sx) / 2);
            return (
              <path
                key={`${e.from}->${e.to}`}
                d={`M ${sx} ${sy} C ${sx + dx} ${sy}, ${tx - dx} ${ty}, ${tx} ${ty}`}
                fill="none"
                stroke={e.active ? 'var(--amber)' : 'var(--line-strong)'}
                strokeWidth={e.active ? 2 : 1.25}
                strokeDasharray={e.active ? '0' : '4 3'}
                markerEnd={`url(#${e.active ? 'wk-arrow-active' : 'wk-arrow'})`}
                opacity={e.active ? 0.9 : 0.55}
              />
            );
          })}
        </svg>
        {layout.nodes.map((n) => (
          <GraphNode key={n.bead.id} node={n} approved={approved.has(n.bead.id)} />
        ))}
      </div>
    </div>
  );
}

function GraphNode({ node, approved }: { node: LayoutNode; approved: boolean }) {
  const { bead } = node;
  const owner = store.ownerById(bead.ownerId);
  const waiting = bead.status === 'blocked';
  const done = bead.status === 'closed';
  const style: CSSProperties = {
    position: 'absolute', left: node.x, top: node.y, width: NODE_W, height: NODE_H,
    display: 'flex', flexDirection: 'column', gap: 4, padding: 'var(--s-2) var(--s-3)',
    background: 'var(--bg-2)', border: `1px solid ${waiting ? 'color-mix(in srgb, var(--amber) 55%, var(--line))' : 'var(--line)'}`,
    borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow)',
    opacity: done ? 0.5 : waiting ? 0.82 : 1,
    borderLeft: `3px solid ${PRIORITY_COLOUR[bead.priority]}`,
  };
  return (
    <div style={style} title={bead.title}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-1)' }}>{bead.id}</span>
        <GateMarker gate={bead.gate} approved={approved} />
      </div>
      <div style={{
        fontSize: 'var(--fs-sm)', fontWeight: 600, lineHeight: 1.25, color: 'var(--fg-0)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{bead.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 'auto' }}>
        <BeadStatusLabel status={bead.status} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {owner && <OwnerDot owner={owner} />}
          <PriorityTag priority={bead.priority} />
        </span>
      </div>
    </div>
  );
}

// --- ready queue -------------------------------------------------------------

function ReadyQueue({ beads, now }: { beads: BeadInfo[]; now: number }) {
  const queue = readyQueue(beads);
  return (
    <>
      <p className="muted" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)' }}>
        Unblocked beads, highest priority first — what an agent claims next.{' '}
        <span className="mono" style={{ color: 'var(--fg-1)' }}>bd ready</span> is the atomic claim point:
        one agent takes the top bead and no other picks it up.
      </p>
      {queue.length === 0 ? (
        <EmptyState>Nothing ready — every open bead is waiting on a dep or a gate.</EmptyState>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {queue.map((b, i) => {
            const owner = store.ownerById(b.ownerId);
            return (
              <li key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-2) var(--s-3)',
                background: i === 0 ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-2))' : 'var(--bg-2)',
                border: `1px solid ${i === 0 ? 'color-mix(in srgb, var(--accent) 35%, transparent)' : 'var(--line)'}`,
                borderRadius: 'var(--radius-sm)',
              }}>
                <PriorityTag priority={b.priority} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-1)' }}>{b.id}</span>
                    {i === 0 && <span className="badge badge-live" style={{ padding: '0 6px' }}>next up</span>}
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                </div>
                <span title={ownerName(owner)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
                  {owner && <OwnerDot owner={owner} />}
                  {fmtAgo(b.createdAt, now)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}

// --- gates -------------------------------------------------------------------

function Gates({ beads, approved, onApprove }: { beads: BeadInfo[]; approved: Set<string>; onApprove: (id: string) => void }) {
  const gated = gatedBeads(beads);
  return (
    <>
      <p className="muted" style={{ margin: '0 0 var(--s-3)', fontSize: 'var(--fs-sm)' }}>
        Beads paused at a gate. A <strong style={{ color: 'var(--amber)' }}>human</strong> gate is the sign-off a
        CTO-scale overhaul waits on — approving here is that sign-off, and it lets the overhaul proceed. CI and PR
        gates clear automatically.
      </p>
      {gated.length === 0 ? (
        <EmptyState>No beads are held at a gate.</EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' }}>
          {gated.map((b) => {
            const owner = store.ownerById(b.ownerId);
            const isApproved = approved.has(b.id);
            const human = b.gate === 'human';
            return (
              <div key={b.id} style={{
                display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-3)',
                background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${isApproved ? 'color-mix(in srgb, var(--green) 45%, transparent)' : human ? 'color-mix(in srgb, var(--amber) 40%, transparent)' : 'var(--line)'}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="mono" style={{ fontSize: 'var(--fs-xs)', color: 'var(--fg-1)' }}>{b.id}</span>
                    <GateMarker gate={b.gate} approved={isApproved} />
                  </div>
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
                    {owner && <OwnerDot owner={owner} size={8} />} requested by {ownerName(owner)}
                  </div>
                </div>
                {human ? (
                  isApproved ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--green)', fontSize: 'var(--fs-sm)', fontWeight: 600 }}>
                      ✓ signed off · overhaul may proceed
                    </span>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={() => onApprove(b.id)}>
                      Approve overhaul
                    </button>
                  )
                ) : (
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)', whiteSpace: 'nowrap' }}>automated · no action</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// --- summary -----------------------------------------------------------------

function Summary({ beads }: { beads: BeadInfo[] }) {
  const byStatus = countByStatus(beads);
  const byOwner = countByOwner(beads);
  const owners = store.owners();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--s-5)' }}>
      <div>
        <div className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--s-2)' }}>By status</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          {STATUS_ORDER.map((s) => (
            <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 100, fontSize: 'var(--fs-sm)' }}>
              <StatusPip status={STATUS_PIP[s]} />
              {STATUS_LABEL[s]}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{byStatus[s]}</strong>
            </span>
          ))}
        </div>
      </div>
      <div>
        <div className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 'var(--s-2)' }}>By owner</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-2)' }}>
          {owners.map((o) => (
            <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 100, fontSize: 'var(--fs-sm)' }}>
              <OwnerDot owner={o} />
              {o.name}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{byOwner.get(o.id) ?? 0}</strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- graph legend ------------------------------------------------------------

function GraphLegend() {
  const items: [PipStatus, string][] = [
    ['pass', 'ready'], ['running', 'in progress'], ['blocked', 'blocked'], ['idle', 'open'], ['done', 'closed'],
  ];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-3)', fontSize: 'var(--fs-xs)', color: 'var(--fg-2)' }}>
      {items.map(([pip, label]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <StatusPip status={pip} /> {label}
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span aria-hidden style={{ width: 16, height: 0, borderTop: '2px solid var(--amber)' }} /> blocking dep
      </span>
    </div>
  );
}

// --- root --------------------------------------------------------------------

export default function WorkTab() {
  const beads = store.beads();
  const now = store.now();
  const [approved, setApproved] = useState<Set<string>>(() => new Set());
  const [toast, setToast] = useState<string | null>(null);

  const approve = (id: string) => {
    setApproved((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setToast(id);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
      <WhenToUse>
        <strong>The work ledger.</strong> Use it to track long-horizon overhaul work across sessions — each bead is a
        unit of work with its dependencies, owner, and gate. Come here to approve a gated overhaul before it proceeds,
        to see what an agent will pick up next, and to understand what is blocked and why.
      </WhenToUse>

      <Panel
        title="Dependency graph"
        hint="Blocked-by edges, laid out by dependency depth. Roots sit left; dependents flow right."
        right={<GraphLegend />}
      >
        <DependencyGraph beads={beads} approved={approved} />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--s-5)', alignItems: 'start' }}>
        <Panel title="Ready queue">
          <ReadyQueue beads={beads} now={now} />
        </Panel>
        <Panel title="Gates">
          <Gates beads={beads} approved={approved} onApprove={approve} />
        </Panel>
      </div>

      <Panel title="Summary">
        <Summary beads={beads} />
      </Panel>

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', right: 'var(--s-5)', bottom: 'var(--s-5)', zIndex: 20,
            display: 'flex', alignItems: 'center', gap: 'var(--s-3)', padding: 'var(--s-3) var(--s-4)',
            background: 'var(--bg-2)', border: '1px solid color-mix(in srgb, var(--green) 50%, transparent)',
            borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', maxWidth: 380,
          }}
        >
          <span aria-hidden style={{ color: 'var(--green)', fontSize: 'var(--fs-lg)' }}>✓</span>
          <span style={{ fontSize: 'var(--fs-sm)' }}>
            <strong className="mono">{toast}</strong> signed off. The overhaul may now proceed.
          </span>
          <button type="button" className="btn" style={{ padding: '2px 8px' }} onClick={() => setToast(null)} aria-label="Dismiss">×</button>
        </div>
      )}
    </div>
  );
}
