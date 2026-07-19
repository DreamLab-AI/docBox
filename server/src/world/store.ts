// The world store seam (PRD-001, M3 vertical slice). The control-plane routes
// read the domain world through ONE narrow interface, exactly as they read the
// engine through getEngine() and audit through getAuditEmitter(). Two impls sit
// behind it, chosen by DOCBOX_DATA like the other seams are chosen by env:
//
//   * SeededStore — wraps the app's deterministic mock module as the routes use
//     it today (same mutable arrays, same NOW clock). This is the DEFAULT and is
//     byte-identical to pre-store behaviour: the existing suite is its gate.
//   * RealStore   — a genuine, initially EMPTY datastore. No mock world data ever
//     reaches it; only the static box manifest (modules, config schema) is shared
//     because that describes the box's capabilities, not its world. Mutations
//     persist to a JSON file with an atomic write (tmp + rename) so a restart
//     re-reads the same world. The live+real+empty onboarding path — provision a
//     first project and watch the demo world self-erase — only exists here.
//
// Swapping seeded for real is getWorldStore() plus this file; the routes and the
// UI stay put. That is the same promise getEngine() and the data adapter make.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ActionKind, ActionStatus,
  ConfigOption, SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus,
  DocumentInfo, ModuleInfo,
} from '../../../app/src/domain/types.ts';
import type { RequestIdentity } from '../audit/emit';
import type { IdentityTuple, EngineEvent } from '../engine/client';

// The static box MANIFEST — a description of what the box can run and be
// configured with, not world data. modules is the ADR-009 inventory; configOptions
// is the option schema (labels/help/apply-class) the Configuration tab renders and
// whose values TOML governs. Both are capability descriptions shared by every
// deployment, so importing them into the real store leaks no seeded owner, agent,
// action, vault or document — the world data arrays all start empty and stay real.
import { modules, configOptions } from '../../../app/src/data/mock.ts';

// The seeded world DATA — referenced ONLY by createSeededStore below, never by
// the real store path. Aliased so the two categories (manifest vs seeded data)
// read distinctly and the seeded arrays are easy to grep-audit.
import {
  owners as seededOwners, sessions as seededSessions, agents as seededAgents,
  elements as seededElements, actions as seededActions, snapshots as seededSnapshots,
  beads as seededBeads, audit as seededAudit, vaults as seededVaults,
  documents as seededDocuments, systemStatus as seededSystem, NOW as seededNOW,
} from '../../../app/src/data/mock.ts';

/** Which datastore is answering. The /api/world payload and the UI's live strip
 *  read this: a green 'live' badge over 'seeded' data must still read as seeded. */
export type DataSource = 'seeded' | 'real';

/** The full one-call hydration payload the /api/world route serves. It is the
 *  frozen World plus the provenance flag and the action time-window the timeline
 *  needs. Shape and key order match the pre-store route exactly. */
export interface WorldSnapshot {
  now: number;
  dataSource: DataSource;
  owners: Owner[];
  sessions: SessionInfo[];
  agents: AgentInfo[];
  elements: ElementInfo[];
  actions: ActionEvent[];
  config: ConfigOption[];
  snapshots: SnapshotInfo[];
  beads: BeadInfo[];
  audit: AuditRecord[];
  vaults: VaultInfo[];
  documents: DocumentInfo[];
  modules: ModuleInfo[];
  system: SystemStatus;
  timeWindow: [number, number];
}

/** Input to provision: the required project name, whether to create its vault
 *  (default true), and the acting identity derived from the oauth2-proxy headers.
 *  Identity is NEVER read from the request body — the route resolves it via
 *  identityFromHeaders and passes it here. */
export interface ProvisionInput {
  project: string;
  vault?: boolean;
  identity?: RequestIdentity;
}

/** The outcome of a provision. On success it carries a fresh snapshot so the UI
 *  hydrates without a second fetch, plus the created records the audit event
 *  attributes to. On failure it carries the HTTP status and a message. */
