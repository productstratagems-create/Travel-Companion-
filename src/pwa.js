/**
 * Progressive-web-app plumbing: register the service worker, and keep the
 * offline banner honest.
 */

/**
 * The worker is registered with the app version in the query string. That is
 * what makes the browser notice a release — the script URL changes — and it
 * doubles as the cache name inside sw.js, so there is no version constant in
 * the worker to keep in sync by hand.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // A worker in `vite dev` would serve yesterday's modules over today's edits.
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    // Relative, so it inherits the GitHub Pages project subpath along with
    // its scope. An absolute '/sw.js' would 404 there.
    navigator.serviceWorker.register('./sw.js?v=' + __APP_VERSION__)
      .catch(() => { /* No worker means no offline shell. Nothing else breaks. */ });
  });
}

/**
 * navigator.onLine only proves the device has *a* network, not that Entur is
 * reachable — so the banner is a hint, not a verdict. The board keeps its own
 * error state for the case where there is signal but no answer.
 */
export function initOfflineBanner() {
  const el = document.getElementById('offline-banner');
  if (!el) return;
  const sync = () => { el.style.display = navigator.onLine ? 'none' : 'block'; };
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}
