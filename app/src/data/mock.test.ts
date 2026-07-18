// Tests for the seeded mock world (mock.ts). The exports are module-level
// constants produced by a fixed-seed PRNG, so the world is deterministic:
// importing the module runs the generators, and these tests lock the invariants
// the rest of the app relies on (counts, spawn-tree shape, time-sort, the audit
// hash-chain, config tab coverage, module layer counts, valid OCR routes).
import { describe, expect, it } from 'vitest';
import * as mock from './mock';
import type { AgentKind, ConfigTabId, ModuleLayer, ProcessingRoute } from '../domain/types';

describe('clock', () => {
  it('NOW is the fixed seeded UTC instant', () => {
    expect(mock.NOW).toBe(Date.UTC(2026, 6, 16, 14, 30, 0));
  });
});

describe('owners', () => {
  it('has exactly four owners with stable identities', () => {
    expect(mock.owners).toHaveLength(4);
    expect(mock.owners.map((o) => o.name)).toEqual([
      'Dana Okoro',
      'Ravi Menon',
      'Lena Fischer',
      'Sam Whitfield',
    ]);
    expect(mock.owners.filter((o) => o.role === 'admin')).toHaveLength(2);
    expect(mock.owners.every((o) => o.id.startsWith('entra:'))).toBe(true);
  });
});

describe('sessions', () => {
  it('has five sessions, only the first of which has ended', () => {
    expect(mock.sessions).toHaveLength(5);
    expect(mock.sessions.filter((s) => s.endedAt !== undefined)).toHaveLength(1);
    expect(mock.sessions.every((s) => mock.owners.some((o) => o.id === s.ownerId))).toBe(true);
  });
});

describe('elements', () => {
  it('mirrors the fixed path table with sequential ids', () => {
    expect(mock.elements).toHaveLength(12);
    expect(mock.elements.map((e) => e.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `el-${i + 1}`),
    );
    const kinds = new Set(mock.elements.map((e) => e.kind));
    expect(kinds).toEqual(new Set(['file', 'config', 'service', 'model', 'vault']));
  });
});

describe('agents spawn tree', () => {
  const orchestrators = () => mock.agents.filter((a) => a.kind === 'orchestrator');

  it('has exactly one orchestrator per session', () => {
    expect(orchestrators()).toHaveLength(mock.sessions.length);
    for (const s of mock.sessions) {
      const roots = mock.agents.filter((a) => a.kind === 'orchestrator' && a.sessionId === s.id);
      expect(roots).toHaveLength(1);
      expect(roots[0].parentAgentId).toBeNull();
    }
  });

  it('gives Overhaul sessions four children and the rest two', () => {
    // 2 Overhaul sessions (1 root + 4) + 3 others (1 root + 2) = 10 + 9 = 19.
    expect(mock.agents).toHaveLength(19);
    for (const s of mock.sessions) {
      const root = mock.agents.find((a) => a.kind === 'orchestrator' && a.sessionId === s.id)!;
      const children = mock.agents.filter((a) => a.parentAgentId === root.id);
      expect(children).toHaveLength(s.title.startsWith('Overhaul') ? 4 : 2);
    }
  });

  it('draws every agent name from the seeded name pools for its kind', () => {
    const pools: Record<AgentKind, string[]> = {
      orchestrator: ['queen', 'foreman'],
      coder: ['coder-α', 'coder-β', 'coder-γ'],
      researcher: ['scout', 'surveyor'],
      qe: ['qe-fleet', 'inspector'],
      compactor: ['compactor'],
    };
    for (const a of mock.agents) {
      expect(pools[a.kind]).toContain(a.name);
    }
  });

  it('marks agents in the ended session done', () => {
    const ended = mock.sessions.find((s) => s.endedAt !== undefined)!;
    const inEnded = mock.agents.filter((a) => a.sessionId === ended.id);
    expect(inEnded.length).toBeGreaterThan(0);
    expect(inEnded.every((a) => a.status === 'done')).toBe(true);
  });
});

