/**
 * Does the app work in Bergen?
 *
 * Answered "yes" once, and that was wrong: a destination typed in Bergen was
 * discarded by an 80 km radius drawn around Oslo S, the geocoder was focused
 * on Oslo in six places, every Skyss bus ranked as «andre busser», and
 * «gå videre» looked for a metro in a city whose rail-bound network is
 * Bybanen — a tram.
 *
 * This drives a Bergen stop and reads what the screen says.
 *
 * Asked for from the Mortensrud screen: «Jernbanetorget er det mest
 * sannsynlige. Gå derfor automatisk dit, men legg på en snarvei tilbake til
 * forrige side.»
 *
 * Three states, because the third is the one that can do harm:
 *   1. clear history   → the board, with the strip above it
 *   2. tap the strip   → back to the direction list, the same rows
 *   3. a close contest → the list stands, exactly as today
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4503;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 60.3894, lon: 5.3327 };   // Bergen stasjon
const AWAY = { lat: HERE.lat - 637 / 111320, lon: HERE.lon };   // 637 m south, as on the screen

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + (1000 + [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 90000, 7)), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Nonneseter', 20), stop('Bergen stasjon', 400)];

const JBT = { name: 'Byparken', id: 'NSR:StopPlace:Byparken' };
const HEL = { name: 'Kronstad', id: 'NSR:StopPlace:Kronstad' };

/* Two directions from Mortensrud, as on the reported screen. Both reach
   Jernbanetorget; line 3 towards Kolsås leaves first. */
const call = (line, front, mins, stops, mode, cs) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line, publicCode: '1', name: 'spor 1' },
  serviceJourney: { id: 'sj:' + line + ':' + mins, situations: [],
    line: { id: (cs || 'SKY:') + 'Line:' + line, publicCode: line, transportMode: mode || 'tram',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: HERE.lat, longitude: HERE.lon,
        stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Nonneseter', latitude: HERE.lat, longitude: HERE.lon } },
        aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000) },
      ...stops.map((s, i) => ({
        quay: { latitude: 59.9 + i / 1000, longitude: 10.75,
          stopPlace: { id: s.id, name: s.name, latitude: 59.9 + i / 1000, longitude: 10.75 } },
        aimedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        aimedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000) })),
    ] },
});
const SKU = { name: 'Danmarksplass', id: 'NSR:StopPlace:Danmarksplass' };
const CALLS = [
  // «mot Stortinget om 2 min» — real, and gone before an 8-minute walk ends.
  // Bybanen: tram, not metro — the mode that made «gå videre» dead here.
  call('1', 'Byparken', 2, [SKU, HEL, JBT], 'tram'),
  call('1', 'Byparken', 17, [SKU, HEL, JBT], 'tram'),
  call('1', 'Byparken', 32, [SKU, HEL, JBT], 'tram'),
  call('2', 'Fyllingsdalen', 11, [SKU, HEL, JBT], 'tram'),
  call('2', 'Fyllingsdalen', 26, [SKU, HEL, JBT], 'tram'),
  // Skyss buses — the local network here, and everything that is not.
  call('5', 'Åsane', 6, [SKU], 'bus'),
  call('12', 'Lønborg', 9, [SKU], 'bus'),
  call('NW180', 'Oslo', 40, [SKU], 'coach', 'VYX:'),
];

const histRow = (to, id, n) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Nonneseter', toName: to, toStopId: id,
  toLat: 59.91, toLon: 10.75, fromStopId: 'NSR:StopPlace:Mortensrud',
  bucket: 3, isWeekend: false, count: n, lastUsed: NOW,
});

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


const ADR = { properties: { id: 'osm:addr:1', name: 'Vossegata 1', label: 'Vossegata 1, Bergen', category: [] }, geometry: { coordinates: [5.33, 60.39] } };
const VOSS = [stop('Voss stasjon', 900), stop('Voss skysstasjon', 950)];
async function run(scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, scheme }) => {
    const Real = Date;
    const t0 = Real.now(); const nå = () => now + (Real.now() - t0);
    class Pinned extends Real { constructor(...a) { super(...(a.length ? a : [nå()])); } static now() { return nå(); } }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.posForklart', '1');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.theme', scheme);
  }, { now: NOW, here: HERE, scheme });
  await page.route('**/geocoder/**', r => {
    const u = r.request().url();
    const f = /text=Vos/i.test(u) ? [ADR, ...VOSS] : NEARBY;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: f }) });
  });
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] }, trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Nonneseter', estimatedCalls: CALLS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(13000);
  const rute = () => page.evaluate(() => JSON.parse(localStorage.getItem('default::t.route') || 'null'));
  console.log(scheme, 'Rute før:', JSON.stringify(await rute()));
  await page.locator('.at-rad').first().click(); await page.waitForTimeout(1200);
  await page.locator('[data-sv-apne]').first().click(); await page.waitForTimeout(500);
  const valg = page.locator('[data-sv]'); console.log(scheme, 'avstigningsvalg:', await valg.count());
  await valg.last().click(); await page.waitForTimeout(500);
  await page.screenshot({ path: `scratchpad/shots/reis-detalj-${scheme}.png`, animations: 'disabled' });
  await page.locator('button', { hasText: 'reis →' }).first().click(); await page.waitForTimeout(1200);
  const r = await rute();
  console.log(scheme, 'Rute etter:', r && r.from, '→', r && r.to, r && r.key);
  await page.locator('#app-nav >> text=Rute').click().catch(() => {}); await page.waitForTimeout(1200);
  console.log(scheme, 'Rute-skjerm:', await page.evaluate(() => (document.getElementById('station-name')||{}).textContent + ' → ' + (document.getElementById('dir-dest')||{}).textContent));
  await page.screenshot({ path: `scratchpad/shots/reis-rute-${scheme}.png`, animations: 'disabled' });
  await ctx.close();
}
fs.mkdirSync('scratchpad/shots', { recursive: true });
await run('dark');
await browser.close(); server.close();
