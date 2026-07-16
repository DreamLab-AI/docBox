// Geometry and grouping for the timeline. Pure functions only — no React, no
// canvas — so the coordinate math is easy to read and reason about in one place.
import type { ActionEvent, AgentInfo } from '../../domain/types';
import { store } from '../../data/adapter';
import { resolveColour, KIND_COLOUR, ELEMENT_COLOUR, KIND_LABEL, KIND_ORDER } from './palette';

export type GroupMode = 'owner' | 'agent' | 'element' | 'kind';

/** Actions with no element land in one shared lane under this key. */
export const NO_ELEMENT = '∅'; // ∅

export interface Lane {
  key: string;    // group key (ownerId / agentId / elementId / kind)
  label: string;  // left-gutter label
  sub?: string;   // secondary caption (role / agent kind / element kind)
  swatch: string; // resolved colour dot next to the label
}

export interface Mark {
  action: ActionEvent;
  laneIndex: number;
  x: number;           // CSS px — horizontal position from time
  y: number;           // CSS px — lane centre + jitter
  colour: string;      // resolved fill colour (encodes the active dimension)
  ring: string | null; // resolved ring colour for blocked/failed, else null
}

export interface Geometry {
  width: number; height: number;
  padLeft: number; padRight: number;
  axisY: number;                 // baseline of the time axis
  densityTop: number; densityH: number;
  lanesTop: number; laneH: number;
  plotLeft: number; plotRight: number; plotW: number;
  t0: number; t1: number;        // time window (t1 guaranteed > t0)
}

const PAD_LEFT = 156;  // left gutter for lane labels
const PAD_RIGHT = 20;

export const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Which lane an action belongs to, for the current grouping. */
function laneKey(a: ActionEvent, mode: GroupMode): string {
  switch (mode) {
    case 'owner': return a.ownerId;
    case 'agent': return a.agentId;
    case 'element': return a.elementId ?? NO_ELEMENT;
    case 'kind': return a.kind;
  }
}

/** Mark fill: owner hue when grouped by owner/agent, else the dimension's own hue. */
function markColour(a: ActionEvent, mode: GroupMode): string {
  if (mode === 'kind') return resolveColour(KIND_COLOUR[a.kind]);
  if (mode === 'element') {
    const el = a.elementId ? store.elementById(a.elementId) : undefined;
    return resolveColour(el ? ELEMENT_COLOUR[el.kind] : 'var(--fg-2)');
  }
  return resolveColour(store.ownerById(a.ownerId)?.colour ?? 'var(--fg-2)');
}

/** Build the swimlanes present in the data, ordered sensibly per mode. */
export function buildLanes(actions: ActionEvent[], mode: GroupMode): Lane[] {
  const present = new Set<string>();
  for (const a of actions) present.add(laneKey(a, mode));

  if (mode === 'owner') {
    return store.owners()
      .filter((o) => present.has(o.id))
      .map((o) => ({ key: o.id, label: o.name, sub: o.role, swatch: resolveColour(o.colour) }));
  }

  if (mode === 'agent') {
    const order = new Map(store.owners().map((o, i) => [o.id, i]));
    return store.agents()
      .filter((a) => present.has(a.id))
      // group agents under their owner, then by spawn time (reads top-to-bottom as the tree grew)
      .sort((a, b) => (order.get(a.ownerId)! - order.get(b.ownerId)!) || (a.spawnedAt - b.spawnedAt))
      .map((a) => ({
        key: a.id, label: a.name, sub: a.kind,
        swatch: resolveColour(store.ownerById(a.ownerId)?.colour ?? 'var(--fg-2)'),
      }));
  }

  if (mode === 'element') {
    const lanes: Lane[] = store.elements()
      .filter((e) => present.has(e.id))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))
      .map((e) => ({ key: e.id, label: e.path, sub: e.kind, swatch: resolveColour(ELEMENT_COLOUR[e.kind]) }));
    if (present.has(NO_ELEMENT)) {
      lanes.push({ key: NO_ELEMENT, label: 'no element', sub: 'lifecycle', swatch: resolveColour('var(--fg-2)') });
    }
    return lanes;
  }

  // kind
  return KIND_ORDER
    .filter((k) => present.has(k))
    .map((k) => ({ key: k, label: KIND_LABEL[k], swatch: resolveColour(KIND_COLOUR[k]) }));
}

