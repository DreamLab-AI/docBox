import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  resolveColour, KIND_COLOUR, ELEMENT_COLOUR, KIND_LABEL, ELEMENT_LABEL, KIND_ORDER,
} from './palette';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveColour — passthrough', () => {
  it('returns a raw hex or named colour untouched, trimming whitespace', () => {
    expect(resolveColour('#abcdef')).toBe('#abcdef');
    expect(resolveColour('rebeccapurple')).toBe('rebeccapurple');
    expect(resolveColour('  #123456  ')).toBe('#123456');
  });

  it('passes through anything that is not a lone var() token', () => {
    // The regex is anchored, so a var() embedded in a larger string is not a match.
    expect(resolveColour('linear-gradient(var(--x), #000)')).toBe('linear-gradient(var(--x), #000)');
  });
});

describe('resolveColour — var() resolution and caching', () => {
  it('resolves from the live stylesheet and caches the first real read', () => {
    let current = ' rgb(1, 2, 3) ';
    const getPropertyValue = vi.fn((name: string) => (name === '--probe' ? current : ''));
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue }));

    // First call reads the stylesheet and trims the result.
    expect(resolveColour('var(--probe)')).toBe('rgb(1, 2, 3)');
    expect(getPropertyValue).toHaveBeenCalledTimes(1);

    // The stylesheet changes, but the cached value is returned without re-reading.
    current = 'rgb(9, 9, 9)';
    expect(resolveColour('var(--probe)')).toBe('rgb(1, 2, 3)');
    expect(getPropertyValue).toHaveBeenCalledTimes(1); // no second read
  });

  it('matches var() case-insensitively', () => {
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: (name: string) => (name === '--Upper' ? '#0f0f0f' : ''),
    }));
    expect(resolveColour('VAR(--Upper)')).toBe('#0f0f0f');
  });
});

describe('resolveColour — fallback', () => {
  it('uses the hardcoded token fallback when the stylesheet yields nothing', () => {
    // Real jsdom getComputedStyle returns '' for an unset custom property.
    expect(resolveColour('var(--accent)')).toBe('#5b8cff');
  });

  it('returns the neutral grey for an unknown token not in the fallback map', () => {
    expect(resolveColour('var(--not-a-real-token)')).toBe('#888888');
  });

  it('skips the stylesheet entirely when document is undefined (SSR/boot branch)', () => {
    vi.stubGlobal('document', undefined);
    // --green is only reachable via the fallback map here, and fallbacks never cache.
    expect(resolveColour('var(--green)')).toBe('#46c273');
    expect(resolveColour('var(--nope-ssr)')).toBe('#888888');
  });
});

describe('palette tables', () => {
  it('assigns every action kind a distinct-ish var() hue and a label', () => {
    for (const kind of KIND_ORDER) {
      expect(KIND_COLOUR[kind]).toMatch(/^var\(--/);
      expect(KIND_LABEL[kind]).toBeTruthy();
    }
    expect(KIND_COLOUR.policy_deny).toBe('var(--fg-2)'); // denial gets grey, ring carries signal
    expect(KIND_ORDER).toHaveLength(7);
  });

  it('assigns every element kind a hue and a label', () => {
    for (const k of Object.keys(ELEMENT_COLOUR) as (keyof typeof ELEMENT_COLOUR)[]) {
      expect(ELEMENT_COLOUR[k]).toMatch(/^var\(--/);
      expect(ELEMENT_LABEL[k]).toBeTruthy();
    }
  });
});
