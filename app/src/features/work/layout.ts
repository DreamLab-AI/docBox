// Pure, deterministic helpers for the Work tab dependency graph.
// No React, no side effects: given beads, produce a layered layout and the
// derived views (ready queue, gates, counts). Kept separate so the maths is
// testable and the component stays declarative.
import type { BeadInfo, BeadStatus, GateKind } from '../../domain/types';

// Node box geometry. Exported so the component positions divs on the same grid
// the edges are computed against — one source of truth for the layout maths.
export const NODE_W = 212;
export const NODE_H = 92;
const PAD = 12;
const COL_STRIDE = NODE_W + 60; // horizontal gap leaves room for edge curves
const ROW_STRIDE = NODE_H + 24;

export interface LayoutNode {
  bead: BeadInfo;
  depth: number; // dependency depth: roots = 0, dependents increase
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string; // the dependency (blocker) — drawn on the left
  to: string;   // the dependent (blocked) — drawn on the right
  active: boolean; // true while the blocker is still open, i.e. currently holding
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  byId: Map<string, LayoutNode>;
  width: number;
  height: number;
}

/** A dep still holds if the blocking bead exists and is not yet closed. */
export function isBlockingOpen(bead: BeadInfo | undefined): boolean {
  return !!bead && bead.status !== 'closed';
}

/** Blockers of a bead that are still open — the reasons it cannot proceed. */
export function openBlockers(bead: BeadInfo, byId: Map<string, BeadInfo>): BeadInfo[] {
  return bead.deps
    .map((id) => byId.get(id))
    .filter((b): b is BeadInfo => isBlockingOpen(b));
}

/** A bead is unblocked when none of its declared deps are still open. */
export function isUnblocked(bead: BeadInfo, byId: Map<string, BeadInfo>): boolean {
  return openBlockers(bead, byId).length === 0;
}

/** Longest-path depth from a root, memoised, with a cycle guard. */
function depthOf(
  id: string,
  byId: Map<string, BeadInfo>,
  cache: Map<string, number>,
  onStack: Set<string>,
): number {
  const cached = cache.get(id);
  if (cached !== undefined) return cached;
  if (onStack.has(id)) return 0; // defensive: break dependency cycles at the back-edge
  onStack.add(id);
  const bead = byId.get(id);
  let d = 0;
  if (bead) {
    for (const dep of bead.deps) {
      if (byId.has(dep)) d = Math.max(d, depthOf(dep, byId, cache, onStack) + 1);
    }
  }
  onStack.delete(id);
  cache.set(id, d);
  return d;
}

/**
 * Layered layout: beads placed in columns by dependency depth (roots left,
 * dependents right). Within a column, ordered by priority then age then id so
 * the layout is fully deterministic across renders.
 */
export function computeGraph(beads: BeadInfo[]): GraphLayout {
  const byId = new Map(beads.map((b) => [b.id, b]));
  const depthCache = new Map<string, number>();
  const onStack = new Set<string>();

  const depths = new Map<string, number>();
  for (const b of beads) depths.set(b.id, depthOf(b.id, byId, depthCache, onStack));

  // Group into columns by depth.
  const columns = new Map<number, BeadInfo[]>();
  for (const b of beads) {
    const d = depths.get(b.id) ?? 0;
    (columns.get(d) ?? columns.set(d, []).get(d)!).push(b);
  }

  const nodes: LayoutNode[] = [];
  const nodeById = new Map<string, LayoutNode>();
  let maxCol = 0;
  let maxDepth = 0;

  for (const [depth, colBeads] of [...columns.entries()].sort((a, b) => a[0] - b[0])) {
    colBeads.sort(
      (a, b) =>
        a.priority - b.priority ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );
    maxCol = Math.max(maxCol, colBeads.length);
    maxDepth = Math.max(maxDepth, depth);
    colBeads.forEach((bead, row) => {
      const node: LayoutNode = {
        bead,
        depth,
        x: PAD + depth * COL_STRIDE,
        y: PAD + row * ROW_STRIDE,
      };
      nodes.push(node);
      nodeById.set(bead.id, node);
    });
  }

  const edges: LayoutEdge[] = [];
  for (const b of beads) {
    for (const dep of b.deps) {
      if (nodeById.has(dep) && nodeById.has(b.id)) {
        edges.push({ from: dep, to: b.id, active: isBlockingOpen(byId.get(dep)) });
      }
    }
  }

  return {
    nodes,
    edges,
    byId: nodeById,
    width: PAD * 2 + maxDepth * COL_STRIDE + NODE_W,
    height: PAD * 2 + Math.max(0, maxCol - 1) * ROW_STRIDE + NODE_H,
  };
}

// ---- Derived panels ---------------------------------------------------------

/**
 * The ready queue: beads an agent could claim next. A bead qualifies when it is
 * not closed, not already in progress, and has no open blocking deps. Sorted by
 * priority (0 highest) then age. This is the set `bd ready` would surface.
 */
export function readyQueue(beads: BeadInfo[]): BeadInfo[] {
  const byId = new Map(beads.map((b) => [b.id, b]));
  return beads
    .filter(
      (b) =>
        b.status !== 'closed' &&
        b.status !== 'in_progress' &&
        isUnblocked(b, byId),
    )
    .sort(
      (a, b) => a.priority - b.priority || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    );
}

/** Beads held at a gate (human/ci/pr) and not yet closed. Human gates first. */
export function gatedBeads(beads: BeadInfo[]): BeadInfo[] {
  const rank: Record<Exclude<GateKind, null>, number> = { human: 0, pr: 1, ci: 2 };
  return beads
    .filter((b): b is BeadInfo & { gate: Exclude<GateKind, null> } => b.gate !== null && b.status !== 'closed')
    .sort((a, b) => rank[a.gate] - rank[b.gate] || a.priority - b.priority || a.id.localeCompare(b.id));
}

export const STATUS_ORDER: BeadStatus[] = ['ready', 'in_progress', 'blocked', 'open', 'closed'];

export function countByStatus(beads: BeadInfo[]): Record<BeadStatus, number> {
  const counts: Record<BeadStatus, number> = { open: 0, ready: 0, in_progress: 0, blocked: 0, closed: 0 };
  for (const b of beads) counts[b.status] += 1;
  return counts;
}

export function countByOwner(beads: BeadInfo[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const b of beads) counts.set(b.ownerId, (counts.get(b.ownerId) ?? 0) + 1);
  return counts;
}
