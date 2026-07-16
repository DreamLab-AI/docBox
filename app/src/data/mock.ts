// Deterministic mock world for the control plane. No backend.
// FROZEN: feature modules read via adapter.ts; they never generate their own data.
import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ConfigOption,
  SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus, ActionKind,
  AgentKind, ElementKind,
} from '../domain/types';

// Small seeded PRNG so every load renders the same world (replayable, like the real audit trail).
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260716);
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];

// Fixed clock so timestamps are stable across reloads (Date.now would drift the world each load).
export const NOW = Date.UTC(2026, 6, 16, 14, 30, 0);
const HOUR = 3600_000;
const MIN = 60_000;

export const owners: Owner[] = [
  { id: 'entra:9f2a:6b1c', name: 'Dana Okoro',   upn: 'dana@client.co',  role: 'admin', colour: 'var(--owner-a)' },
  { id: 'entra:9f2a:7c2d', name: 'Ravi Menon',   upn: 'ravi@client.co',  role: 'user',  colour: 'var(--owner-b)' },
  { id: 'entra:9f2a:8d3e', name: 'Lena Fischer',  upn: 'lena@client.co',  role: 'user',  colour: 'var(--owner-c)' },
  { id: 'entra:9f2a:9e4f', name: 'Sam Whitfield', upn: 'sam@client.co',   role: 'admin', colour: 'var(--owner-d)' },
];

export const sessions: SessionInfo[] = [
  { id: '01J8ZA-s1', ownerId: owners[0].id, title: 'Overhaul: split billing module', startedAt: NOW - 6 * HOUR, endedAt: NOW - 2 * HOUR },
  { id: '01J8ZB-s2', ownerId: owners[1].id, title: 'Add export endpoint',            startedAt: NOW - 5 * HOUR },
  { id: '01J8ZC-s3', ownerId: owners[2].id, title: 'Dashboard: revenue widget',      startedAt: NOW - 3 * HOUR },
  { id: '01J8ZD-s4', ownerId: owners[3].id, title: 'Overhaul: swap auth provider',   startedAt: NOW - 90 * MIN },
  { id: '01J8ZE-s5', ownerId: owners[0].id, title: 'Report: Q2 usage LaTeX',         startedAt: NOW - 40 * MIN },
];

const agentNames: Record<AgentKind, string[]> = {
  orchestrator: ['queen', 'foreman'],
  coder: ['coder-α', 'coder-β', 'coder-γ'],
  researcher: ['scout', 'surveyor'],
  qe: ['qe-fleet', 'inspector'],
  compactor: ['compactor'],
};

// Build an agent spawn tree per session: one orchestrator, a few children.
export const agents: AgentInfo[] = [];
let agentSeq = 0;
for (const s of sessions) {
  const root: AgentInfo = {
    id: `ag-${++agentSeq}`, name: pick(agentNames.orchestrator), kind: 'orchestrator',
    ownerId: s.ownerId, sessionId: s.id, parentAgentId: null,
    spawnedAt: s.startedAt + MIN, status: s.endedAt ? 'done' : 'running',
  };
  agents.push(root);
  const childKinds: AgentKind[] = s.title.startsWith('Overhaul')
    ? ['coder', 'coder', 'researcher', 'qe']
    : ['coder', 'researcher'];
  childKinds.forEach((k, i) => {
    agents.push({
      id: `ag-${++agentSeq}`, name: pick(agentNames[k]), kind: k,
      ownerId: s.ownerId, sessionId: s.id, parentAgentId: root.id,
      spawnedAt: s.startedAt + (i + 2) * 6 * MIN,
      status: s.endedAt ? 'done' : pick<AgentInfo['status']>(['running', 'idle', 'done']),
    });
  });
}

const elementPaths: [string, ElementKind][] = [
  ['src/billing/invoice.ts', 'file'], ['src/billing/tax.ts', 'file'],
  ['src/auth/oidc.ts', 'file'], ['src/export/csv.ts', 'file'],
  ['src/dashboard/revenue.tsx', 'file'], ['compose.yaml', 'config'],
  ['foreman.toml', 'config'], ['service:gateway', 'service'],
  ['service:audit-sidecar', 'service'], ['model:qwen3-8b', 'model'],
  ['vault:project-aurora', 'vault'], ['reports/q2-usage.tex', 'file'],
];
export const elements: ElementInfo[] = elementPaths.map(([path, kind], i) => ({
  id: `el-${i + 1}`, path, kind,
}));

