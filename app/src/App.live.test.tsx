// Live-mode shell test: mock the data/live module so IS_LIVE is true. This
// exercises the TopBar's live branch (green 'live' badge) and confirms the App
// wires the live action subscription on mount.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./data/live', () => ({
  IS_LIVE: true,
  subscribeActions: vi.fn(() => vi.fn()),
}));

import { App } from './App';
import * as live from './data/live';

describe('App shell (live mode)', () => {
  it('renders the live badge and subscribes to live actions', () => {
    render(<App />);
    expect(screen.getByText('live')).toBeInTheDocument();
    expect(screen.queryByText('mock')).toBeNull();
    expect(live.subscribeActions).toHaveBeenCalledTimes(1);
  });
});
