import { describe, it, expect } from 'vitest';
import {
  valueEquals, effectiveValue, displayValue, derivePending, formatValue,
  groupByHeading, TAB_ORDER, TAB_LABEL, APPLY_ORDER, type OptValue,
} from './pending';
import { configOpt } from '../../test/world';

const m = (entries: [string, OptValue][] = []) => new Map<string, OptValue>(entries);

describe('valueEquals', () => {
  it('compares scalars by identity', () => {
    expect(valueEquals('a', 'a')).toBe(true);
    expect(valueEquals(1, 2)).toBe(false);
    expect(valueEquals(true, true)).toBe(true);
  });

  it('compares string lists element-by-element', () => {
    expect(valueEquals(['x', 'y'], ['x', 'y'])).toBe(true);
    expect(valueEquals(['x', 'y'], ['x', 'z'])).toBe(false);
  });

  it('treats different-length lists as unequal', () => {
    expect(valueEquals(['x'], ['x', 'y'])).toBe(false);
  });

  it('falls through to scalar compare when only one side is an array', () => {
    expect(valueEquals(['x'], 'x')).toBe(false);
  });
});

describe('effectiveValue', () => {
  const opt = configOpt({ key: 'k', value: 'baseline' });

  it('returns the baseline when no local override is applied', () => {
    expect(effectiveValue(opt, m())).toBe('baseline');
  });

  it('returns the applied override when present', () => {
    expect(effectiveValue(opt, m([['k', 'applied']]))).toBe('applied');
  });
});

describe('displayValue', () => {
  const opt = configOpt({ key: 'k', value: 'baseline' });

  it('shows a staged edit above everything else', () => {
    expect(displayValue(opt, m([['k', 'applied']]), m([['k', 'editing']]))).toBe('editing');
  });

  it('falls back to the effective value when no edit is staged', () => {
    expect(displayValue(opt, m([['k', 'applied']]), m())).toBe('applied');
    expect(displayValue(opt, m(), m())).toBe('baseline');
  });
});

describe('derivePending', () => {
  it('emits a row only where a staged edit differs from the effective value', () => {
    const opts = [
      configOpt({ key: 'changed', value: 'a', applyClass: 'rebuild' }),
      configOpt({ key: 'same', value: 'b' }),
      configOpt({ key: 'untouched', value: 'c' }),
    ];
    const edits = m([['changed', 'a2'], ['same', 'b']]); // 'same' edited to its own value
    const out = derivePending(opts, m(), edits);
    expect(out).toEqual([{ key: 'changed', from: 'a', to: 'a2', applyClass: 'rebuild' }]);
  });

  it('measures the diff against the applied value, not the frozen baseline', () => {
    const opts = [configOpt({ key: 'k', value: 'baseline' })];
    const applied = m([['k', 'applied']]);
    // editing back to the applied value → no pending change
    expect(derivePending(opts, applied, m([['k', 'applied']]))).toEqual([]);
    // editing away from the applied value → a pending change from 'applied'
    expect(derivePending(opts, applied, m([['k', 'next']]))).toEqual([
      { key: 'k', from: 'applied', to: 'next', applyClass: 'live' },
    ]);
  });

  it('carries the hot apply-class through for interface edits', () => {
    const opts = [configOpt({ key: 'layout', value: 'grid', applyClass: 'hot' })];
    const out = derivePending(opts, m(), m([['layout', 'stack']]));
    expect(out).toEqual([{ key: 'layout', from: 'grid', to: 'stack', applyClass: 'hot' }]);
  });

  it('skips options with no staged edit at all', () => {
    expect(derivePending([configOpt({ key: 'k', value: 'a' })], m(), m())).toEqual([]);
  });
});

describe('formatValue', () => {
  it('joins non-empty lists and marks empty ones', () => {
    expect(formatValue(['a', 'b'])).toBe('a, b');
    expect(formatValue([])).toBe('(none)');
  });

  it('renders booleans as on/off', () => {
    expect(formatValue(true)).toBe('on');
    expect(formatValue(false)).toBe('off');
  });

  it('marks the empty string and passes other scalars through', () => {
    expect(formatValue('')).toBe('(empty)');
    expect(formatValue('hello')).toBe('hello');
    expect(formatValue(42)).toBe('42');
  });
});

describe('groupByHeading', () => {
  it('filters to the tab and groups by heading in first-seen order', () => {
    const opts = [
      configOpt({ key: 'a', tab: 'providers', group: 'Auth' }),
      configOpt({ key: 'b', tab: 'providers', group: 'Limits' }),
      configOpt({ key: 'c', tab: 'providers', group: 'Auth' }), // appended to first group
      configOpt({ key: 'd', tab: 'network', group: 'Auth' }),   // other tab, excluded
    ];
    const grouped = groupByHeading(opts, 'providers');
    expect(grouped.map(([h]) => h)).toEqual(['Auth', 'Limits']);
    expect(grouped[0][1].map((o) => o.key)).toEqual(['a', 'c']);
    expect(grouped[1][1].map((o) => o.key)).toEqual(['b']);
  });

  it('returns nothing when no option targets the tab', () => {
    expect(groupByHeading([configOpt({ key: 'a', tab: 'network' })], 'audit')).toEqual([]);
  });
});

describe('constants', () => {
  it('orders every tab and labels each one', () => {
    expect(TAB_ORDER).toHaveLength(9);
    for (const t of TAB_ORDER) expect(TAB_LABEL[t]).toBeTruthy();
    expect(TAB_LABEL.providers).toBe('Providers');
    expect(TAB_LABEL.interface).toBe('Interface');
  });

  it('orders the apply classes that reach a rebuild plan', () => {
    expect(APPLY_ORDER).toEqual(['live', 'session', 'rebuild']);
  });
});
