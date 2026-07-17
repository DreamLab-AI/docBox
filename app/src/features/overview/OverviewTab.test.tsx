// Tests for the Overview tab. The first block asserts real numbers and content
// from the deterministic mock world; the second swaps in a "quiet" world (via
// the adapter's hydrate seam) to exercise the empty-state branches.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import OverviewTab from './OverviewTab';
import { store, hydrate, type World } from '../../data/adapter';

function snapshotWorld(): World {
  return {
    now: store.now(), owners: store.owners(), sessions: store.sessions(), agents: store.agents(),
    elements: store.elements(), actions: store.actions(), config: store.config(),
    snapshots: store.snapshots(), beads: store.beads(), audit: store.audit(),
    vaults: store.vaults(), documents: store.documents(), modules: store.modules(), system: store.system(),
  };
}

describe('OverviewTab (mock world)', () => {
  it('opens with the WhenToUse guidance', () => {
    render(<OverviewTab />);
    expect(screen.getByText(/Start here to see whether the sandbox is healthy/)).toBeInTheDocument();
  });

  it('shows the stat row with the mock world figures', () => {
    render(<OverviewTab />);
    const openSessions = screen.getByText('Open sessions').closest('.card') as HTMLElement;
    expect(within(openSessions).getByText('4')).toBeInTheDocument();
    expect(within(openSessions).getByText('5 today')).toBeInTheDocument();

    const agentsRunning = screen.getByText('Agents running').closest('.card') as HTMLElement;
    expect(within(agentsRunning).getByText('19 spawned')).toBeInTheDocument();

    const openWork = screen.getByText('Open work items').closest('.card') as HTMLElement;
    expect(within(openWork).getByText('5')).toBeInTheDocument();
    expect(within(openWork).getByText('6 total')).toBeInTheDocument();

    expect(screen.getByText('Blocked writes')).toBeInTheDocument();
    expect(screen.getByText('Failed actions')).toBeInTheDocument();
  });

  it('renders the overhaul-in-flight candidate with its rebuild badge and initiator', () => {
    render(<OverviewTab />);
    const panel = screen.getByText('Overhaul in flight').closest('.card') as HTMLElement;
    expect(within(panel).getByText('auth provider swap')).toBeInTheDocument();
    expect(within(panel).getByText('rebuild')).toHaveClass('badge-rebuild');
    expect(within(panel).getByText(/Replace bespoke session store with Entra OIDC/)).toBeInTheDocument();
    expect(within(panel).getByText(/healthcheck running/)).toBeInTheDocument();
    // Requested by the admin who initiated snap-4 (Sam Whitfield).
    expect(within(panel).getByText('Sam Whitfield')).toBeInTheDocument();
  });

  it('lists the human-gated bead awaiting approval', () => {
    render(<OverviewTab />);
    const panel = screen.getByText('Overhaul in flight').closest('.card') as HTMLElement;
    expect(within(panel).getByText('Waiting on human approval (1)')).toBeInTheDocument();
    expect(within(panel).getByText('bd-b2c4')).toBeInTheDocument();
    expect(within(panel).getByText(/Swap auth to Entra OIDC/)).toBeInTheDocument();
    expect(within(panel).getByText('human gate')).toBeInTheDocument();
  });

  it('renders the last-hour action-kind bars', () => {
    render(<OverviewTab />);
    const panel = screen.getByText('Last hour').closest('.card') as HTMLElement;
    for (const label of ['tool call', 'file change', 'gate approval', 'provision', 'snapshot', 'rollback', 'policy deny']) {
      expect(within(panel).getByText(label)).toBeInTheDocument();
    }
  });

  it('renders people-at-work with every owner attributed', () => {
    render(<OverviewTab />);
    const panel = screen.getByText('People at work').closest('.card') as HTMLElement;
    for (const name of ['Dana Okoro', 'Ravi Menon', 'Lena Fischer', 'Sam Whitfield']) {
      expect(within(panel).getByText(name)).toBeInTheDocument();
    }
    // Two owners are admins (Dana, Sam) → two admin badges inside this panel.
    expect(within(panel).getAllByText('admin')).toHaveLength(2);
  });

  it('renders the system panel with provisioning facts', () => {
    render(<OverviewTab />);
    const panel = screen.getByText('System').closest('.card') as HTMLElement;
    expect(within(panel).getByText('blue · foreman:c4d9a2')).toBeInTheDocument();
    expect(within(panel).getByText('9h')).toBeInTheDocument();
    expect(within(panel).getByText('qwen3-8b (Q4)')).toBeInTheDocument();
    expect(within(panel).getByText('anthropic, openai')).toBeInTheDocument();
    expect(within(panel).getByText('4m ago')).toBeInTheDocument();
    const pendingRebuilds = within(panel).getByText('Pending rebuilds').closest('dt') as HTMLElement;
    expect(pendingRebuilds.nextElementSibling?.textContent).toBe('0');
  });
});

describe('OverviewTab (quiet world)', () => {
  let original: World;
  beforeAll(() => {
    original = snapshotWorld();
    hydrate({
      ...original,
      actions: [],
      agents: original.agents.map((a) => ({ ...a, status: 'done' })),
      snapshots: original.snapshots.filter((s) => s.status !== 'candidate'),
      beads: original.beads.map((b) => (b.gate === 'human' ? { ...b, gate: null } : b)),
    });
  });
  afterAll(() => hydrate(original));

  it('shows the stable-system message when no overhaul is running', () => {
    render(<OverviewTab />);
    expect(screen.getByText('No overhaul running. The system definition is stable.')).toBeInTheDocument();
  });

  it('omits the human-approval block when nothing is gated', () => {
    render(<OverviewTab />);
    expect(screen.queryByText(/Waiting on human approval/)).toBeNull();
  });

  it('reports zero running agents and no blocked/failed activity', () => {
    render(<OverviewTab />);
    const agentsRunning = screen.getByText('Agents running').closest('.card') as HTMLElement;
    expect(within(agentsRunning).getByText('0')).toBeInTheDocument();
    const blocked = screen.getByText('Blocked writes').closest('.card') as HTMLElement;
    expect(within(blocked).getByText('0')).toBeInTheDocument();
    const failed = screen.getByText('Failed actions').closest('.card') as HTMLElement;
    expect(within(failed).getByText('0')).toBeInTheDocument();
  });
});
