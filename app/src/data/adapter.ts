// The seam. Feature modules import ONLY from here, never from mock.ts directly.
// The accessor API is synchronous and frozen. Data lives in a swappable `world`
// object: it starts as the deterministic mock and, in live mode, is replaced by
// a snapshot fetched from the control-plane server at boot (see live.ts and
// main.tsx). Swapping mock for a real backend is this file plus live.ts, nothing
// in the feature modules — the promise ADR-001 makes.
import * as mock from './mock';
import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ConfigOption,
  SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus, ApplyClass,
  DocumentInfo,
} from '../domain/types';

export interface World {
  now: number;
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
  system: SystemStatus;
}

const mockWorld: World = {
  now: mock.NOW,
  owners: mock.owners,
  sessions: mock.sessions,
  agents: mock.agents,
  elements: mock.elements,
  actions: mock.actions,
  config: mock.configOptions,
  snapshots: mock.snapshots,
  beads: mock.beads,
  audit: mock.audit,
  vaults: mock.vaults,
  documents: mock.documents,
  system: mock.systemStatus,
};

// Mutable current world. Defaults to mock so the app always renders offline.
let world: World = mockWorld;

/** Replace the world (called by live.ts after fetching from the server). */
export function hydrate(next: World): void {
  world = next;
}

/** Append a live action (from the SSE stream). Keeps the array time-sorted. */
export function pushAction(a: ActionEvent): void {
  world.actions = [...world.actions, a].sort((x, y) => x.ts - y.ts);
}

export const store = {
  now: (): number => world.now,
  owners: (): Owner[] => world.owners,
  sessions: (): SessionInfo[] => world.sessions,
  agents: (): AgentInfo[] => world.agents,
  elements: (): ElementInfo[] => world.elements,
  actions: (): ActionEvent[] => world.actions,
  config: (): ConfigOption[] => world.config,
  snapshots: (): SnapshotInfo[] => world.snapshots,
  beads: (): BeadInfo[] => world.beads,
  audit: (): AuditRecord[] => world.audit,
  vaults: (): VaultInfo[] => world.vaults,
  documents: (): DocumentInfo[] => world.documents,
  system: (): SystemStatus => world.system,

  ownerById: (id: string): Owner | undefined => world.owners.find((o) => o.id === id),
  agentById: (id: string): AgentInfo | undefined => world.agents.find((a) => a.id === id),
  elementById: (id: string): ElementInfo | undefined => world.elements.find((e) => e.id === id),

  timeWindow: (): [number, number] => {
    const ts = world.actions.map((a) => a.ts);
    return [Math.min(...ts), Math.max(...ts, world.now)];
  },
};

export const applyClassLabel: Record<ApplyClass, string> = {
  hot: 'Hot',
  live: 'Live',
  session: 'Next session',
  rebuild: 'Rebuild',
};

export const applyClassHelp: Record<ApplyClass, string> = {
  hot: 'Interface edit through hot reload or the layout manifest. Sub-second, no rebuild.',
  live: 'Takes effect immediately on the running sandbox.',
  session: 'Applies to sessions started after you save.',
  rebuild: 'Writes the TOML, rebuilds the image, and swaps stacks with rollback.',
};
