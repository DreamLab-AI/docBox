// Configuration tab suite. Drives the REAL ConfigTab against the frozen mock
// world (store.config()); nothing is stubbed. Editing is local React state, so
// tests are isolated by the afterEach cleanup in test/setup.ts.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import ConfigTab from './ConfigTab';
import * as live from '../../data/live';
import { SIMULATED_NOTE } from '../../ui/demo';

// Spies (used by the demo-erasure cases below) are restored between tests; the
// rest of the suite runs in the default mock plane where isDemo() is true.
afterEach(() => vi.restoreAllMocks());

describe('ConfigTab — sub-tab strip', () => {
  it('renders a tab for every section that has options, including Interface', () => {
    render(<ConfigTab />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(9);
    for (const name of [
      'Providers', 'Toolchain', 'Identity', 'Network', 'Vaults',
      'Audit', 'Snapshots', 'Agents', 'Interface',
    ]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    // Providers is the default active tab.
    expect(screen.getByRole('tab', { name: 'Providers' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ConfigTab — staging edits', () => {
  it('stages a pending change when a control is edited', () => {
    render(<ConfigTab />);
    // No drawer before any edit.
    expect(screen.queryByText(/staged change/)).toBeNull();

    // Toggle Anthropic (a live-class boolean, first switch on the Providers tab).
    fireEvent.click(screen.getAllByRole('switch')[0]);

    // The sticky drawer appears and offers to apply the one live change.
    expect(screen.getByText(/1 staged change/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Apply live \+ session changes \(1\)/ }),
    ).toBeInTheDocument();
  });

  it('groups staged changes in the footer by apply-class', () => {
    render(<ConfigTab />);
    // A live change (Anthropic toggle) and a rebuild change (embedded model).
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });

    // Two distinct apply-classes each with a count of one.
    expect(screen.getAllByText('× 1')).toHaveLength(2);
    // Live/session and rebuild get separate actions in the footer.
    expect(
      screen.getByRole('button', { name: /Apply live \+ session changes \(1\)/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Review rebuild plan \(1\)/ }),
    ).toBeInTheDocument();
  });
});

describe('ConfigTab — applying, resetting and discarding', () => {
  it('applies live/session changes and clears the drawer', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getAllByRole('switch')[0]); // Anthropic → off (live)
    fireEvent.click(
      screen.getByRole('button', { name: /Apply live \+ session changes \(1\)/ }),
    );
    // Committed: nothing pending, and the applied value now shows on the control.
    expect(screen.queryByText(/staged change/)).toBeNull();
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'false');
  });

  it('resets a single staged edit back to baseline', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'reset' }));
    expect(screen.queryByText(/staged change/)).toBeNull();
    expect(screen.getAllByRole('switch')[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('discards every staged edit at once', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getAllByRole('switch')[0]);
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });
    expect(screen.getByText(/2 staged changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText(/staged change/)).toBeNull();
  });
});

