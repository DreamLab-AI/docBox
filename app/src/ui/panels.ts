// The panel registry: the single, typed, validated source of truth for the
// interface's top-level panels. Formalises what App.tsx used to hold inline, so
// (a) an agent adds a panel in ONE predictable place and shape, (b) the compiler
// rejects a registry that forgets a panel's component, and (c) a malformed panel
// manifest is rejected BEFORE it can reach Vite HMR — a broken agent edit is a
// caught error with a precise message, not a blanked interface. See ADR-010.
import { createElement, type ReactElement } from 'react';
import OverviewTab from '../features/overview/OverviewTab';
import VisualiserTab from '../features/visualiser/VisualiserTab';
import ActivityTab from '../features/activity/ActivityTab';
import WorkTab from '../features/work/WorkTab';
import DocumentsTab from '../features/documents/DocumentsTab';
import ClinicianPanel from '../features/clinician/ClinicianPanel';
import ConfigTab from '../features/config/ConfigTab';
import OperationsTab from '../features/operations/OperationsTab';
import SystemTab from '../features/system/SystemTab';

// The closed set of panel ids. This is the only place ids are minted; adding one
// forces a matching component below (the `satisfies` check).
export const PANEL_IDS = ['overview', 'visualiser', 'activity', 'work', 'documents', 'clinician', 'config', 'ops', 'system'] as const;
export type PanelId = (typeof PANEL_IDS)[number];

// The serialisable half of a panel — exactly what an agent may author or edit.
// The render function is not serialisable, so it is bound separately from the
// component registry; this shape is the whole agent-authorable contract.
export interface PanelManifestEntry {
  id: PanelId;
  label: string;
  hint: string;
}

export interface PanelDef extends PanelManifestEntry {
  render: () => ReactElement;
}

// The bounded component vocabulary a panel id resolves to. `satisfies` makes
// "added a PanelId but forgot its component" a compile error — the static half
// of the contract, checked by tsc with no runtime cost.
const COMPONENTS = {
  overview: OverviewTab,
  visualiser: VisualiserTab,
  activity: ActivityTab,
  work: WorkTab,
  documents: DocumentsTab,
  clinician: ClinicianPanel,
  config: ConfigTab,
  ops: OperationsTab,
  system: SystemTab,
} satisfies Record<PanelId, () => ReactElement>;

// The shipped manifest (serialisable, agent-editable). Order is display order.
const MANIFEST: PanelManifestEntry[] = [
  { id: 'overview',   label: 'Overview',      hint: 'System at a glance' },
  { id: 'visualiser', label: 'Visualiser',    hint: 'Who did what, to what, when' },
  { id: 'activity',   label: 'Activity',      hint: 'Action feed and agent tree' },
  { id: 'work',       label: 'Work',          hint: 'The agent work ledger' },
  { id: 'documents',  label: 'Documents',     hint: 'Uploads and OCR' },
  { id: 'clinician',  label: 'Clinician',     hint: 'Ask the patient record, with citations' },
  { id: 'config',     label: 'Configuration', hint: 'Everything you can change' },
  { id: 'ops',        label: 'Operations',    hint: 'Snapshots, audit, vaults' },
  { id: 'system',     label: 'System',        hint: 'Core, surfaces and modules' },
];

/** Thrown when a panel manifest is malformed. The message names the offending panel. */
export class PanelManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PanelManifestError';
  }
}

const isPanelId = (v: unknown): v is PanelId => PANEL_IDS.includes(v as PanelId);

/**
 * Validate a panel manifest — the runtime "validate before render" gate. Rejects
 * an unknown id, an empty label/hint, or a duplicate id, throwing a precise
 * message an agent can act on. Owned rather than pulled from a schema library:
 * the contract is small and fixed, so a hand-checked validator keeps the app's
 * runtime dependencies at just React (the distillation steer). Swap in Zod here
 * if the manifest ever grows rich enough to earn it.
 */
export function parsePanelManifest(input: unknown): PanelManifestEntry[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new PanelManifestError('panel manifest must be a non-empty array');
  }
  const seen = new Set<PanelId>();
  return input.map((raw, i) => {
    const e = (raw ?? {}) as Record<string, unknown>;
    if (!isPanelId(e.id)) {
      throw new PanelManifestError(`panel[${i}]: unknown id ${JSON.stringify(e.id)} (allowed: ${PANEL_IDS.join(', ')})`);
    }
    if (typeof e.label !== 'string' || e.label.trim() === '') {
      throw new PanelManifestError(`panel[${i}] "${e.id}": label must be a non-empty string`);
    }
    if (typeof e.hint !== 'string' || e.hint.trim() === '') {
      throw new PanelManifestError(`panel[${i}] "${e.id}": hint must be a non-empty string`);
    }
    if (seen.has(e.id)) {
      throw new PanelManifestError(`panel[${i}]: duplicate id "${e.id}"`);
    }
    seen.add(e.id);
    return { id: e.id, label: e.label, hint: e.hint };
  });
}

/**
 * Build the render-ready panel list from a manifest (defaults to the shipped
 * one). Each entry is validated, then bound to its component from the registry.
 */
export function buildPanels(manifest: unknown = MANIFEST): PanelDef[] {
  return parsePanelManifest(manifest).map((e) => ({
    ...e,
    render: () => createElement(COMPONENTS[e.id]),
  }));
}

/** The shipped, validated panel registry the shell renders. */
export const PANELS: readonly PanelDef[] = buildPanels();
