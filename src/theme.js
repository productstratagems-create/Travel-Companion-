import { storage } from './storage.js';

const THEME_KEY = 't.theme';
const PALETTE_KEY = 't.palette';

// Two independent axes: light/dark (data-theme) and colour family (data-palette).
export const PALETTES = ['standard', 'bluegrey'];

// Browser chrome colour per resolved combination.
const THEME_COLOR = {
  'standard|light':  '#fffdf7',
  'standard|dark':   '#0a0806',
  'bluegrey|light':  '#f7f9fb',
  'bluegrey|dark':   '#0f172a',
};

export function loadTheme() {
  return storage.get(THEME_KEY) || 'system';
}

export function saveTheme(val) {
  storage.set(THEME_KEY, val);
}

export function loadPalette() {
  const v = storage.get(PALETTE_KEY);
  return PALETTES.includes(v) ? v : 'standard';
}

export function savePalette(val) {
  storage.set(PALETTE_KEY, PALETTES.includes(val) ? val : 'standard');
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
  if (meta) meta.content = THEME_COLOR[palette + '|' + resolved] || THEME_COLOR['standard|dark'];
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
