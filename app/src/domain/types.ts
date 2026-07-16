// Domain model for the Foreman control plane.
// FROZEN CONTRACT: feature modules import from here and from data/adapter.ts.
// Do not extend these types inside feature directories; propose changes here.

/** How a configuration change takes effect. This is the product's core semantic. */
export type ApplyClass =
  | 'hot'      // interface edit via HMR or the layout manifest: sub-second, no rebuild (ADR-008)
  | 'live'     // applies immediately to the running sandbox
  | 'session'  // applies to sessions started after the change
  | 'rebuild'; // changes the system definition: TOML commit -> image rebuild -> blue/green swap

export interface Owner {
  id: string;          // entra:{tid}:{oid} shape
  name: string;
  upn: string;
  role: 'admin' | 'user';
  colour: string;      // stable per-owner hue for the visualiser
}

export interface SessionInfo {
  id: string;          // ULID-ish, sortable by time
  ownerId: string;
  title: string;
  startedAt: number;   // epoch ms
  endedAt?: number;
}

export type AgentKind = 'orchestrator' | 'coder' | 'researcher' | 'qe' | 'compactor';
export type AgentStatus = 'running' | 'idle' | 'done' | 'failed';

export interface AgentInfo {
  id: string;
  name: string;
  kind: AgentKind;
  ownerId: string;
  sessionId: string;
  parentAgentId: string | null;
  spawnedAt: number;
  status: AgentStatus;
}

export type ElementKind = 'file' | 'service' | 'config' | 'model' | 'vault';

export interface ElementInfo {
  id: string;
  path: string;        // e.g. src/auth.ts, service:gateway, vault:project-aurora
  kind: ElementKind;
}

export type ActionKind =
  | 'tool_call'
  | 'file_change'
  | 'snapshot'
  | 'rollback'
  | 'gate_approval'
  | 'provision'
  | 'policy_deny';

export type ActionStatus = 'ok' | 'blocked' | 'failed';

export interface ActionEvent {
  id: string;
  ts: number;          // epoch ms
  kind: ActionKind;
  ownerId: string;
  agentId: string;
  sessionId: string;
  elementId?: string;
  label: string;       // short human line, e.g. "Edit src/auth.ts"
  status: ActionStatus;
  durationMs?: number;
}

export type OptionType = 'boolean' | 'string' | 'number' | 'enum' | 'secret' | 'list';

/** One configurable option surfaced in the Configuration tab groups. */
export interface ConfigOption {
  key: string;                 // toml path, e.g. providers.anthropic.enabled
  label: string;
  help: string;                // one plain sentence: what it does
  whenToUse: string;           // operator guidance: when and why to change it
  applyClass: ApplyClass;
  type: OptionType;
  value: string | number | boolean | string[];
  options?: string[];          // for enum
  group: string;               // sub-group heading inside a tab
  tab: ConfigTabId;
}

export type ConfigTabId =
  | 'providers'
  | 'toolchain'
  | 'identity'
  | 'network'
  | 'vaults'
  | 'audit'
  | 'snapshots'
  | 'agents'
  | 'interface';

export interface PendingChange {
  key: string;
  from: ConfigOption['value'];
  to: ConfigOption['value'];
  applyClass: ApplyClass;
}

export interface SnapshotInfo {
  id: string;
  ts: number;
  label: string;
  shaBefore: string;
  shaAfter?: string;
  status: 'promoted' | 'auto_rolled_back' | 'candidate';
  proposalSummary: string;
  initiatorOwnerId: string;
  healthcheck: 'pass' | 'fail' | 'running';
}

export type BeadStatus = 'open' | 'ready' | 'in_progress' | 'blocked' | 'closed';
export type GateKind = 'human' | 'ci' | 'pr' | null;

export interface BeadInfo {
  id: string;               // bd-xxxx
  title: string;
  status: BeadStatus;
  ownerId: string;          // who asked for it
  assigneeAgentId?: string;
  deps: string[];           // blocking bead ids
  gate: GateKind;
  priority: 0 | 1 | 2 | 3;  // 0 highest
  createdAt: number;
  closedAt?: number;
}

export interface AuditRecord {
  seq: number;
  eventId: string;          // joins ActionEvent.id
  ts: number;
  userId: string;
  agentId?: string;
  kind: ActionKind | 'session_start' | 'agent_spawn' | 'config_change';
  summary: string;
  hash: string;
  prevHash: string;
  anchored: boolean;        // included in a signed off-box anchor
}

export interface VaultInfo {
  id: string;
  project: string;
  state: 'locked' | 'unlocked';
  unlockedBy?: string;      // ownerId
  unlockedAt?: number;
  sizeMb: number;
}

export interface SystemStatus {
  activeStack: 'blue' | 'green';
  imageTag: string;
  uptimeHours: number;
  pendingRebuildChanges: number;
  auditChainVerifiedAt: number;
  localModel: string;
  providersOnline: string[];
}

/** How a feature's AI work is processed. `local` keeps data in the box (private);
 *  the others send to a cloud provider. This is the per-feature privacy switch. */
export type ProcessingRoute = 'local' | 'anthropic' | 'openai' | 'mistral' | 'gemini';

export type OcrStatus = 'pending' | 'processing' | 'done' | 'review' | 'failed';

export interface DocumentInfo {
  id: string;
  name: string;              // filename
  ownerId: string;           // who uploaded it
  project: string;           // which project/vault it belongs to
  sizeKb: number;
  pages: number;
  mime: string;              // application/pdf, image/png, ...
  uploadedAt: number;
  ocr: OcrStatus;
  ocrRoute: ProcessingRoute; // where the OCR ran (local = private)
  handwriting: boolean;      // detected handwritten content
  confidence?: number;       // 0..1, lowest-field confidence when OCR is done
  fieldsForReview?: number;  // count of low-confidence fields routed to human review
}