export type ProvisionResult =
  | {
      ok: true;
      status: 200;
      world: WorldSnapshot;
      owner: Owner;
      vault?: VaultInfo;
      action: ActionEvent;
      sessionId: string;
    }
  | { ok: false; status: 400 | 409; error: string };

/** Input to recordEngineTurn: one completed engine trajectory to fold into the
 *  world. sessionId + identity are the orchestrator's attribution tuple (never
 *  from prompt text); prompt is the user text (its first ~60 chars title a new
 *  session); events is the ordered trajectory whose consequential steps become
 *  attributed ActionEvents. */
export interface EngineTurnInput {
  sessionId: string;
  identity: IdentityTuple;
  prompt: string;
  events: EngineEvent[];
}

/** The narrow surface the routes need — nothing more. */
export interface WorldStore {
  readonly dataSource: DataSource;
  world(): WorldSnapshot;
  documents(): DocumentInfo[];
  addDocument(doc: DocumentInfo): void;
  appendAction(action: ActionEvent): void;
  provision(input: ProvisionInput): ProvisionResult;
  recordEngineTurn(turn: EngineTurnInput): ActionEvent[];
}

// ── Mutable world data ───────────────────────────────────────────────────────
// The ten arrays a running box mutates. modules/config/system are NOT here:
// modules and config are the static manifest, system is computed live. These ten
// are exactly what RealStore persists to disk (and loads back on start).
interface WorldData {
  owners: Owner[];
  sessions: SessionInfo[];
  agents: AgentInfo[];
  elements: ElementInfo[];
  actions: ActionEvent[];
  snapshots: SnapshotInfo[];
  beads: BeadInfo[];
  audit: AuditRecord[];
  vaults: VaultInfo[];
  documents: DocumentInfo[];
}

// A stable palette so each new owner gets a distinct, deterministic hue in the
// visualiser without depending on any seeded owner colour.
const OWNER_HUES = ['var(--owner-a)', 'var(--owner-b)', 'var(--owner-c)', 'var(--owner-d)'];

// A project name is slug-safe: a leading alphanumeric then alphanumerics, hyphen
// or underscore, bounded. No spaces, slashes or dots — it becomes a vault id and
// a plane path segment, so it must be safe to use as one.
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Seed the monotonic id counter from the world already on disk so a restart
 *  never re-mints an id that persisted before it. recordEngineTurn mints
 *  `act-turn-${seq}`, provision mints `act-provision-${seq}` and
 *  `sess-provision-${seq}`; all three draw from the SAME counter, so the seed is
 *  the max numeric suffix seen across those persisted ids. A fresh (empty) world
 *  yields 0, unchanged from the old in-memory default. */
function maxRecordedSeq(data: WorldData): number {
  let max = 0;
  const scan = (id: string, re: RegExp): void => {
    const m = re.exec(id);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  };
  for (const a of data.actions) scan(a.id, /^act-(?:turn|provision)-(\d+)$/);
  for (const s of data.sessions) scan(s.id, /^sess-provision-(\d+)$/);
  return max;
}

/** Derive a human name from an identity: the local part of a UPN, else the id. */
function nameFor(identity: RequestIdentity | undefined): string {
  const upn = identity?.upn;
  if (upn && upn.includes('@')) return upn.slice(0, upn.indexOf('@'));
  return identity?.ownerId ?? 'anonymous';
}

/** Map one engine trajectory event to an ActionEvent kind+label, or undefined
 *  when it is not a consequential world mutation. Only tool executions are
 *  recorded: a write/edit tool is a 'file_change', any other tool is a
 *  'tool_call'. session_start/session_end, agent_message deltas, tool_result
 *  completions and errors are trajectory noise, not world actions, so they are
 *  skipped — one action per initiating tool_call, never double-counted. */
