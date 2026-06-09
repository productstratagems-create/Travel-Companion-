const THEME_KEY = 't.theme';

export function loadTheme() {
  try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; }
}

export function saveTheme(val) {
  try { localStorage.setItem(THEME_KEY, val); } catch {}
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