// Action stream: the heart of the visualiser. ~180 events across the window.
const actionKinds: ActionKind[] = ['tool_call', 'file_change', 'snapshot', 'rollback', 'gate_approval', 'provision', 'policy_deny'];
const toolLabels = ['Read', 'Edit', 'Write', 'Bash', 'Grep', 'test-run'];
export const actions: ActionEvent[] = [];
let actSeq = 0;
const workingAgents = agents.filter((a) => a.kind !== 'orchestrator');
for (let i = 0; i < 180; i++) {
  const agent = pick(workingAgents);
  const session = sessions.find((s) => s.id === agent.sessionId)!;
  const start = agent.spawnedAt;
  const end = session.endedAt ?? NOW;
  const ts = start + rnd() * (end - start);
  // Weight toward tool_call/file_change; keep rare events rare.
  const roll = rnd();
  const kind: ActionKind =
    roll < 0.55 ? 'tool_call' :
    roll < 0.82 ? 'file_change' :
    roll < 0.88 ? 'provision' :
    roll < 0.93 ? 'gate_approval' :
    roll < 0.97 ? 'snapshot' :
    roll < 0.99 ? 'policy_deny' : 'rollback';
  const el = kind === 'file_change' || kind === 'tool_call' ? pick(elements) : undefined;
  const status = kind === 'policy_deny' ? 'blocked' : rnd() < 0.05 ? 'failed' : 'ok';
  const label =
    kind === 'tool_call' ? `${pick(toolLabels)} ${el?.path ?? ''}`.trim() :
    kind === 'file_change' ? `edit ${el?.path}` :
    kind === 'snapshot' ? 'pre-overhaul snapshot' :
    kind === 'rollback' ? 'auto-rollback: healthcheck fail' :
    kind === 'gate_approval' ? 'human gate cleared' :
    kind === 'provision' ? 'provider key resolved' :
    'blocked: write outside workspace';
  actions.push({
    id: `ac-${++actSeq}`, ts, kind, ownerId: agent.ownerId, agentId: agent.id,
    sessionId: agent.sessionId, elementId: el?.id, label, status,
    durationMs: kind === 'tool_call' ? Math.round(80 + rnd() * 1200) : undefined,
  });
}
actions.sort((a, b) => a.ts - b.ts);

export const snapshots: SnapshotInfo[] = [
  { id: 'snap-4', ts: NOW - 20 * MIN, label: 'auth provider swap', shaBefore: 'a91c3f', status: 'candidate', proposalSummary: 'Replace bespoke session store with Entra OIDC + oauth2-proxy', initiatorOwnerId: owners[3].id, healthcheck: 'running' },
  { id: 'snap-3', ts: NOW - 2 * HOUR, label: 'billing module split', shaBefore: '7f3e11', shaAfter: 'c4d9a2', status: 'promoted', proposalSummary: 'Extract tax calc into its own service; add contract tests', initiatorOwnerId: owners[0].id, healthcheck: 'pass' },
  { id: 'snap-2', ts: NOW - 5 * HOUR, label: 'add polars to python bundle', shaBefore: '2b1a90', status: 'auto_rolled_back', proposalSummary: 'Add polars; broke the pinned pandas contract in reports', initiatorOwnerId: owners[3].id, healthcheck: 'fail' },
  { id: 'snap-1', ts: NOW - 9 * HOUR, label: 'baseline image v0.3.1', shaBefore: '001abc', shaAfter: '2b1a90', status: 'promoted', proposalSummary: 'Baseline: Node 24, uv, Typst, pi engine', initiatorOwnerId: owners[0].id, healthcheck: 'pass' },
];

export const beads: BeadInfo[] = [
  { id: 'bd-a1f8', title: 'Split billing into tax + invoice services', status: 'closed', ownerId: owners[0].id, deps: [], gate: null, priority: 1, createdAt: NOW - 8 * HOUR, closedAt: NOW - 2 * HOUR },
  { id: 'bd-b2c4', title: 'Swap auth to Entra OIDC', status: 'in_progress', ownerId: owners[3].id, assigneeAgentId: 'ag-16', deps: [], gate: 'human', priority: 0, createdAt: NOW - 2 * HOUR },
  { id: 'bd-b2c4.1', title: 'Wire oauth2-proxy forward-auth', status: 'blocked', ownerId: owners[3].id, deps: ['bd-b2c4'], gate: null, priority: 1, createdAt: NOW - 100 * MIN },
  { id: 'bd-c3d1', title: 'Revenue widget on dashboard', status: 'ready', ownerId: owners[2].id, deps: [], gate: null, priority: 2, createdAt: NOW - 3 * HOUR },
  { id: 'bd-d4e9', title: 'CSV export endpoint', status: 'in_progress', ownerId: owners[1].id, assigneeAgentId: 'ag-9', deps: [], gate: 'ci', priority: 2, createdAt: NOW - 5 * HOUR },
  { id: 'bd-e5f2', title: 'Q2 usage report (LaTeX)', status: 'open', ownerId: owners[0].id, deps: ['bd-c3d1'], gate: null, priority: 3, createdAt: NOW - 40 * MIN },
];

