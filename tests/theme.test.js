import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory stand-in for the profile-scoped storage wrapper.
const store = new Map();
vi.mock('../src/storage.js', () => ({
  storage: {
    get: k => (store.has(k) ? store.get(k) : null),
    set: (k, v) => store.set(k, String(v)),
    remove: k => store.delete(k),
  },
}));

import { loadTheme, loadPalette, setTheme, setPalette, applyTheme, initTheme, PALETTES } from '../src/theme.js';

let prefersLight = false;
beforeEach(() => {
  store.clear();
  prefersLight = false;
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-palette');
  document.head.innerHTML = '<meta name="theme-color" content="">';
  // jsdom has no matchMedia
  window.matchMedia = vi.fn().mockImplementation(q => ({
    matches: q.includes('light') ? prefersLight : !prefersLight,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});

const attrs = () => ({
  theme: document.documentElement.getAttribute('data-theme'),
  palette: document.documentElement.getAttribute('data-palette'),
});
const themeColor = () => document.querySelector('meta[name="theme-color"]').content;

describe('defaults', () => {
  it('defaults to system theme and the standard palette', () => {
    expect(loadTheme()).toBe('system');
    expect(loadPalette()).toBe('standard');
  });

  it('falls back to standard for an unknown stored palette', () => {
    store.set('t.palette', 'chartreuse');
    expect(loadPalette()).toBe('standard');
  });

  it('refuses to persist an unknown palette', () => {
    setPalette('chartreuse');
    expect(loadPalette()).toBe('standard');
    expect(attrs().palette).toBe('standard');
  });

  it('exposes the supported palettes', () => {
    expect(PALETTES).toEqual(['standard', 'bluegrey']);
  });
});

describe('the two axes are independent', () => {
  it.each([
    ['light', 'standard'],
    ['dark', 'standard'],
    ['light', 'bluegrey'],
    ['dark', 'bluegrey'],
  ])('theme=%s palette=%s sets both attributes', (theme, palette) => {
    setPalette(palette);
    setTheme(theme);
    expect(attrs()).toEqual({ theme, palette });
  });

  it('changing palette leaves the light/dark choice alone', () => {
    setTheme('dark');
    setPalette('bluegrey');
    expect(attrs()).toEqual({ theme: 'dark', palette: 'bluegrey' });
    setPalette('standard');
    expect(attrs()).toEqual({ theme: 'dark', palette: 'standard' });
  });

  it('changing light/dark leaves the palette alone', () => {
    setPalette('bluegrey');
    setTheme('light');
    setTheme('dark');
    expect(loadPalette()).toBe('bluegrey');
    expect(attrs().palette).toBe('bluegrey');
  });
});

describe('system preference', () => {
  it('resolves to light when the OS prefers light', () => {
    prefersLight = true;
    setTheme('system');
    expect(attrs().theme).toBe('light');
  });

  it('resolves to dark when the OS prefers dark', () => {
    prefersLight = false;
    setTheme('system');
    expect(attrs().theme).toBe('dark');
  });

  it('keeps the chosen palette while following the OS', () => {
    prefersLight = true;
    setPalette('bluegrey');
    setTheme('system');
    expect(attrs()).toEqual({ theme: 'light', palette: 'bluegrey' });
  });
});

describe('theme-color meta', () => {
  it.each([
    ['light', 'standard', '#fffdf7'],
    ['dark', 'standard', '#0a0806'],
    ['light', 'bluegrey', '#f7f9fb'],
    ['dark', 'bluegrey', '#0f172a'],
  ])('%s + %s → %s', (theme, palette, expected) => {
    setPalette(palette);
    setTheme(theme);
    expect(themeColor()).toBe(expected);
  });
});

describe('persistence', () => {
  it('restores both preferences on init', () => {
    store.set('t.theme', 'light');
    store.set('t.palette', 'bluegrey');
    initTheme();
    expect(attrs()).toEqual({ theme: 'light', palette: 'bluegrey' });
  });

  it('applyTheme falls back to the stored palette when none is passed', () => {
    setPalette('bluegrey');
    applyTheme('dark');
    expect(attrs()).toEqual({ theme: 'dark', palette: 'bluegrey' });
  });
});
