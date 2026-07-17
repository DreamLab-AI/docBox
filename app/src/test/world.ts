// Test fixtures: a World builder plus compact factories for each domain entity.
// Lives under src/test/** so coverage config excludes it. Feature tests that read
// through the `store` singleton call `useWorld(...)` in a beforeEach to install a
// deterministic world via the adapter's `hydrate` seam.
import { hydrate, type World } from '../data/adapter';
import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ConfigOption,
  SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus, DocumentInfo,
  ModuleInfo, AgentKind, AgentStatus, ActionKind, ActionStatus, ElementKind,
  BeadStatus, GateKind, ConfigTabId, ApplyClass, OptionType, ModuleLayer,
  ModuleState,
} from '../domain/types';

export const SYSTEM: SystemStatus = {
  activeStack: 'blue',
  imageTag: 'img:test',
  uptimeHours: 12,
  pendingRebuildChanges: 0,
  auditChainVerifiedAt: 0,
  localModel: 'gpt-oss',
  providersOnline: [],
};

export function makeWorld(partial: Partial<World> = {}): World {
  return {
    now: 1000,
    owners: [],
    sessions: [],
    agents: [],
    elements: [],
    actions: [],
    config: [],
    snapshots: [],
    beads: [],
    audit: [],
    vaults: [],
    documents: [],
    modules: [],
    system: SYSTEM,
    ...partial,
  };
}

/** Install a controlled world into the adapter singleton for the current test. */
export function useWorld(partial: Partial<World> = {}): World {
  const w = makeWorld(partial);
  hydrate(w);
  return w;
}

// ── Entity factories ─────────────────────────────────────────────────────────
export function owner(p: Partial<Owner> & { id: string }): Owner {
  return {
    name: p.id, upn: `${p.id}@x`, role: 'user', colour: 'var(--owner-a)', ...p,
  };
}

export function session(p: Partial<SessionInfo> & { id: string }): SessionInfo {
  return { ownerId: 'o1', title: p.id, startedAt: 0, ...p };
}

export function agent(p: Partial<AgentInfo> & { id: string }): AgentInfo {
  return {
    name: p.id, kind: 'coder' as AgentKind, ownerId: 'o1', sessionId: 's1',
    parentAgentId: null, spawnedAt: 0, status: 'running' as AgentStatus, ...p,
  };
}

export function element(p: Partial<ElementInfo> & { id: string }): ElementInfo {
  return { path: p.id, kind: 'file' as ElementKind, ...p };
}

export function action(p: Partial<ActionEvent> & { id: string }): ActionEvent {
  return {
    ts: 0, kind: 'tool_call' as ActionKind, ownerId: 'o1', agentId: 'a1',
    sessionId: 's1', label: p.id, status: 'ok' as ActionStatus, ...p,
  };
}

export function configOpt(p: Partial<ConfigOption> & { key: string }): ConfigOption {
  return {
    label: p.key, help: '', whenToUse: '', applyClass: 'live' as ApplyClass,
    type: 'string' as OptionType, value: '', group: 'g', tab: 'providers' as ConfigTabId, ...p,
  };
}

export function bead(p: Partial<BeadInfo> & { id: string }): BeadInfo {
  return {
    title: p.id, status: 'open' as BeadStatus, ownerId: 'o1', deps: [],
    gate: null as GateKind, priority: 2, createdAt: 0, ...p,
  };
}

export function audit(p: Partial<AuditRecord> & { seq: number }): AuditRecord {
  return {
    eventId: `e${p.seq}`, ts: p.seq, userId: 'u1', kind: 'tool_call',
    summary: '', hash: `h${p.seq}`, prevHash: '000000', anchored: false, ...p,
  };
}

export function vault(p: Partial<VaultInfo> & { id: string }): VaultInfo {
  return { project: p.id, state: 'locked', sizeMb: 1, ...p };
}

export function doc(p: Partial<DocumentInfo> & { id: string }): DocumentInfo {
  return {
    name: p.id, ownerId: 'o1', project: 'proj', sizeKb: 10, pages: 1,
    mime: 'application/pdf', uploadedAt: 0, ocr: 'pending', ocrRoute: 'local',
    handwriting: false, ...p,
  };
}

export function moduleInfo(p: Partial<ModuleInfo> & { id: string }): ModuleInfo {
  return {
    name: p.id, layer: 'module' as ModuleLayer, state: 'on' as ModuleState,
    summary: '', ...p,
  };
}
