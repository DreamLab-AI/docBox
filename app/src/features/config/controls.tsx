// Controls, one per OptionType, and the ConfigRow that assembles each option.
// Every row shows: label, control, the `help` sentence, an ApplyBadge, and a
// "why" disclosure carrying the option's `whenToUse` text (hard requirement:
// every option surfaces its whenToUse, both on hover and on expand).
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { ConfigOption } from '../../domain/types';
import { ApplyBadge } from '../../ui/primitives';
import type { OptValue } from './pending';

const inputStyle = (w: number): CSSProperties => ({
  width: w,
  padding: '5px 8px',
  background: 'var(--bg-3)',
  color: 'var(--fg-0)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 'var(--fs-sm)',
});

const linkBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  cursor: 'pointer',
  font: 'inherit',
  fontSize: 'var(--fs-xs)',
  color: 'var(--fg-2)',
};

// --- boolean -----------------------------------------------------------------
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 42, height: 24, borderRadius: 100, padding: 2, cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', flex: 'none',
        border: `1px solid ${checked ? 'var(--accent)' : 'var(--line-strong)'}`,
        background: checked ? 'var(--accent-dim)' : 'var(--bg-3)',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
    >
      <span aria-hidden style={{
        width: 18, height: 18, borderRadius: '50%', background: 'var(--fg-0)',
        transform: checked ? 'translateX(18px)' : 'translateX(0)',
        transition: 'transform 120ms ease',
      }} />
    </button>
  );
}

// --- enum (segmented, or select when there are many options) -----------------
function Segmented({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div role="radiogroup" style={{ display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--line-strong)' }}>
      {options.map((o, i) => {
        const on = o === value;
        return (
          <button
            key={o} type="button" role="radio" aria-checked={on}
            onClick={() => onChange(o)}
            style={{
              padding: '5px 11px', border: 'none', cursor: 'pointer',
              borderLeft: i === 0 ? 'none' : '1px solid var(--line)',
              background: on ? 'var(--accent-dim)' : 'transparent',
              color: on ? 'var(--fg-0)' : 'var(--fg-1)',
              fontSize: 'var(--fs-sm)', fontWeight: 600,
            }}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function Select({ value, options, onChange }: { value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(180)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// --- number ------------------------------------------------------------------
function NumberInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const set = (n: number) => onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button type="button" className="btn" style={{ padding: '4px 11px' }} onClick={() => set(value - 1)} aria-label="decrease">−</button>
      <input
        type="number" value={value} min={0}
        onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
        className="mono" style={{ ...inputStyle(70), textAlign: 'center' }}
      />
      <button type="button" className="btn" style={{ padding: '4px 11px' }} onClick={() => set(value + 1)} aria-label="increase">+</button>
    </div>
  );
}

// --- string ------------------------------------------------------------------
function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle(220)} />;
}

// --- secret (display-only demo; value is already masked, never staged) --------
function SecretInput({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  const masked = '•'.repeat(Math.max(10, value.length));
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input readOnly value={shown ? value : masked} className="mono" style={{ ...inputStyle(170), color: 'var(--fg-1)' }} />
      <button type="button" className="btn" style={{ padding: '4px 10px' }} onClick={() => setShown((s) => !s)} aria-label={shown ? 'hide value' : 'reveal value'}>
        {shown ? 'hide' : 'reveal'}
      </button>
    </div>
  );
}

// --- list (editable chips; local state only) ---------------------------------
function ChipList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const t = draft.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', maxWidth: 440, justifyContent: 'flex-end' }}>
      {value.map((c) => (
        <span key={c} className="mono" style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 9px',
          background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 100, fontSize: 'var(--fs-xs)',
        }}>
          {c}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={`remove ${c}`}
            style={{ ...linkBtn, width: 16, height: 16, borderRadius: '50%', background: 'var(--bg-1)', color: 'var(--fg-1)', display: 'grid', placeItems: 'center', fontSize: 13, lineHeight: 1 }}>
            ×
          </button>
        </span>
      ))}
      <input
        value={draft} placeholder="add…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        style={inputStyle(120)}
      />
      <button type="button" className="btn" style={{ padding: '4px 10px' }} onClick={add}>add</button>
    </div>
  );
}

/** Dispatch to the right control for an option's type. */
function ConfigControl({ opt, value, onChange }: { opt: ConfigOption; value: OptValue; onChange: (v: OptValue) => void }) {
  switch (opt.type) {
    case 'boolean':
      return <Toggle checked={value as boolean} onChange={onChange} />;
    case 'enum': {
      const options = opt.options ?? [];
      return options.length > 4
        ? <Select value={value as string} options={options} onChange={onChange} />
        : <Segmented value={value as string} options={options} onChange={onChange} />;
    }
    case 'number':
      return <NumberInput value={value as number} onChange={onChange} />;
    case 'string':
      return <TextInput value={value as string} onChange={onChange} />;
    case 'secret':
      return <SecretInput value={value as string} />;
    case 'list':
      return <ChipList value={value as string[]} onChange={onChange} />;
  }
  return null;
}

export function ConfigRow({ opt, value, dirty, onChange, onReset }: {
  opt: ConfigOption;
  value: OptValue;
  dirty: boolean;
  onChange: (v: OptValue) => void;
  onReset: () => void;
}) {
  const [why, setWhy] = useState(false);
  return (
    <div style={{
      display: 'flex', gap: 'var(--s-4)', flexWrap: 'wrap',
      alignItems: 'flex-start', justifyContent: 'space-between',
      padding: 'var(--s-3) 0', borderTop: '1px solid var(--line)',
    }}>
      <div style={{ flex: '1 1 320px', minWidth: 240 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>{opt.label}</span>
          {dirty && <span title="staged change" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--amber)', flex: 'none' }} />}
          <button
            type="button" onClick={() => setWhy((w) => !w)} aria-expanded={why}
            title={opt.whenToUse} style={{ ...linkBtn, color: 'var(--accent)' }}
          >
            {why ? 'why ▲' : 'why ▾'}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 2 }}>{opt.help}</div>
        <div className="mono muted" style={{ fontSize: 'var(--fs-xs)', marginTop: 2 }}>{opt.key}</div>
        {why && (
          <div style={{
            marginTop: 'var(--s-2)', padding: 'var(--s-2) var(--s-3)',
            background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)',
            borderRadius: 'var(--radius-sm)', fontSize: 'var(--fs-sm)', color: 'var(--fg-1)',
          }}>
            <strong style={{ color: 'var(--accent)', fontWeight: 600 }}>When to use · </strong>{opt.whenToUse}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
        <ConfigControl opt={opt} value={value} onChange={onChange} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirty && <button type="button" onClick={onReset} style={linkBtn}>reset</button>}
          {opt.type === 'secret' && <span className="muted" style={{ fontSize: 'var(--fs-xs)' }}>display only</span>}
          <ApplyBadge cls={opt.applyClass} />
        </div>
      </div>
    </div>
  );
}
