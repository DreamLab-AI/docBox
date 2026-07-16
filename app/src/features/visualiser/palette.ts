// Colour resolution for the visualiser.
//
// The canvas 2D context cannot paint a CSS custom property: fillStyle needs a
// concrete colour, not "var(--owner-a)". Owner colours in the domain data are
// stored as var() references (see mock.ts), and our own encodings lean on the
// same token palette. This module turns those references into real colours,
// resolving them from the live stylesheet with a hardcoded fallback so a mark
// always paints even if styles have not attached yet.
import type { ActionKind, ElementKind } from '../../domain/types';

const cache = new Map<string, string>();

// Mirrors styles/tokens.css. Only used if getComputedStyle returns nothing.
const FALLBACK: Record<string, string> = {
  '--accent': '#5b8cff', '--accent-dim': '#3a5fb0', '--violet': '#a06bff',
  '--teal': '#33c2b4', '--amber': '#f0a53a', '--rose': '#f0596b', '--green': '#46c273',
  '--owner-a': '#5b8cff', '--owner-b': '#33c2b4', '--owner-c': '#f0a53a', '--owner-d': '#a06bff',
  '--fg-0': '#eef2f8', '--fg-1': '#aeb8c8', '--fg-2': '#6b7688',
  '--line': '#2c3444', '--line-strong': '#3a4457',
  '--bg-1': '#121620', '--bg-2': '#1a1f2b', '--bg-3': '#232a39',
};

/** Turn "var(--name)" (or a raw colour, passed through) into a concrete colour. */
export function resolveColour(input: string): string {
  const trimmed = input.trim();
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(trimmed);
  if (!m) return trimmed; // already a hex / named colour
  const name = m[1];
  const cached = cache.get(name);
  if (cached) return cached;
  let value = '';
  if (typeof document !== 'undefined') {
    value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  if (value) { cache.set(name, value); return value; } // cache only real reads
  return FALLBACK[name] ?? '#888888';
}

// Action-kind hues — seven distinct anchors from the token palette. policy_deny
// gets grey: a denial earns no colour of its own, and its amber "blocked" ring
// carries the signal.
export const KIND_COLOUR: Record<ActionKind, string> = {
  tool_call: 'var(--accent)',
  file_change: 'var(--teal)',
  snapshot: 'var(--violet)',
  rollback: 'var(--rose)',
  gate_approval: 'var(--green)',
  provision: 'var(--amber)',
  policy_deny: 'var(--fg-2)',
};

export const ELEMENT_COLOUR: Record<ElementKind, string> = {
  file: 'var(--accent)',
  service: 'var(--teal)',
  config: 'var(--amber)',
  model: 'var(--violet)',
  vault: 'var(--green)',
};

export const KIND_LABEL: Record<ActionKind, string> = {
  tool_call: 'Tool call', file_change: 'File change', snapshot: 'Snapshot',
  rollback: 'Rollback', gate_approval: 'Gate approval', provision: 'Provision',
  policy_deny: 'Policy deny',
};

export const ELEMENT_LABEL: Record<ElementKind, string> = {
  file: 'File', service: 'Service', config: 'Config', model: 'Model', vault: 'Vault',
};

// Fixed display order for kind lanes and the legend.
export const KIND_ORDER: ActionKind[] = [
  'tool_call', 'file_change', 'provision', 'gate_approval', 'snapshot', 'rollback', 'policy_deny',
];
