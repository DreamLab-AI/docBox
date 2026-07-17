import { describe, it, expect } from 'vitest';
import {
  isBlockingOpen, openBlockers, isUnblocked, computeGraph, readyQueue,
  gatedBeads, countByStatus, countByOwner, STATUS_ORDER, NODE_W, NODE_H,
} from './layout';
import { bead } from '../../test/world';
import type { BeadInfo } from '../../domain/types';

const byId = (beads: BeadInfo[]) => new Map(beads.map((b) => [b.id, b]));

describe('isBlockingOpen', () => {
  it('is false for a missing bead', () => {
    expect(isBlockingOpen(undefined)).toBe(false);
  });
  it('is false for a closed bead and true for any open state', () => {
    expect(isBlockingOpen(bead({ id: 'x', status: 'closed' }))).toBe(false);
    expect(isBlockingOpen(bead({ id: 'x', status: 'in_progress' }))).toBe(true);
  });
});

describe('openBlockers / isUnblocked', () => {
  it('lists only deps that exist and are still open', () => {
    const beads = [
      bead({ id: 'a', status: 'open' }),
      bead({ id: 'b', status: 'closed' }),
      bead({ id: 'target', deps: ['a', 'b', 'ghost'] }),
    ];
    const map = byId(beads);
    const blockers = openBlockers(map.get('target')!, map);
    expect(blockers.map((b) => b.id)).toEqual(['a']); // 'b' closed, 'ghost' absent
    expect(isUnblocked(map.get('target')!, map)).toBe(false);
  });

  it('reports a bead with no open blockers as unblocked', () => {
    const beads = [bead({ id: 'b', status: 'closed' }), bead({ id: 'target', deps: ['b'] })];
    const map = byId(beads);
    expect(isUnblocked(map.get('target')!, map)).toBe(true);
  });
});

describe('computeGraph', () => {
  it('places beads in columns by longest-path dependency depth', () => {
    const beads = [
      bead({ id: 'a' }),
      bead({ id: 'b', deps: ['a'] }),
      bead({ id: 'c', deps: ['b'] }),
    ];
    const g = computeGraph(beads);
    expect(g.byId.get('a')!.depth).toBe(0);
    expect(g.byId.get('b')!.depth).toBe(1);
    expect(g.byId.get('c')!.depth).toBe(2);
    // x grows with depth; a/b/c each alone in their column so y is the top row.
    expect(g.byId.get('a')!.x).toBeLessThan(g.byId.get('b')!.x);
    expect(g.byId.get('c')!.x).toBeGreaterThan(g.byId.get('b')!.x);
  });

  it('orders within a column by priority, then age, then id', () => {
    const beads = [
      bead({ id: 'z', priority: 1, createdAt: 5 }),
      bead({ id: 'a', priority: 1, createdAt: 5 }), // tie on priority+age → id breaks it
      bead({ id: 'p0', priority: 0, createdAt: 99 }),
      bead({ id: 'old', priority: 1, createdAt: 1 }),
    ];
    const g = computeGraph(beads);
    const col0 = g.nodes.filter((n) => n.depth === 0).sort((n1, n2) => n1.y - n2.y);
    expect(col0.map((n) => n.bead.id)).toEqual(['p0', 'old', 'a', 'z']);
  });

  it('emits edges from blocker to dependent and flags active ones', () => {
    const beads = [
      bead({ id: 'a', status: 'open' }),   // still blocking
      bead({ id: 'b', status: 'closed' }), // no longer blocking
      bead({ id: 't', deps: ['a', 'b', 'ghost'] }),
    ];
    const g = computeGraph(beads);
    const edges = g.edges.filter((e) => e.to === 't');
    expect(edges).toEqual([
      { from: 'a', to: 't', active: true },
      { from: 'b', to: 't', active: false },
      // 'ghost' has no node, so no edge
    ]);
  });

  it('breaks dependency cycles with the on-stack guard', () => {
    const beads = [
      bead({ id: 'a', deps: ['b'] }),
      bead({ id: 'b', deps: ['a'] }),
    ];
    const g = computeGraph(beads);
    // Neither depth blows the stack; the back-edge resolves to 0.
    expect(g.byId.get('a')!.depth).toBeGreaterThanOrEqual(0);
    expect(g.byId.get('b')!.depth).toBeGreaterThanOrEqual(0);
    expect(g.nodes).toHaveLength(2);
  });

  it('sizes an empty graph from the constants alone', () => {
    const g = computeGraph([]);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.width).toBe(12 * 2 + NODE_W); // PAD*2 + NODE_W, no columns
    expect(g.height).toBe(12 * 2 + NODE_H); // PAD*2 + NODE_H, max(0,-1)=0
  });

  it('sizes width/height from the widest column and deepest chain', () => {
    const beads = [
      bead({ id: 'r' }),
      bead({ id: 's' }),           // second root → column 0 has two rows
      bead({ id: 'd', deps: ['r'] }),
    ];
    const g = computeGraph(beads);
    // maxDepth 1, maxCol 2
    expect(g.width).toBe(12 * 2 + 1 * (NODE_W + 60) + NODE_W);
    expect(g.height).toBe(12 * 2 + (2 - 1) * (NODE_H + 24) + NODE_H);
  });
});