/** Time → x. Linear across the plot area; clamped so out-of-window marks stay in view. */
export function timeToX(ts: number, g: Geometry): number {
  return g.plotLeft + clamp01((ts - g.t0) / (g.t1 - g.t0)) * g.plotW;
}

/** x → time. Inverse of timeToX, for scrubbing. */
export function xToTime(x: number, g: Geometry): number {
  return g.t0 + clamp01((x - g.plotLeft) / g.plotW) * (g.t1 - g.t0);
}

// Deterministic per-mark vertical offset in [-1, 1). Spreads overlapping marks
// inside a lane so a busy minute reads as a cluster, not a single blob. Same id
// always lands in the same spot (the world is replayable).
function jitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/** Bin action counts across the window for the density strip. */
export function densityBins(actions: ActionEvent[], g: Geometry, binCount: number): number[] {
  const bins = new Array<number>(binCount).fill(0);
  const span = g.t1 - g.t0;
  for (const a of actions) {
    const f = span > 0 ? (a.ts - g.t0) / span : 0;
    let b = Math.floor(f * binCount);
    if (b < 0) b = 0;
    if (b >= binCount) b = binCount - 1;
    bins[b]++;
  }
  return bins;
}

/** Walk parentAgentId up to the orchestrator; returns root → leaf. */
export function lineageOf(agentId: string): AgentInfo[] {
  const chain: AgentInfo[] = [];
  const seen = new Set<string>();
  let cur = store.agentById(agentId);
  while (cur && !seen.has(cur.id)) {
    chain.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentAgentId ? store.agentById(cur.parentAgentId) : undefined;
  }
  return chain;
}

/** Everything the canvas needs for one (width, mode) pairing. */
export function computeLayout(width: number, mode: GroupMode, actions: ActionEvent[]): {
  geo: Geometry; lanes: Lane[]; marks: Mark[];
} {
  const lanes = buildLanes(actions, mode);
  const index = new Map(lanes.map((l, i) => [l.key, i]));

  const [t0, t1raw] = store.timeWindow();
  const t1 = t1raw > t0 ? t1raw : t0 + 1; // guard a zero-width window

  const axisY = 26;
  const densityTop = 34, densityH = 34;
  const lanesTop = densityTop + densityH + 14; // = 82
  // Lane height shrinks as lanes multiply, so 4 owners feel airy and 15 agents still fit.
  const laneH = Math.max(22, Math.min(36, Math.round(300 / Math.max(1, lanes.length))));

  const plotLeft = PAD_LEFT;
  const plotRight = Math.max(plotLeft + 1, width - PAD_RIGHT);
  const plotW = plotRight - plotLeft;
  const height = lanesTop + lanes.length * laneH + 16;

  const geo: Geometry = {
    width, height, padLeft: PAD_LEFT, padRight: PAD_RIGHT,
    axisY, densityTop, densityH, lanesTop, laneH,
    plotLeft, plotRight, plotW, t0, t1,
  };

  const marks: Mark[] = actions.map((a) => {
    const li = index.get(laneKey(a, mode)) ?? 0;
    const laneCentre = lanesTop + li * laneH + laneH / 2;
    return {
      action: a,
      laneIndex: li,
      x: timeToX(a.ts, geo),
      y: laneCentre + jitter(a.id) * (laneH * 0.3),
      colour: markColour(a, mode),
      ring: a.status === 'blocked' ? resolveColour('var(--amber)')
        : a.status === 'failed' ? resolveColour('var(--rose)') : null,
    };
  });

  return { geo, lanes, marks };
}
