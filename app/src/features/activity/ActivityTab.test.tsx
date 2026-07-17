// Component tests for the Activity tab: the action feed with its "N of M events"
// counter and paging, the owner/kind/status/text filters, agent selection from
// the spawn tree, removable filter chips, and the standout border on
// policy_deny / rollback rows. Cross-checked against the pure filter helpers so
// the assertions track the deterministic mock world rather than magic numbers.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ActivityTab from './ActivityTab';
import { store } from '../../data/adapter';
import { filterActions, EMPTY_FILTERS } from './activity.helpers';

const actions = store.actions();
const TOTAL = actions.length; // 180
const count = (patch: Partial<typeof EMPTY_FILTERS>) => filterActions(actions, { ...EMPTY_FILTERS, ...patch }).length;

// The "N of M events" line is the only span whose text matches this shape.
function counter(container: HTMLElement): string {
  const el = [...container.querySelectorAll('span')].find((s) => /^\d+ of \d+ events$/.test(s.textContent ?? ''));
  if (!el) throw new Error('events counter not found');
  return el.textContent as string;
}

describe('ActivityTab — feed and paging', () => {
  it('lists events, caps the first page, and reveals more on demand', () => {
    const { container } = render(<ActivityTab />);
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);

    // 180 visible, first page caps at 120, 60 hidden behind the "more" button.
    expect(container.querySelectorAll('.act-row')).toHaveLength(120);
    const more = screen.getByText(/Show 60 more · 60 hidden/);
    fireEvent.click(more);
    expect(container.querySelectorAll('.act-row')).toHaveLength(TOTAL);
    expect(screen.queryByText(/more ·/)).toBeNull();
  });
});

describe('ActivityTab — filters narrow the feed', () => {
  it('filters by action kind', () => {
    const { container } = render(<ActivityTab />);
    const toolChip = screen.getByRole('button', { name: 'tool' });
    fireEvent.click(toolChip);
    expect(toolChip).toHaveAttribute('aria-pressed', 'true');
    expect(counter(container)).toBe(`${count({ kinds: ['tool_call'] })} of ${TOTAL} events`);
    expect(count({ kinds: ['tool_call'] })).toBe(110); // guards the fixture
  });

  it('filters by owner', () => {
    const { container } = render(<ActivityTab />);
    const owner = store.owners()[0]; // Dana Okoro
    fireEvent.click(screen.getByRole('button', { name: owner.name.split(' ')[0] }));
    expect(counter(container)).toBe(`${count({ ownerId: owner.id })} of ${TOTAL} events`);
  });

  it('filters by status', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.click(screen.getByRole('button', { name: 'blocked' }));
    expect(counter(container)).toBe(`${count({ status: 'blocked' })} of ${TOTAL} events`);
    expect(count({ status: 'blocked' })).toBe(4);
  });

  it('filters by label text', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.change(screen.getByPlaceholderText('Filter on label text…'), { target: { value: 'src' } });
    const expected = count({ text: 'src' });
    expect(expected).toBeGreaterThan(0);
    expect(counter(container)).toBe(`${expected} of ${TOTAL} events`);
  });
});

describe('ActivityTab — spawn tree drives the feed', () => {
  it('clicking an agent filters the feed to that agent and shows a chip', () => {
    const { container } = render(<ActivityTab />);
    const agent = store.agents().find((a) => a.name === 'inspector')!; // unique, 8 actions
    const expected = count({ agentId: agent.id });
    expect(expected).toBe(8);

    fireEvent.click(screen.getByTitle('Filter the feed to inspector'));
    expect(counter(container)).toBe(`${expected} of ${TOTAL} events`);
    expect(container.querySelectorAll('.act-row')).toHaveLength(expected);
    expect(screen.getByText(/agent: inspector/)).toBeInTheDocument();
  });

  it('clicking a session header filters the feed to that session', () => {
    const { container } = render(<ActivityTab />);
    const session = store.sessions().find((s) => s.title === 'Add export endpoint')!;
    const expected = count({ sessionId: session.id });

    fireEvent.click(screen.getByRole('button', { name: /Add export endpoint/ }));
    expect(counter(container)).toBe(`${expected} of ${TOTAL} events`);
    expect(screen.getByText(/session: Add export endpoint/)).toBeInTheDocument();
  });
});

describe('ActivityTab — empty feed', () => {
  it('shows the no-match empty state and clears out of it', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.change(screen.getByPlaceholderText('Filter on label text…'), { target: { value: 'zzz-no-such-label' } });
    expect(container.querySelectorAll('.act-row')).toHaveLength(0);
    expect(screen.getByText(/No events match these filters/)).toBeInTheDocument();

    // The inline "Clear filters" link (only shown when a filter is active) resets.
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
  });
});

