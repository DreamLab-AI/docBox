// Vitest setup: jest-dom matchers plus jsdom shims for the browser APIs the app
// touches that jsdom does not implement — canvas 2D and matchMedia. The canvas
// stub lets the visualiser's drawing code run (covering its lines) without a
// real rendering surface; tests assert behaviour around it, not pixels.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node >= 25 defines a global `localStorage` accessor that yields undefined
// unless the process runs with --localstorage-file; because the key already
// exists on the global, vitest's jsdom environment skips copying jsdom's
// working implementation over it — and in this environment `window` IS the
// populated global, so there is no separate jsdom store to reach for. Install
// a minimal in-memory Storage so bare `localStorage` works on every Node.
if (!globalThis.localStorage) {
  const backing = new Map<string, string>();
  const shim: Storage = {
    get length() { return backing.size; },
    key: (i: number) => [...backing.keys()][i] ?? null,
    getItem: (k: string) => backing.get(String(k)) ?? null,
    setItem: (k: string, v: string) => void backing.set(String(k), String(v)),
    removeItem: (k: string) => void backing.delete(String(k)),
    clear: () => backing.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: shim,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// matchMedia — used for prefers-reduced-motion checks. Default: motion allowed.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Canvas 2D context stub — every method is a no-op so drawing code executes.
const ctxStub = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'canvas') return null;
      if (prop === 'measureText') return () => ({ width: 0 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: () => {} });
      }
      return () => {};
    },
  },
);
HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxStub) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ResizeObserver — the visualiser measures its container. jsdom has no impl.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// requestAnimationFrame — run the callback synchronously so playback loops tick.
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    return setTimeout(() => cb(performance.now()), 0) as unknown as number;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof window.cancelAnimationFrame;
}
