/**
 * Auto-tavle til fots, steg 2 (v1.218.172).
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at rader fra et nabostopp du går BORT fra
 * får «bak deg» og havner under, at trykk på en slik rad tegner gangen dit på
 * kartet, og at tavla ikke viser «sitter du på …» mens du går.
 * Sporet bygges ved å flytte GPS-en sørover mens klokka går.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4651;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8300, lon: 10.8050 };
const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name, name, label: name, category: ['onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
// Hauketo litt SØR (foran deg), Lofsrud nord (bak deg — du går sørover).
const NEARBY = [stop('Hauketo', -200), stop('Lofsrud', 250)];
const call = (stopName, line, front, mins) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + stopName + line, publicCode: '1', name: '1' },
  serviceJourney: { id: 'sj:' + stopName + line + mins, situations: [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'bus', presentation: { colour: 'e60000' } },
    estimatedCalls: [
      { quay: { stopPlace: { id: 'NSR:StopPlace:' + stopName, name: stopName, latitude: HERE.lat, longitude: HERE.lon } }, expectedArrivalTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000) },
      { quay: { stopPlace: { id: 'NSR:StopPlace:Bøler', name: 'Bøler', latitude: HERE.lat - 200 / 111320, longitude: HERE.lon + 0.003 } }, expectedArrivalTime: iso(NOW + (mins + 6) * 60000), expectedDepartureTime: iso(NOW + (mins + 6) * 60000) },
      { quay: { stopPlace: { id: 'NSR:StopPlace:Jbt', name: front, latitude: 59.91, longitude: 10.75 } }, expectedArrivalTime: iso(NOW + (mins + 17) * 60000), expectedDepartureTime: iso(NOW + (mins + 17) * 60000) },
    ] },
});
function enc(pts, pr) { const f = 10 ** pr; let la = 0, lo = 0, o = '';
  const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  for (const [a, b] of pts) { const A = Math.round(a * f), B = Math.round(b * f); o += e(A - la) + e(B - lo); la = A; lo = B; } return o; }
const DL = 1 / 111320, DO = 1 / (111320 * Math.cos(HERE.lat * Math.PI / 180));
const RUTE = [[HERE.lat, HERE.lon], [HERE.lat - 100 * DL, HERE.lon], [HERE.lat - 100 * DL, HERE.lon + 40 * DO], [HERE.lat - 200 * DL, HERE.lon + 40 * DO], [HERE.lat - 200 * DL, HERE.lon]];
const CALLS = {
  Hauketo: [call('Hauketo', '73', 'Brenna', 0.5), call('Hauketo', '81', 'Fornebu', 15)],
  Lofsrud: [call('Lofsrud', '76', 'Jernbanetorget', 6), call('Lofsrud', '79', 'Grorud', 12)],
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const f = path.join(DIST, rel);
  if (!f.startsWith(DIST) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return void res.writeHead(404).end('x');
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise(r => server.listen(PORT, r));
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function run(scheme) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon, accuracy: 5 }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, scheme }) => {
    const Real = Date, t0 = Real.now();
    const nå = () => now + (Real.now() - t0) * 20;   // klokka går 20× fort, så sporet får fart
    class Pinned extends Real { constructor(...a) { super(...(a.length ? a : [nå()])); } static now() { return nå(); } }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.kartFokus', JSON.stringify({ autoTavle: 'vei' }));
  }, { now: NOW, scheme });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: NEARBY }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    const navn = /Lofsrud/.test(body) ? 'Lofsrud' : 'Hauketo';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { stopPlace: {
      id: 'NSR:StopPlace:' + navn, name: navn, situations: [], estimatedCalls: CALLS[navn] } } }) });
  });
  // To ruter som går hver sin vei rundt et kvartal, møtes i krysset 120 m sør, og skilles der.
  await page.route(/valhalla/, r => { const b = JSON.parse(r.request().postData() || '{}'); const til = (b.locations || [])[1] || {};
    const K = [HERE.lat - 120 * DL, HERE.lon];
    const nord = Math.random() < 0 ? 0 : (til.lon > HERE.lon ? 1 : -1);
    const vei = [[HERE.lat, HERE.lon], [HERE.lat - 60 * DL, HERE.lon + nord * 40 * DO], K, [til.lat, til.lon]];
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ trip: { legs: [{ shape: enc(vei, 6) }], summary: { length: 0.3 } } }) }); });
  await page.route(/tiles|open-meteo|overpass|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window._settAutoTavle && window._settAutoTavle(true));
  // Gå sørover: 6 m per steg.
  for (let i = 1; i <= 12; i++) {
    await ctx.setGeolocation({ latitude: HERE.lat - i * 1.4 / 111320, longitude: HERE.lon, accuracy: 5 });
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(3000);
  const rader = await page.evaluate(() => [...document.querySelectorAll('#auto-body .at-rad')].map(r => (r.closest('details') ? '[ikke] ' : '') + r.textContent.replace(/\s+/g, ' ').trim().slice(0, 110)));
  console.log('\n══ ' + scheme + ' ══'); rader.forEach(r => console.log('  ' + r));
  await page.screenshot({ path: 'scratchpad/veivalg-' + scheme + '.png' });
  console.log('  veivalg-merke: ' + await page.evaluate(() => !!document.querySelector('.veivalg-merke')));
  console.log('  kartlapper (synlige i auto-kartet): ' + JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('#auto-map .leaflet-tooltip-pane .map-label')].filter(e => !e.classList.contains('lapp-skjult')).map(e => e.textContent.trim()))));
  console.log('  walkDist: ' + await page.evaluate(() => localStorage.getItem('default::t.walkDist2')) + ' · homeLL ' + await page.evaluate(() => localStorage.getItem('default::t.homeLL')));
  const rad = page.locator('#auto-body .at-rad', { hasText: 'rekk den på' }).first();
  if (await rad.count()) { await rad.click(); await page.waitForTimeout(1200);
    console.log('  detaljer: ' + await page.evaluate(() => document.querySelector('#v-selected').innerText.replace(/\s+/g, ' ').slice(0, 260)));
    await page.screenshot({ path: 'scratchpad/altkart-detalj-' + scheme + '.png' }); }
  await ctx.close();
}
await run('light'); await run('dark');
await browser.close(); server.close();