describe('ActivityTab — row agent shortcut', () => {
  it('clicking the agent in a feed row filters the feed to that agent', () => {
    const { container } = render(<ActivityTab />);
    const newest = actions[actions.length - 1]; // rows render newest first
    const expected = count({ agentId: newest.agentId });

    const firstRow = container.querySelector('.act-row') as HTMLElement;
    fireEvent.click(within(firstRow).getByRole('button')); // the .act-agent button

    expect(counter(container)).toBe(`${expected} of ${TOTAL} events`);
    expect(screen.getByText(/agent:/)).toBeInTheDocument();
  });
});

describe('ActivityTab — active-filter chips', () => {
  it('clears all filters via the "Clear all" control', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.click(screen.getByRole('button', { name: 'blocked' }));
    expect(screen.getByText('Active:')).toBeInTheDocument();
    expect(screen.getByText('status: blocked')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
    expect(screen.queryByText('Active:')).toBeNull();
  });

  it('removes a single filter by clicking its chip', () => {
    const { container } = render(<ActivityTab />);
    const owner = store.owners()[0];
    fireEvent.click(screen.getByRole('button', { name: owner.name.split(' ')[0] }));
    const chip = screen.getByRole('button', { name: new RegExp(`owner: ${owner.name}`) });
    fireEvent.click(chip);
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
  });

  it('removes owner/status/kind/text chips independently', () => {
    const { container } = render(<ActivityTab />);
    const owner = store.owners()[0];
    fireEvent.click(screen.getByRole('button', { name: owner.name.split(' ')[0] })); // owner
    fireEvent.click(screen.getByRole('button', { name: 'blocked' }));                 // status
    fireEvent.click(screen.getByRole('button', { name: 'tool' }));                    // kind
    fireEvent.change(screen.getByPlaceholderText('Filter on label text…'), { target: { value: 'e' } }); // text

    // Each active chip removes just its own filter.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`owner: ${owner.name}`) }));
    fireEvent.click(screen.getByRole('button', { name: 'status: blocked' }));
    fireEvent.click(screen.getByRole('button', { name: '“e”' }));                     // text chip
    // The kind chip in the active row shares the label "tool" with the filter
    // chip; grab the one inside the Active: row.
    const activeRow = screen.getByText('Active:').closest('div') as HTMLElement;
    fireEvent.click(within(activeRow).getByRole('button', { name: 'tool' }));

    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
    expect(screen.queryByText('Active:')).toBeNull();
  });

  it('removes the session chip set from the spawn tree', () => {
    const { container } = render(<ActivityTab />);
    const session = store.sessions().find((s) => s.title === 'Add export endpoint')!;
    fireEvent.click(screen.getByRole('button', { name: /Add export endpoint/ }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`session: ${session.title}`) }));
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
  });

  it('removes the agent chip set from the spawn tree', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.click(screen.getByTitle('Filter the feed to inspector'));
    fireEvent.click(screen.getByRole('button', { name: 'agent: inspector' }));
    expect(counter(container)).toBe(`${TOTAL} of ${TOTAL} events`);
  });
});

describe('ActivityTab — standout rows', () => {
  it('gives policy_deny and rollback rows a coloured left border', () => {
    const { container } = render(<ActivityTab />);

    // Denied events carry an amber edge. Keep the filter-chip reference: once a
    // filter is active an identically-named removal chip also exists.
    const denyChip = screen.getByRole('button', { name: 'deny' });
    fireEvent.click(denyChip);
    expect(counter(container)).toBe(`${count({ kinds: ['policy_deny'] })} of ${TOTAL} events`);
    let row = container.querySelector('.act-row') as HTMLElement;
    expect(row.style.borderLeft).toContain('var(--amber)');

    // Toggle deny off, rollbacks on — those carry a rose edge.
    fireEvent.click(denyChip);
    fireEvent.click(screen.getByRole('button', { name: 'rollback' }));
    row = container.querySelector('.act-row') as HTMLElement;
    expect(row.style.borderLeft).toContain('var(--rose)');
  });

  it('leaves ordinary rows without a coloured edge', () => {
    const { container } = render(<ActivityTab />);
    fireEvent.click(screen.getByRole('button', { name: 'file' }));
    const row = container.querySelector('.act-row') as HTMLElement;
    expect(row.style.borderLeft).toBe('2px solid transparent');
  });
});