export const vaults: VaultInfo[] = [
  { id: 'v-aurora', project: 'project-aurora', state: 'unlocked', unlockedBy: owners[0].id, unlockedAt: NOW - 6 * HOUR, sizeMb: 412 },
  { id: 'v-borealis', project: 'project-borealis', state: 'locked', sizeMb: 1180 },
  { id: 'v-cirrus', project: 'project-cirrus', state: 'locked', sizeMb: 96 },
];

// Audit chain derived from the action stream (a subset gets recorded), plus lifecycle events.
export const audit: AuditRecord[] = (() => {
  const recorded = actions.filter((_, i) => i % 3 === 0);
  let prev = '000000';
  return recorded.map((a, i) => {
    const hash = (parseInt(prev, 16) ^ (a.id.length * 2654435761)).toString(16).slice(-6).padStart(6, '0');
    const rec: AuditRecord = {
      seq: i + 1, eventId: a.id, ts: a.ts,
      userId: a.ownerId, agentId: a.agentId, kind: a.kind,
      summary: a.label, hash, prevHash: prev, anchored: i < recorded.length - 4,
    };
    prev = hash;
    return rec;
  });
})();

export const systemStatus: SystemStatus = {
  activeStack: 'blue',
  imageTag: 'foreman:c4d9a2',
  uptimeHours: 9,
  pendingRebuildChanges: 0,
  auditChainVerifiedAt: NOW - 4 * MIN,
  localModel: 'qwen3-8b (Q4)',
  providersOnline: ['anthropic', 'openai'],
};

