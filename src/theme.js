import { storage } from './storage.js';

const THEME_KEY = 't.theme';
const PALETTE_KEY = 't.palette';

// Two independent axes: light/dark (data-theme) and colour family (data-palette).
export const PALETTES = ['standard', 'bluegrey'];

/**
 * What a reader who has chosen nothing gets.
 *
 * Dark and blue-grey. Not 'system' for the theme: the app is read on a
 * platform at night and in a tunnel far more often than in daylight, and
 * following the phone would hand a first-time reader whatever their OS
 * happens to say rather than the screen this was designed on.
 *
 * DUPLICATED, unavoidably, in the inline script at the top of index.html —
 * that runs before the bundle exists, and without it the first paint flashes
 * the wrong palette. A test reads both files and requires they agree, because
 * two spellings of one default is precisely how they drift.
 */
export const DEFAULT_THEME = 'dark';
export const DEFAULT_PALETTE = 'bluegrey';

// Browser chrome colour per resolved combination.
const THEME_COLOR = {
  'standard|light':  '#fffdf7',
  'standard|dark':   '#0a0806',
  'bluegrey|light':  '#f7f9fb',
  'bluegrey|dark':   '#0f172a',
};

export function loadTheme() {
  return storage.get(THEME_KEY) || DEFAULT_THEME;
}

export function saveTheme(val) {
  storage.set(THEME_KEY, val);
}

export function loadPalette() {
  const v = storage.get(PALETTE_KEY);
  return PALETTES.includes(v) ? v : DEFAULT_PALETTE;
}

export function savePalette(val) {
  storage.set(PALETTE_KEY, PALETTES.includes(val) ? val : DEFAULT_PALETTE);
}

function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref, palettePref) {
  const resolved = resolveTheme(pref);
  const palette = PALETTES.includes(palettePref) ? palettePref : loadPalette();
  const root = document.documentElement;
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-palette', palette);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = THEME_COLOR[palette + '|' + resolved]
    || THEME_COLOR[DEFAULT_PALETTE + '|' + DEFAULT_THEME];
}

export function initTheme() {
  applyTheme(loadTheme(), loadPalette());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (loadTheme() === 'system') applyTheme('system', loadPalette());
  });
}

export function setTheme(val) {
  saveTheme(val);
  applyTheme(val, loadPalette());
}

export function setPalette(val) {
  savePalette(val);
  applyTheme(loadTheme(), loadPalette());
}
