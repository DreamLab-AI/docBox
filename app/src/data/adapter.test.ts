// Tests for the store seam (adapter.ts). Exercises every accessor, the id
// lookups (hit + miss), timeWindow maths, hydrate() world-swap, pushAction()
// append + time-sort, and the apply-class label/help maps. The adapter holds a
// module-level mutable `world`; each test re-hydrates a fresh baseline so state
// never leaks between cases.
import { beforeEach, describe, expect, it } from 'vitest';
import * as mock from './mock';
import {
  store,
  hydrate,
  pushAction,
  applyClassLabel,
  applyClassHelp,
  type World,
} from './adapter';
import type { ActionEvent, ApplyClass } from '../domain/types';

/** A world identical to the adapter's default mock world (same array refs). */
function baselineWorld(): World {
  return {
    now: mock.NOW,
    owners: mock.owners,
    sessions: mock.sessions,
    agents: mock.agents,
    elements: mock.elements,
    actions: mock.actions,
    config: mock.configOptions,
    snapshots: mock.snapshots,
    beads: mock.beads,
    audit: mock.audit,
    vaults: mock.vaults,
    documents: mock.documents,
    modules: mock.modules,
    system: mock.systemStatus,
  };
}

const mkWorld = (partial: Partial<World>): World => ({ ...baselineWorld(), ...partial });

const action = (id: string, ts: number): ActionEvent => ({
  id,
  ts,
  kind: 'tool_call',
  ownerId: 'o1',
  agentId: 'ag-1',
  sessionId: 's1',
  label: `act ${id}`,
  status: 'ok',
});

beforeEach(() => hydrate(baselineWorld()));

describe('store accessors', () => {
  it('every accessor returns its backing world slice by reference', () => {
    expect(store.now()).toBe(mock.NOW);
    expect(store.owners()).toBe(mock.owners);
    expect(store.sessions()).toBe(mock.sessions);
    expect(store.agents()).toBe(mock.agents);
    expect(store.elements()).toBe(mock.elements);
    expect(store.actions()).toBe(mock.actions);
    expect(store.config()).toBe(mock.configOptions);
    expect(store.snapshots()).toBe(mock.snapshots);
    expect(store.beads()).toBe(mock.beads);
    expect(store.audit()).toBe(mock.audit);
    expect(store.vaults()).toBe(mock.vaults);
    expect(store.documents()).toBe(mock.documents);
    expect(store.modules()).toBe(mock.modules);
    expect(store.system()).toBe(mock.systemStatus);
  });
});

describe('id lookups', () => {
  it('ownerById hits a known id and misses an unknown one', () => {
    expect(store.ownerById(mock.owners[0].id)).toBe(mock.owners[0]);
    expect(store.ownerById(mock.owners[3].id)).toBe(mock.owners[3]);
    expect(store.ownerById('entra:nope')).toBeUndefined();
  });

  it('agentById hits a known id and misses an unknown one', () => {
    expect(store.agentById(mock.agents[0].id)).toBe(mock.agents[0]);
    expect(store.agentById('ag-does-not-exist')).toBeUndefined();
  });

  it('elementById hits a known id and misses an unknown one', () => {
    expect(store.elementById(mock.elements[0].id)).toBe(mock.elements[0]);
    expect(store.elementById('el-9999')).toBeUndefined();
  });
});

describe('timeWindow', () => {
  it('spans min action ts to the max of action ts values', () => {
    hydrate(mkWorld({ now: 250, actions: [action('a', 100), action('b', 300), action('c', 200)] }));
    expect(store.timeWindow()).toEqual([100, 300]);
  });

  it('uses now as the upper bound when now exceeds every action ts', () => {
    hydrate(mkWorld({ now: 500, actions: [action('a', 100), action('b', 300)] }));
    expect(store.timeWindow()).toEqual([100, 500]);
  });

  it('collapses to [now, now] when there are no actions', () => {
    // Empty ts array would make Math.min() === +Infinity (a NaN-poison upper
    // bound downstream); the guard returns a zero-width window on the clock.
    hydrate(mkWorld({ now: 777, actions: [] }));
    expect(store.timeWindow()).toEqual([777, 777]);
  });
});

describe('hydrate', () => {
  it('swaps the world so accessors return the new data', () => {
    const owners = [
      { id: 'x1', name: 'New Owner', upn: 'x@x.co', role: 'admin' as const, colour: 'var(--x)' },
    ];
    hydrate(mkWorld({ now: 999, owners }));
    expect(store.owners()).toBe(owners);
    expect(store.owners()).not.toBe(mock.owners);
    expect(store.now()).toBe(999);
  });
});

describe('pushAction', () => {
  it('appends an action and keeps the stream time-sorted after an out-of-order insert', () => {
    hydrate(mkWorld({ actions: [action('a', 100), action('c', 300)] }));
    pushAction(action('b', 200));
    expect(store.actions().map((a) => a.ts)).toEqual([100, 200, 300]);
    expect(store.actions().map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(store.actions()).toHaveLength(3);
  });

  it('sorts an action that predates every existing action to the front', () => {
    hydrate(mkWorld({ actions: [action('a', 200), action('b', 300)] }));
    pushAction(action('z', 50));
    expect(store.actions().map((a) => a.id)).toEqual(['z', 'a', 'b']);
  });

  it('does not mutate the source mock.actions array', () => {
    hydrate(baselineWorld());
    const originalLength = mock.actions.length;
    pushAction(action('extra', mock.NOW + 10_000));
    expect(mock.actions).toHaveLength(originalLength);
    expect(store.actions()).toHaveLength(originalLength + 1);
  });
});

describe('applyClass maps', () => {
  const keys: ApplyClass[] = ['hot', 'live', 'session', 'rebuild'];

  it('applyClassLabel has all four apply classes with exact labels', () => {
    expect(applyClassLabel).toEqual({
      hot: 'Hot',
      live: 'Live',
      session: 'Next session',
      rebuild: 'Rebuild',
    });
    expect(Object.keys(applyClassLabel).sort()).toEqual([...keys].sort());
  });

  it('applyClassHelp has all four apply classes with non-empty guidance', () => {
    expect(Object.keys(applyClassHelp).sort()).toEqual([...keys].sort());
    keys.forEach((k) => expect(applyClassHelp[k]).toBeTruthy());
  });
});
