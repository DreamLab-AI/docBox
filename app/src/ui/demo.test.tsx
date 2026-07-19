// Unit tests for the first-run honesty layer. The data plane is mocked so every
// branch of liveStatus()/dataSource() is drivable, proving the layer's central
// invariant: it self-erases on real live data and stays honest on seeded data.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

vi.mock('../data/live', () => ({
  liveStatus: vi.fn(() => 'mock'),
  dataSource: vi.fn(() => 'seeded'),
}));

import { isDemo, DemoBanner, DemoChip, DemoTag, WelcomeDialog, SIMULATED_NOTE } from './demo';
import { useUiState } from './uiState';
import * as live from '../data/live';

// A known baseline every test can override. mockClear (via clearAllMocks) keeps
// implementations, so we re-assert the defaults here to stop return values from
// leaking across tests.
beforeEach(() => {
  vi.mocked(live.liveStatus).mockReturnValue('mock');
  vi.mocked(live.dataSource).mockReturnValue('seeded');
});

describe('isDemo', () => {
  it('is true off-live (mock/degraded) and false only when live', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    expect(isDemo()).toBe(true);
    vi.mocked(live.liveStatus).mockReturnValue('degraded');
    expect(isDemo()).toBe(true);
    vi.mocked(live.liveStatus).mockReturnValue('live');
    expect(isDemo()).toBe(false);
  });
});

describe('DemoBanner — three branches on the real data plane', () => {
  it('mock: shows the fabricated-world strip with a How to go live affordance', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    const onGo = vi.fn();
    render(<DemoBanner onHowToGoLive={onGo} />);
    expect(screen.getByText(/every owner, agent, action, document and patient record below is fabricated/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'How to go live' }));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('degraded: surfaces the control-plane fault as an alert', () => {
    vi.mocked(live.liveStatus).mockReturnValue('degraded');
    render(<DemoBanner />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/control plane is unreachable — still showing demo data/i);
  });

  it('live-seeded: shows the honest seeded strip', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('seeded');
    render(<DemoBanner />);
    expect(screen.getByText(/live-transported, not yet a real datastore/i)).toBeInTheDocument();
  });

  it('live-real: renders nothing (the layer erases on real data)', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('real');
    const { container } = render(<DemoBanner />);
    expect(container.textContent).toBe('');
  });

  it('the degraded fault strip is NOT dismissible', () => {
    vi.mocked(live.liveStatus).mockReturnValue('degraded');
    render(<DemoBanner />);
    expect(screen.queryByRole('button', { name: 'Collapse demo notice' })).toBeNull();
  });

  it('collapses the mock strip to a pill and persists that choice under its own key', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse demo notice' }));
    expect(screen.queryByText(/fabricated/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Demo world · show/ })).toBeInTheDocument();
    expect(localStorage.getItem('docbox.ui.demoBannerCollapsed.mock')).toBe(JSON.stringify(true));
    // The seeded branch's own state stays false — one branch never collapses another.
    expect(localStorage.getItem('docbox.ui.demoBannerCollapsed.seeded')).toBe(JSON.stringify(false));
  });

  it('collapses the seeded strip under a distinct key', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    vi.mocked(live.dataSource).mockReturnValue('seeded');
    render(<DemoBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse demo notice' }));
    expect(localStorage.getItem('docbox.ui.demoBannerCollapsed.seeded')).toBe(JSON.stringify(true));
    expect(localStorage.getItem('docbox.ui.demoBannerCollapsed.mock')).toBe(JSON.stringify(false));
  });
});

describe('DemoChip', () => {
  it('renders the DEMO DATA pill when not live', () => {
    vi.mocked(live.liveStatus).mockReturnValue('mock');
    render(<DemoChip />);
    expect(screen.getByText('DEMO DATA')).toBeInTheDocument();
  });

  it('renders nothing when live', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    const { container } = render(<DemoChip />);
    expect(container.firstChild).toBeNull();
  });
});

