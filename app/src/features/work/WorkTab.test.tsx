// Component tests for the Work tab: dependency graph, ready queue, gates, and
// the local gate-approval interaction (approve → signed-off → toast). Data is
// the deterministic mock world (6 beads). Assertions target the DOM the graph
// renders — SVG edges, positioned nodes, panel content — not pixels.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import WorkTab from './WorkTab';
import { store } from '../../data/adapter';
import { readyQueue, gatedBeads, computeGraph } from './layout';

const beads = store.beads();
const panel = (title: string) => screen.getByText(title, { selector: 'h3' }).closest('section') as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe('WorkTab — dependency graph', () => {
  it('renders one positioned node per bead and one path per dependency edge', () => {
    const { container } = render(<WorkTab />);
    const g = computeGraph(beads);

    // Graph nodes are the only 212px-wide boxes on the page (NODE_W).
    const nodes = [...container.querySelectorAll('div')].filter((d) => d.style.width === '212px');
    expect(nodes).toHaveLength(beads.length);        // 6 beads → 6 nodes
    expect(nodes).toHaveLength(g.nodes.length);

    // Edge paths are direct children of the <svg>; marker glyphs live in <defs>.
    const edges = container.querySelectorAll('svg > path');
    expect(edges).toHaveLength(g.edges.length);       // 2 dependency edges
    expect(edges.length).toBe(2);

    // Both edges are "active" (their blocker is still open) → drawn amber.
    for (const p of edges) expect(p.getAttribute('stroke')).toBe('var(--amber)');
  });

  it('shows every bead title and id inside the graph', () => {
    const { container } = render(<WorkTab />);
    const nodes = [...container.querySelectorAll('div')].filter((d) => d.style.width === '212px');
    const nodeText = nodes.map((n) => n.textContent ?? '').join('\n');
    for (const b of beads) {
      expect(nodeText).toContain(b.id);
      expect(nodeText).toContain(b.title);
    }
  });

  it('renders the status legend including the blocking-dep key', () => {
    render(<WorkTab />);
    const graphPanel = panel('Dependency graph');
    expect(within(graphPanel).getByText('blocking dep')).toBeInTheDocument();
    // "ready" appears in both the legend and a node's status label.
    expect(within(graphPanel).getAllByText('ready').length).toBeGreaterThanOrEqual(1);
  });
});

describe('WorkTab — ready queue', () => {
  it('lists only unblocked, claimable beads with the top one flagged "next up"', () => {
    render(<WorkTab />);
    const ready = readyQueue(beads);
    expect(ready.map((b) => b.id)).toEqual(['bd-c3d1']); // guards the fixture

    const queuePanel = panel('Ready queue');
    expect(within(queuePanel).getByText('bd-c3d1')).toBeInTheDocument();
    expect(within(queuePanel).getByText('Revenue widget on dashboard')).toBeInTheDocument();
    expect(within(queuePanel).getByText('next up')).toBeInTheDocument();

    // In-progress / blocked beads never surface in the queue.
    expect(within(queuePanel).queryByText('bd-b2c4')).toBeNull();
    expect(within(queuePanel).queryByText('bd-b2c4.1')).toBeNull();
  });
});

describe('WorkTab — gates and approval', () => {
  it('shows the human gate with an Approve button and the CI gate as automated', () => {
    render(<WorkTab />);
    const gated = gatedBeads(beads);
    expect(gated.map((b) => b.gate)).toEqual(['human', 'ci']); // human first

    const gatesPanel = panel('Gates');
    expect(within(gatesPanel).getByText('bd-b2c4')).toBeInTheDocument();
    expect(within(gatesPanel).getByRole('button', { name: 'Approve overhaul' })).toBeInTheDocument();
    // The CI-gated bead clears automatically — no button.
    expect(within(gatesPanel).getByText('bd-d4e9')).toBeInTheDocument();
    expect(within(gatesPanel).getByText(/automated · no action/)).toBeInTheDocument();
  });

  it('approving flips the gate to signed-off and raises a toast', () => {
    render(<WorkTab />);
    const gatesPanel = panel('Gates');

    // Before: no toast, and nothing is signed off yet.
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('✓ approved')).toBeNull();

    fireEvent.click(within(gatesPanel).getByRole('button', { name: 'Approve overhaul' }));

    // Button is replaced by the signed-off confirmation.
    expect(within(gatesPanel).queryByRole('button', { name: 'Approve overhaul' })).toBeNull();
    expect(within(gatesPanel).getByText(/signed off · overhaul may proceed/)).toBeInTheDocument();

    // The graph node's gate marker flips to approved.
    expect(screen.getAllByText('✓ approved').length).toBeGreaterThanOrEqual(1);

    // Toast confirms, naming the bead, and can be dismissed.
    const toast = screen.getByRole('status');
    expect(within(toast).getByText('bd-b2c4')).toBeInTheDocument();
    expect(toast).toHaveTextContent(/signed off/);
    fireEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('WorkTab — empty ledger', () => {
  it('renders the empty states for graph, queue and gates when there are no beads', () => {
    vi.spyOn(store, 'beads').mockReturnValue([]);
    render(<WorkTab />);
    expect(screen.getByText('No beads on the ledger.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing ready/)).toBeInTheDocument();
    expect(screen.getByText('No beads are held at a gate.')).toBeInTheDocument();
  });
});

describe('WorkTab — inactive edges and a multi-item queue', () => {
  it('draws a settled dependency edge and orders multiple ready beads', () => {
    const owner = store.owners()[0].id;
    const now = store.now();
    vi.spyOn(store, 'beads').mockReturnValue([
      { id: 'k1', title: 'done root', status: 'closed', ownerId: owner, deps: [], gate: null, priority: 0, createdAt: now - 300, closedAt: now - 200 },
      { id: 'k2', title: 'freed by the closed root', status: 'ready', ownerId: owner, deps: ['k1'], gate: null, priority: 1, createdAt: now - 200 },
      { id: 'k3', title: 'independent ready', status: 'ready', ownerId: owner, deps: [], gate: null, priority: 2, createdAt: now - 100 },
    ]);

    const { container } = render(<WorkTab />);

    // The k1→k2 edge is settled (blocker closed) → drawn in the muted line colour.
    const edges = [...container.querySelectorAll('svg > path')];
    expect(edges).toHaveLength(1);
    expect(edges[0].getAttribute('stroke')).toBe('var(--line-strong)');

    // Two ready beads: the first is flagged "next up", the second is not.
    const queuePanel = panel('Ready queue');
    expect(within(queuePanel).getByText('next up')).toBeInTheDocument();
    expect(within(queuePanel).getByText('k2')).toBeInTheDocument();
    expect(within(queuePanel).getByText('k3')).toBeInTheDocument();
  });
});

describe('WorkTab — summary', () => {
  it('renders by-status and by-owner breakdowns', () => {
    render(<WorkTab />);
    const summary = panel('Summary');
    expect(within(summary).getByText('By status')).toBeInTheDocument();
    expect(within(summary).getByText('By owner')).toBeInTheDocument();
    // Every owner appears in the by-owner breakdown.
    for (const o of store.owners()) {
      expect(within(summary).getByText(o.name)).toBeInTheDocument();
    }
  });
});