describe('ConfigTab — rebuild plan', () => {
  it('surfaces the review action and lists the TOML from→to in the plan modal', () => {
    render(<ConfigTab />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });

    const review = screen.getByRole('button', { name: /Review rebuild plan \(1\)/ });
    fireEvent.click(review);

    const dialog = screen.getByRole('dialog', { name: 'Rebuild plan' });
    // The changed key and its from→to values are itemised.
    expect(within(dialog).getByText('models.local.name')).toBeInTheDocument();
    expect(within(dialog).getByText('qwen3-8b')).toBeInTheDocument();     // from
    expect(within(dialog).getByText('gpt-oss-20b')).toBeInTheDocument();  // to
    // The rebuild sequence is spelled out.
    expect(within(dialog).getByText('Build image')).toBeInTheDocument();
  });

  it('cancels the plan without applying', () => {
    render(<ConfigTab />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });
    fireEvent.click(screen.getByRole('button', { name: /Review rebuild plan \(1\)/ }));
    const dialog = screen.getByRole('dialog', { name: 'Rebuild plan' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    // Modal closed, change still staged (not applied).
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: /Review rebuild plan \(1\)/ })).toBeInTheDocument();
  });

  it('closes the plan on Escape and on backdrop click before it starts', () => {
    render(<ConfigTab />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });

    // Escape closes while idle.
    fireEvent.click(screen.getByRole('button', { name: /Review rebuild plan \(1\)/ }));
    expect(screen.getByRole('dialog', { name: 'Rebuild plan' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    // Re-open, then a backdrop click closes it too.
    fireEvent.click(screen.getByRole('button', { name: /Review rebuild plan \(1\)/ }));
    fireEvent.click(screen.getByRole('dialog', { name: 'Rebuild plan' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('runs the simulated rebuild to completion and applies the change', () => {
    vi.useFakeTimers();
    try {
      render(<ConfigTab />);
      fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'gpt-oss-20b' } });
      fireEvent.click(screen.getByRole('button', { name: /Review rebuild plan \(1\)/ }));
      const dialog = screen.getByRole('dialog', { name: 'Rebuild plan' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start rebuild' }));

      // Four simulated steps, 950ms apart.
      for (let i = 0; i < 4; i++) {
        act(() => { vi.advanceTimersByTime(950); });
      }

      fireEvent.click(within(dialog).getByRole('button', { name: 'Apply and close' }));
      // Modal closed and the rebuild change is applied → no pending remains.
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText(/staged change/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ConfigTab — why disclosure', () => {
  it('reveals the option whenToUse guidance on expand', () => {
    render(<ConfigTab />);
    // Guidance is not shown as body text until the disclosure is opened.
    expect(
      screen.queryByText(/Default engine for complex overhaul work/),
    ).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: /why/ })[0]);

    expect(
      screen.getByText(/Default engine for complex overhaul work/),
    ).toBeInTheDocument();
  });
});

describe('ConfigTab — search', () => {
  it('filters options across all sections and hides the tab strip', () => {
    render(<ConfigTab />);
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(1);

    fireEvent.change(screen.getByLabelText('Filter settings'), {
      target: { value: 'anthropic' },
    });

    // The section strip is replaced by cross-section results.
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(screen.getAllByText(/across all sections/).length).toBeGreaterThan(0);
    // Only the two anthropic options survive (one boolean, one secret).
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.queryByText('DeepSeek')).toBeNull();
    expect(screen.getByText('Anthropic API key')).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', () => {
    render(<ConfigTab />);
    fireEvent.change(screen.getByLabelText('Filter settings'), {
      target: { value: 'zzzznomatch' },
    });
    expect(screen.getByText(/No settings match/)).toBeInTheDocument();
  });
});

describe('ConfigTab — controls per option type', () => {
  it('renders boolean, enum (segmented + select), string and secret controls', () => {
    render(<ConfigTab />);

    // boolean → toggle switch
    expect(screen.getAllByRole('switch').length).toBeGreaterThan(0);
    // enum with ≤4 options → segmented radiogroup
    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('radio').length).toBeGreaterThan(0);
    // enum with >4 options → select (models.local.name and ocr.local_model)
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    // string → text input (the local endpoint), editable
    const endpoint = screen.getByDisplayValue('http://local-model:11434/v1');
    fireEvent.change(endpoint, { target: { value: 'http://elsewhere:1234/v1' } });
    expect(screen.getByDisplayValue('http://elsewhere:1234/v1')).toBeInTheDocument();

    // enum select is editable (models.local.name has >4 options).
    fireEvent.change(screen.getByRole('combobox', { name: 'Embedded model' }), { target: { value: 'qwen3-4b' } });
    expect(screen.getByRole('combobox', { name: 'Embedded model' })).toHaveValue('qwen3-4b');

    // secret → masked by default, reveal toggles the value.
    expect(screen.getByDisplayValue('•'.repeat(12))).toBeInTheDocument();
    const reveal = screen.getByRole('button', { name: 'reveal value' });
    fireEvent.click(reveal);
    expect(screen.getByDisplayValue('sk-ant-•••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'hide value' })).toBeInTheDocument();
  });

  it('ties each control to its option label for assistive tech', () => {
    render(<ConfigTab />);
    // The boolean toggle, the enum select and the enum radiogroup all point at
    // their row label via aria-labelledby, so they have an accessible name.
    const toggle = screen.getAllByRole('switch')[0];
    expect(toggle).toHaveAttribute('aria-labelledby');
    const labelId = toggle.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBeTruthy();

    expect(screen.getAllByRole('combobox')[0]).toHaveAttribute('aria-labelledby');
    expect(screen.getAllByRole('radiogroup')[0]).toHaveAttribute('aria-labelledby');
  });

  it('renders a number stepper: increment, decrement, direct entry and empty→0 (Identity tab)', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getByRole('tab', { name: 'Identity' }));

    const spin = screen.getByRole('spinbutton');
    expect(spin).toHaveValue(15);

    // Increment stages a change.
    fireEvent.click(screen.getByRole('button', { name: 'increase' }));
    expect(screen.getByRole('spinbutton')).toHaveValue(16);
    expect(screen.getByText(/1 staged change/)).toBeInTheDocument();

    // Decrement back to baseline clears the staged change.
    fireEvent.click(screen.getByRole('button', { name: 'decrease' }));
    expect(screen.getByRole('spinbutton')).toHaveValue(15);
    expect(screen.queryByText(/staged change/)).toBeNull();

    // Direct entry, and the empty-string guard which floors to 0.
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '42' } });
    expect(screen.getByRole('spinbutton')).toHaveValue(42);
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '' } });
    expect(screen.getByRole('spinbutton')).toHaveValue(0);
  });

  it('renders editable list chips with add and remove (Network tab)', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getByRole('tab', { name: 'Network' }));

    // Existing chip present, then removed.
    expect(screen.getByText('api.anthropic.com')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'remove api.anthropic.com' }));
    expect(screen.queryByText('api.anthropic.com')).toBeNull();

    // Add a new chip via the button.
    fireEvent.change(screen.getByPlaceholderText('add…'), {
      target: { value: 'example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getByText('example.com')).toBeInTheDocument();

    // Add another via the Enter key.
    fireEvent.change(screen.getByPlaceholderText('add…'), {
      target: { value: 'enter.com' },
    });
    fireEvent.keyDown(screen.getByPlaceholderText('add…'), { key: 'Enter' });
    expect(screen.getByText('enter.com')).toBeInTheDocument();

    // Empty and duplicate adds are ignored (no throw, no extra chip).
    fireEvent.click(screen.getByRole('button', { name: 'add' })); // empty draft
    fireEvent.change(screen.getByPlaceholderText('add…'), {
      target: { value: 'enter.com' }, // duplicate
    });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));
    expect(screen.getAllByText('enter.com')).toHaveLength(1);
  });
});

