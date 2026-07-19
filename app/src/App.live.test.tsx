// Live-mode shell test: mock the data/live module so we can drive liveStatus()
// through all three data-plane states. The TopBar badge must be derived from the
// ACTUAL hydration outcome (liveStatus), never from the compile-time IS_LIVE
// flag — a green 'live' badge over silently-degraded mock data is the P0 lie
// this test guards against.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';

vi.mock('./data/live', () => ({
  IS_LIVE: true,
  subscribeActions: vi.fn(() => vi.fn()),
  liveStatus: vi.fn(() => 'live'),
  // The demo layer reads dataSource() to keep the live strip honest about seeded
  // data; default 'seeded' (what the dev server serves today).
  dataSource: vi.fn(() => 'seeded'),
}));

import { App } from './App';
import * as live from './data/live';

// Scope badge/text queries to the top bar so panel content can never collide
// with the badge words ('live' / 'offline' / 'mock'). The TopBar is uniquely
// identified by the h1 wordmark; its enclosing <header> is the top bar.
const bar = () =>
  within(screen.getByRole('heading', { level: 1, name: 'Foreman' }).closest('header') as HTMLElement);

beforeEach(() => {
  vi.clearAllMocks();
  // Restore the mock defaults cleared above, and seal first-run so the one-time
  // WelcomeDialog never mounts during these badge checks (it would in the 'mock'
  // and 'degraded' cases, since isDemo() is true there).
  vi.mocked(live.liveStatus).mockReturnValue('live');
  vi.mocked(live.dataSource).mockReturnValue('seeded');
  localStorage.setItem('docbox.ui.firstRunSeen', JSON.stringify(true));
});

describe('App shell — TopBar badge reflects the real data plane', () => {
  it('shows the green "live" badge and subscribes to actions when hydration succeeded', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    render(<App />);
    const badge = bar().getByText('live');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'Live data from the control-plane server');
    expect(bar().queryByText('mock')).toBeNull();
    expect(bar().queryByText('offline')).toBeNull();
    // The live action subscription is still wired on mount.
    expect(live.subscribeActions).toHaveBeenCalledTimes(1);
  });

  it('shows the amber "offline" badge when live was requested but the fetch degraded to mock', () => {
    vi.mocked(live.liveStatus).mockReturnValue('degraded');
    render(<App />);
    const badge = bar().getByText('offline');
    expect(badge).toBeInTheDocument();
    // The title tells the operator the truth: mock data, control plane unreachable.
    expect(badge.getAttribute('title')).toMatch(/control-plane unreachable/i);
    expect(bar().queryByText('live')).toBeNull();
    expect(bar().queryByText('mock')).toBeNull();
  });

  it('shows the grey "mock" badge when running offline', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    render(<App />);
    const badge = bar().getByText('mock');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveAttribute('title', 'Deterministic mock world (offline)');
    expect(bar().queryByText('live')).toBeNull();
    expect(bar().queryByText('offline')).toBeNull();
  });
});

// The gating invariant made observable: the demo layer erases on genuinely real
// data, but stays honest while live data is only seeded.
describe('App shell — the demo layer self-suppresses on real live data', () => {
  it('renders no demo banner or chip when live data is real', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('real');
    render(<App />);
    // The header still tells the plane truth (that is not a demo tell)…
    expect(bar().getByText('live')).toBeInTheDocument();
    // …but every demo surface is gone: no DemoChip, no banner copy.
    expect(screen.queryByText('DEMO DATA')).toBeNull();
    expect(screen.queryByText(/fabricated/i)).toBeNull();
    expect(screen.queryByText(/Seeded:/)).toBeNull();
  });

  it('keeps the honest seeded strip, but no chip, when live data is only seeded', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('seeded');
    render(<App />);
    expect(screen.getByText(/Seeded: the dev server serves the mock world/i)).toBeInTheDocument();
    // The chip means 'not live'; live-seeded is still live, so it does not show.
    expect(screen.queryByText('DEMO DATA')).toBeNull();
  });

  it('shows the DemoChip on the panel heading when not live', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    render(<App />);
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument();
  });
});