describe('readyQueue', () => {
  it('surfaces claimable beads and orders them by priority then age then id', () => {
    const beads = [
      bead({ id: 'done', status: 'closed' }),
      bead({ id: 'busy', status: 'in_progress' }),
      bead({ id: 'blocked', deps: ['open-dep'] }),
      bead({ id: 'open-dep', status: 'open' }),
      bead({ id: 'ready-hi', status: 'ready', priority: 0, createdAt: 10 }),
      // Two beads tied on both priority and age force the id tiebreaker.
      bead({ id: 'tie-b', status: 'ready', priority: 1, createdAt: 2 }),
      bead({ id: 'tie-a', status: 'ready', priority: 1, createdAt: 2 }),
    ];
    const q = readyQueue(beads);
    // 'open-dep' is itself claimable (open, no deps) but priority 2, so it sorts
    // last. Order: priority (ready-hi first), then age, then id (tie-a < tie-b).
    expect(q.map((b) => b.id)).toEqual(['ready-hi', 'tie-a', 'tie-b', 'open-dep']);
  });
});

describe('gatedBeads', () => {
  it('keeps non-closed gated beads, human gates first', () => {
    const beads = [
      bead({ id: 'ci', gate: 'ci', priority: 0 }),
      bead({ id: 'human', gate: 'human', priority: 3 }),
      bead({ id: 'pr', gate: 'pr' }),
      bead({ id: 'none', gate: null }),
      bead({ id: 'closed-human', gate: 'human', status: 'closed' }),
    ];
    expect(gatedBeads(beads).map((b) => b.id)).toEqual(['human', 'pr', 'ci']);
  });

  it('breaks gate ties by priority then id', () => {
    const beads = [
      bead({ id: 'b', gate: 'human', priority: 1 }),
      bead({ id: 'a', gate: 'human', priority: 1 }),
      bead({ id: 'hi', gate: 'human', priority: 0 }),
    ];
    expect(gatedBeads(beads).map((b) => b.id)).toEqual(['hi', 'a', 'b']);
  });
});

describe('counts', () => {
  it('tallies every status including the zeros', () => {
    const beads = [
      bead({ id: '1', status: 'open' }),
      bead({ id: '2', status: 'open' }),
      bead({ id: '3', status: 'closed' }),
    ];
    expect(countByStatus(beads)).toEqual({ open: 2, ready: 0, in_progress: 0, blocked: 0, closed: 1 });
  });

  it('tallies beads per owner', () => {
    const beads = [
      bead({ id: '1', ownerId: 'x' }),
      bead({ id: '2', ownerId: 'x' }),
      bead({ id: '3', ownerId: 'y' }),
    ];
    const counts = countByOwner(beads);
    expect(counts.get('x')).toBe(2);
    expect(counts.get('y')).toBe(1);
  });

  it('exposes the canonical status order and node geometry', () => {
    expect(STATUS_ORDER).toEqual(['ready', 'in_progress', 'blocked', 'open', 'closed']);
    expect(NODE_W).toBe(212);
    expect(NODE_H).toBe(92);
  });
});
