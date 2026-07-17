// Tests for the App shell in the default (mock) data mode: the 8-tab tablist,
// tab selection + panel swap, the top bar's mock badge and stack info, and the
// active-tab persistence to localStorage that survives a re-mount.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react';
import { App } from './App';
import { IS_LIVE } from './data/live';
import { store } from './data/adapter';

const TAB_LABELS = ['Overview', 'Visualiser', 'Activity', 'Work', 'Documents', 'Configuration', 'Operations', 'System'];

// Some feature tabs (e.g. Configuration) render their own nested tablist, so tab
// queries must be scoped to the shell's tablist to avoid counting sub-tabs.
function shellTabs() {
  const nav = screen.getByRole('tablist', { name: 'Control plane sections' });
  return within(nav);
}

// Some feature tabs are heavy; a faulty one is contained by PanelBoundary and
// logs to console.error. Silence it so switching across every tab stays quiet;
// the shell-level assertions (heading + aria-selected) live outside the boundary.
let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
beforeAll(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => {
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('App shell', () => {
  it('runs in mock mode (live data disabled)', () => {
    expect(IS_LIVE).toBe(false);
  });

  it('renders a tablist with all 8 sections', () => {
    render(<App />);
    expect(screen.getByRole('tablist', { name: 'Control plane sections' })).toBeInTheDocument();
    const tabs = shellTabs().getAllByRole('tab');
    expect(tabs).toHaveLength(8);
    expect(tabs.map((t) => t.textContent)).toEqual(TAB_LABELS);
  });

  it('defaults to Overview: it is selected and its heading is shown', () => {
    render(<App />);
    expect(shellTabs().getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeInTheDocument();
    expect(shellTabs().getByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'false');
  });

  it('selecting each tab updates aria-selected and swaps the panel heading', () => {
    render(<App />);
    for (const label of TAB_LABELS) {
      fireEvent.click(shellTabs().getByRole('tab', { name: label }));
      expect(shellTabs().getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByRole('heading', { level: 2, name: label })).toBeInTheDocument();
      // Exactly one shell tab is selected at a time (ignoring feature sub-tabs).
      const selected = shellTabs().getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
      expect(selected).toHaveLength(1);
    }
  });

  it('shows the top bar mock badge and live stack/model info', () => {
    render(<App />);
    const sys = store.system();
    // The 'mock' badge is unique to the top bar; scope to its <header> so the
    // assertions don't collide with the same facts echoed in the Overview panel.
    const badge = screen.getByText('mock');
    const bar = within(badge.closest('header') as HTMLElement);
    expect(badge).toBeInTheDocument();
    expect(bar.queryByText('live')).toBeNull();
    expect(bar.getByText(sys.activeStack)).toBeInTheDocument(); // 'blue'
    expect(bar.getByText(`· ${sys.imageTag}`)).toBeInTheDocument(); // '· foreman:c4d9a2'
    expect(bar.getByText(sys.localModel)).toBeInTheDocument(); // 'qwen3-8b (Q4)'
    expect(bar.getByText('4m ago')).toBeInTheDocument(); // audit verified NOW-4min
  });

  it('persists the active tab to localStorage and reads it back on re-mount', () => {
    render(<App />);
    fireEvent.click(shellTabs().getByRole('tab', { name: 'System' }));
    expect(localStorage.getItem('docbox.ui.activeTab')).toBe(JSON.stringify('system'));

    // Re-mount from scratch: the persisted tab is restored, not reset to Overview.
    cleanup();
    render(<App />);
    expect(shellTabs().getByRole('tab', { name: 'System' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'System' })).toBeInTheDocument();
  });

  it('falls back to the first tab when the persisted id is unknown', () => {
    localStorage.setItem('docbox.ui.activeTab', JSON.stringify('does-not-exist'));
    render(<App />);
    // active = TABS.find(...) ?? TABS[0] → Overview heading, but no tab matches → none selected.
    expect(screen.getByRole('heading', { level: 2, name: 'Overview' })).toBeInTheDocument();
    const selected = shellTabs().getAllByRole('tab').filter((t) => t.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(0);
  });
});
