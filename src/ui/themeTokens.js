// Leaflet vector options and injected marker HTML take colour STRINGS, so
// var(--accent) can't be used there. Read the resolved token values instead,
// and invalidate whenever the theme or palette attribute changes.

let _cache = null;

function _read() {
  const cs = getComputedStyle(document.documentElement);
  const get = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
  return {
    accent:     get('--accent', '#f5b840'),
    accentRgb:  get('--accent-rgb', '245, 184, 64').replace(/\s+/g, ''),
    bgRgb:      get('--bg-rgb', '10, 8, 6').replace(/\s+/g, ''),
    surface2:   get('--surface-2', '#1a1410'),
    textMuted:  get('--text-muted', '#8a837d'),
  };
}

export function tokens() {
  if (!_cache) _cache = _read();
  return _cache;
}

/** rgba() built from a token triplet, e.g. alpha('bgRgb', .85). */
export function alpha(key, a) {
  return 'rgba(' + tokens()[key] + ',' + a + ')';
}

export function refreshTokens() {
  _cache = null;
}

// data-theme / data-palette are only ever set on <html>.
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver(refreshTokens).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme', 'data-palette'],
  });
}
