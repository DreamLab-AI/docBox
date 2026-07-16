// Per-user interface state that survives HMR and full reloads (ADR-008).
// Kept in localStorage, outside the component tree, so an agent editing a live
// panel — or a Vite hot reload — never loses what the user was doing. A later
// milestone can move this behind a /api/ui-state endpoint so a layout follows a
// user across devices; the hook signature would not change.
import { useState, useEffect } from 'react';

const NS = 'docbox.ui.';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NS + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** useState that persists to localStorage under a stable key. */
export function useUiState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  useEffect(() => {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch {
      /* storage full or blocked; state still works in-session */
    }
  }, [key, value]);
  return [value, setValue];
}
