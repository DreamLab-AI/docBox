// The seam. Feature modules import ONLY from here, never from mock.ts directly.
// Swapping mock for a real HTTP/SSE client later means rewriting this file alone.
import {
  owners, sessions, agents, elements, actions, configOptions,
  snapshots, beads, audit, vaults, systemStatus, NOW,
} from './mock';
import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ConfigOption,
  SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus, ApplyClass,
} from '../domain/types';

export const store = {
  now: (): number => NOW,
  owners: (): Owner[] => owners,
  sessions: (): SessionInfo[] => sessions,
  agents: (): AgentInfo[] => agents,
  elements: (): ElementInfo[] => elements,
  actions: (): ActionEvent[] => actions,
  config: (): ConfigOption[] => configOptions,
  snapshots: (): SnapshotInfo[] => snapshots,
  beads: (): BeadInfo[] => beads,
  audit: (): AuditRecord[] => audit,
  vaults: (): VaultInfo[] => vaults,
  system: (): SystemStatus => systemStatus,

  ownerById: (id: string): Owner | undefined => owners.find((o) => o.id === id),
  agentById: (id: string): AgentInfo | undefined => agents.find((a) => a.id === id),
  elementById: (id: string): ElementInfo | undefined => elements.find((e) => e.id === id),

  // Window covering all activity, for the timeline scale.
  timeWindow: (): [number, number] => {
    const ts = actions.map((a) => a.ts);
    return [Math.min(...ts), Math.max(...ts, NOW)];
  },
};

export const applyClassLabel: Record<ApplyClass, string> = {
  live: 'Live',
  session: 'Next session',
  rebuild: 'Rebuild',
};

export const applyClassHelp: Record<ApplyClass, string> = {
  live: 'Takes effect immediately on the running sandbox.',
  session: 'Applies to sessions started after you save.',
  rebuild: 'Writes the TOML, rebuilds the image, and swaps stacks with rollback.',
};
