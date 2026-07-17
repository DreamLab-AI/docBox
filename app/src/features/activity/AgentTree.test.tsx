// Direct test for the real AgentTree covering the branch the mock world never
// exercises: a session that spawned no agents.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentTree } from './AgentTree';
import { store } from '../../data/adapter';
import { EMPTY_FILTERS } from './activity.helpers';

describe('AgentTree', () => {
  it('renders the "no agents spawned" note for an agent-less session', () => {
    const owner = store.owners()[0];
    const session = { id: 'sess-empty', ownerId: owner.id, title: 'Empty session', startedAt: store.now() };
    render(
      <AgentTree
        sessions={[session]}
        agents={[]}
        actionCounts={new Map()}
        filters={EMPTY_FILTERS}
        now={store.now()}
        update={() => {}}
      />,
    );
    expect(screen.getByText('Empty session')).toBeInTheDocument();
    expect(screen.getByText('No agents spawned.')).toBeInTheDocument();
  });

  it('renders a neutral owner dot when the session owner is unknown (live data)', () => {
    const session = { id: 'sess-orphan', ownerId: 'no-such-owner', title: 'Orphan session', startedAt: store.now() };
    const { container } = render(
      <AgentTree
        sessions={[session]}
        agents={[]}
        actionCounts={new Map()}
        filters={EMPTY_FILTERS}
        now={store.now()}
        update={() => {}}
      />,
    );
    // Renders without throwing on the missing owner, with a neutral placeholder.
    expect(screen.getByText('Orphan session')).toBeInTheDocument();
    expect(container.querySelector('[title="unknown owner"]')).toBeInTheDocument();
  });

  it('renders the "no sessions" empty state', () => {
    render(
      <AgentTree
        sessions={[]}
        agents={[]}
        actionCounts={new Map()}
        filters={EMPTY_FILTERS}
        now={store.now()}
        update={() => {}}
      />,
    );
    expect(screen.getByText('No sessions yet.')).toBeInTheDocument();
  });
});
