import { describe, it, expect } from 'vitest';
import { buildScene, shortCoreName } from './layout';
import { moduleInfo } from '../../test/world';

// Four surfaces at startDeg -90 land at angles -90, 0, 90, 180. The one at angle
// 0 (surfaces[1]) makes the ray to centre exactly horizontal (dy === 0), which
// drives edgeFromCentre's degenerate axis (sy = Infinity) — the slab-method
// guard. Names are chosen to exercise pillWidth's three outcomes.
function manifest() {
  return [
    moduleInfo({ id: 'core1', layer: 'core', state: 'core', name: 'Control-plane server' }),
    moduleInfo({ id: 'core2', layer: 'core', state: 'core', name: 'Audit spine' }),
    moduleInfo({ id: 's0', layer: 'surface', state: 'on', name: 'x' }),                              // len 1 → PILL_MIN
    moduleInfo({ id: 's1', layer: 'surface', state: 'on', name: '0123456789' }),                     // len 10 → mid, angle 0
    moduleInfo({ id: 's2', layer: 'surface', state: 'on', name: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }), // len 30 → PILL_MAX
    moduleInfo({ id: 's3', layer: 'surface', state: 'on', name: 'mid' }),
    moduleInfo({ id: 'm0', layer: 'module', state: 'off', name: 'Model' }),        // dim (off)
    moduleInfo({ id: 'm1', layer: 'module', state: 'available', name: 'Tunnel' }), // dim (available)
  ];
}

describe('buildScene — fixed board geometry', () => {
  const scene = buildScene(manifest());

  it('centres a core plate inside the constant viewBox', () => {
    expect(scene.vb).toEqual({ w: 880, h: 660 });
    expect(scene.centre).toEqual({ x: 440, y: 330 });
    expect(scene.core).toEqual({ x: 306, y: 254, w: 268, h: 152 });
    expect(scene.glowR).toBe(196);
    expect(scene.rings).toEqual([212, 292]);
  });

  it('partitions the manifest by layer', () => {
    expect(scene.coreItems.map((m) => m.id)).toEqual(['core1', 'core2']);
    expect(scene.surfaces.map((n) => n.m.id)).toEqual(['s0', 's1', 's2', 's3']);
    expect(scene.modules.map((n) => n.m.id)).toEqual(['m0', 'm1']);
  });

  it('assigns each ring its layer colour and constant pill height', () => {
    expect(scene.surfaces.every((n) => n.colour === 'var(--teal)' && n.h === 30)).toBe(true);
    expect(scene.modules.every((n) => n.colour === 'var(--violet)')).toBe(true);
  });
});

describe('pillWidth (via buildScene) clamps to the label band', () => {
  const scene = buildScene(manifest());
  it('floors at PILL_MIN, computes the middle, and caps at PILL_MAX', () => {
    expect(scene.surfaces[0].w).toBe(92);   // len 1 → below min → 92
    expect(scene.surfaces[1].w).toBe(100);  // len 10 → 10*6.6+34 = 100
    expect(scene.surfaces[2].w).toBe(176);  // len 30 → above max → 176
  });
});

describe('placeRing geometry and edge connectors', () => {
  const scene = buildScene(manifest());

  it('places the first surface at the top of its ring (angle -90)', () => {
    const top = scene.surfaces[0].centre;
    expect(top.x).toBeCloseTo(440, 6);
    expect(top.y).toBeCloseTo(118, 6); // CY - SURFACE_R = 330 - 212
  });

  it('runs a horizontal connector for the angle-0 node (dy === 0 slab branch)', () => {
    const node = scene.surfaces[1]; // angle 0 → centre (652, 330)
    expect(node.centre.x).toBeCloseTo(652, 6);
    expect(node.centre.y).toBe(330);
    // Both endpoints stay on the centre line: the pill edge and the core edge.
    expect(node.line.from.y).toBe(330);
    expect(node.line.to.y).toBe(330);
    expect(node.line.from.x).toBeCloseTo(602, 6); // 652 - w/2 (=50)
    expect(node.line.to.x).toBeCloseTo(574, 6);   // 440 + CORE_W/2 (=134)
  });

  it('runs a sloped connector with finite endpoints for a generic node', () => {
    const node = scene.surfaces[3]; // angle 180-ish, both dx and dy non-zero
    for (const p of [node.line.from, node.line.to]) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });

  it('dims off/available nodes and leaves on/core nodes bright', () => {
    expect(scene.modules.find((n) => n.m.id === 'm0')!.dim).toBe(true);  // off
    expect(scene.modules.find((n) => n.m.id === 'm1')!.dim).toBe(true);  // available
    expect(scene.surfaces.every((n) => n.dim === false)).toBe(true);     // all on
  });

  it('returns empty rings when a layer has no members', () => {
    const coreOnly = buildScene([moduleInfo({ id: 'c', layer: 'core', state: 'core', name: 'Domain contract' })]);
    expect(coreOnly.surfaces).toEqual([]);
    expect(coreOnly.modules).toEqual([]);
    expect(coreOnly.coreItems).toHaveLength(1);
  });
});

describe('shortCoreName', () => {
  it('compacts the known core-piece labels', () => {
    expect(shortCoreName('Control-plane server')).toBe('Control plane');
    expect(shortCoreName('Audit spine')).toBe('Audit');
    expect(shortCoreName('Config + apply-class')).toBe('Config');
    expect(shortCoreName('Snapshot / rollback')).toBe('Snapshot');
    expect(shortCoreName('Identity')).toBe('Identity');
    expect(shortCoreName('Domain contract')).toBe('Domain contract');
  });

  it('passes an unknown name through unchanged', () => {
    expect(shortCoreName('Some New Module')).toBe('Some New Module');
  });
});
