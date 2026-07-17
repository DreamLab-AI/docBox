import { describe, it, expect } from 'vitest';
import {
  emphasisColour, hasAnyFilter, filterActions, toggleKind, countActionsByAgent,
  buildAgentTree, orderSessions, EMPTY_FILTERS, ACTION_KINDS, KIND_META,
  ACTION_STATUSES, type Filters,
} from './activity.helpers';
import { action, agent, session } from '../../test/world';

const filters = (p: Partial<Filters> = {}): Filters => ({ ...EMPTY_FILTERS, ...p });

describe('emphasisColour', () => {
  it('highlights denials amber and rollbacks rose, nothing else', () => {
    expect(emphasisColour('policy_deny')).toBe('var(--amber)');
    expect(emphasisColour('rollback')).toBe('var(--rose)');
    expect(emphasisColour('tool_call')).toBeNull();
    expect(emphasisColour('file_change')).toBeNull();
  });
});

describe('hasAnyFilter', () => {
  it('is false for the empty filter set', () => {
    expect(hasAnyFilter(EMPTY_FILTERS)).toBe(false);
  });
  it('treats whitespace-only text as no filter', () => {
    expect(hasAnyFilter(filters({ text: '   ' }))).toBe(false);
  });
  it('is true when any single dimension is set', () => {
    expect(hasAnyFilter(filters({ ownerId: 'o1' }))).toBe(true);
    expect(hasAnyFilter(filters({ kinds: ['tool_call'] }))).toBe(true);
    expect(hasAnyFilter(filters({ status: 'failed' }))).toBe(true);
    expect(hasAnyFilter(filters({ text: 'x' }))).toBe(true);
    expect(hasAnyFilter(filters({ agentId: 'a1' }))).toBe(true);
    expect(hasAnyFilter(filters({ sessionId: 's1' }))).toBe(true);
  });
});

describe('filterActions', () => {
  const acts = [
    action({ id: '1', ownerId: 'o1', agentId: 'a1', sessionId: 's1', kind: 'tool_call', status: 'ok', label: 'Edit auth.ts' }),
    action({ id: '2', ownerId: 'o2', agentId: 'a2', sessionId: 's2', kind: 'file_change', status: 'failed', label: 'Write index.ts' }),
    action({ id: '3', ownerId: 'o1', agentId: 'a2', sessionId: 's1', kind: 'rollback', status: 'blocked', label: 'Rollback deploy' }),
  ];

  it('returns everything when unfiltered', () => {
    expect(filterActions(acts, EMPTY_FILTERS)).toHaveLength(3);
  });
  it('filters by owner', () => {
    expect(filterActions(acts, filters({ ownerId: 'o1' })).map((a) => a.id)).toEqual(['1', '3']);
  });
  it('filters by kind membership', () => {
    expect(filterActions(acts, filters({ kinds: ['file_change', 'rollback'] })).map((a) => a.id)).toEqual(['2', '3']);
  });
  it('filters by status', () => {
    expect(filterActions(acts, filters({ status: 'failed' })).map((a) => a.id)).toEqual(['2']);
  });
  it('filters by agent and session', () => {
    expect(filterActions(acts, filters({ agentId: 'a2' })).map((a) => a.id)).toEqual(['2', '3']);
    expect(filterActions(acts, filters({ sessionId: 's1' })).map((a) => a.id)).toEqual(['1', '3']);
  });
  it('filters by case-insensitive label substring', () => {
    expect(filterActions(acts, filters({ text: 'ROLLBACK' })).map((a) => a.id)).toEqual(['3']);
  });
  it('ANDs dimensions together', () => {
    expect(filterActions(acts, filters({ ownerId: 'o1', kinds: ['rollback'] })).map((a) => a.id)).toEqual(['3']);
  });
  it('returns nothing when no row matches', () => {
    expect(filterActions(acts, filters({ ownerId: 'nobody' }))).toEqual([]);
  });
});

describe('toggleKind', () => {
  it('adds an absent kind and removes a present one', () => {
    expect(toggleKind([], 'tool_call')).toEqual(['tool_call']);
    expect(toggleKind(['tool_call', 'snapshot'], 'tool_call')).toEqual(['snapshot']);
  });
});

