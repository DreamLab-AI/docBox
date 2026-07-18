// Tests for the System tab: the WhenToUse guide, the SVG orbit map, the three
// module lists with the right members, GPU markers on heavy modules, the legend
// and the count summary. matchMedia is mocked (matches:false) so the pill glow
// branch runs during render.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import SystemTab from './SystemTab';

function listCard(title: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name: title }).closest('section') as HTMLElement;
}

describe('SystemTab', () => {
  it('opens with the WhenToUse guidance', () => {
    render(<SystemTab />);
    expect(screen.getByText(/See what the system is actually made of/)).toBeInTheDocument();
  });

  it('renders the orbit map as a labelled image with core copy', () => {
    render(<SystemTab />);
    const map = screen.getByRole('img', { name: 'Core, surfaces and modules map' });
    expect(map.tagName.toLowerCase()).toBe('svg');
    expect(within(map).getByText('CORE')).toBeInTheDocument();
    expect(within(map).getByText('governance + data spine')).toBeInTheDocument();
  });

  it('renders the legend and the core/surface/module count summary', () => {
    render(<SystemTab />);
    expect(screen.getByText('Core (spine)')).toBeInTheDocument();
    expect(screen.getByText('Surface')).toBeInTheDocument();
    expect(screen.getByText('Module')).toBeInTheDocument();
    expect(
      screen.getByText((_content, el) =>
        el?.textContent === '6 core · 5 surfaces · 8 modules · 6 off/available'),
    ).toBeInTheDocument();
  });

  it('lists all six core pieces under Core', () => {
    render(<SystemTab />);
    const card = listCard('Core');
    for (const name of ['Control-plane server', 'Domain contract', 'Identity', 'Audit spine', 'Config + apply-class', 'Snapshot / rollback']) {
      expect(within(card).getByText(name)).toBeInTheDocument();
    }
    // Core is the spine: no GPU markers, no apply-class badges here.
    expect(within(card).queryByText('GPU')).toBeNull();
  });

  it('lists all five surfaces and marks the heavy one with GPU', () => {
    render(<SystemTab />);
    const card = listCard('Surfaces');
    for (const name of ['Foreman (web)', 'code-server', 'Companion extension', 'Chat bubble', 'Streamed desktop']) {
      expect(within(card).getByText(name)).toBeInTheDocument();
    }
    // Streamed desktop is heavy → a GPU badge; and it is a rebuild-class surface.
    expect(within(card).getByText('GPU')).toBeInTheDocument();
    expect(within(card).getByText('Rebuild')).toBeInTheDocument();
  });

  it('lists all eight modules with the heavy ones GPU-marked and apply-classes shown', () => {
    render(<SystemTab />);
    const card = listCard('Modules');
    for (const name of ['Local model', 'Local OCR', 'Clinical NER', 'Browser sidecar', 'Vaults', 'Work ledger', 'Tunnel', 'QE fleet']) {
      expect(within(card).getByText(name)).toBeInTheDocument();
    }
    // Local OCR and Clinical NER are the heavy modules.
    expect(within(card).getAllByText('GPU').length).toBeGreaterThanOrEqual(2);
    // Session apply-class appears on Local OCR and the QE fleet module.
    expect(within(card).getAllByText('Next session').length).toBeGreaterThanOrEqual(1);
    expect(within(card).getAllByText('Rebuild').length).toBeGreaterThanOrEqual(4);
    // A gated module surfaces its gate key.
    expect(within(card).getByText('gate: ocr.route')).toBeInTheDocument();
  });

  it('shows each module state as a word, not colour alone', () => {
    render(<SystemTab />);
    // Modules: Tunnel and Clinical NER are off, QE fleet is available, the rest on.
    const modules = listCard('Modules');
    expect(within(modules).getAllByText('off').length).toBeGreaterThanOrEqual(2);
    expect(within(modules).getByText('available')).toBeInTheDocument();
    expect(within(modules).getAllByText('on').length).toBeGreaterThanOrEqual(5);

    // Core pieces read as "core".
    const core = listCard('Core');
    expect(within(core).getAllByText('core')).toHaveLength(6);
  });
});
