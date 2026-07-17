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
