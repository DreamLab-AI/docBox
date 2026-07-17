import { describe, it, expect } from 'vitest';
import {
  clamp01, timeToX, xToTime, densityBins, buildLanes, computeLayout, lineageOf,
  NO_ELEMENT, type Geometry,
} from './layout';
import { useWorld, owner, agent, element, action } from '../../test/world';

// Fallback hexes from palette.ts (jsdom has no tokens.css, so var() → fallback).
const OWNER_A = '#5b8cff';
const FG2 = '#6b7688';
const AMBER = '#f0a53a';
const ROSE = '#f0596b';

const geo = (over: Partial<Geometry> = {}): Geometry => ({
  width: 556, height: 0, padLeft: 156, padRight: 20, axisY: 26,
  densityTop: 34, densityH: 34, lanesTop: 82, laneH: 30,
  plotLeft: 156, plotRight: 536, plotW: 380, t0: 0, t1: 100, ...over,
});

describe('clamp01', () => {
  it('clamps below 0, above 1, and passes the interior through', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('timeToX / xToTime', () => {
  const g = geo();
  it('maps time linearly across the plot area and clamps out-of-window marks', () => {
    expect(timeToX(0, g)).toBe(156);
    expect(timeToX(100, g)).toBe(536);
    expect(timeToX(50, g)).toBe(346);
    expect(timeToX(-10, g)).toBe(156);  // before the window → pinned left
    expect(timeToX(200, g)).toBe(536);  // after the window → pinned right
  });
  it('inverts timeToX for scrubbing, clamped to the plot bounds', () => {
    expect(xToTime(156, g)).toBe(0);
    expect(xToTime(536, g)).toBe(100);
    expect(xToTime(346, g)).toBe(50);
    expect(xToTime(0, g)).toBe(0);      // left of plot → t0
    expect(xToTime(9999, g)).toBe(100); // right of plot → t1
  });
  it('round-trips a mid-window timestamp', () => {
    expect(xToTime(timeToX(37, g), g)).toBeCloseTo(37, 6);
  });
});

describe('densityBins', () => {
  it('bins timestamps across the window, clamping the edges into range', () => {
    const g = geo({ t0: 0, t1: 100 });
    const acts = [0, 50, 99, 100, -10].map((ts, i) => action({ id: `a${i}`, ts }));
    const bins = densityBins(acts, g, 10);
    expect(bins).toHaveLength(10);
    expect(bins[0]).toBe(2);  // ts 0 and the clamped ts -10
    expect(bins[5]).toBe(1);  // ts 50
    expect(bins[9]).toBe(2);  // ts 99 and the clamped ts 100
  });
  it('drops every mark into bin 0 when the window has zero span', () => {
    const g = geo({ t0: 50, t1: 50 });
    const bins = densityBins([action({ id: '1', ts: 50 }), action({ id: '2', ts: 999 })], g, 4);
    expect(bins).toEqual([2, 0, 0, 0]);
  });
});

describe('buildLanes', () => {
  it('owner mode: store order, filtered to owners that appear', () => {
    useWorld({
      owners: [owner({ id: 'o1', name: 'Dana', role: 'admin' }), owner({ id: 'o2', name: 'Ravi' }), owner({ id: 'o3', name: 'Absent' })],
      actions: [action({ id: '1', ownerId: 'o2' }), action({ id: '2', ownerId: 'o1' })],
    });
    const lanes = buildLanes(useWorldActions(), 'owner');
    expect(lanes.map((l) => l.key)).toEqual(['o1', 'o2']); // store order, o3 dropped
    expect(lanes[0]).toMatchObject({ label: 'Dana', sub: 'admin', swatch: OWNER_A });
  });

  it('agent mode: grouped under owner order, then by spawn time', () => {
    useWorld({
      owners: [owner({ id: 'o1' }), owner({ id: 'o2' })],
      agents: [
        agent({ id: 'agB', ownerId: 'o2', spawnedAt: 5, name: 'scout', kind: 'researcher' }),
        agent({ id: 'agA2', ownerId: 'o1', spawnedAt: 9, name: 'coder-b' }),
        agent({ id: 'agA1', ownerId: 'o1', spawnedAt: 1, name: 'coder-a' }),
      ],
      actions: [
        action({ id: '1', agentId: 'agB' }), action({ id: '2', agentId: 'agA2' }), action({ id: '3', agentId: 'agA1' }),
      ],
    });
    const lanes = buildLanes(useWorldActions(), 'agent');
    expect(lanes.map((l) => l.key)).toEqual(['agA1', 'agA2', 'agB']); // owner o1 first (spawn asc), then o2
    expect(lanes[0]).toMatchObject({ label: 'coder-a', sub: 'coder', swatch: OWNER_A });
  });

  it('agent mode: falls back to a neutral swatch when the owner is missing', () => {
    useWorld({
      owners: [],
      agents: [agent({ id: 'orphan', ownerId: 'ghost', name: 'lost' })],
      actions: [action({ id: '1', agentId: 'orphan' })],
    });
    const lanes = buildLanes(useWorldActions(), 'agent');
    expect(lanes).toHaveLength(1);
    expect(lanes[0].swatch).toBe(FG2);
  });

  it('element mode: sorted by kind then path, with a shared no-element lane', () => {
    useWorld({
      elements: [
        element({ id: 'e1', kind: 'service', path: 'gateway' }),
        element({ id: 'e2', kind: 'file', path: 'b.ts' }),
        element({ id: 'e3', kind: 'file', path: 'a.ts' }),
      ],
      actions: [
        action({ id: '1', elementId: 'e1' }), action({ id: '2', elementId: 'e2' }),
        action({ id: '3', elementId: 'e3' }), action({ id: '4' }), // no element → NO_ELEMENT lane
      ],
    });
    const lanes = buildLanes(useWorldActions(), 'element');
    expect(lanes.map((l) => l.key)).toEqual(['e3', 'e2', 'e1', NO_ELEMENT]); // file a.ts, file b.ts, service, then ∅
    expect(lanes[3]).toMatchObject({ key: NO_ELEMENT, label: 'no element', sub: 'lifecycle' });
  });

  it('element mode: omits the no-element lane when every action has an element', () => {
    useWorld({
      elements: [element({ id: 'e1', kind: 'file', path: 'a.ts' })],
      actions: [action({ id: '1', elementId: 'e1' })],
    });
    const lanes = buildLanes(useWorldActions(), 'element');
    expect(lanes.map((l) => l.key)).toEqual(['e1']);
  });

  it('kind mode: fixed KIND_ORDER filtered to kinds that appear', () => {
    useWorld({
      actions: [
        action({ id: '1', kind: 'rollback' }), action({ id: '2', kind: 'tool_call' }),
        action({ id: '3', kind: 'file_change' }),
      ],
    });
    const lanes = buildLanes(useWorldActions(), 'kind');
    expect(lanes.map((l) => l.key)).toEqual(['tool_call', 'file_change', 'rollback']); // canonical order
    expect(lanes[0].label).toBe('Tool call');
  });
});

describe('computeLayout', () => {
  it('positions marks by time and lane, colours by dimension, rings by status', () => {
    useWorld({
      now: 3000,
      owners: [owner({ id: 'o1', colour: 'var(--owner-a)' }), owner({ id: 'o2', colour: 'var(--owner-a)' })],
      actions: [
        action({ id: 'ok', ts: 1000, ownerId: 'o1', status: 'ok' }),
        action({ id: 'blk', ts: 3000, ownerId: 'o2', status: 'blocked' }),
        action({ id: 'fail', ts: 2000, ownerId: 'o2', status: 'failed' }),
      ],
    });
    const { geo: g, lanes, marks } = computeLayout(556, 'owner', useWorldActions());

    expect(g.t0).toBe(1000);
    expect(g.t1).toBe(3000);
    expect(g.laneH).toBe(36);          // 2 lanes → round(300/2)=150 → clamped to 36
    expect(lanes).toHaveLength(2);
    expect(marks).toHaveLength(3);

    const ok = marks.find((m) => m.action.id === 'ok')!;
    expect(ok.laneIndex).toBe(0);
    expect(ok.x).toBe(156);            // ts at t0 → plotLeft
    expect(ok.colour).toBe(OWNER_A);
    expect(ok.ring).toBeNull();
    // y sits within the jitter band around the lane centre (82 + 0 + 18 = 100).
    expect(Math.abs(ok.y - 100)).toBeLessThanOrEqual(36 * 0.3);

    const blk = marks.find((m) => m.action.id === 'blk')!;
    expect(blk.x).toBe(536);           // ts at t1 → plotRight
    expect(blk.ring).toBe(AMBER);
    expect(marks.find((m) => m.action.id === 'fail')!.ring).toBe(ROSE);
  });

  it('guards a zero-width time window so x stays finite', () => {
    useWorld({ now: 5000, owners: [owner({ id: 'o1' })], actions: [action({ id: '1', ts: 5000, ownerId: 'o1' })] });
    const { geo: g, marks } = computeLayout(556, 'owner', useWorldActions());
    expect(g.t1).toBe(g.t0 + 1);       // t1raw == t0 → nudged to t0 + 1
    expect(Number.isFinite(marks[0].x)).toBe(true);
    expect(marks[0].x).toBe(156);
  });

  it('shrinks lane height as lanes multiply (min clamp)', () => {
    const owners = Array.from({ length: 15 }, (_, i) => owner({ id: `o${i}` }));
    const actions = owners.map((o, i) => action({ id: `a${i}`, ownerId: o.id }));
    useWorld({ owners, actions });
    const { geo: g, lanes } = computeLayout(556, 'owner', useWorldActions());
    expect(lanes).toHaveLength(15);
    expect(g.laneH).toBe(22);          // round(300/15)=20 → clamped up to the 22 floor
  });

  it('returns empty lanes and marks for no actions', () => {
    useWorld({ now: 1000, actions: [] });
    const { lanes, marks, geo: g } = computeLayout(556, 'owner', []);
    expect(lanes).toEqual([]);
    expect(marks).toEqual([]);
    expect(g.height).toBe(98);         // lanesTop 82 + 0 lanes + 16
  });

  it('kind mode colours marks by their kind hue', () => {
    useWorld({ now: 100, actions: [action({ id: '1', ts: 50, kind: 'tool_call' })] });
    const { marks } = computeLayout(556, 'kind', useWorldActions());
    expect(marks[0].colour).toBe(OWNER_A); // KIND_COLOUR.tool_call = var(--accent) → #5b8cff
  });

  it('element mode: resolves element hue, neutral for found-miss and no-element', () => {
    useWorld({
      now: 100,
      elements: [element({ id: 'e1', kind: 'vault', path: 'v' })],
      actions: [
        action({ id: 'hit', ts: 10, elementId: 'e1' }),
        action({ id: 'miss', ts: 20, elementId: 'gone' }), // element not in store
        action({ id: 'none', ts: 30 }),                    // no elementId
      ],
    });
    const { marks } = computeLayout(556, 'element', useWorldActions());
    expect(marks.find((m) => m.action.id === 'hit')!.colour).toBe('#46c273'); // ELEMENT_COLOUR.vault = var(--green)
    expect(marks.find((m) => m.action.id === 'miss')!.colour).toBe(FG2);      // found-miss → var(--fg-2)
    expect(marks.find((m) => m.action.id === 'none')!.colour).toBe(FG2);      // no element → var(--fg-2)
  });

  it('defaults the lane index to 0 when a mark has no matching lane', () => {
    // Owner present in an action but absent from store.owners() → no lane built.
    useWorld({ owners: [owner({ id: 'o1' })], actions: [action({ id: '1', ownerId: 'ghost' })] });
    const { lanes, marks } = computeLayout(556, 'owner', useWorldActions());
    expect(lanes).toEqual([]);
    expect(marks[0].laneIndex).toBe(0);
    expect(marks[0].colour).toBe(FG2); // unknown owner → neutral swatch
  });
});

describe('lineageOf', () => {
  it('walks parent links from root to leaf', () => {
    useWorld({
      agents: [
        agent({ id: 'root', parentAgentId: null }),
        agent({ id: 'child', parentAgentId: 'root' }),
        agent({ id: 'grand', parentAgentId: 'child' }),
      ],
    });
    expect(lineageOf('grand').map((a) => a.id)).toEqual(['root', 'child', 'grand']);
  });

  it('returns an empty chain for an unknown agent', () => {
    useWorld({ agents: [] });
    expect(lineageOf('nobody')).toEqual([]);
  });

  it('stops when a parent link points outside the store', () => {
    useWorld({ agents: [agent({ id: 'child', parentAgentId: 'missing' })] });
    expect(lineageOf('child').map((a) => a.id)).toEqual(['child']);
  });

  it('breaks a parent cycle instead of looping forever', () => {
    useWorld({
      agents: [agent({ id: 'a1', parentAgentId: 'a2' }), agent({ id: 'a2', parentAgentId: 'a1' })],
    });
    const chain = lineageOf('a1').map((a) => a.id);
    expect(chain).toEqual(['a2', 'a1']); // each id visited once, then the back-edge is cut
  });
});

// Read the actions from the world just installed via useWorld, so tests keep the
// data and its assertions side by side without threading the return value.
import { store } from '../../data/adapter';
function useWorldActions() {
  return store.actions();
}