function mapEngineEvent(e: EngineEvent): { kind: ActionKind; label: string; status: ActionStatus } | undefined {
  if (e.kind !== 'tool_call') return undefined;
  const status: ActionStatus = e.status === 'blocked' ? 'blocked' : e.status === 'failed' ? 'failed' : 'ok';
  const tool = e.tool ?? 'tool';
  const isWrite = /write|edit/i.test(tool);
  return {
    kind: isWrite ? 'file_change' : 'tool_call',
    label: `${isWrite ? 'Write' : 'Call'} ${tool}`,
    status,
  };
}

/** The base store both impls share. It differs only in its clock, its system
 *  status, whether config/modules come from the manifest, and whether mutations
 *  persist — all injected. The provision + snapshot logic is identical, so the
 *  real path and the seeded path can never drift. */
class BaseStore implements WorldStore {
  readonly dataSource: DataSource;
  protected data: WorldData;
  private clock: () => number;
  private systemOf: () => SystemStatus;
  private persist: () => void;
  // Minted-id counter, SEEDED from the world already on disk (not 0) so a restart
  // that reloaded persisted actions/sessions cannot re-mint a colliding id.
  private seq: number;

  constructor(opts: {
    dataSource: DataSource;
    data: WorldData;
    clock: () => number;
    system: () => SystemStatus;
    persist?: () => void;
  }) {
    this.dataSource = opts.dataSource;
    this.data = opts.data;
    this.seq = maxRecordedSeq(opts.data);
    this.clock = opts.clock;
    this.systemOf = opts.system;
    this.persist = opts.persist ?? (() => {});
  }

  world(): WorldSnapshot {
    const now = this.clock();
    const { actions } = this.data;
    // Empty actions would make Math.min(...[]) === Infinity; guard to [now, now]
    // so an empty real world still reports a finite, sane window.
    const timeWindow: [number, number] = actions.length
      ? [Math.min(...actions.map((a) => a.ts)), Math.max(...actions.map((a) => a.ts), now)]
      : [now, now];
    return {
      now,
      dataSource: this.dataSource,
      owners: this.data.owners,
      sessions: this.data.sessions,
      agents: this.data.agents,
      elements: this.data.elements,
      actions: this.data.actions,
      config: configOptions,
      snapshots: this.data.snapshots,
      beads: this.data.beads,
      audit: this.data.audit,
      vaults: this.data.vaults,
      documents: this.data.documents,
      modules,
      system: this.systemOf(),
      timeWindow,
    };
  }

  documents(): DocumentInfo[] {
    return this.data.documents;
  }

  addDocument(doc: DocumentInfo): void {
    this.data.documents.unshift(doc);
    this.persist();
  }

  appendAction(action: ActionEvent): void {
    this.data.actions.push(action);
    this.persist();
  }

  /** Find or create an owner by id. The first owner on an empty box is the admin,
   *  every later one a user; each gets a stable deterministic hue. Shared by
   *  provision and recordEngineTurn so the two paths can never drift. */
  private ensureOwner(ownerId: string, name: string, upn: string): Owner {
    let owner = this.data.owners.find((o) => o.id === ownerId);
    if (!owner) {
      owner = {
        id: ownerId,
        name,
        upn,
        role: this.data.owners.length === 0 ? 'admin' : 'user',
        colour: OWNER_HUES[this.data.owners.length % OWNER_HUES.length],
      };
      this.data.owners.push(owner);
    }
    return owner;
  }

