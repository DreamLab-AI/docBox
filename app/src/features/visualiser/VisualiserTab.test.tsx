// Component tests for the Visualiser tab. The mark field is a 2D canvas whose
// pixels can't be asserted (getContext is stubbed in setup), so these tests
// drive the surrounding DOM: the group-by control re-labels and re-legends the
// scene, the play/scrubber controls move the cursor, and pointer interaction on
// the canvas hovers (tooltip), selects (detail panel) and scrubs. The paint
// effect runs on every change — with a non-zero container width and the mock's
// 180 actions, drawScene executes end-to-end without throwing.
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import VisualiserTab from './VisualiserTab';
import { store } from '../../data/adapter';
import { computeLayout, xToTime, clamp01 } from './layout';

// jsdom reports clientWidth as 0; the visualiser needs a width to build a layout
// and paint. Force a stable 900px so mark coordinates are deterministic.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Element.prototype.setPointerCapture = function () {};
  Element.prototype.releasePointerCapture = function () {};
});
afterAll(() => {
  delete (HTMLElement.prototype as unknown as { clientWidth?: unknown }).clientWidth;
});
afterEach(() => vi.restoreAllMocks());

const N = store.actions().length; // 180
const layout = () => computeLayout(900, 'owner', store.actions());
function pointer(el: Element, type: string, x: number, y: number) {
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

describe('VisualiserTab — scaffold', () => {
  it('renders the timeline, group-by control, canvas and legend', () => {
    const { container } = render(<VisualiserTab />);
    expect(screen.getByText(`${N} actions · grouped by owner`)).toBeInTheDocument();
    expect(container.querySelector('canvas')).toBeTruthy();

    const group = screen.getByRole('group', { name: 'Group by' });
    for (const label of ['Owner', 'Agent', 'Element', 'Action kind']) {
      expect(within(group).getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByText('Owners')).toBeInTheDocument(); // active-mode legend
    expect(screen.getByText('Status')).toBeInTheDocument(); // fixed status legend
  });

  it('shows the empty state when there are no actions', () => {
    vi.spyOn(store, 'actions').mockReturnValue([]);
    render(<VisualiserTab />);
    expect(screen.getByText('No actions recorded yet.')).toBeInTheDocument();
  });
});

describe('VisualiserTab — group-by control', () => {
  it('re-labels the hint and swaps the legend for each grouping', () => {
    render(<VisualiserTab />);
    const group = screen.getByRole('group', { name: 'Group by' });
    const cases: [string, string, string][] = [
      ['Agent', 'agent', 'Colour: owner'],
      ['Element', 'element', 'Element kinds'],
      ['Action kind', 'action kind', 'Action kinds'],
      ['Owner', 'owner', 'Owners'],
    ];
    for (const [button, mode, legend] of cases) {
      const btn = within(group).getByRole('button', { name: button });
      fireEvent.click(btn);
      expect(btn).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByText(`${N} actions · grouped by ${mode}`)).toBeInTheDocument();
      expect(screen.getByText(legend)).toBeInTheDocument();
    }
  });
});

describe('VisualiserTab — playback controls', () => {
  it('scrubber value tracks the cursor position', () => {
    render(<VisualiserTab />);
    const range = screen.getByLabelText('Timeline position') as HTMLInputElement;
    expect(range.value).toBe('1000'); // cursor starts at the end (shows everything)
    fireEvent.change(range, { target: { value: '500' } });
    expect(range.value).toBe('500');
  });

  it('"Show all" snaps the cursor back to the end', () => {
    render(<VisualiserTab />);
    const range = screen.getByLabelText('Timeline position') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '200' } });
    expect(range.value).toBe('200');
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(range.value).toBe('1000');
  });

  it('play toggles to pause and back', () => {
    render(<VisualiserTab />);
    const play = screen.getByRole('button', { name: '▶ Replay' });
    expect(play).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(play);
    const pause = screen.getByRole('button', { name: '❚❚ Pause' });
    expect(pause).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(pause);
    expect(screen.getByRole('button', { name: '▶ Play' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables auto-play under prefers-reduced-motion', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: true, media: q, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    try {
      render(<VisualiserTab />);
      const play = screen.getByRole('button', { name: '▶ Replay' });
      expect(play).toBeDisabled();
      expect(play.getAttribute('title')).toContain('reduced-motion');
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('VisualiserTab — canvas interaction', () => {
  it('hovering a mark shows a tooltip; leaving clears it', () => {
    const { container } = render(<VisualiserTab />);
    const canvas = container.querySelector('canvas')!;
    const m = layout().marks[0];

    pointer(canvas, 'pointermove', m.x, m.y);
    expect(screen.getByText(m.action.label)).toBeInTheDocument();

    // React synthesises onPointerLeave from a pointerout whose relatedTarget is
    // outside the element — dispatch that so onLeave runs.
    fireEvent(canvas, new MouseEvent('pointerout', { bubbles: true, cancelable: true, clientX: m.x, clientY: m.y }));
    expect(screen.queryByText(m.action.label)).toBeNull();
  });

  it('changing the grouping clears an active hover', () => {
    const { container } = render(<VisualiserTab />);
    const canvas = container.querySelector('canvas')!;
    const m = layout().marks[0];

    pointer(canvas, 'pointermove', m.x, m.y);
    expect(screen.getByText(m.action.label)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.queryByText(m.action.label)).toBeNull();
  });

  it('clicking a mark selects it and fills the detail panel; Clear resets', () => {
    const { container } = render(<VisualiserTab />);
    const canvas = container.querySelector('canvas')!;
    // A tool_call has both an element and a duration, exercising the richer
    // detail branches (element badge + formatted duration).
    const marks = layout().marks;
    const m = marks.find((mm) => mm.action.kind === 'tool_call' && mm.action.elementId) ?? marks[0];

    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument();

    pointer(canvas, 'pointerdown', m.x, m.y);
    pointer(canvas, 'pointerup', m.x, m.y);

    expect(screen.getByText('Agent lineage')).toBeInTheDocument(); // a Detail-only field
    expect(screen.getByText(m.action.label)).toBeInTheDocument();  // confirms this mark was selected
    expect(screen.queryByText(/Nothing selected/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText(/Nothing selected/)).toBeInTheDocument();

    // Now select a lifecycle action with no element and no duration, exercising
    // the detail panel's em-dash fallbacks.
    const noEl = marks.find((mm) => !mm.action.elementId && mm.action.durationMs == null);
    if (noEl) {
      pointer(canvas, 'pointerdown', noEl.x, noEl.y);
      pointer(canvas, 'pointerup', noEl.x, noEl.y);
      expect(screen.getByText('Agent lineage')).toBeInTheDocument();
    }
  });

  it('advances the cursor through the animation-frame loop while playing', () => {
    // Drive requestAnimationFrame synchronously for a couple of frames so the
    // playback step() runs (covering its first-frame and delta branches).
    let n = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      if (n++ < 2) cb(16 + n);
      return n;
    });
    render(<VisualiserTab />);
    fireEvent.click(screen.getByRole('button', { name: '▶ Replay' }));
    expect(screen.getByRole('button', { name: '❚❚ Pause' })).toBeInTheDocument();
  });

  it('truncates overflowing lane labels without throwing (both head and tail)', () => {
    // A context whose measureText always reports overflow drives truncate()'s
    // ellipsis loops — the head path for plain labels, the tail path for paths.
    const wideCtx = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'measureText') return () => ({ width: 9999 });
          if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop: () => {} });
          if (prop === 'canvas') return null;
          return () => {};
        },
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(wideCtx as unknown as CanvasRenderingContext2D);

    render(<VisualiserTab />); // owner labels → head ellipsis
    const group = screen.getByRole('group', { name: 'Group by' });
    fireEvent.click(within(group).getByRole('button', { name: 'Element' })); // element paths → tail ellipsis
    expect(screen.getByText(`${N} actions · grouped by element`)).toBeInTheDocument();
  });

  it('dragging the top strip scrubs the cursor', () => {
    const { container } = render(<VisualiserTab />);
    const canvas = container.querySelector('canvas')!;
    const range = screen.getByLabelText('Timeline position') as HTMLInputElement;
    const geo = layout().geo;

    // y within the axis/density strip (<= lanesTop) enters scrub mode.
    pointer(canvas, 'pointerdown', 400, 10);
    pointer(canvas, 'pointermove', 600, 10);
    pointer(canvas, 'pointerup', 600, 10);

    const ts = xToTime(600, geo);
    const expected = Math.round(clamp01((ts - geo.t0) / (geo.t1 - geo.t0)) * 1000);
    expect(range.value).toBe(String(expected));
  });
});
