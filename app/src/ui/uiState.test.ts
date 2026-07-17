import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useUiState } from './uiState';

const NS = 'docbox.ui.';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useUiState', () => {
  it('starts from the initial value and persists it under the namespaced key', () => {
    const { result } = renderHook(() => useUiState('panel', 'grid'));
    expect(result.current[0]).toBe('grid');
    // The mount effect writes the current value straight away.
    expect(localStorage.getItem(NS + 'panel')).toBe(JSON.stringify('grid'));
  });

  it('reads a previously stored value instead of the initial', () => {
    localStorage.setItem(NS + 'panel', JSON.stringify('stack'));
    const { result } = renderHook(() => useUiState('panel', 'grid'));
    expect(result.current[0]).toBe('stack');
  });

  it('parses structured values, not just strings', () => {
    localStorage.setItem(NS + 'filters', JSON.stringify({ open: true, n: 3 }));
    const { result } = renderHook(() => useUiState('filters', { open: false, n: 0 }));
    expect(result.current[0]).toEqual({ open: true, n: 3 });
  });

  it('writes back to localStorage when the value changes', () => {
    const { result } = renderHook(() => useUiState('count', 1));
    act(() => result.current[1](2));
    expect(result.current[0]).toBe(2);
    expect(localStorage.getItem(NS + 'count')).toBe('2');
  });

  it('falls back to the initial value when stored JSON is corrupt', () => {
    localStorage.setItem(NS + 'broken', '{not valid json');
    const { result } = renderHook(() => useUiState('broken', 'safe'));
    expect(result.current[0]).toBe('safe');
  });

  it('swallows a storage write failure (quota/blocked) without throwing', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });
    const { result } = renderHook(() => useUiState('big', 'v'));
    // The mount effect already tried (and swallowed) a write.
    expect(setItem).toHaveBeenCalled();
    // A further change still updates in-session state despite the throwing setter.
    expect(() => act(() => result.current[1]('v2'))).not.toThrow();
    expect(result.current[0]).toBe('v2');
  });
});
