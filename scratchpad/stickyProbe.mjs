/**
 * Is "du er ved" sticky?
 *
 * Reported by screenshot: the heading said Mortensrud, 649 m, while all seven
 * alternatives under it were NEARER — down to 369 m. Since v1.76.0 the
 * nearest is supposed to win, so something is holding on to an older answer.
 *
 * The suspicion from reading the code: locateUser() resolves stops from the
 * REMEMBERED position first (geo.js, state.homeLL) so the screen has
 * something before GPS warms up, then re-resolves once you have moved 200 m.
 * But auto.js only ever picks a stop when it has none:
 *
 *     if (!_stop && list.length) _stop = list[0];
 *
 * So the second, better answer never reaches the heading. This drives exactly
 * that sequence and reads the heading at each step.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4493;
const NOW = Date.parse('2026-09-04T20:51:00+02:00');
const iso = ms => new Date(ms).toISOString();

/* Yesterday's remembered position, and where the reader actually is now.
   Far enough apart to pass STATION_REFRESH_M = 200. */
const OLD = { lat: 59.8617, lon: 10.8285 };   // by Mortensrud T
const NEW = { lat: 59.8680, lon: 10.8240 };   // ~800 m north, by Olasrudveien

const stop = (name, m, lat0) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [OLD.lon, lat0 + m / 111320] },
});

/* Two worlds. From the remembered position Mortensrud is nearest; from where
   the reader actually stands, it is the farthest of the eight. */
const FROM_OLD = [stop('Mortensrud T', 20, OLD.lat), stop('Olasrudveien', 400, OLD.lat)];
const FROM_NEW = [
  stop('Mortensrud T', 649, NEW.lat), stop('Olasrudveien', 369, NEW.lat),
  stop('Granebakken', 429, NEW.lat), stop('Stenbråten', 496, NEW.lat),
];

const CALLS = [{
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + 3 * 60000), expectedDepartureTime: iso(NOW + 3 * 60000),
  destinationDisplay: { frontText: 'Kolsås' },
  quay: { id: 'NSR:Quay:1', publicCode: '1', name: 'A 1' },
  serviceJourney: { id: 'sj:1', situations: [],
    line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [{ quay: { latitude: 59.9, longitude: 10.7,
      stopPlace: { id: 'NSR:StopPlace:9', name: 'Ryen', latitude: 59.9, longitude: 10.7 } },
      aimedArrivalTime: iso(NOW + 9 * 60000), expectedArrivalTime: iso(NOW + 9 * 60000),
      aimedDepartureTime: iso(NOW + 9 * 60000), expectedDepartureTime: iso(NOW + 9 * 60000) }] },
}];

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(DIST, rel);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void res.writeHead(404).end('x');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT, r));

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({
  viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark',
  hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  geolocation: { latitude: NEW.lat, longitude: NEW.lon }, permissions: ['geolocation'],
});
const page = await ctx.newPage();
await page.addInitScript(({ now, old }) => {
  const Real = Date;
  class Pinned extends Real {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  globalThis.Date = Pinned;
  localStorage.setItem('__activeProfile', 'default');
  localStorage.setItem('default::t.autoMode', '1');
  localStorage.setItem('default::t.landing', 'auto');
  // Yesterday's position, which is what the screen resolves from first.
  localStorage.setItem('default::t.homeLL', JSON.stringify(old));
  // Open, so the alternatives and their distances are readable.
  localStorage.setItem('default::t.autoStops', '1');
}, { now: NOW, old: OLD });

let reverseCalls = 0;
await page.route('**/geocoder/**', route => {
  const u = new URL(route.request().url());
  const lat = Number(u.searchParams.get('point.lat'));
  const fromOld = Math.abs(lat - OLD.lat) < 0.0005;
  reverseCalls++;
  console.log('  → geocoder-oppslag #' + reverseCalls + ' fra',
    fromOld ? 'HUSKET posisjon' : 'GPS-posisjon');
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: fromOld ? FROM_OLD : FROM_NEW }) });
});
await page.route('**/journey-planner/**', route => {
  const body = route.request().postData() || '';
  if (body.includes('stopPlaces(')) return route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ data: { stopPlaces: [] } }) });
  if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'x', estimatedCalls: CALLS } } }) });
  return route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
});
await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

console.log('\n══ laster, med gårsdagens posisjon i lagringen ══');
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('#v-auto .auto-stop');

const head = () => page.$eval('#v-auto .auto-stop .auto-stop-name', e => e.textContent.trim());
const dist = () => page.$eval('#v-auto .auto-stop .nearby-dist', e => e.textContent.trim());
const alts = () => page.$$eval('#v-auto .auto-alt', els => els.map(e =>
  e.querySelector('.nearby-name').textContent.trim() + ' ' +
  e.querySelector('.nearby-dist').textContent.trim()));

console.log('\n  rett etter last:');
console.log('    du er ved:', await head(), '·', await dist());

// Give the GPS watch time to deliver a fix and re-resolve.
await page.waitForTimeout(4000);
console.log('\n  etter at GPS har landet:');
console.log('    du er ved:', await head(), '·', await dist());
(await alts()).forEach(a => console.log('      alt:', a));

const h = await head(), d = await dist();
const nearest = (await alts())[0];
console.log('\n  ── dom ──');
console.log('  nærmeste i lista:', nearest);
console.log('  overskriften er :', h, d);
console.log('  KLEBRIG:', nearest && Number(d.replace(/\D/g, '')) > Number(nearest.replace(/\D+/g, '')));

// ── The other half: a choice the reader makes must survive the next fix ───
//
// _stopPinned is set inside a click handler, so no unit test can see it. This
// is the instrument for it: tap an alternative, then move the reader again and
// let a new fix land.
console.log('\n══ leserens eget valg ══');
await page.click('#v-auto .auto-alt');           // pick the first alternative
await page.waitForTimeout(600);
const picked = await head();
console.log('  trykket p\u00e5:', picked, '·', await dist());
await ctx.setGeolocation({ latitude: NEW.lat + 0.006, longitude: NEW.lon });  // ~670 m further
await page.waitForTimeout(4000);
console.log('  etter et nytt GPS-fiks:');
console.log('    du er ved:', await head(), '·', await dist());
console.log('    valget beholdt:', (await head()).startsWith(picked.replace(/[▴▾].*/, '')));

await page.screenshot({ path: 'scratchpad/shots/sticky.png', animations: 'disabled' });
await ctx.close(); await browser.close(); server.close();
