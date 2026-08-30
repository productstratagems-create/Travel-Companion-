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
// Survives releases, because tiles don't change — but the *provider* did.
// v1 holds CARTO tiles, and the keyless ones among them carry a repeating
// "API key required" watermark. cache-first would serve those forever, so the
// name is bumped; the activate handler deletes any cache not named here.
const TILE_CACHE  = 'tiles-v2';
const TILE_LIMIT  = 400;               // ~15 MB of 256px PNGs

const SHELL = ['./', './index.html', './install.html', './privacy.html', './manifest.webmanifest', './icons/icon-192.png'];

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
          // Key the copy to the page that was actually requested. Writing
          // every navigation to './index.html' meant a single visit to the
          // install guide replaced the cached app shell, so the next offline
          // launch of the app opened the guide instead of the board.
          caches.open(SHELL_CACHE).then(c => c.put(req.url, copy));
          return res;
        })
        // Prefer the page asked for; fall back to the app shell only when we
        // have never seen that page.
        .catch(() => caches.match(req.url, { ignoreSearch: true })
          .then(hit => hit || caches.match('./index.html', { ignoreSearch: true }))
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
  if (url.hostname === 'tiles.stadiamaps.com') {
    e.respondWith(cacheFirst(req, TILE_CACHE, trimTiles).catch(() => Response.error()));
    return;
  }

  // Everything else — Entur, weather, GBFS, geocoding — is live data.
  // Leave it alone.
});