  /** Fold a completed engine trajectory into the world (M3, ADR-005). The seeded
   *  store is a no-op returning [] so the mock world stays byte-identical; only the
   *  real store records. It ensures the acting owner, the session (titled from the
   *  prompt) and the agent exist, then appends one attributed ActionEvent per
   *  consequential tool step — timestamped from the store clock, persisted once —
   *  and returns exactly the actions it appended so the caller (and the live
   *  /api/events stream) sees them arrive. */
  recordEngineTurn(turn: EngineTurnInput): ActionEvent[] {
    if (this.dataSource === 'seeded') return [];
    const { sessionId, identity, prompt } = turn;
    const now = this.clock();
    const ownerId = identity.ownerId;
    this.ensureOwner(ownerId, ownerId, ownerId);

    // Ensure the session exists; a new one is titled from the first ~60 chars of
    // the prompt so Foreman's timeline reads the intent, not an id.
    if (!this.data.sessions.some((s) => s.id === sessionId)) {
      this.data.sessions.push({
        id: sessionId,
        ownerId,
        title: prompt.slice(0, 60) || 'Engine turn',
        startedAt: now,
      });
    }

    // Ensure the agent exists under this session (attributed to the same owner).
    if (!this.data.agents.some((a) => a.id === identity.agentId && a.sessionId === sessionId)) {
      this.data.agents.push({
        id: identity.agentId,
        name: identity.agentId,
        kind: 'orchestrator',
        ownerId,
        sessionId,
        parentAgentId: null,
        spawnedAt: now,
        status: 'running',
      });
    }

    const appended: ActionEvent[] = [];
    for (const e of turn.events) {
      const mapped = mapEngineEvent(e);
      if (!mapped) continue;
      this.seq += 1;
      const action: ActionEvent = {
        id: `act-turn-${this.seq}`,
        ts: now,
        kind: mapped.kind,
        ownerId,
        agentId: identity.agentId,
        sessionId,
        label: mapped.label,
        status: mapped.status,
      };
      this.data.actions.push(action);
      appended.push(action);
    }

    this.persist();
    return appended;
  }

  provision(input: ProvisionInput): ProvisionResult {
    const project = typeof input.project === 'string' ? input.project.trim() : '';
    if (!project || !SLUG.test(project)) {
      return { ok: false, status: 400, error: 'project must be a non-empty slug-safe name' };
    }
    // Duplicate guard: the vault name is the project, so a repeated project is a
    // conflict, not a second create.
    if (this.data.vaults.some((v) => v.project === project)) {
      return { ok: false, status: 409, error: `project ${project} already exists` };
    }

    const now = this.clock();
    const ownerId = input.identity?.ownerId ?? 'anonymous';

    // First provision creates the first owner. An owner already present is reused;
    // the first owner on an empty box is the admin, the rest are users.
    const owner = this.ensureOwner(ownerId, nameFor(input.identity), input.identity?.upn ?? ownerId);

    // A session records the provisioning act (DDD-001): every action belongs to a
    // session, and provision is the box's first action. It is an instant act, so
    // it opens and closes at the same tick.
    this.seq += 1;
    const sessionId = `sess-provision-${this.seq}`;
    this.data.sessions.push({
      id: sessionId,
      ownerId: owner.id,
      title: `Provision ${project}`,
      startedAt: now,
      endedAt: now,
    });

    let vault: VaultInfo | undefined;
    if (input.vault !== false) {
      vault = { id: `vault-${project}`, project, state: 'locked', sizeMb: 0 };
      this.data.vaults.push(vault);
    }

    const action: ActionEvent = {
      id: `act-provision-${this.seq}`,
      ts: now,
      kind: 'provision',
      ownerId: owner.id,
      agentId: 'foreman',
      sessionId,
      elementId: vault?.id,
      label: `Provision ${project}`,
      status: 'ok',
    };
    this.data.actions.push(action);

    this.persist();
    return { ok: true, status: 200, world: this.world(), owner, vault, action, sessionId };
  }
}

// ── Seeded store ─────────────────────────────────────────────────────────────
// Wraps the app's mock module exactly as the routes used it before the store
// existed: the SAME mutable array instances, the SAME NOW clock, the SAME
// systemStatus. Its world() is byte-identical to the pre-store /api/world.
//
// This is the ONLY place seeded world DATA is referenced. The real store path
// (createRealStore) never reads any of these arrays — a grep for a seeded owner,
// agent, action, vault or document lands here and nowhere the real world is built.
function createSeededStore(): WorldStore {
  return new BaseStore({
    dataSource: 'seeded',
    data: {
      owners: seededOwners, sessions: seededSessions, agents: seededAgents,
      elements: seededElements, actions: seededActions, snapshots: seededSnapshots,
      beads: seededBeads, audit: seededAudit, vaults: seededVaults,
      documents: seededDocuments,
    },
    clock: () => seededNOW,
    system: () => seededSystem,
  });
}

