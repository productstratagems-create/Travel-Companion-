import { storage } from './storage.js';

const THEME_KEY = 't.theme';

export function loadTheme() {
  return storage.get(THEME_KEY) || 'system';
}

export function saveTheme(val) {
  storage.set(THEME_KEY, val);
}

function resolveTheme(pref) {
  if (pref === 'light') return 'light';
  if (pref === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(pref) {
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#fffdf7' : '#0a0806';
}

export function initTheme() {
  applyTheme(loadTheme());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (loadTheme() === 'system') applyTheme('system');
  });
}

export function setTheme(val) {
  saveTheme(val);
  applyTheme(val);
}
