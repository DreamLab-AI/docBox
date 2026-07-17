// Tests for the panel-level error boundary (ADR-008): a throwing child is
// contained behind a fallback with a reload affordance; a healthy child passes
// through; reload resets the boundary so a recovered child renders.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelBoundary } from './PanelBoundary';

function Boom({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

let errSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React logs caught boundary errors to console.error; componentDidCatch logs a
  // warning. Silence both so test output stays clean, but keep the spies to assert.
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
  warnSpy.mockRestore();
});

describe('PanelBoundary', () => {
  it('passes a healthy child through unchanged', () => {
    render(
      <PanelBoundary name="Overview">
        <div>healthy content</div>
      </PanelBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
    expect(screen.queryByText(/stopped/)).toBeNull();
  });

  it('shows a contained fallback with the panel name, error message and reload button', () => {
    render(
      <PanelBoundary name="Documents">
        <Boom message="ocr worker exploded" />
      </PanelBoundary>,
    );
    // Fallback headline names the panel (curly quotes in the source).
    expect(screen.getByText('Panel “Documents” stopped')).toBeInTheDocument();
    // The error message is surfaced verbatim.
    expect(screen.getByText('ocr worker exploded')).toBeInTheDocument();
    // Reload affordance present.
    expect(screen.getByRole('button', { name: 'Reload this panel' })).toBeInTheDocument();
    // componentDidCatch reported the fault.
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('panel "Documents" faulted'))).toBe(true);
  });

  it('resets on reload so a child that recovers renders through', () => {
    let fail = true;
    function Flaky(): JSX.Element {
      if (fail) throw new Error('transient boot error');
      return <div>panel recovered</div>;
    }

    render(
      <PanelBoundary name="Work">
        <Flaky />
      </PanelBoundary>,
    );
    // First render faults into the fallback.
    expect(screen.getByText('transient boot error')).toBeInTheDocument();

    // The underlying cause clears, then the user reloads just this panel.
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reload this panel' }));

    // Boundary reset (error cleared + key bumped) → child re-mounts and succeeds.
    expect(screen.getByText('panel recovered')).toBeInTheDocument();
    expect(screen.queryByText(/stopped/)).toBeNull();
  });
});