// ── Configuration surface: every option we discussed, tagged by apply-class ──
export const configOptions: ConfigOption[] = [
  // providers
  { key: 'providers.anthropic.enabled', label: 'Anthropic', help: 'Route agent calls to the Anthropic API.', whenToUse: 'Default engine for complex overhaul work. Uses a metered API key, never a personal subscription.', applyClass: 'live', type: 'boolean', value: true, group: 'Cloud providers', tab: 'providers' },
  { key: 'providers.anthropic.key', label: 'Anthropic API key', help: 'Metered console key. Stored wrapped; agents never read it raw.', whenToUse: 'Set once at provisioning. Rotate on the provider schedule.', applyClass: 'live', type: 'secret', value: 'sk-ant-•••••', group: 'Cloud providers', tab: 'providers' },
  { key: 'providers.openai.enabled', label: 'OpenAI', help: 'Route agent calls to OpenAI.', whenToUse: 'Alternative or fallback provider. Enable if a workload prefers it.', applyClass: 'live', type: 'boolean', value: true, group: 'Cloud providers', tab: 'providers' },
  { key: 'providers.deepseek.enabled', label: 'DeepSeek', help: 'Route to the DeepSeek hosted API.', whenToUse: 'Leave off for personal or regulated data: hosted in China, no UK/EU adequacy. Self-host the open weights instead.', applyClass: 'live', type: 'boolean', value: false, group: 'Cloud providers', tab: 'providers' },
  { key: 'providers.glm.enabled', label: 'GLM (Zhipu)', help: 'Route to the GLM hosted API.', whenToUse: 'Same residency caveat as DeepSeek. Dev and non-sensitive workloads only.', applyClass: 'live', type: 'boolean', value: false, group: 'Cloud providers', tab: 'providers' },
  { key: 'models.local.name', label: 'Embedded model', help: 'Local model that runs with no provider key.', whenToUse: 'Keeps the sandbox working offline and for cheap background tasks. Rebuild to change which weights ship.', applyClass: 'rebuild', type: 'enum', value: 'qwen3-8b', options: ['qwen3-4b', 'qwen3-8b', 'gemma-4-e4b'], group: 'Local model', tab: 'providers' },
  { key: 'models.default_route', label: 'Default route', help: 'Which model an agent uses when nothing is specified.', whenToUse: 'Point everyday work at the cheapest model that clears the bar; reserve the strong model for overhauls.', applyClass: 'session', type: 'enum', value: 'anthropic', options: ['anthropic', 'openai', 'local'], group: 'Routing', tab: 'providers' },

  // toolchain
  { key: 'toolchain.ts_dashboard', label: 'TS dashboard tools', help: 'Biome, Vite, Vitest, Playwright in the image.', whenToUse: 'Enable when the team builds dashboards or web UIs in the sandbox.', applyClass: 'rebuild', type: 'boolean', value: true, group: 'Bundles', tab: 'toolchain' },
  { key: 'toolchain.python', label: 'Python + Jupyter', help: 'uv with Python 3.11/3.12/3.13, JupyterLab, papermill.', whenToUse: 'Enable for data work, notebooks, or scripted analysis.', applyClass: 'rebuild', type: 'boolean', value: true, group: 'Bundles', tab: 'toolchain' },
  { key: 'toolchain.typesetting', label: 'Typesetting', help: 'Typst by default; Tectonic for LaTeX; full TeX Live for air-gap.', whenToUse: 'Typst for new reports. full-latex only when offline or for deep LaTeX documents (adds ~5GB).', applyClass: 'rebuild', type: 'enum', value: 'typst', options: ['off', 'typst', 'full-latex'], group: 'Bundles', tab: 'toolchain' },
  { key: 'toolchain.playwright_browsers', label: 'Playwright browsers', help: 'Bake Chromium into the image for the team\'s own E2E tests.', whenToUse: 'Turn off to save ~400MB if the team does not run browser tests. Agent browsing uses the confined sidecar regardless.', applyClass: 'rebuild', type: 'boolean', value: true, group: 'Bundles', tab: 'toolchain' },

  // identity
  { key: 'identity.entra.tenant', label: 'Entra tenant ID', help: 'The Microsoft Entra directory that owns the app registration.', whenToUse: 'Set once from the client tenant. Drives every login.', applyClass: 'rebuild', type: 'string', value: '9f2a…c4', group: 'Microsoft Entra', tab: 'identity' },
  { key: 'identity.entra.admin_role', label: 'Admin app role', help: 'Entra App Role mapped to control-plane admin.', whenToUse: 'Assign the client\'s admin security group to this role in Entra, not raw group IDs.', applyClass: 'session', type: 'string', value: 'Sandbox.Admin', group: 'Microsoft Entra', tab: 'identity' },
  { key: 'identity.require_mfa', label: 'Require MFA', help: 'Enforce multi-factor at sign-in via Conditional Access.', whenToUse: 'Keep on. Prefer MFA + named location over device-compliance for mixed fleets.', applyClass: 'live', type: 'boolean', value: true, group: 'Access policy', tab: 'identity' },
  { key: 'identity.session_ttl_min', label: 'Session TTL (min)', help: 'Lifetime of an internal session token.', whenToUse: 'Shorter is safer, longer is smoother. 15 min is a sensible default.', applyClass: 'live', type: 'number', value: 15, group: 'Access policy', tab: 'identity' },

  // network
  { key: 'network.posture', label: 'Exposure posture', help: 'How the sandbox is reached from outside.', whenToUse: 'cloudflare = tunnel + Access→Entra (least inbound). microsoft = Entra Private Access. selfhost = OpenZiti.', applyClass: 'rebuild', type: 'enum', value: 'cloudflare', options: ['cloudflare', 'microsoft', 'selfhost'], group: 'Ingress', tab: 'network' },
  { key: 'network.loopback_only', label: 'Loopback-only host ports', help: 'Bind host ports to 127.0.0.1 only; reach the app through the tunnel.', whenToUse: 'Keep on. Removes the inbound firewall surface entirely.', applyClass: 'rebuild', type: 'boolean', value: true, group: 'Ingress', tab: 'network' },
  { key: 'network.egress_allowlist', label: 'Egress allowlist', help: 'Domains the agent may reach outbound.', whenToUse: 'Add only what agents genuinely need. This is the load-bearing control.', applyClass: 'live', type: 'list', value: ['api.anthropic.com', 'api.openai.com', 'registry.npmjs.org', 'pypi.org'], group: 'Egress', tab: 'network' },

  // vaults
  { key: 'vaults.engine', label: 'Vault engine', help: 'How per-project encrypted storage is implemented.', whenToUse: 'gocryptfs decrypt-on-unlock is the default: zero container privilege. FUSE sidecar only for long-running server hosts.', applyClass: 'rebuild', type: 'enum', value: 'gocryptfs-unlock', options: ['gocryptfs-unlock', 'gocryptfs-fuse'], group: 'Encryption', tab: 'vaults' },
  { key: 'vaults.key_source', label: 'Key source', help: 'Where wrapped vault keys are released from.', whenToUse: 'Azure Key Vault when the client is on Azure (default). OpenBao for self-host.', applyClass: 'rebuild', type: 'enum', value: 'azure-kv', options: ['azure-kv', 'openbao'], group: 'Encryption', tab: 'vaults' },
  { key: 'vaults.auto_lock_min', label: 'Auto-lock (min idle)', help: 'Re-lock a vault after this idle period.', whenToUse: 'Lower for sensitive projects. Locking shreds the plaintext and the in-memory key.', applyClass: 'live', type: 'number', value: 30, group: 'Encryption', tab: 'vaults' },

  // audit
  { key: 'audit.enabled', label: 'Audit trail', help: 'Record every agent action to the write-only sidecar.', whenToUse: 'Always on for client work. Off is only for a throwaway local demo.', applyClass: 'session', type: 'boolean', value: true, group: 'Recording', tab: 'audit' },
  { key: 'audit.log_tool_content', label: 'Record tool content', help: 'Store full tool arguments and output, not just hashes.', whenToUse: 'On gives a richer trail; off is leaner and lower-risk. Secrets are redacted either way.', applyClass: 'session', type: 'boolean', value: false, group: 'Recording', tab: 'audit' },
  { key: 'audit.anchor_interval_min', label: 'Anchor interval (min)', help: 'How often the chain head is signed and shipped off-box.', whenToUse: 'Shorter narrows the tamper window. 60 min balances cost and evidence.', applyClass: 'live', type: 'number', value: 60, group: 'Tamper-evidence', tab: 'audit' },
  { key: 'audit.siem_export', label: 'SIEM export', help: 'Forward records as CEF over syslog.', whenToUse: 'Enable when the client\'s security team wants the trail in Sentinel or similar.', applyClass: 'live', type: 'boolean', value: false, group: 'Tamper-evidence', tab: 'audit' },

  // snapshots
  { key: 'snapshots.auto_rollback', label: 'Auto-rollback on failed healthcheck', help: 'If a rebuilt stack fails its healthcheck, never cut over.', whenToUse: 'Keep on. This is what makes overhauls safe: the old stack serves until the new one proves itself.', applyClass: 'live', type: 'boolean', value: true, group: 'Overhaul safety', tab: 'snapshots' },
  { key: 'snapshots.retain', label: 'Restore points kept', help: 'How many prior image tags and snapshots to retain.', whenToUse: 'More points, more disk. Enough to cover a working week is usually right.', applyClass: 'live', type: 'number', value: 8, group: 'Overhaul safety', tab: 'snapshots' },
  { key: 'snapshots.data_probe', label: 'Data-compatibility probe', help: 'Before cutover, check the new stack can read existing user data.', whenToUse: 'Keep on. Catches overhauls that break data format before they go live.', applyClass: 'live', type: 'boolean', value: true, group: 'Overhaul safety', tab: 'snapshots' },

  // agents
  { key: 'agents.engine', label: 'Agent engine', help: 'The coding-agent harness the sandbox embeds.', whenToUse: 'pi is the default permissive engine. Changing it is a rebuild.', applyClass: 'rebuild', type: 'enum', value: 'pi', options: ['pi', 'opencode', 'goose'], group: 'Harness', tab: 'agents' },
  { key: 'agents.max_parallel', label: 'Max parallel agents', help: 'Concurrency ceiling for spawned sub-agents.', whenToUse: 'Raise for throughput on a big host; lower to bound cost and load.', applyClass: 'live', type: 'number', value: 6, group: 'Harness', tab: 'agents' },
  { key: 'agents.ledger', label: 'Work ledger', help: 'Where long-horizon agent work is tracked.', whenToUse: 'beads gives dependency graphs and approval gates. backlog.md is the simpler option.', applyClass: 'rebuild', type: 'enum', value: 'beads', options: ['beads', 'backlog.md', 'off'], group: 'Work ledger', tab: 'agents' },
  { key: 'agents.overhaul_gate', label: 'Overhaul approval gate', help: 'Require a named human to approve CTO-scale overhauls.', whenToUse: 'Keep on. A chat request should not be able to rebuild the system without sign-off.', applyClass: 'live', type: 'boolean', value: true, group: 'Work ledger', tab: 'agents' },
];
