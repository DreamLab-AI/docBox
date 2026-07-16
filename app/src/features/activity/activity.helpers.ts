// Pure logic and constants for the Activity feature. No JSX, no React.
// Feeds both the action feed (left) and the agent spawn tree (right).
import type {
  ActionEvent, ActionKind, ActionStatus, AgentInfo, SessionInfo,
} from '../../domain/types';

// ── Action-kind presentation ────────────────────────────────────────────────
export const ACTION_KINDS: ActionKind[] = [
  'tool_call', 'file_change', 'snapshot', 'rollback', 'gate_approval', 'provision', 'policy_deny',
];

interface KindMeta { label: string; colour: string; }

// One stable hue per kind, drawn from the token palette so chips read as a set.
export const KIND_META: Record<ActionKind, KindMeta> = {
  tool_call:     { label: 'tool',      colour: 'var(--accent)' },
  file_change:   { label: 'file',      colour: 'var(--teal)' },
  snapshot:      { label: 'snapshot',  colour: 'var(--violet)' },
  rollback:      { label: 'rollback',  colour: 'var(--rose)' },
  gate_approval: { label: 'gate',      colour: 'var(--green)' },
  provision:     { label: 'provision', colour: 'var(--accent-dim)' },
  policy_deny:   { label: 'deny',      colour: 'var(--amber)' },
};

export const ACTION_STATUSES: ActionStatus[] = ['ok', 'blocked', 'failed'];

// Rows that deserve a coloured left border so they catch the eye in a long list.
export function emphasisColour(kind: ActionKind): string | null {
  if (kind === 'policy_deny') return 'var(--amber)';
  if (kind === 'rollback') return 'var(--rose)';
  return null;
}

// ── Filter model ─────────────────────────────────────────────────────────────
// Every field ANDs together. `kinds` empty means "all kinds". `agentId` and
// `sessionId` come from clicking the tree; the rest come from the feed's top bar.
export interface Filters {
  ownerId: string | null;
  kinds: ActionKind[];
  status: ActionStatus | null;
  text: string;
  agentId: string | null;
  sessionId: string | null;
}

export const EMPTY_FILTERS: Filters = {
  ownerId: null, kinds: [], status: null, text: '', agentId: null, sessionId: null,
};

export function hasAnyFilter(f: Filters): boolean {
  return Boolean(
    f.ownerId || f.kinds.length || f.status || f.text.trim() || f.agentId || f.sessionId,
  );
}

export function filterActions(actions: ActionEvent[], f: Filters): ActionEvent[] {
  const text = f.text.trim().toLowerCase();
  return actions.filter((a) => {
    if (f.ownerId && a.ownerId !== f.ownerId) return false;
    if (f.kinds.length && !f.kinds.includes(a.kind)) return false;
    if (f.status && a.status !== f.status) return false;
    if (f.agentId && a.agentId !== f.agentId) return false;
    if (f.sessionId && a.sessionId !== f.sessionId) return false;
    if (text && !a.label.toLowerCase().includes(text)) return false;
    return true;
  });
}

export function toggleKind(kinds: ActionKind[], kind: ActionKind): ActionKind[] {
  return kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
}

// ── Derived data ─────────────────────────────────────────────────────────────
export function countActionsByAgent(actions: ActionEvent[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of actions) counts.set(a.agentId, (counts.get(a.agentId) ?? 0) + 1);
  return counts;
}

// ── Agent spawn tree ─────────────────────────────────────────────────────────
export interface AgentNode {
  agent: AgentInfo;
  depth: number;
  children: AgentNode[];
}

// Build the parent→child hierarchy for one session. Roots are agents with no
// parent, or whose parent falls outside the session (defensive against orphans).
export function buildAgentTree(agents: AgentInfo[], sessionId: string): AgentNode[] {
  const inSession = agents
    .filter((a) => a.sessionId === sessionId)
    .sort((a, b) => a.spawnedAt - b.spawnedAt);
  const ids = new Set(inSession.map((a) => a.id));
  const childrenOf = new Map<string, AgentInfo[]>();
  const roots: AgentInfo[] = [];

  for (const a of inSession) {
    if (a.parentAgentId && ids.has(a.parentAgentId)) {
      const arr = childrenOf.get(a.parentAgentId) ?? [];
      arr.push(a);
      childrenOf.set(a.parentAgentId, arr);
    } else {
      roots.push(a);
    }
  }

  const build = (agent: AgentInfo, depth: number): AgentNode => ({
    agent,
    depth,
    children: (childrenOf.get(agent.id) ?? []).map((child) => build(child, depth + 1)),
  });
  return roots.map((root) => build(root, 0));
}

// Sessions most-recent first; live sessions (no end) always float to the top.
export function orderSessions(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => {
    const liveA = a.endedAt ? 0 : 1;
    const liveB = b.endedAt ? 0 : 1;
    if (liveA !== liveB) return liveB - liveA;
    return b.startedAt - a.startedAt;
  });
}
