/* Service worker.
 *
 * The app is used underground, so the goal is narrow and specific: the shell,
 * the fonts and the map tiles you have already seen must render with no
 * network at all. Live departure data is deliberately never cached here —
 * a cached departure board is a lie. The last board is persisted by the app
 * itself (src/state.js) and rendered behind the existing "sist oppdatert"
 * staleness stamp, so it can never be mistaken for realtime.
 *
 * The cache name comes from the ?v= on the script URL, which main.js sets to
 * the package version. A release therefore changes the worker's URL, which is
 * what makes the browser install it, and gives us a fresh cache for free —
 * no constant in here to remember to bump.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE = 'shell-' + VERSION;
const ASSET_CACHE = 'assets-' + VERSION;
const TILE_CACHE  = 'tiles-v1';        // survives releases; tiles don't change
const TILE_LIMIT  = 400;               // ~15 MB of 256px PNGs

const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      // Individually, so one 404 can't fail the whole install.
      .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => {
        if (k === SHELL_CACHE || k === ASSET_CACHE || k === TILE_CACHE) return null;
        return caches.delete(k);
      })))
      .then(() => self.clients.claim())
  );
});

function cacheFirst(req, cacheName, onStore) {
  return caches.open(cacheName).then(cache =>
    cache.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok) { cache.put(req, res.clone()); if (onStore) onStore(cache); }
        return res;
      });
    })
  );
}

// Oldest-first trim. Cache.keys() returns insertion order, so this is a real
// FIFO rather than a guess.
function trimTiles(cache) {
  cache.keys().then(keys => {
    const over = keys.length - TILE_LIMIT;
    if (over > 0) keys.slice(0, over).forEach(k => cache.delete(k));
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                    // GraphQL POSTs pass through
  const url = new URL(req.url);

  // Navigations: network first so a deploy is picked up immediately, falling
  // back to the cached shell when there is no signal.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true })
          .then(hit => hit || caches.match('./')))
    );
    return;
  }

  // Our own build output: content-hashed, so cache-first is safe and permanent.
  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req, ASSET_CACHE).catch(() => caches.match(req)));
    return;
  }

  // Basemap tiles: immutable, and having them offline is most of what makes
  // the map useful in a tunnel.
  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(cacheFirst(req, TILE_CACHE, trimTiles).catch(() => Response.error()));
    return;
  }

  // Everything else — Entur, weather, GBFS, geocoding — is live data.
  // Leave it alone.
});
