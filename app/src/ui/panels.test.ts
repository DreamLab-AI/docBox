// The panel-registry contract (ADR-010): the manifest is validated before it can
// build panels, so a malformed agent edit is a caught error, not a blank screen.
import { describe, it, expect } from 'vitest';
import { PANELS, PANEL_IDS, buildPanels, parsePanelManifest, PanelManifestError } from './panels';

describe('panel registry', () => {
  it('ships every panel id in manifest (display) order', () => {
    expect(PANELS.map((p) => p.id)).toEqual([...PANEL_IDS]);
  });

  it('binds each panel to a render function and a non-empty label/hint', () => {
    for (const p of PANELS) {
      expect(typeof p.render).toBe('function');
      expect(p.label.trim().length).toBeGreaterThan(0);
      expect(p.hint.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('parsePanelManifest — validate before render', () => {
  const good = [{ id: 'overview', label: 'Overview', hint: 'System at a glance' }];

  it('accepts a well-formed manifest', () => {
    expect(parsePanelManifest(good)).toEqual(good);
  });

  it('rejects a non-array or empty manifest', () => {
    expect(() => parsePanelManifest(null)).toThrow(PanelManifestError);
    expect(() => parsePanelManifest([])).toThrow(/non-empty/);
  });

  it('rejects an unknown panel id (naming the allowed set)', () => {
    expect(() => parsePanelManifest([{ id: 'nope', label: 'x', hint: 'y' }])).toThrow(/unknown id/);
  });

  it('rejects an empty label or a whitespace-only hint', () => {
    expect(() => parsePanelManifest([{ id: 'work', label: '', hint: 'y' }])).toThrow(/label/);
    expect(() => parsePanelManifest([{ id: 'work', label: 'x', hint: '   ' }])).toThrow(/hint/);
  });

  it('rejects a duplicate id', () => {
    const dup = [
      { id: 'work', label: 'A', hint: 'a' },
      { id: 'work', label: 'B', hint: 'b' },
    ];
    expect(() => parsePanelManifest(dup)).toThrow(/duplicate/);
  });
});

describe('buildPanels', () => {
  it('binds a custom validated manifest to its components', () => {
    const panels = buildPanels([{ id: 'system', label: 'Sys', hint: 'h' }]);
    expect(panels).toHaveLength(1);
    expect(panels[0].id).toBe('system');
    expect(typeof panels[0].render).toBe('function');
  });

  it('throws on a malformed manifest before any panel is built', () => {
    expect(() => buildPanels([{ id: 'ghost', label: 'x', hint: 'y' }])).toThrow(PanelManifestError);
  });
});
