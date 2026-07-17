// Geometry for the core-and-orbit hero. Pure functions only — no React, no DOM —
// so the coordinate maths lives in one readable place and the picture is
// deterministic (same manifest always draws the same scene).
//
// The model: a fixed SVG viewBox (the SVG scales to its container, so we work in
// constant "board" units, never pixels). A rectangular CORE plate sits dead
// centre. SURFACES ride an inner orbit ring, MODULES an outer one. Each orbit
// node is a pill placed on its ring by angle; a connective line runs from the
// pill's inner edge to the point where the ray to centre crosses the core plate,
// which is what signals "everything routes through the core contract".
import type { ModuleInfo } from '../../domain/types';

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number } // top-left origin

export interface OrbitNode {
  m: ModuleInfo;
  centre: Pt;            // pill centre in board units
  w: number;             // pill width (from name length)
  h: number;             // pill height (constant)
  dim: boolean;          // off / available → drawn faint
  colour: string;        // CSS var for the layer (teal / violet)
  line: { from: Pt; to: Pt }; // connector: pill edge → core plate edge
}

export interface Scene {
  vb: { w: number; h: number };
  centre: Pt;
  core: Rect;
  coreItems: ModuleInfo[];
  glowR: number;              // radius of the soft emphasis disc behind the core
  rings: number[];            // guide-circle radii (faint orbit hints)
  surfaces: OrbitNode[];
  modules: OrbitNode[];
}

// Board dimensions. Chosen so the outer ring plus its widest pill and label stay
// inside the box: centre (440,330), outer ring 292 → far nodes land ~732/148 in
// x, ~77/583 in y, all comfortably within 880×660.
const VB_W = 880;
const VB_H = 660;
const CX = 440;
const CY = 330;

const CORE_W = 268;
const CORE_H = 152;

const SURFACE_R = 212; // inner orbit — the ways in
const MODULE_R = 292;  // outer orbit — the optional capabilities

const PILL_H = 30;
const CHAR_W = 6.6;    // ~advance of the 12.5px sans at this size
const PILL_MIN = 92;
const PILL_MAX = 176;

const RAD = Math.PI / 180;

/** Pill width from the name: text run plus room for the state pip and padding. */
function pillWidth(name: string): number {
  const w = name.length * CHAR_W + 34;
  return w < PILL_MIN ? PILL_MIN : w > PILL_MAX ? PILL_MAX : w;
}

/**
 * Where a ray leaving a rectangle's centre in direction (dx,dy) crosses the
 * rectangle boundary. Slab method: scale the direction until it hits the nearer
 * of the vertical or horizontal edge. Used twice per connector — once on the
 * pill (small rect), once on the core plate (big rect).
 */
function edgeFromCentre(c: Pt, halfW: number, halfH: number, dx: number, dy: number): Pt {
  const sx = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(sx, sy);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Lay a group of modules evenly around a ring, first node at `startDeg`. */
function placeRing(mods: ModuleInfo[], radius: number, startDeg: number, colour: string): OrbitNode[] {
  const n = mods.length;
  if (n === 0) return [];
  return mods.map((m, i) => {
    // Even angular spacing from the start angle, clockwise (SVG y points down).
    const ang = (startDeg + (360 / n) * i) * RAD;
    const centre: Pt = { x: CX + radius * Math.cos(ang), y: CY + radius * Math.sin(ang) };
    const w = pillWidth(m.name);
    // Connector: leave the pill on the side facing centre, land on the core edge
    // along the same ray, so the line reads as "routes into the core".
    const from = edgeFromCentre(centre, w / 2, PILL_H / 2, CX - centre.x, CY - centre.y);
    const to = edgeFromCentre({ x: CX, y: CY }, CORE_W / 2, CORE_H / 2, centre.x - CX, centre.y - CY);
    return {
      m,
      centre,
      w,
      h: PILL_H,
      dim: m.state === 'off' || m.state === 'available',
      colour,
      line: { from, to },
    };
  });
}

/** Build the whole scene from the manifest. */
export function buildScene(mods: ModuleInfo[]): Scene {
  const core = mods.filter((m) => m.layer === 'core');
  const surfaces = mods.filter((m) => m.layer === 'surface');
  const modules = mods.filter((m) => m.layer === 'module');

  return {
    vb: { w: VB_W, h: VB_H },
    centre: { x: CX, y: CY },
    core: { x: CX - CORE_W / 2, y: CY - CORE_H / 2, w: CORE_W, h: CORE_H },
    coreItems: core,
    glowR: 196,
    rings: [SURFACE_R, MODULE_R],
    // Surfaces start at the top; modules are staggered 30° so the two rings
    // interleave and their connectors don't line up radially.
    surfaces: placeRing(surfaces, SURFACE_R, -90, 'var(--teal)'),
    modules: placeRing(modules, MODULE_R, -60, 'var(--violet)'),
  };
}

/** Compact core-piece labels for the crowded centre; full names live in the list. */
export function shortCoreName(name: string): string {
  const map: Record<string, string> = {
    'Control-plane server': 'Control plane',
    'Domain contract': 'Domain contract',
    Identity: 'Identity',
    'Audit spine': 'Audit',
    'Config + apply-class': 'Config',
    'Snapshot / rollback': 'Snapshot',
  };
  return map[name] ?? name;
}
