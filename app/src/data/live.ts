// Live mode: fetch the world from the control-plane server at boot and subscribe
// to the SSE event stream. Off by default — set VITE_DATA_MODE=live to enable.
// When live fetch fails, we keep the mock world so the UI still renders.
import { hydrate, pushAction, type World } from './adapter';
import type { ActionEvent } from '../domain/types';

export const IS_LIVE = import.meta.env.VITE_DATA_MODE === 'live';
const API = import.meta.env.VITE_API_BASE ?? '';

/** Fetch and install the world. Returns true if live data was loaded. */
export async function bootstrapWorld(): Promise<boolean> {
  if (!IS_LIVE) return false;
  try {
    const res = await fetch(`${API}/api/world`);
    if (!res.ok) throw new Error(`world fetch ${res.status}`);
    const data = (await res.json()) as World;
    hydrate(data);
    return true;
  } catch (err) {
    console.warn('[docBox] live world unavailable, using mock:', (err as Error).message);
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
  es.onerror = () => es.close();
  return () => es.close();
}