describe('ConfigTab — demo-erasure invariant', () => {
  // The pending drawer's apply/rebuild controls read as real operations, and the
  // seeded secret/identity rows read as the box's real provisioned values. Both
  // must be tagged in demo mode and both must vanish once live data is real.
  it('notes the apply action as simulated and flags seeded secrets as example (demo mode)', () => {
    render(<ConfigTab />);
    // The Anthropic API key (a secret on the default Providers tab) is flagged.
    expect(screen.getAllByText('example').length).toBeGreaterThanOrEqual(1);
    // Stage a change so the sticky drawer (with the apply note) appears.
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(screen.getByText(SIMULATED_NOTE)).toBeInTheDocument();
  });

  it('drops the simulated apply note and the example tags once live data is real', () => {
    vi.spyOn(live, 'liveStatus').mockReturnValue('live');
    render(<ConfigTab />);
    expect(screen.queryByText('example')).toBeNull();
    fireEvent.click(screen.getAllByRole('switch')[0]);
    expect(screen.getByText(/1 staged change/)).toBeInTheDocument(); // drawer is open…
    expect(screen.queryByText(SIMULATED_NOTE)).toBeNull();            // …but not tagged
  });
});

describe('ConfigTab — hot apply-class', () => {
  it('shows the Hot badge on the self-modifying Interface options', () => {
    render(<ConfigTab />);
    // No hot-class options exist on the default Providers tab.
    expect(screen.queryByText('Hot')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Interface' }));
    // density and panels are hot-class → at least two Hot badges.
    expect(screen.getAllByText('Hot').length).toBeGreaterThanOrEqual(2);
  });

  it('surfaces a staged hot change with its Hot chip in the pending drawer', () => {
    render(<ConfigTab />);
    fireEvent.click(screen.getByRole('tab', { name: 'Interface' }));

    // Switch Density comfortable → compact: a hot-class enum edit.
    fireEvent.click(screen.getByRole('radio', { name: 'compact' }));

    // The drawer opens and the hot class is counted (previously the hot class
    // was missing from APPLY_ORDER, so its chip never appeared).
    expect(screen.getByText(/1 staged change/)).toBeInTheDocument();
    expect(screen.getByText('× 1')).toBeInTheDocument();
    // Row badges (density + panels) plus the new drawer chip → 3 Hot labels.
    expect(screen.getAllByText('Hot').length).toBeGreaterThanOrEqual(3);
  });
});
