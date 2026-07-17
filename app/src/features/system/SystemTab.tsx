import { store } from '../../data/adapter';
import { Panel, ApplyBadge, WhenToUse } from '../../ui/primitives';
import type { ModuleInfo } from '../../domain/types';
import { buildScene, shortCoreName, type Scene, type OrbitNode } from './layout';

// System: the module manifest drawn as the slim core with its surfaces and
// modules around it (ADR-009). The core is the governance and data spine; the
// connectors show that every surface and module routes through its contract.
export default function SystemTab() {
  const modules = store.modules();
  const core = modules.filter((m) => m.layer === 'core');
  const surfaces = modules.filter((m) => m.layer === 'surface');
  const mods = modules.filter((m) => m.layer === 'module');
  const optional = [...surfaces, ...mods].filter((m) => m.state !== 'on').length;
  const scene = buildScene(modules);

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      <WhenToUse>
        See what the system is actually made of: a slim core (the governance and data spine) with
        surfaces and modules around it. Use it to confirm which optional modules are on, and that
        every surface routes through the core contract rather than around it.
      </WhenToUse>

      <Panel style={{ padding: 0, overflow: 'hidden' }}>
        <OrbitMap scene={scene} />
        <div style={{ display: 'flex', gap: 'var(--s-4)', flexWrap: 'wrap', padding: 'var(--s-3) var(--s-4)', borderTop: '1px solid var(--line)', fontSize: 'var(--fs-sm)' }}>
          <Legend colour="var(--accent)" label="Core (spine)" />
          <Legend colour="var(--teal)" label="Surface" />
          <Legend colour="var(--violet)" label="Module" />
          <span className="muted" style={{ marginLeft: 'auto' }}>
            {core.length} core · {surfaces.length} surfaces · {mods.length} modules
            {optional > 0 && <> · {optional} off/available</>}
          </span>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--s-4)', alignItems: 'start' }}>
        <ModuleList title="Core" hint="The spine: always on, never optional" items={core} />
        <ModuleList title="Surfaces" hint="How people and agents interact" items={surfaces} />
        <ModuleList title="Modules" hint="Optional capabilities, gated on" items={mods} />
      </div>
    </div>
  );
}

function OrbitMap({ scene }: { scene: Scene }) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const { vb, centre, core, coreItems, glowR, rings } = scene;
  const nodes = [...scene.surfaces, ...scene.modules];

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${vb.w} ${vb.h}`} width="100%" style={{ display: 'block', minWidth: 680 }}
        role="img" aria-label="Core, surfaces and modules map">
        <defs>
          <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* faint orbit guides */}
        {rings.map((r) => (
          <circle key={`ring-${r}`} cx={centre.x} cy={centre.y} r={r} fill="none" stroke="var(--line)" strokeOpacity={0.4} />
        ))}

        {/* connectors: pill edge → core edge, so the eye reads "routes through the core" */}
        {nodes.map((n) => (
          <line key={`l-${n.m.id}`} x1={n.line.from.x} y1={n.line.from.y} x2={n.line.to.x} y2={n.line.to.y}
            stroke={n.dim ? 'var(--line)' : n.colour} strokeWidth={1}
            strokeOpacity={n.dim ? 0.2 : 0.4} strokeDasharray={n.dim ? '3 3' : undefined} />
        ))}

        {/* core glow + plate */}
        <circle cx={centre.x} cy={centre.y} r={glowR} fill="url(#coreGlow)" />
        <rect x={core.x} y={core.y} width={core.w} height={core.h} rx={12}
          fill="color-mix(in srgb, var(--accent) 14%, var(--bg-2))" stroke="var(--accent)" strokeWidth={1.5} />
        <text x={centre.x} y={core.y + 24} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--fg-0)">CORE</text>
        <text x={centre.x} y={core.y + 40} textAnchor="middle" fontSize={10} fill="var(--fg-2)">governance + data spine</text>
        {coreItems.map((m, i) => {
          const perCol = Math.ceil(coreItems.length / 2);
          const col = Math.floor(i / perCol);
          const row = i % perCol;
          const x = centre.x + (col === 0 ? -core.w / 4 : core.w / 4);
          const y = core.y + 60 + row * 15;
          return <text key={m.id} x={x} y={y} textAnchor="middle" fontSize={9.5} fill="var(--fg-1)">{shortCoreName(m.name)}</text>;
        })}

        {/* pills */}
        {nodes.map((n) => <Pill key={n.m.id} n={n} glow={!reduce && !n.dim} />)}
      </svg>
    </div>
  );
}

function Pill({ n, glow }: { n: OrbitNode; glow: boolean }) {
  const { centre, w, h, colour, dim, m } = n;
  return (
    <g opacity={dim ? 0.55 : 1}>
      <rect x={centre.x - w / 2} y={centre.y - h / 2} width={w} height={h} rx={h / 2}
        fill={dim ? 'var(--bg-3)' : `color-mix(in srgb, ${colour} 16%, var(--bg-2))`}
        stroke={colour} strokeWidth={1.25}
        style={glow ? { filter: `drop-shadow(0 0 5px color-mix(in srgb, ${colour} 60%, transparent))` } : undefined} />
      <circle cx={centre.x - w / 2 + 13} cy={centre.y} r={4} fill={stateColour(m)} />
      <text x={centre.x + 4} y={centre.y + 3.5} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--fg-0)">{m.name}</text>
      {m.heavy && <text x={centre.x + w / 2 - 12} y={centre.y - h / 2 + 1} textAnchor="middle" fontSize={8} fill="var(--amber)">GPU</text>}
    </g>
  );
}

function ModuleList({ title, hint, items }: { title: string; hint: string; items: ModuleInfo[] }) {
  return (
    <Panel title={title} hint={hint}>
      <div style={{ display: 'grid', gap: 'var(--s-2)' }}>
        {items.map((m) => (
          <div key={m.id} style={{ display: 'grid', gap: 2, padding: 'var(--s-2)', background: 'var(--bg-2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: stateColour(m), flex: 'none' }} />
              <strong style={{ fontSize: 'var(--fs-sm)' }}>{m.name}</strong>
              {m.heavy && <span className="badge" style={{ padding: '0 5px', color: 'var(--amber)', borderColor: 'var(--amber)' }} title="Wants a GPU or real resources">GPU</span>}
              {m.applyClass && <span style={{ marginLeft: 'auto' }}><ApplyBadge cls={m.applyClass} /></span>}
            </div>
            <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{m.summary}</span>
            <div style={{ display: 'flex', gap: 'var(--s-3)', fontSize: 'var(--fs-xs)' }} className="muted">
              {m.reach && <span>reach: {m.reach}</span>}
              {m.gate && <span className="mono">gate: {m.gate}</span>}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Legend({ colour, label }: { colour: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 9, height: 9, borderRadius: '50%', background: colour }} /> {label}
    </span>
  );
}

function stateColour(m: ModuleInfo): string {
  if (m.state === 'on') return 'var(--green)';
  if (m.state === 'off') return 'var(--fg-2)';
  if (m.state === 'core') return 'var(--accent)';
  return 'var(--amber)'; // available
}
