// Tests for the shared UI primitives. Every exported member is exercised, and
// assertions check real rendered content (labels, classes, titles, colours,
// time formatting) rather than mere presence.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import {
  Panel, ApplyBadge, OwnerDot, OwnerTag, StatusPip, EmptyState, WhenToUse, fmtTime, fmtAgo,
} from './primitives';
import { applyClassHelp, applyClassLabel } from '../data/adapter';
import { owners } from '../data/mock';
import type { ApplyClass, Owner } from '../domain/types';

const MIN = 60_000;
const HOUR = 3600_000;

describe('Panel', () => {
  it('renders title, hint and right slot in a header', () => {
    render(
      <Panel title="Widgets" hint="a helpful hint" right={<span>right-slot</span>}>
        <p>body</p>
      </Panel>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Widgets' })).toBeInTheDocument();
    expect(screen.getByText('a helpful hint')).toBeInTheDocument();
    expect(screen.getByText('right-slot')).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('renders only children when no title/hint/right (header suppressed)', () => {
    const { container } = render(<Panel><p>lonely body</p></Panel>);
    expect(screen.getByText('lonely body')).toBeInTheDocument();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('h3')).toBeNull();
  });

  it('renders a header when only the right slot is supplied', () => {
    const { container } = render(<Panel right={<span>just-right</span>}><p>b</p></Panel>);
    expect(container.querySelector('header')).not.toBeNull();
    expect(screen.getByText('just-right')).toBeInTheDocument();
    expect(container.querySelector('h3')).toBeNull();
  });

  it('merges a custom style onto the card', () => {
    const { container } = render(<Panel style={{ opacity: '0.5' }}><p>x</p></Panel>);
    const card = container.querySelector('section.card') as HTMLElement;
    expect(card.getAttribute('style')).toContain('opacity: 0.5');
  });
});

describe('ApplyBadge', () => {
  const cases: { cls: ApplyClass; label: string; klass: string }[] = [
    { cls: 'hot', label: 'Hot', klass: 'badge-hot' },
    { cls: 'live', label: 'Live', klass: 'badge-live' },
    { cls: 'session', label: 'Next session', klass: 'badge-session' },
    { cls: 'rebuild', label: 'Rebuild', klass: 'badge-rebuild' },
  ];

  it.each(cases)('renders $cls with the right label, class and title', ({ cls, label, klass }) => {
    const { container } = render(<ApplyBadge cls={cls} />);
    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('badge', klass);
    expect(badge).toHaveAttribute('title', applyClassHelp[cls]);
    expect(badge.textContent).toContain(label);
    expect(applyClassLabel[cls]).toBe(label);
    // Without showHelp the inline help sentence is not rendered.
    expect(badge.textContent).not.toContain(applyClassHelp[cls]);
  });

  it('appends the help sentence when showHelp is set', () => {
    render(<ApplyBadge cls="rebuild" showHelp />);
    expect(screen.getByText(`· ${applyClassHelp.rebuild}`)).toBeInTheDocument();
  });
});

describe('OwnerDot', () => {
  const owner: Owner = { id: 'x', name: 'Nadia Q', upn: 'n@co', role: 'user', colour: 'var(--owner-a)' };

  it('renders a titled swatch tinted with the owner colour at the default size', () => {
    const { container } = render(<OwnerDot owner={owner} />);
    const dot = container.firstChild as HTMLElement;
    expect(dot).toHaveAttribute('title', 'Nadia Q');
    const style = dot.getAttribute('style') ?? '';
    expect(style).toContain('background: var(--owner-a)');
    expect(style).toContain('width: 10px');
    expect(style).toContain('height: 10px');
  });

  it('honours a custom size', () => {
    const { container } = render(<OwnerDot owner={owner} size={22} />);
    const style = (container.firstChild as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain('width: 22px');
    expect(style).toContain('height: 22px');
  });
});

describe('OwnerTag', () => {
  it('renders a known admin owner with name and an admin badge', () => {
    const admin = owners.find((o) => o.role === 'admin')!;
    const { container } = render(<OwnerTag ownerId={admin.id} />);
    expect(screen.getByText(admin.name)).toBeInTheDocument();
    expect(within(container).getByText('admin')).toBeInTheDocument();
  });

  it('renders a known non-admin owner without an admin badge', () => {
    const user = owners.find((o) => o.role === 'user')!;
    const { container } = render(<OwnerTag ownerId={user.id} />);
    expect(screen.getByText(user.name)).toBeInTheDocument();
    expect(within(container).queryByText('admin')).toBeNull();
  });

  it('renders "unknown" for an unrecognised owner id', () => {
    render(<OwnerTag ownerId="no-such-owner" />);
    const el = screen.getByText('unknown');
    expect(el).toHaveClass('muted');
  });
});

describe('StatusPip', () => {
  const colourFor: Record<string, string> = {
    ok: 'var(--green)', pass: 'var(--green)', promoted: 'var(--green)', done: 'var(--green)',
    failed: 'var(--rose)', fail: 'var(--rose)', auto_rolled_back: 'var(--rose)',
    blocked: 'var(--amber)',
    running: 'var(--accent)', candidate: 'var(--accent)',
    idle: 'var(--fg-2)',
  };

  it.each(Object.entries(colourFor))('maps %s to its colour', (status, colour) => {
    const { container } = render(<StatusPip status={status as never} />);
    const style = (container.firstChild as HTMLElement).getAttribute('style') ?? '';
    expect(style).toContain(`background: ${colour}`);
    expect(style).toContain(`box-shadow: 0 0 8px ${colour}`);
  });
});

describe('EmptyState', () => {
  it('renders muted centred content', () => {
    const { container } = render(<EmptyState>nothing here</EmptyState>);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('muted');
    expect(el.textContent).toBe('nothing here');
    expect(el.getAttribute('style') ?? '').toContain('text-align: center');
  });
});

describe('WhenToUse', () => {
  it('renders a guidance block with the decorative marker and children', () => {
    const { container } = render(<WhenToUse>use it when X</WhenToUse>);
    expect(screen.getByText('use it when X')).toBeInTheDocument();
    const marker = container.querySelector('[aria-hidden]') as HTMLElement;
    expect(marker.textContent).toBe('▸');
  });
});

describe('fmtTime', () => {
  it('formats an epoch to a 2-digit HH:MM string', () => {
    const out = fmtTime(Date.UTC(2026, 6, 16, 14, 30, 0));
    expect(out).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('fmtAgo', () => {
  const now = Date.UTC(2026, 6, 16, 14, 30, 0);
  it('returns "just now" under a minute', () => {
    expect(fmtAgo(now - 20_000, now)).toBe('just now');
  });
  it('returns minutes below the hour boundary', () => {
    expect(fmtAgo(now - 45 * MIN, now)).toBe('45m ago');
    expect(fmtAgo(now - 59 * MIN, now)).toBe('59m ago');
  });
  it('crosses into hours at 60 minutes', () => {
    expect(fmtAgo(now - 60 * MIN, now)).toBe('1h ago');
    expect(fmtAgo(now - 3 * HOUR, now)).toBe('3h ago');
  });
});