describe('DemoTag — never colour-only', () => {
  it('carries the visible literal word and a visually-hidden label (simulated)', () => {
    render(<DemoTag />);
    expect(screen.getByText('Simulated')).toBeInTheDocument();
    expect(screen.getByText(/not a real operation/i)).toBeInTheDocument();
  });

  it('has an example variant for seeded values', () => {
    render(<DemoTag variant="example" />);
    expect(screen.getByText('example')).toBeInTheDocument();
    expect(screen.getByText(/not a real secret/i)).toBeInTheDocument();
  });
});

describe('SIMULATED_NOTE', () => {
  it('names the demo world and says nothing real changed', () => {
    expect(SIMULATED_NOTE).toMatch(/Simulated/);
    expect(SIMULATED_NOTE).toMatch(/demo world/i);
  });
});

// WelcomeDialog is controlled: the parent owns firstRunSeen (persisted via
// useUiState) and gates `open`. This harness mirrors App so the persistence is
// observable end to end.
function Harness() {
  const [seen, setSeen] = useUiState('firstRunSeen', false);
  return <WelcomeDialog open={isDemo() && !seen} onClose={() => setSeen(true)} />;
}

describe('WelcomeDialog', () => {
  beforeEach(() => vi.mocked(live.liveStatus).mockReturnValue('mock'));

  it('is a labelled modal dialog naming the four invented owners', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'You are looking at a fabricated demo world');
    expect(within(dialog).getByText('Dana Okoro')).toBeInTheDocument();
    expect(within(dialog).getByText('Ravi Menon')).toBeInTheDocument();
    expect(within(dialog).getByText('Lena Fischer')).toBeInTheDocument();
    expect(within(dialog).getByText('Sam Whitfield')).toBeInTheDocument();
  });

  it('reproduces the getting-started tour inline and carries no dead in-app doc link', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog');
    // The tour is inline: it names it as such and spells out the nine-tab loop,
    // so first run needs nothing the running app cannot serve.
    expect(within(dialog).getByText(/getting-started tour/i)).toBeInTheDocument();
    expect(within(dialog).getByText('Overview')).toBeInTheDocument();
    // Crucially there is NO anchor pointing at a repo markdown path — the app only
    // serves app/dist or the Vite root, so a docs/*.md href would 404 in dev and
    // fall through the SPA catch-all in the built image (the review finding).
    const deadDocLinks = within(dialog)
      .queryAllByRole('link')
      .filter((a) => /\.md(?:[?#]|$)/.test(a.getAttribute('href') ?? ''));
    expect(deadDocLinks).toHaveLength(0);
  });

  it('autofocuses the primary button and traps Tab focus within the dialog', () => {
    render(<Harness />);
    const primary = screen.getByRole('button', { name: 'Explore the demo' });
    expect(document.activeElement).toBe(primary);
    // The primary button is the only focusable in the dialog, so Tab and Shift+Tab
    // both keep focus trapped on it — focus can never escape the modal.
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(primary);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(primary);
  });

  it('the primary button dismisses, sealing first-run and removing the overlay', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore the demo' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('docbox.ui.firstRunSeen')).toBe(JSON.stringify(true));
  });

  it('Escape dismisses and seals first-run', () => {
    render(<Harness />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('docbox.ui.firstRunSeen')).toBe(JSON.stringify(true));
  });

  it('a backdrop click dismisses and seals first-run', () => {
    render(<Harness />);
    const backdrop = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(localStorage.getItem('docbox.ui.firstRunSeen')).toBe(JSON.stringify(true));
  });

  it('restores focus to the previously focused element on close', () => {
    const prior = document.createElement('button');
    document.body.appendChild(prior);
    prior.focus();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Explore the demo' }));
    expect(document.activeElement).toBe(prior);
    prior.remove();
  });

  it('does not open once first-run has been seen', () => {
    localStorage.setItem('docbox.ui.firstRunSeen', JSON.stringify(true));
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays closed on real live data even on the first run', () => {
    vi.mocked(live.liveStatus).mockReturnValue('live');
    render(<Harness />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
