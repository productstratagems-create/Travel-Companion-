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
const DIST = path.join(ROOT, 'dist'); const PORT = 4510;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 60.3180, lon: 5.3540 };   // Nesttun
const BRUKER = process.env.BORTE ? { lat: 60.3894 + 700 / 111320, lon: 5.3327 } : HERE;   // Bergen stasjon
const AWAY = { lat: HERE.lat - 637 / 111320, lon: HERE.lon };   // 637 m south, as on the screen

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + (1000 + [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 90000, 7)), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Nonneseter', 150), stop('Bergen stasjon', 400)];

const JBT = { name: 'Byparken', id: 'NSR:StopPlace:Byparken' };
const HEL = { name: 'Kronstad', id: 'NSR:StopPlace:Kronstad' };

/* Two directions from Mortensrud, as on the reported screen. Both reach
   Jernbanetorget; line 3 towards Kolsås leaves first. */
const call = (line, front, mins, stops, mode, cs, fra) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line, publicCode: '1', name: 'spor 1' },
  serviceJourney: { id: 'sj:' + line + ':' + mins, situations: [],
    line: { id: (cs || 'SKY:') + 'Line:' + line, publicCode: line, transportMode: mode || 'tram',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: (fra || {}).lat ?? HERE.lat, longitude: (fra || {}).lon ?? HERE.lon,
        stopPlace: { id: (fra || {}).id ?? 'NSR:StopPlace:Mortensrud', name: (fra || {}).name ?? 'Nonneseter', latitude: (fra || {}).lat ?? HERE.lat, longitude: (fra || {}).lon ?? HERE.lon } },
        aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000) },
      ...stops.map((s, i) => ({
        quay: { latitude: s.lat ?? 59.9 + i / 1000, longitude: s.lon ?? 10.75,
          stopPlace: { id: s.id, name: s.name, latitude: s.lat ?? 59.9 + i / 1000, longitude: s.lon ?? 10.75 } },
        aimedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        aimedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000) })),
    ] },
});
const SKU = { name: 'Danmarksplass', id: 'NSR:StopPlace:202', lat: 60.370, lon: 5.350 };
const BYP = { name: 'Byparken', id: 'NSR:StopPlace:203', lat: 60.3920, lon: 5.3240 };
const LAG = { name: 'Lagunen', id: 'NSR:StopPlace:204', lat: 60.2960, lon: 5.3270 };
const RÅD = { name: 'Råstølen', id: 'NSR:StopPlace:205', lat: 60.2800, lon: 5.3200 };
const _pl = (name, id, lat) => ({ name, latitude: lat, longitude: 5.33, quay: { id: 'NSR:Quay:' + id, stopPlace: { id: 'NSR:StopPlace:' + id } } });
const _leg = (mode, kode, fra, til, a, b) => ({ mode, expectedStartTime: iso(NOW + a * 60000), expectedEndTime: iso(NOW + b * 60000), fromPlace: fra, toPlace: til,
  serviceJourney: mode === 'foot' ? null : { id: 'sj:k' + kode, line: { id: 'SKY:Line:' + kode, publicCode: kode, transportMode: mode, presentation: { colour: 'e60000' } } },
  fromEstimatedCall: mode === 'foot' ? null : { expectedDepartureTime: iso(NOW + a * 60000), quay: { publicCode: '1' }, destinationDisplay: { frontText: til.name } },
  toEstimatedCall: mode === 'foot' ? null : { expectedArrivalTime: iso(NOW + b * 60000) } });
const _NON = _pl('Nesttun terminal', 101, 60.3180), _DAN = _pl('Danmarksplass', 102, 60.37), _TOR = _pl('Torgallmenningen', 103, 60.3925);
const KOMBI_TP = { duration: 1500, legs: [_leg('foot', '', { name: 'Ditt sted', latitude: 60.318, longitude: 5.354 }, _NON, 1, 3), _leg('tram', '1', _NON, _DAN, 3, 9), _leg('bus', '5', _DAN, _TOR, 12, 20)] };
const CALLS = [
  call('1', 'Byparken', 4, [SKU, BYP], 'tram'),
  call('1', 'Byparken', 14, [SKU, BYP], 'tram'),
  call('1', 'Lufthavnen', 7, [LAG, RÅD], 'tram'),
  call('1', 'Lufthavnen', 17, [LAG, RÅD], 'tram'),
];
const B = { id: NEARBY[1].properties.id, name: 'Bergen stasjon', lat: HERE.lat + 400 / 111320, lon: HERE.lon };
const BCALLS = [['5', 'Lagunen', 9], ['12', 'Råstølen', 11], ['20', 'Fana', 13], ['21', 'Kirkevoll', 15]].map(([l, f, m]) => call(l, f, m, [LAG, RÅD], 'bus', undefined, B));

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
    geolocation: { latitude: BRUKER.lat, longitude: BRUKER.lon }, permissions: ['geolocation'],
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
    localStorage.setItem('default::t.theme', scheme); localStorage.setItem('default::t.autoTavleRetning', 'alle'); window.__probe = 1;
  }, { now: NOW, here: BRUKER, scheme });
  await page.route('**/geocoder/**', r => {
    const u = r.request().url();
    const f = /text=Vos/i.test(u) ? [ADR, ...VOSS] : NEARBY;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: f }) });
  });
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] }, trip: { tripPatterns: [KOMBI_TP] } } }) });
    globalThis.__hent = (globalThis.__hent || 0) + 1;
    if (body.includes(B.id)) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: B.id, name: B.name, estimatedCalls: BCALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Nonneseter', estimatedCalls: CALLS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(13000);
  await page.waitForTimeout(6000);
  const les = () => page.evaluate(() => ({ over: (document.querySelector('#auto-where .set-label') || {}).textContent + ' ' + ((document.querySelector('#auto-where') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 60),
    henter: /henter avganger/.test((document.getElementById('auto-body') || {}).textContent || ''),
    knapper: [...document.querySelectorAll('#v-auto .at-retning button')].map(b => b.textContent.replace(/\s+/g, ' ').trim() + '@' + Math.round(b.getBoundingClientRect().top)).join(' | ') }));
  console.log(scheme, 'start:', JSON.stringify(await les()));
  const knapper = await page.locator('#v-auto .at-retning button').allTextContents();
  console.log(scheme, 'knapper:', knapper.join(' | '));
  const valg = page.locator('#v-auto .at-retning button').filter({ hasNotText: /^alle|sentrum|hjemover/ }).first();
  const h0 = globalThis.__hent;
  await valg.click();
  let tomt = 0; const sett = new Set();
  for (let i = 0; i < 25; i++) { const r = await les(); if (r.henter) tomt++; sett.add(r.knapper.replace(/@\d+/g, '')); if (i === 0 || i === 24) console.log(scheme, i * 100 + ' ms:', JSON.stringify(r)); await page.waitForTimeout(100); }
  console.log(scheme, 'etter trykk: hentinger', globalThis.__hent - h0, '| «henter avganger» i', tomt, 'av 25 prøver | ulike knappesett', sett.size);
  await page.screenshot({ path: `scratchpad/shots/hurtigvalgRo-${scheme}.png`, animations: 'disabled' });
  await ctx.close();
}
fs.mkdirSync('scratchpad/shots', { recursive: true });
await run('dark'); await run('light');
await browser.close(); server.close();
