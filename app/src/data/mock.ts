// Deterministic mock world for the control plane. No backend.
// FROZEN: feature modules read via adapter.ts; they never generate their own data.
import type {
  Owner, SessionInfo, AgentInfo, ElementInfo, ActionEvent, ConfigOption,
  SnapshotInfo, BeadInfo, AuditRecord, VaultInfo, SystemStatus, ActionKind,
  AgentKind, ElementKind, DocumentInfo, ModuleInfo,
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
  ['service:audit-sidecar', 'service'], ['model:gemma-4-31b', 'model'],
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

// Uploaded documents and their OCR state. ocrRoute records where OCR ran —
// 'local' kept the page in the box, a cloud route sent it out.
export const documents: DocumentInfo[] = [
  { id: 'doc-1', name: 'intake-form-scanned.pdf', ownerId: owners[2].id, project: 'project-aurora', sizeKb: 2840, pages: 3, mime: 'application/pdf', uploadedAt: NOW - 55 * MIN, ocr: 'review', ocrRoute: 'local', handwriting: true, confidence: 0.61, fieldsForReview: 4 },
  { id: 'doc-2', name: 'signed-contract.pdf', ownerId: owners[0].id, project: 'project-aurora', sizeKb: 910, pages: 12, mime: 'application/pdf', uploadedAt: NOW - 3 * HOUR, ocr: 'done', ocrRoute: 'local', handwriting: false, confidence: 0.98 },
  { id: 'doc-3', name: 'handwritten-survey-batch.png', ownerId: owners[1].id, project: 'project-borealis', sizeKb: 5120, pages: 1, mime: 'image/png', uploadedAt: NOW - 20 * MIN, ocr: 'processing', ocrRoute: 'local', handwriting: true },
  { id: 'doc-4', name: 'invoice-Q2.pdf', ownerId: owners[3].id, project: 'project-cirrus', sizeKb: 430, pages: 2, mime: 'application/pdf', uploadedAt: NOW - 8 * MIN, ocr: 'done', ocrRoute: 'mistral', handwriting: false, confidence: 0.99 },
  { id: 'doc-5', name: 'field-notes-messy.jpg', ownerId: owners[2].id, project: 'project-aurora', sizeKb: 3300, pages: 1, mime: 'image/jpeg', uploadedAt: NOW - 2 * MIN, ocr: 'pending', ocrRoute: 'local', handwriting: true },
];

// Audit chain derived from the action stream (a subset gets recorded), plus lifecycle events.
// Seeded demo data only: the hashes are computed in-app for the walkthrough, not read from a
// real trail. The live write-only, hash-chained audit sidecar arrives at M6 (surfaced as the
// "DEMO DATA" marker in AuditSection). Do not treat these records as evidential.
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

// Module manifest (ADR-009): the honest inventory. Core is the spine; surfaces
// are how people and agents interact; modules are optional capabilities.
export const modules: ModuleInfo[] = [
  // core — the governance and data spine
  { id: 'control-plane', name: 'Control-plane server', layer: 'core', state: 'core', reach: 'spine', summary: 'Serves the world, config, events and documents over one API.' },
  { id: 'domain-contract', name: 'Domain contract', layer: 'core', state: 'core', reach: 'spine', summary: 'The frozen types and adapter seam every surface reads.' },
  { id: 'identity', name: 'Identity', layer: 'core', state: 'core', reach: 'spine', summary: 'Entra oid/tid seeds every action; the single attribution key.' },
  { id: 'audit', name: 'Audit spine', layer: 'core', state: 'core', reach: 'spine', summary: 'Write-only hash-chained trail; the boundary all surfaces route through.' },
  { id: 'config', name: 'Config + apply-class', layer: 'core', state: 'core', reach: 'spine', summary: 'One TOML source of truth; every change carries its apply-class.' },
  { id: 'snapshots', name: 'Snapshot / rollback', layer: 'core', state: 'core', reach: 'spine', summary: 'Blue/green overhauls with a recovery partition and auto-rollback.' },

  // surfaces — how humans and agents interact
  { id: 'foreman', name: 'Foreman (web)', layer: 'surface', state: 'on', reach: 'core-api', summary: 'The admin control plane; the surface you are looking at.' },
  { id: 'code-server', name: 'code-server', layer: 'surface', state: 'on', service: 'agent', reach: 'core-api', summary: 'Web VS Code; the primary-user workspace, served externally.' },
  { id: 'companion', name: 'Companion extension', layer: 'surface', state: 'available', reach: 'extension', summary: 'Chat + documents as a code-server sidebar dock (ADR-007).' },
  { id: 'chat-bubble', name: 'Chat bubble', layer: 'surface', state: 'available', reach: 'core-api', summary: 'deep-chat widget for embedding in a client dashboard.' },
  { id: 'desktop', name: 'Streamed desktop', layer: 'surface', state: 'available', reach: 'sidecar', heavy: true, applyClass: 'rebuild', summary: 'Optional native Linux desktop under agentic control (ADR-009 candidate).' },

  // modules — optional capabilities
  { id: 'local-model', name: 'Local model', layer: 'module', state: 'on', service: 'local-model', gate: 'models.local.name', reach: 'core-api', applyClass: 'rebuild', summary: 'Private in-box text model (Gemma 4 / Qwen / gpt-oss) on the agent route switch.' },
  { id: 'local-ocr', name: 'Local OCR', layer: 'module', state: 'on', service: 'local-ocr', gate: 'ocr.route', reach: 'core-api', heavy: true, applyClass: 'session', summary: 'Private in-box vision OCR for documents; cloud routes are peers.' },
  { id: 'ner', name: 'Clinical NER', layer: 'module', state: 'off', service: 'ner', gate: 'grounding.enabled', reach: 'sidecar', heavy: true, applyClass: 'session', summary: 'OpenMed/medspaCy clinical entity and assertion grounding sidecar (ADR-012).' },
  { id: 'browser-sidecar', name: 'Browser sidecar', layer: 'module', state: 'on', service: 'browser-sidecar', reach: 'sidecar', summary: 'Real headful Chrome (GPU, undetectable), VNC-observable, for agent web work.' },
  { id: 'vault', name: 'Vaults', layer: 'module', state: 'on', service: 'vault-sidecar', gate: 'vaults.engine', reach: 'sidecar', applyClass: 'rebuild', summary: 'gocryptfs per-project encrypted storage, unlocked via SSO.' },
  { id: 'ledger', name: 'Work ledger', layer: 'module', state: 'on', gate: 'agents.ledger', reach: 'core-api', applyClass: 'rebuild', summary: 'beads dependency-graphed work items behind a narrow interface.' },
  { id: 'tunnel', name: 'Tunnel', layer: 'module', state: 'off', service: 'cloudflared', gate: 'network.posture', reach: 'sidecar', applyClass: 'rebuild', summary: 'Zero-inbound exposure via cloudflared + Access (overlay).' },
  { id: 'qe-fleet', name: 'QE fleet', layer: 'module', state: 'available', gate: 'dev.qe_fleet', reach: 'core-api', applyClass: 'session', summary: 'Agentic test-generation and coverage building during development; on in a dev box, off in a locked deployment.' },
];

export const systemStatus: SystemStatus = {
  activeStack: 'blue',
  imageTag: 'foreman:c4d9a2',
  uptimeHours: 9,
  pendingRebuildChanges: 0,
  auditChainVerifiedAt: NOW - 4 * MIN,
  localModel: 'gemma-4-31b (QAT 8-bit)',
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
  { key: 'models.local.name', label: 'Embedded model', help: 'Local model that runs with no provider key. Weights are baked in and served inside the box.', whenToUse: 'Keeps the sandbox working offline and cheap for background tasks. gemma-4-31b (Apache-2.0, 256K context) is the quality pick where the GPU allows: ~18GB at 4-bit, ~35GB at the 8-bit QAT build. The two gpt-oss weights are OpenAI’s open models (Apache-2.0), kept as defence in depth — a second open-weights lineage on the same switch, for clients who want OpenAI-class reasoning but whose data must never reach OpenAI’s API (gpt-oss-20b ~16GB; gpt-oss-120b wants an 80GB GPU). The Qwen and E4B builds are the CPU-class floor. Changing which weights ship is a rebuild.', applyClass: 'rebuild', type: 'enum', value: 'gemma-4-31b', options: ['qwen3-4b', 'qwen3-8b', 'gemma-4-e4b', 'gemma-4-31b', 'gpt-oss-20b', 'gpt-oss-120b'], group: 'Local model', tab: 'providers' },
  { key: 'models.local.runtime', label: 'Local runtime', help: 'The server that runs the embedded weights and exposes an OpenAI-compatible API inside the box.', whenToUse: 'llama.cpp is the lean CPU-first default and carries Gemma 4’s multi-token prediction (MTP) speculative decoding — roughly 1.4–2.2× faster generation for ~2GB of extra headroom. Use vLLM on a GPU host for gpt-oss-120b throughput. gpt-oss needs a runtime that speaks OpenAI’s harmony response format — all three listed do.', applyClass: 'rebuild', type: 'enum', value: 'llama.cpp', options: ['llama.cpp', 'ollama', 'vllm'], group: 'Local model', tab: 'providers' },
  { key: 'models.local.endpoint', label: 'Local endpoint', help: 'OpenAI-compatible base URL the gateway routes local calls to.', whenToUse: 'Leave as the in-box service address unless you serve the model from another host. Because it is OpenAI-compatible, gpt-oss reaches the agent through the same code path as the cloud OpenAI provider — only the URL differs, and nothing leaves the box.', applyClass: 'live', type: 'string', value: 'http://local-model:11434/v1', group: 'Local model', tab: 'providers' },
  { key: 'models.default_route', label: 'Agent route', help: 'Which model an agent uses when nothing is specified. This is the agent feature’s local/cloud switch.', whenToUse: 'Cloud providers give the strongest reasoning; local keeps a workload fully private on the embedded model. Point everyday work at the cheapest option that clears the bar; reserve the strong model for overhauls.', applyClass: 'session', type: 'enum', value: 'anthropic', options: ['anthropic', 'openai', 'local'], group: 'Routing', tab: 'providers' },

  // ocr / documents — each AI feature carries its own local/cloud switch (route).
  { key: 'ocr.enabled', label: 'Document OCR', help: 'Read uploaded documents into text the agent can use.', whenToUse: 'Enable when the team uploads scans or forms. Off if documents are always plain text.', applyClass: 'session', type: 'boolean', value: true, group: 'OCR', tab: 'providers' },
  { key: 'ocr.route', label: 'OCR route', help: 'Where OCR runs. The document feature’s local/cloud switch.', whenToUse: 'local keeps sensitive forms in the box (a vision model runs in-network). Cloud routes are more accurate on messy handwriting but send the page image out — use them only where the document’s sensitivity allows.', applyClass: 'session', type: 'enum', value: 'local', options: ['local', 'openai', 'mistral', 'gemini'], group: 'OCR', tab: 'providers' },
  { key: 'ocr.local_model', label: 'Local OCR model', help: 'Vision model used when the OCR route is local.', whenToUse: 'Qwen-VL is the best permissive single model for handwriting on forms. PaddleOCR-VL is lighter/faster for cleaner print. On the demonstrator box a Pixtral-class Mistral model is also available as a larger local option, its weights held under Mistral’s terms (ADR-015). All run behind the same OpenAI-compatible endpoint as the local text model.', applyClass: 'rebuild', type: 'enum', value: 'qwen2.5-vl-7b', options: ['qwen2.5-vl-7b', 'qwen3-vl', 'paddleocr-vl', 'deepseek-ocr', 'pixtral-12b'], group: 'OCR', tab: 'providers' },
  { key: 'ocr.confidence_review', label: 'Low-confidence review', help: 'Route fields the model is unsure of to a human.', whenToUse: 'Keep on for handwriting. No open model reads messy cursive reliably; a person confirms the fields below the confidence threshold.', applyClass: 'live', type: 'boolean', value: true, group: 'OCR', tab: 'providers' },

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
  { key: 'dev.qe_fleet', label: 'QE fleet (dev)', help: 'Let agents build test coverage during development.', whenToUse: 'On in a development box so agents can generate and run tests as they build. Off in a locked client deployment where no test-authoring should happen.', applyClass: 'session', type: 'boolean', value: false, group: 'Development', tab: 'agents' },

  // interface — the self-modifying surface. These are hot: the agent applies
  // them through hot reload or the layout manifest, sub-second, with no rebuild.
  { key: 'interface.density', label: 'Density', help: 'Spacing of the interface.', whenToUse: 'Compact fits more on screen; comfortable is easier to read. An agent can switch this on request without a rebuild.', applyClass: 'hot', type: 'enum', value: 'comfortable', options: ['comfortable', 'compact'], group: 'Layout', tab: 'interface' },
  { key: 'interface.panels', label: 'Visible panels', help: 'Which panels the interface shows and their order.', whenToUse: 'Ask the agent in chat to add, remove, or reorder panels. The layout is data, so the change lands live and cannot break a panel.', applyClass: 'hot', type: 'list', value: ['overview', 'visualiser', 'activity', 'work', 'documents', 'config', 'ops'], group: 'Layout', tab: 'interface' },
  { key: 'interface.agent_edits', label: 'Allow agent layout edits', help: 'Let the agent change the layout from chat guidance.', whenToUse: 'On lets a user say “make the visualiser bigger” and have it happen. Off freezes the layout for a locked-down deployment.', applyClass: 'live', type: 'boolean', value: true, group: 'Self-editing', tab: 'interface' },
  { key: 'interface.state_backend', label: 'UI state', help: 'Where per-user interface state is kept so it survives reloads.', whenToUse: 'Browser keeps state per device (default). Server lets a layout follow a user across devices.', applyClass: 'rebuild', type: 'enum', value: 'browser', options: ['browser', 'server'], group: 'Self-editing', tab: 'interface' },
];