describe('countActionsByAgent', () => {
  it('counts actions grouped by agent id', () => {
    const counts = countActionsByAgent([
      action({ id: '1', agentId: 'a1' }),
      action({ id: '2', agentId: 'a1' }),
      action({ id: '3', agentId: 'a2' }),
    ]);
    expect(counts.get('a1')).toBe(2);
    expect(counts.get('a2')).toBe(1);
    expect(counts.get('missing')).toBeUndefined();
  });
});

describe('buildAgentTree', () => {
  it('nests children under parents with increasing depth', () => {
    const agents = [
      agent({ id: 'root', sessionId: 's1', parentAgentId: null, spawnedAt: 0 }),
      agent({ id: 'child', sessionId: 's1', parentAgentId: 'root', spawnedAt: 1 }),
      agent({ id: 'grand', sessionId: 's1', parentAgentId: 'child', spawnedAt: 2 }),
    ];
    const tree = buildAgentTree(agents, 's1');
    expect(tree).toHaveLength(1);
    expect(tree[0].agent.id).toBe('root');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].agent.id).toBe('child');
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].agent.id).toBe('grand');
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('only considers agents in the requested session', () => {
    const agents = [
      agent({ id: 'a', sessionId: 's1' }),
      agent({ id: 'b', sessionId: 's2' }),
    ];
    expect(buildAgentTree(agents, 's1').map((n) => n.agent.id)).toEqual(['a']);
  });

  it('promotes an orphan (parent outside the session) to a root', () => {
    const agents = [
      agent({ id: 'orphan', sessionId: 's1', parentAgentId: 'lives-elsewhere', spawnedAt: 5 }),
      agent({ id: 'real-root', sessionId: 's1', parentAgentId: null, spawnedAt: 0 }),
    ];
    const roots = buildAgentTree(agents, 's1');
    // sorted by spawnedAt, so real-root (0) precedes orphan (5)
    expect(roots.map((n) => n.agent.id)).toEqual(['real-root', 'orphan']);
    expect(roots.every((n) => n.depth === 0)).toBe(true);
  });

  it('orders siblings by spawn time', () => {
    const agents = [
      agent({ id: 'root', sessionId: 's1', parentAgentId: null, spawnedAt: 0 }),
      agent({ id: 'late', sessionId: 's1', parentAgentId: 'root', spawnedAt: 9 }),
      agent({ id: 'early', sessionId: 's1', parentAgentId: 'root', spawnedAt: 1 }),
    ];
    const tree = buildAgentTree(agents, 's1');
    expect(tree[0].children.map((c) => c.agent.id)).toEqual(['early', 'late']);
  });
});

describe('orderSessions', () => {
  it('floats live sessions to the top, then sorts most-recent first', () => {
    const sessions = [
      session({ id: 'old-done', startedAt: 10, endedAt: 20 }),
      session({ id: 'live-early', startedAt: 5 }),        // no endedAt → live
      session({ id: 'recent-done', startedAt: 30, endedAt: 40 }),
      session({ id: 'live-late', startedAt: 50 }),        // no endedAt → live
    ];
    expect(orderSessions(sessions).map((s) => s.id)).toEqual([
      'live-late', 'live-early', 'recent-done', 'old-done',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [session({ id: 'a', startedAt: 1 }), session({ id: 'b', startedAt: 2 })];
    const snapshot = input.map((s) => s.id);
    orderSessions(input);
    expect(input.map((s) => s.id)).toEqual(snapshot);
  });
});

describe('presentation constants', () => {
  it('publishes a stable kind/status set with metadata', () => {
    expect(ACTION_KINDS).toHaveLength(7);
    expect(ACTION_STATUSES).toEqual(['ok', 'blocked', 'failed']);
    for (const k of ACTION_KINDS) {
      expect(KIND_META[k].label).toBeTruthy();
      expect(KIND_META[k].colour).toMatch(/^var\(--/);
    }
  });
});
