// Visualiser — a timeline of actions over time.
//
// The mark field is drawn on a 2D canvas: ~180 marks stay smooth, and a canvas
// keeps the bundle lean (no charting dependency). Everything interactive around
// it — tooltip, detail panel, legends, controls — is plain React/DOM.
//
// Reading the picture: the horizontal axis is time across the whole activity
// window. A group-by control lays the same events into horizontal swimlanes, so
// regrouping re-asks the question (who / which agent / which file / what kind).
// A play cursor sweeps left→right; marks it has passed are solid, the rest dim.
import {
  useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { ActionEvent } from '../../domain/types';
import { store } from '../../data/adapter';
import {
  Panel, WhenToUse, EmptyState, OwnerTag, OwnerDot, StatusPip, fmtTime,
} from '../../ui/primitives';
import {
  computeLayout, densityBins, xToTime, lineageOf, clamp01,
  type GroupMode, type Geometry, type Lane, type Mark,
} from './layout';
import {
  resolveColour, KIND_COLOUR, ELEMENT_COLOUR, KIND_LABEL, ELEMENT_LABEL, KIND_ORDER,
} from './palette';

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const SWEEP_MS = 11000; // wall time for a full left→right sweep

const MODES: { id: GroupMode; label: string }[] = [
  { id: 'owner', label: 'Owner' },
  { id: 'agent', label: 'Agent' },
  { id: 'element', label: 'Element' },
  { id: 'kind', label: 'Action kind' },
];
const MODE_LABEL: Record<GroupMode, string> = {
  owner: 'owner', agent: 'agent', element: 'element', kind: 'action kind',
};

export default function VisualiserTab() {
  const actions = useMemo(() => store.actions(), []);

  const [mode, setMode] = useState<GroupMode>('owner');
  const [width, setWidth] = useState(0);
  const [cursorTs, setCursorTs] = useState(() => store.timeWindow()[1]); // start showing everything
  const [playing, setPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<'none' | 'scrub' | 'press'>('none');
  const pressAt = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Respect the OS reduced-motion setting: no auto-play if set (scrubber still works).
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    setReducedMotion(mq.matches);
    const on = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // Track the container width so the canvas is responsive.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(
    () => (width > 0 && actions.length > 0 ? computeLayout(width, mode, actions) : null),
    [width, mode, actions],
  );

  // Hover indexes into the marks array; that array changes when the mode does.
  useEffect(() => { setHover(null); }, [mode]);

  // Playback: advance the cursor using the rAF timestamp (no Date.now needed).
  useEffect(() => {
    if (!layout || !playing) return;
    const { t0, t1 } = layout.geo;
    const span = t1 - t0;
    let raf = 0;
    let last = -1;
    const step = (t: number) => {
      if (last < 0) last = t;
      const dt = t - last;
      last = t;
      setCursorTs((prev) => Math.min(t1, prev + (dt / SWEEP_MS) * span));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, layout]);

  // Stop when the sweep reaches the end.
  useEffect(() => {
    if (layout && playing && cursorTs >= layout.geo.t1) setPlaying(false);
  }, [cursorTs, playing, layout]);

  // Paint. Re-runs on any change to the scene.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const { geo, lanes, marks } = layout;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(geo.width * dpr);
    canvas.height = Math.round(geo.height * dpr);
    canvas.style.width = `${geo.width}px`;
    canvas.style.height = `${geo.height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS px; the DPR scale keeps it crisp
    drawScene(ctx, geo, lanes, marks, actions, cursorTs, hover, selectedId);
  }, [layout, cursorTs, hover, selectedId, actions]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  // The plot splits into two zones by y: the axis + density strip at the top is
  // the scrub track; the swimlanes below are the mark field (hover + select).
  const posOf = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hitTest = (x: number, y: number): { i: number; x: number; y: number } | null => {
    if (!layout) return null;
    let best = -1;
    let bestD = 81; // 9px radius, squared
    layout.marks.forEach((m, i) => {
      const dx = x - m.x;
      const dy = y - m.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    });
    return best >= 0 ? { i: best, x: layout.marks[best].x, y: layout.marks[best].y } : null;
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const { x, y } = posOf(e);
    if (y <= layout.geo.lanesTop - 4) {
      drag.current = 'scrub';
      canvasRef.current?.setPointerCapture(e.pointerId);
      setPlaying(false);
      setCursorTs(xToTime(x, layout.geo));
    } else {
      drag.current = 'press';
      pressAt.current = { x, y };
    }
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!layout) return;
    const { x, y } = posOf(e);
    if (drag.current === 'scrub') { setCursorTs(xToTime(x, layout.geo)); return; }
    const hit = hitTest(x, y);
    setHover(hit);
    const c = canvasRef.current;
    if (c) c.style.cursor = y <= layout.geo.lanesTop - 4 ? 'ew-resize' : hit ? 'pointer' : 'crosshair';
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (layout && drag.current === 'press') {
      const { x, y } = posOf(e);
      const hit = hitTest(x, y);
      // A click (not a drag) on a mark selects it.
      if (hit && Math.hypot(x - pressAt.current.x, y - pressAt.current.y) < 5) {
        setSelectedId(layout.marks[hit.i].action.id);
      }
    }
    drag.current = 'none';
  };
  const onLeave = () => { if (drag.current !== 'scrub') setHover(null); };

  // ── Playback controls ───────────────────────────────────────────────────────
  const atEnd = layout ? cursorTs >= layout.geo.t1 - 1 : true;
  const togglePlay = () => {
    if (!layout || reducedMotion) return;
    if (playing) { setPlaying(false); return; }
    if (atEnd) setCursorTs(layout.geo.t0); // restart from the beginning
    setPlaying(true);
  };
  const showAll = () => { if (layout) { setPlaying(false); setCursorTs(layout.geo.t1); } };

  const selected = selectedId ? actions.find((a) => a.id === selectedId) ?? null : null;

  const intro = (
    <WhenToUse>
      Answers who did what, to what, and when. Regroup the same events by owner, agent, element
      or action kind to change the question — catch an agent making an odd run of edits, trace one
      owner's blast radius across files and services, or watch an overhaul land as a burst. Press
      play to sweep the cursor and replay the order things happened.
    </WhenToUse>
  );

  if (actions.length === 0) {
    return (
      <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
        {intro}
        <Panel title="Timeline"><EmptyState>No actions recorded yet.</EmptyState></Panel>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--s-4)' }}>
      {intro}

      <Panel
        title="Timeline"
        hint={`${actions.length} actions · grouped by ${MODE_LABEL[mode]}`}
        right={<Segmented value={mode} onChange={setMode} />}
      >
        <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onLeave}
            style={{ display: 'block', width: '100%', touchAction: 'none' }}
          />
          {hover && layout && <Tooltip mark={layout.marks[hover.i]} geo={layout.geo} />}
        </div>

        {/* Playback + scrubber */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)', marginTop: 'var(--s-3)' }}>
          <button
            className="btn"
            onClick={togglePlay}
            disabled={reducedMotion}
            aria-pressed={playing}
            title={reducedMotion
              ? 'Auto-play is off under reduced-motion — drag the scrubber instead'
              : playing ? 'Pause the sweep' : 'Sweep the cursor left to right'}
            style={{ minWidth: 92, justifyContent: 'center' }}
          >
            {playing ? '❚❚ Pause' : atEnd ? '▶ Replay' : '▶ Play'}
          </button>
          <button className="btn" onClick={showAll} title="Move the cursor to the end — show every action">
            Show all
          </button>
          <input
            type="range"
            min={0}
            max={1000}
            value={layout ? Math.round(clamp01((cursorTs - layout.geo.t0) / (layout.geo.t1 - layout.geo.t0)) * 1000) : 0}
            onChange={(e) => {
              if (!layout) return;
              const f = Number(e.target.value) / 1000;
              setPlaying(false);
              setCursorTs(layout.geo.t0 + f * (layout.geo.t1 - layout.geo.t0));
            }}
            aria-label="Timeline position"
            style={{ flex: 1, accentColor: 'var(--accent)', minWidth: 120 }}
          />
          <span className="mono" style={{ fontSize: 'var(--fs-sm)', color: 'var(--fg-1)', minWidth: 92, textAlign: 'right' }}>
            {fmtTime(cursorTs)}
          </span>
        </div>

        <Legend mode={mode} />
      </Panel>

      <Panel title="Selected action" hint="Click a mark to trace one action end to end.">
        {selected ? <Detail action={selected} onClear={() => setSelectedId(null)} /> : (
          <EmptyState>Nothing selected. Click a mark to see its owner, agent lineage, element and exact time.</EmptyState>
        )}
      </Panel>
    </div>
  );
}

// ── Group-by control ──────────────────────────────────────────────────────────
function Segmented({ value, onChange }: { value: GroupMode; onChange: (m: GroupMode) => void }) {
  return (
    <div
      role="group"
      aria-label="Group by"
      style={{ display: 'inline-flex', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
    >
      {MODES.map((m) => {
        const on = m.id === value;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
            aria-pressed={on}
            style={{
              padding: '6px 12px', border: 'none', cursor: 'pointer',
              fontSize: 'var(--fs-sm)', fontWeight: 600, whiteSpace: 'nowrap',
              background: on ? 'var(--accent-dim)' : 'transparent',
              color: on ? 'var(--fg-0)' : 'var(--fg-2)',
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────
function Tooltip({ mark, geo }: { mark: Mark; geo: Geometry }) {
  const a = mark.action;
  const agent = store.agentById(a.agentId);
  const el = a.elementId ? store.elementById(a.elementId) : undefined;
  const flip = mark.x > geo.width * 0.62; // near the right edge, open leftwards
  return (
    <div
      style={{
        position: 'absolute', left: mark.x, top: mark.y, pointerEvents: 'none', zIndex: 5,
        transform: `translate(${flip ? 'calc(-100% - 14px)' : '14px'}, -50%)`,
        minWidth: 220, maxWidth: 300,
        background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-sm)',
        boxShadow: 'var(--shadow)', padding: 'var(--s-3)', fontSize: 'var(--fs-sm)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)', marginBottom: 6 }}>
        <span className="mono" style={{ color: 'var(--fg-1)' }}>{fmtTime(a.ts)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <StatusPip status={a.status} /> <span className="muted">{a.status}</span>
        </span>
      </div>
      <div style={{ marginBottom: 4 }}><OwnerTag ownerId={a.ownerId} /></div>
      <div className="muted" style={{ marginBottom: 6 }}>
        {agent ? `${agent.name} · ${agent.kind}` : 'unknown agent'} · {KIND_LABEL[a.kind]}
      </div>
      <div className="mono" style={{ color: 'var(--fg-0)', wordBreak: 'break-word' }}>{a.label}</div>
      {el && <div className="mono muted" style={{ marginTop: 4, fontSize: 'var(--fs-xs)' }}>{el.path}</div>}
    </div>
  );
}

// ── Selected-action detail ────────────────────────────────────────────────────
function Detail({ action, onClear }: { action: ActionEvent; onClear: () => void }) {
  const chain = lineageOf(action.agentId);
  const owner = store.ownerById(action.ownerId);
  const el = action.elementId ? store.elementById(action.elementId) : undefined;
  const session = store.sessions().find((s) => s.id === action.sessionId);
  const kindColour = resolveColour(KIND_COLOUR[action.kind]);

  return (
    <div style={{ display: 'grid', gap: 'var(--s-3)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--s-3)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: kindColour, boxShadow: `0 0 8px ${kindColour}` }} />
          <strong>{KIND_LABEL[action.kind]}</strong>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--fg-2)', fontSize: 'var(--fs-sm)' }}>
            <StatusPip status={action.status} /> {action.status}
          </span>
        </span>
        <button className="btn" onClick={onClear} title="Clear selection">Clear</button>
      </div>

      <div className="mono" style={{ color: 'var(--fg-0)', wordBreak: 'break-word' }}>{action.label}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--s-3)' }}>
        <Field label="Owner"><OwnerTag ownerId={action.ownerId} /></Field>
        <Field label="Exact time">
          <span className="mono">{new Date(action.ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'medium' })}</span>
        </Field>
        <Field label="Agent lineage">
          {chain.length === 0 ? <span className="muted">unknown</span> : (
            <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 4 }}>
              {chain.map((ag, i) => (
                <span key={ag.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
                  {i > 0 && <span className="muted" aria-hidden>›</span>}
                  <span style={{ fontWeight: i === chain.length - 1 ? 700 : 400, color: i === chain.length - 1 ? 'var(--fg-0)' : 'var(--fg-1)' }}>
                    {ag.name}
                  </span>
                  <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>({ag.kind})</span>
                </span>
              ))}
            </span>
          )}
        </Field>
        <Field label="Element">
          {el ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="mono">{el.path}</span>
              <span className="badge" style={{ padding: '0 6px' }}>{ELEMENT_LABEL[el.kind]}</span>
            </span>
          ) : <span className="muted">—</span>}
        </Field>
        <Field label="Duration">
          <span className="mono">{fmtDuration(action.durationMs)}</span>
        </Field>
        <Field label="Session">
          <span className="secondary">{session?.title ?? '—'}</span>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 'var(--fs-sm)' }}>{children}</div>
    </div>
  );
}

// ── Legend: colour key for the active mode + a fixed status/status key ─────────
function Legend({ mode }: { mode: GroupMode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--s-5)', marginTop: 'var(--s-4)', paddingTop: 'var(--s-3)', borderTop: '1px solid var(--line)', fontSize: 'var(--fs-sm)' }}>
      <LegendGroup title={mode === 'agent' ? 'Colour: owner' : mode === 'owner' ? 'Owners' : mode === 'kind' ? 'Action kinds' : 'Element kinds'}>
        {mode === 'owner' || mode === 'agent'
          ? store.owners().map((o) => (
              <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <OwnerDot owner={o} /> <span className="secondary">{o.name}</span>
              </span>
            ))
          : mode === 'kind'
            ? KIND_ORDER.map((k) => <Chip key={k} colour={resolveColour(KIND_COLOUR[k])} label={KIND_LABEL[k]} />)
            : (['file', 'service', 'config', 'model', 'vault'] as const).map((k) => (
                <Chip key={k} colour={resolveColour(ELEMENT_COLOUR[k])} label={ELEMENT_LABEL[k]} />
              ))}
      </LegendGroup>

      <LegendGroup title="Status">
        <Chip colour={resolveColour('var(--fg-1)')} label="ok" />
        <Chip colour={resolveColour('var(--fg-1)')} ring={resolveColour('var(--amber)')} label="blocked" />
        <Chip colour={resolveColour('var(--fg-1)')} ring={resolveColour('var(--rose)')} label="failed" />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: resolveColour('var(--fg-1)'), opacity: 0.2 }} />
          <span className="secondary">after the cursor</span>
        </span>
      </LegendGroup>
    </div>
  );
}

function LegendGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--s-3)' }}>
      <span className="muted" style={{ fontSize: 'var(--fs-xs)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</span>
      {children}
    </div>
  );
}

function Chip({ colour, label, ring }: { colour: string; label: string; ring?: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: colour, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }} />
      <span className="secondary">{label}</span>
    </span>
  );
}

function fmtDuration(ms?: number): string {
  if (ms == null) return '—';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// ── Canvas rendering ──────────────────────────────────────────────────────────
// One pass, drawn in CSS px (the context is pre-scaled by DPR). Order: lane
// bands + labels, then axis ticks and gridlines, the density strip, the marks,
// and finally the play cursor on top.
function drawScene(
  ctx: CanvasRenderingContext2D,
  geo: Geometry,
  lanes: Lane[],
  marks: Mark[],
  actions: ActionEvent[],
  cursorTs: number,
  hover: { i: number } | null,
  selectedId: string | null,
) {
  const { width, height, plotLeft, plotRight, plotW, axisY, densityTop, densityH, lanesTop, laneH, t0, t1 } = geo;
  const cLine = resolveColour('var(--line)');
  const cFg2 = resolveColour('var(--fg-2)');
  const cFg1 = resolveColour('var(--fg-1)');
  const cFg0 = resolveColour('var(--fg-0)');
  const cBg2 = resolveColour('var(--bg-2)');
  const cAccent = resolveColour('var(--accent)');

  ctx.clearRect(0, 0, width, height);
  const lanesBottom = lanesTop + lanes.length * laneH;

  // Lane bands (zebra) + left-gutter labels.
  ctx.textBaseline = 'middle';
  lanes.forEach((ln, i) => {
    const top = lanesTop + i * laneH;
    const cy = top + laneH / 2;
    if (i % 2 === 0) {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = cBg2;
      ctx.fillRect(plotLeft, top, plotW, laneH);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = ln.swatch;
    ctx.beginPath();
    ctx.arc(14, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    const maxLabelW = plotLeft - 28;
    ctx.fillStyle = cFg1;
    ctx.font = `600 11px ${FONT}`;
    // Element paths keep their tail (the filename); other labels keep their head.
    const keepTail = ln.sub !== 'lifecycle' && ln.label.includes('/');
    ctx.fillText(truncate(ctx, ln.label, maxLabelW, keepTail), 24, cy - (ln.sub ? 5 : 0));
    if (ln.sub) {
      ctx.fillStyle = cFg2;
      ctx.font = `10px ${FONT}`;
      ctx.fillText(truncate(ctx, ln.sub, maxLabelW, false), 24, cy + 7);
    }
  });

  // Horizontal lane separators.
  ctx.strokeStyle = cLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= lanes.length; i++) {
    const y = lanesTop + i * laneH + 0.5;
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
  }
  ctx.stroke();

  // Time axis: six ticks with labels, plus faint gridlines through the lanes.
  ctx.textBaseline = 'alphabetic';
  const ticks = 6;
  for (let i = 0; i < ticks; i++) {
    const f = i / (ticks - 1);
    const x = plotLeft + f * plotW;
    ctx.strokeStyle = cLine;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x, lanesTop);
    ctx.lineTo(x, lanesBottom);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = cFg2;
    ctx.font = `10px ${FONT}`;
    const label = fmtTime(t0 + f * (t1 - t0));
    const w = ctx.measureText(label).width;
    const lx = Math.max(plotLeft, Math.min(plotRight - w, x - w / 2));
    ctx.fillText(label, lx, axisY - 8);
  }
  ctx.strokeStyle = cLine;
  ctx.beginPath();
  ctx.moveTo(plotLeft, axisY - 2);
  ctx.lineTo(plotRight, axisY - 2);
  ctx.stroke();

  // Density strip — event counts binned across the window, for orientation.
  const binN = Math.max(12, Math.min(80, Math.round(plotW / 10)));
  const bins = densityBins(actions, geo, binN);
  const maxBin = Math.max(1, ...bins);
  const bw = plotW / binN;
  ctx.fillStyle = cAccent;
  for (let i = 0; i < binN; i++) {
    const h = (bins[i] / maxBin) * (densityH - 4);
    if (h <= 0) continue;
    ctx.globalAlpha = 0.28;
    ctx.fillRect(plotLeft + i * bw + 0.5, densityTop + densityH - h, Math.max(1, bw - 1), h);
    ctx.globalAlpha = 1;
  }
  ctx.strokeStyle = cLine;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(plotLeft, densityTop + densityH + 0.5);
  ctx.lineTo(plotRight, densityTop + densityH + 0.5);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Marks. Solid if the cursor has passed them, dim if still ahead.
  const disc = (m: Mark, r: number, solid: boolean) => {
    ctx.globalAlpha = solid ? 1 : 0.16;
    ctx.beginPath();
    ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
    ctx.fillStyle = m.colour;
    ctx.fill();
    if (m.ring && solid) {
      ctx.lineWidth = 1.75;
      ctx.strokeStyle = m.ring;
      ctx.beginPath();
      ctx.arc(m.x, m.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };
  for (const m of marks) disc(m, 4, m.action.ts <= cursorTs);

  // Hover ring, then the mark re-drawn larger on top.
  if (hover) {
    const m = marks[hover.i];
    if (m) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = cFg0;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 8.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      disc(m, 5.5, true);
    }
  }

  // Selection sits above everything and stays solid even ahead of the cursor.
  if (selectedId) {
    const m = marks.find((mm) => mm.action.id === selectedId);
    if (m) {
      ctx.strokeStyle = cFg0;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.stroke();
      disc(m, 5.5, true);
    }
  }

  // Play cursor: a soft-glow spine from the axis down through the lanes, with a
  // small handle at the top to signal it is draggable.
  const cx = plotLeft + clamp01((cursorTs - t0) / (t1 - t0)) * plotW;
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = cAccent;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx, axisY - 2);
  ctx.lineTo(cx, lanesBottom);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, axisY - 2);
  ctx.lineTo(cx, lanesBottom);
  ctx.stroke();
  ctx.fillStyle = cAccent;
  ctx.beginPath();
  ctx.moveTo(cx - 5, axisY - 2);
  ctx.lineTo(cx + 5, axisY - 2);
  ctx.lineTo(cx, axisY + 5);
  ctx.closePath();
  ctx.fill();
}

/** Fit text to a width with an ellipsis, keeping either the head or the tail. */
function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number, keepTail: boolean): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  if (keepTail) {
    while (s.length > 1 && ctx.measureText('…' + s).width > maxW) s = s.slice(1);
    return '…' + s;
  }
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