describe('actions stream', () => {
  it('generates 180 events sorted ascending by timestamp', () => {
    expect(mock.actions).toHaveLength(180);
    for (let i = 1; i < mock.actions.length; i++) {
      expect(mock.actions[i].ts).toBeGreaterThanOrEqual(mock.actions[i - 1].ts);
    }
  });

  it('every action has a non-empty label and a valid status', () => {
    for (const a of mock.actions) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(['ok', 'blocked', 'failed']).toContain(a.status);
      if (a.kind === 'policy_deny') expect(a.status).toBe('blocked');
    }
  });

  it('attaches an element only to tool_call and file_change events', () => {
    for (const a of mock.actions) {
      if (a.kind === 'file_change') {
        expect(a.elementId).toBeDefined();
      } else if (a.kind !== 'tool_call') {
        expect(a.elementId).toBeUndefined();
      }
    }
  });
});

describe('audit hash-chain', () => {
  it('records every third action', () => {
    expect(mock.audit).toHaveLength(Math.ceil(mock.actions.length / 3));
    expect(mock.audit).toHaveLength(60);
  });

  it('links each record to the previous via prevHash, seeded from 000000', () => {
    expect(mock.audit[0].prevHash).toBe('000000');
    for (let i = 1; i < mock.audit.length; i++) {
      expect(mock.audit[i].prevHash).toBe(mock.audit[i - 1].hash);
    }
  });

  it('numbers seq from 1 and anchors all but the last four records', () => {
    expect(mock.audit.map((r) => r.seq)).toEqual(
      Array.from({ length: mock.audit.length }, (_, i) => i + 1),
    );
    const notAnchored = mock.audit.filter((r) => !r.anchored);
    expect(notAnchored).toHaveLength(4);
    expect(notAnchored.map((r) => r.seq)).toEqual(
      mock.audit.slice(-4).map((r) => r.seq),
    );
  });
});

describe('config surface', () => {
  it('covers every config tab including interface', () => {
    const expected: ConfigTabId[] = [
      'providers',
      'toolchain',
      'identity',
      'network',
      'vaults',
      'audit',
      'snapshots',
      'agents',
      'interface',
    ];
    const present = new Set(mock.configOptions.map((c) => c.tab));
    for (const tab of expected) expect(present).toContain(tab);
    expect(present.size).toBe(expected.length);
  });

  it('gives every interface option the hot apply-class', () => {
    const iface = mock.configOptions.filter((c) => c.tab === 'interface');
    expect(iface.length).toBeGreaterThan(0);
    expect(iface.some((c) => c.applyClass === 'hot')).toBe(true);
  });

  it('every enum option ships its options list', () => {
    for (const c of mock.configOptions) {
      if (c.type === 'enum') {
        expect(Array.isArray(c.options)).toBe(true);
        expect(c.options!.length).toBeGreaterThan(0);
        expect(c.options).toContain(c.value);
      }
    }
  });
});

describe('module manifest', () => {
  it('has 6 core, 5 surface and 8 module entries', () => {
    const byLayer = (layer: ModuleLayer) => mock.modules.filter((m) => m.layer === layer);
    expect(byLayer('core')).toHaveLength(6);
    expect(byLayer('surface')).toHaveLength(5);
    expect(byLayer('module')).toHaveLength(8);
    expect(mock.modules).toHaveLength(19);
  });

  it('marks every core module with the core state', () => {
    expect(mock.modules.filter((m) => m.layer === 'core').every((m) => m.state === 'core')).toBe(true);
  });
});

describe('documents', () => {
  it('has five documents, each with a valid OCR route', () => {
    const validRoutes: ProcessingRoute[] = ['local', 'anthropic', 'openai', 'mistral', 'gemini'];
    expect(mock.documents).toHaveLength(5);
    for (const d of mock.documents) {
      expect(validRoutes).toContain(d.ocrRoute);
    }
    expect(mock.documents.some((d) => d.ocrRoute === 'local')).toBe(true);
  });
});

describe('remaining fixtures', () => {
  it('has the expected snapshot, bead and vault counts', () => {
    expect(mock.snapshots).toHaveLength(4);
    expect(mock.beads).toHaveLength(6);
    expect(mock.vaults).toHaveLength(3);
  });

  it('exposes a coherent system status', () => {
    expect(mock.systemStatus.activeStack).toBe('blue');
    expect(mock.systemStatus.providersOnline.length).toBeGreaterThan(0);
  });
});
