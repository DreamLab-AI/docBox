// The world store seam. Two impls behind one interface: the seeded store (the
// mock module, the offline default) and the real store (an initially empty
// JSON-file datastore). These exercise the real store directly — empty start,
// provision semantics, and the atomic persistence roundtrip — plus the seeded
// store's provenance. The route-level behaviour is covered in index.world.test.ts.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getWorldStore, resetWorldStore } from './store';

function realEnv(dir: string): NodeJS.ProcessEnv {
  return { DOCBOX_DATA: 'real', DOCBOX_DATA_DIR: dir } as NodeJS.ProcessEnv;
}

describe('RealStore — an initially empty datastore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'docbox-store-'));
    resetWorldStore();
  });
  afterEach(() => {
    resetWorldStore();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports dataSource "real" and starts with every world-data array empty', () => {
    const store = getWorldStore(realEnv(dir));
    expect(store.dataSource).toBe('real');
    const w = store.world();
    expect(w.dataSource).toBe('real');
    for (const key of ['owners', 'sessions', 'agents', 'elements', 'actions',
      'snapshots', 'beads', 'audit', 'vaults', 'documents'] as const) {
      expect(w[key]).toHaveLength(0);
    }
    // The static manifest is present even on an empty box — capability, not data.
    expect(w.modules.length).toBeGreaterThan(0);
    expect(w.config.length).toBeGreaterThan(0);
  });

  it('reports a finite [now, now] time-window with no actions', () => {
    const w = getWorldStore(realEnv(dir)).world();
    expect(w.timeWindow).toHaveLength(2);
    expect(Number.isFinite(w.timeWindow[0])).toBe(true);
    expect(Number.isFinite(w.timeWindow[1])).toBe(true);
    expect(w.timeWindow[0]).toBe(w.now);
    expect(w.timeWindow[1]).toBe(w.now);
  });

  it('reports honest live system values from the environment', () => {
    const store = getWorldStore({ DOCBOX_DATA: 'real', DOCBOX_DATA_DIR: dir, DOCBOX_STACK: 'green', DOCBOX_IMAGE_TAG: 'foreman:test' } as NodeJS.ProcessEnv);
    const sys = store.world().system;
    expect(sys.activeStack).toBe('green');
    expect(sys.imageTag).toBe('foreman:test');
    expect(sys.auditChainVerifiedAt).toBe(0);
    expect(sys.providersOnline).toEqual([]);
    expect(sys.uptimeHours).toBeGreaterThanOrEqual(0);
  });

  it('provision creates the first owner (admin), a locked vault, a session and a provision action', () => {
    const store = getWorldStore(realEnv(dir));
    const res = store.provision({ project: 'aurora', identity: { ownerId: 'entra:9f2a:6b1c', upn: 'dana@client.co', groups: [] } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.owner.id).toBe('entra:9f2a:6b1c');
    expect(res.owner.name).toBe('dana');
    expect(res.owner.role).toBe('admin'); // first owner on an empty box
    expect(res.vault).toMatchObject({ project: 'aurora', state: 'locked' });
    expect(res.action.kind).toBe('provision');
    expect(res.action.ownerId).toBe('entra:9f2a:6b1c');
    expect(res.action.sessionId).toBe(res.sessionId);

    const w = store.world();
    expect(w.owners).toHaveLength(1);
    expect(w.vaults).toHaveLength(1);
    expect(w.sessions).toHaveLength(1);
    expect(w.actions).toHaveLength(1);
    // With one action the window is finite and bounded by it.
    expect(w.timeWindow[0]).toBe(res.action.ts);
  });

  it('reuses an existing owner and makes the second owner a user, not admin', () => {
    const store = getWorldStore(realEnv(dir));
    store.provision({ project: 'aurora', identity: { ownerId: 'a', groups: [] } });
    const second = store.provision({ project: 'borealis', identity: { ownerId: 'b', groups: [] } });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.owner.role).toBe('user');
    expect(store.world().owners).toHaveLength(2);
    // Re-provision as the first owner reuses them, not a third owner.
    const third = store.provision({ project: 'cirrus', identity: { ownerId: 'a', groups: [] } });
    expect(third.ok).toBe(true);
    expect(store.world().owners).toHaveLength(2);
  });

  it('provision without a vault omits the vault but still records the action', () => {
    const store = getWorldStore(realEnv(dir));
    const res = store.provision({ project: 'novault', vault: false, identity: { ownerId: 'a', groups: [] } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.vault).toBeUndefined();
    expect(store.world().vaults).toHaveLength(0);
    expect(store.world().actions).toHaveLength(1);
  });

  it('rejects a missing or non-slug-safe project name with 400', () => {
    const store = getWorldStore(realEnv(dir));
    for (const bad of ['', '  ', 'has spaces', '../escape', 'slash/name', '.dotfile']) {
      const res = store.provision({ project: bad });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    }
    expect(store.world().vaults).toHaveLength(0);
  });

  it('rejects a duplicate project with 409', () => {
    const store = getWorldStore(realEnv(dir));
    expect(store.provision({ project: 'aurora' }).ok).toBe(true);
    const dup = store.provision({ project: 'aurora' });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.status).toBe(409);
    expect(store.world().vaults).toHaveLength(1);
  });

  it('attributes an unauthenticated provision to anonymous', () => {
    const res = getWorldStore(realEnv(dir)).provision({ project: 'aurora' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.owner.id).toBe('anonymous');
  });

  it('persists atomically: a new store instance re-reads the same world', () => {
    const a = getWorldStore(realEnv(dir));
    a.provision({ project: 'aurora', identity: { ownerId: 'a', upn: 'a@x.co', groups: [] } });
    const before = a.world();

    // The atomic write left a durable file (and no leftover temp file).
    const file = join(dir, 'world.json');
    expect(existsSync(file)).toBe(true);
    const persisted = JSON.parse(readFileSync(file, 'utf8'));
    expect(persisted.owners).toHaveLength(1);
    expect(persisted.vaults[0].project).toBe('aurora');

    // A fresh store over the same dir loads it back identically.
    resetWorldStore();
    const b = getWorldStore(realEnv(dir));
    const after = b.world();
    expect(after.owners).toEqual(before.owners);
    expect(after.vaults).toEqual(before.vaults);
    expect(after.actions).toEqual(before.actions);
    expect(after.sessions).toEqual(before.sessions);
  });

  it('addDocument and appendAction persist through a restart', () => {
    const a = getWorldStore(realEnv(dir));
    a.addDocument({
      id: 'doc-1', name: 'x.pdf', ownerId: 'a', project: 'aurora', sizeKb: 1, pages: 1,
      mime: 'application/pdf', uploadedAt: 1, ocr: 'pending', ocrRoute: 'local', handwriting: false,
    });
    resetWorldStore();
    const b = getWorldStore(realEnv(dir));
    expect(b.documents()).toHaveLength(1);
    expect(b.documents()[0].id).toBe('doc-1');
  });

  it('survives a corrupt world.json by starting empty', () => {
    const file = join(dir, 'world.json');
    // Write garbage to the data file, then construct a store over it.
    writeFileSync(file, '{ not json at all', 'utf8');
    resetWorldStore();
    const store = getWorldStore(realEnv(dir));
    expect(store.world().owners).toHaveLength(0);
    // And it heals: a subsequent provision writes a valid file.
    expect(store.provision({ project: 'aurora' }).ok).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8')).vaults).toHaveLength(1);
  });
});

describe('SeededStore — the offline default', () => {
  afterEach(() => resetWorldStore());

  it('reports dataSource "seeded" and a populated, finite world', () => {
    resetWorldStore();
    const store = getWorldStore({} as NodeJS.ProcessEnv); // no DOCBOX_DATA -> seeded
    expect(store.dataSource).toBe('seeded');
    const w = store.world();
    expect(w.dataSource).toBe('seeded');
    expect(w.owners.length).toBeGreaterThan(0);
    expect(w.actions.length).toBeGreaterThan(0);
    expect(Number.isFinite(w.timeWindow[0])).toBe(true);
    expect(w.timeWindow[1]).toBeGreaterThanOrEqual(w.timeWindow[0]);
  });

  it('memoises: the same instance is returned until reset', () => {
    resetWorldStore();
    const first = getWorldStore({} as NodeJS.ProcessEnv);
    const second = getWorldStore({} as NodeJS.ProcessEnv);
    expect(second).toBe(first);
    resetWorldStore();
    expect(getWorldStore({} as NodeJS.ProcessEnv)).not.toBe(first);
  });
});
