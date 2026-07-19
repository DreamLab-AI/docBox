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

// ── Module manifest (ADR-009) ────────────────────────────────────────────────
// The single source of truth for what the system is made of: a slim core plus
// surfaces and modules around it. This is a description that makes the
// architecture legible and drives the System view — NOT a plugin runtime.

/** Where a piece sits in the slim-core-modules model. */
export type ModuleLayer =
  | 'core'      // the governance and data spine; always on, never optional
  | 'surface'   // how a human or agent interacts (web, editor, extension, desktop)
  | 'module';   // an optional capability (model, ocr, sidecar, ledger, tunnel)

/** Whether a piece is running. Core is always on; the rest can be off or available. */
export type ModuleState =
  | 'on'         // enabled and running
  | 'off'        // present but disabled by its gate
  | 'available'  // shippable but not part of this deployment yet
  | 'core';      // always on (the spine)

export interface ModuleInfo {
  id: string;
  name: string;
  layer: ModuleLayer;
  state: ModuleState;
  summary: string;            // one plain sentence: what it is
  gate?: string;              // config key / compose profile that toggles it (none for core)
  service?: string;           // compose service name, if it runs as one
  reach?: 'core-api' | 'sidecar' | 'extension' | 'spine'; // how it connects
  heavy?: boolean;            // wants a GPU or real resources
  applyClass?: ApplyClass;    // how turning it on/off lands
}

// ── Clinical corpus domain (DDD-004, doctorBox demonstrator) ─────────────────
// The typed, evidence-linked record built from one synthetic patient's documents.
// Ingestion writes Claims; query time reads them. Every Claim carries provenance
// back to exact source characters, so an answer can cite what it stands on. This
// is the doctorBox demonstrator's contract; the generic main branch does not ship it.

/** The deliberately-seeded scenarios (PRD-009) the demo is built to surface. */
export type SeedId = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';

/** A span of characters in a SourceDocument's frozen text: the citation primitive.
 *  quote must equal text.slice(start, end) in the referenced document (DDD-004 inv. 2). */
export interface EvidenceSpan {
  docId: string;      // SourceDocument.id
  start: number;      // character offset, inclusive
  end: number;        // character offset, exclusive
  quote: string;      // the exact text at [start, end)
}

/** A confidence score plus the method that produced it. Descriptive, never a licence to hide. */
export interface Confidence {
  score: number;      // 0..1
  method: string;     // e.g. 'ocr+ner', 'schema-llm', 'reconciled'
}

/** The temporal window a Claim speaks for. Supersession is decided on this. */
export interface ValidityInterval {
  from: number;                                  // epoch ms, effective-from
  to?: number;                                   // epoch ms, effective-to (open if absent)
  precision: 'day' | 'month' | 'year' | 'unknown';
}

/** The FHIR R4 resource + element a Claim's value normalises to, with optional coding.
 *  system is undefined when uncoded; on main it may be SNOMED/UMLS/ICD-10, else dm+d. */
export interface FhirMapping {
  resource:
    | 'Condition'
    | 'MedicationStatement'
    | 'Observation'
    | 'AllergyIntolerance'
    | 'Encounter'
    | 'Procedure';
  element: string;                               // e.g. 'code', 'medicationCodeableConcept'
  system?: 'dm+d' | 'SNOMED' | 'UMLS' | 'ICD-10' | 'LOINC';
  code?: string;
  display?: string;
}

export type ClaimCategory = 'medication' | 'lab' | 'diagnosis' | 'allergy' | 'encounter' | 'procedure';
export type ClaimStanding = 'active' | 'superseded' | 'refuted';

/** A single typed, evidence-linked assertion derived from a SourceDocument.
 *  Named Claim because its standing (not its content) can change: it can be
 *  contradicted or superseded by another document. */
export interface Claim {
  id: string;
  category: ClaimCategory;
  label: string;                                 // human line, e.g. "Amlodipine 10mg once daily"
  value: string;                                 // normalised value
  fhir: FhirMapping;
  evidence: EvidenceSpan;                        // the source span that backs it (DDD-004 inv. 1)
  confidence: Confidence;
  validity: ValidityInterval;
  standing: ClaimStanding;
  supersedesClaimId?: string;                    // set when this Claim supersedes another
  seedId?: SeedId;                               // which seeded scenario planted it (demo)
}

/** A detected conflict between exactly two Claims. Surfaced, never silently resolved. */
export interface Contradiction {
  id: string;
  claimIds: [string, string];
  kind: 'medication' | 'diagnosis' | 'allergy' | 'lab';
  note: string;                                  // one line: what conflicts
  seedId?: SeedId;
}

export type SourceDocKind =
  | 'referral'
  | 'clinic_letter'
  | 'discharge'
  | 'lab_report'
  | 'radiology'
  | 'medication_list'
  | 'gp_notes'
  | 'econsult'
  | 'consent';

/** One ingested artefact with frozen, char-addressable text (DDD-004 SourceDocument root). */
export interface SourceDocument {
  id: string;
  documentId?: string;                           // joins DocumentInfo (Documents tab) if uploaded there
  name: string;
  kind: SourceDocKind;
  provenance: string;                            // e.g. "Cardiology outpatient clinic"
  date: number;                                  // epoch ms, the document's own date
  text: string;                                  // frozen OCR/extracted text, addressable by offset
  ocrRoute: ProcessingRoute;
  handwriting: boolean;
  seedId?: SeedId;
}

/** The reconciled, FHIR-shaped view assembled from all Claims, for one patient. */
export interface LongitudinalRecord {
  patientLabel: string;                          // synthetic patient display name
  claims: Claim[];
  contradictions: Contradiction[];
  documentIds: string[];                         // SourceDocument ids that fed it
  builtAt: number;
}

/** The five bounded reading-mesh Specialists (PRD-011). Fixed set, no dynamic spawning. */
export const SPECIALISTS = ['medications', 'labs', 'diagnoses', 'chronology', 'correspondence'] as const;
export type SpecialistId = (typeof SPECIALISTS)[number];

/** One Specialist's contribution to answering a Question. */
export interface SpecialistFinding {
  specialist: SpecialistId;
  summary: string;
  claimIds: string[];                            // Claims this Specialist read
  evidence: EvidenceSpan[];
}

/** One sentence of an answer, with the evidence that supports it (>=1, or not emitted). */
export interface CitedSentence {
  text: string;
  evidence: EvidenceSpan[];
  contradictionId?: string;                      // set when the sentence surfaces a Contradiction
}

/** An answer whose every sentence carries EvidenceSpans (DDD-004 inv. 3). */
export interface CitedAnswer {
  sentences: CitedSentence[];
  gaps: string[];                                // what the record could not evidence
}

/** One Question, the findings that addressed it, and the CitedAnswer.
 *  The query-time unit of work and of audit (DDD-004 ReadingSession root). */
export interface ReadingSession {
  id: string;
  question: string;
  askedBy: string;                               // owner id
  askedAt: number;
  findings: SpecialistFinding[];
  answer: CitedAnswer;
}
