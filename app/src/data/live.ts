// Live mode: fetch the world from the control-plane server at boot and subscribe
// to the SSE event stream. Off by default — set VITE_DATA_MODE=live to enable.
// When live fetch fails, we keep the mock world so the UI still renders.
import { hydrate, pushAction, type World } from './adapter';
import type { ActionEvent } from '../domain/types';

export const IS_LIVE = import.meta.env.VITE_DATA_MODE === 'live';
const API = import.meta.env.VITE_API_BASE ?? '';

/** The data plane the UI is actually running on, resolved by bootstrapWorld():
 *  - 'mock'     offline deterministic world (live mode off)
 *  - 'live'     hydrated from the control-plane server
 *  - 'degraded' live mode requested but the server was unreachable → mock data
 * The header badge reads this so it can never claim 'live' while showing mock. */
export type LiveStatus = 'live' | 'degraded' | 'mock';
let currentStatus: LiveStatus = 'mock';

/** The real live/degraded/mock state after boot. Drives the TopBar badge. */
export function liveStatus(): LiveStatus {
  return currentStatus;
}

/** Fetch and install the world. Returns true if live data was loaded. */
export async function bootstrapWorld(): Promise<boolean> {
  if (!IS_LIVE) {
    currentStatus = 'mock';
    return false;
  }
  try {
    const res = await fetch(`${API}/api/world`);
    if (!res.ok) throw new Error(`world fetch ${res.status}`);
    const data = (await res.json()) as World;
    hydrate(data);
    currentStatus = 'live';
    return true;
  } catch (err) {
    console.warn('[docBox] live world unavailable, using mock:', (err as Error).message);
    // Live was asked for but the control plane did not answer: keep the mock
    // world but record that we are degraded so the UI can tell the truth.
    currentStatus = 'degraded';
    return false;
  }
}

/** Subscribe to live actions. Returns an unsubscribe function. */
export function subscribeActions(onAction: (a: ActionEvent) => void): () => void {
  if (!IS_LIVE) return () => {};
  const es = new EventSource(`${API}/api/events`);
  es.addEventListener('action', (ev) => {
    try {
      const a = JSON.parse((ev as MessageEvent).data) as ActionEvent;
      pushAction(a);
      onAction(a);
    } catch {
      /* ignore malformed frame */
    }
  });
  es.onerror = () => {
    // A transient error (network blip, server restart) leaves readyState at
    // CONNECTING while EventSource retries on its own — do NOT close, or that
    // built-in auto-reconnect is defeated forever. Only tear down when the
    // browser has already given up and moved to the terminal CLOSED state.
    if (es.readyState === EventSource.CLOSED) es.close();
  };
  return () => es.close();
}