// ── Real store ───────────────────────────────────────────────────────────────
// Starts EMPTY. modules/config come from the manifest above; system reports
// honest live values; the clock is the wall clock. Every mutation persists to
// DOCBOX_DATA_DIR/world.json with an atomic tmp+rename write, and construction
// loads any existing file so a restart re-reads the same world.
const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_START = Date.now();

function emptyWorldData(): WorldData {
  return {
    owners: [], sessions: [], agents: [], elements: [], actions: [],
    snapshots: [], beads: [], audit: [], vaults: [], documents: [],
  };
}

function dataDir(env: NodeJS.ProcessEnv): string {
  return env.DOCBOX_DATA_DIR ?? join(HERE, '../../data');
}

function loadWorldData(file: string): WorldData {
  if (!existsSync(file)) return emptyWorldData();
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<WorldData>;
    const base = emptyWorldData();
    // Restore each known array; ignore anything unexpected on disk.
    for (const key of Object.keys(base) as (keyof WorldData)[]) {
      const v = raw[key];
      if (Array.isArray(v)) (base[key] as unknown[]) = v;
    }
    return base;
  } catch {
    // A corrupt file must not brick the box: start empty, the next write heals it.
    return emptyWorldData();
  }
}

function createRealStore(env: NodeJS.ProcessEnv): WorldStore {
  const dir = dataDir(env);
  const file = join(dir, 'world.json');
  const data = loadWorldData(file);

  const persist = () => {
    mkdirSync(dir, { recursive: true });
    const tmp = join(dir, `world.json.${process.pid}.tmp`);
    // Atomic replace: write the whole world to a temp file, then rename over the
    // target. A reader never sees a half-written file.
    writeFileSync(tmp, JSON.stringify(data), 'utf8');
    renameSync(tmp, file);
  };

  const localModel =
    (configOptions.find((o) => o.key === 'models.local.name')?.value as string) ?? 'none';

  const system = (): SystemStatus => ({
    // Honest live values. activeStack/imageTag come from the deployment env; the
    // union widens to whatever the operator tags a stack (dev by default).
    activeStack: (env.DOCBOX_STACK ?? 'dev') as SystemStatus['activeStack'],
    imageTag: env.DOCBOX_IMAGE_TAG ?? 'dev',
    uptimeHours: Math.max(0, (Date.now() - REAL_START) / 3_600_000),
    pendingRebuildChanges: 0,
    // 0 until the audit emitter confirms a verified chain; a fresh box has none.
    auditChainVerifiedAt: 0,
    localModel,
    providersOnline: [],
  });

  return new BaseStore({ dataSource: 'real', data, clock: () => Date.now(), system, persist });
}

// ── Factory ──────────────────────────────────────────────────────────────────
// Chosen by DOCBOX_DATA — 'seed' (default) | 'real' — and memoised like the audit
// emitter, so every route shares one store instance. A corrupt or missing env
// value falls back to seeded: the safe, offline default.
let store: WorldStore | undefined;

export function getWorldStore(env: NodeJS.ProcessEnv = process.env): WorldStore {
  if (!store) {
    store = env.DOCBOX_DATA === 'real' ? createRealStore(env) : createSeededStore();
  }
  return store;
}

/** Drop the memoised store so the next getWorldStore() re-reads the environment.
 *  Tests use this to switch between seeded and real (and between temp data dirs)
 *  the way setAuditEmitter(undefined) resets the audit seam. */
export function resetWorldStore(): void {
  store = undefined;
}
