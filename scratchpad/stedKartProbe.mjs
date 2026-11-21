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
const DIST = path.join(ROOT, 'dist'); const PORT = 4643;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8300, lon: 10.8050 };
const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name, name, label: name, category: ['onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
// Hauketo litt SØR (foran deg), Lofsrud nord (bak deg — du går sørover).
const NEARBY = [stop('Hauketo', -60), stop('Lofsrud', 250)];
const call = (stopName, line, front, mins) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + stopName + line, publicCode: '1', name: '1' },
  serviceJourney: { id: 'sj:' + stopName + line + mins, situations: [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'bus', presentation: { colour: 'e60000' } },
    estimatedCalls: [] },
});
const CALLS = {
  Hauketo: [call('Hauketo', '73', 'Brenna', 9), call('Hauketo', '81', 'Fornebu', 15)],
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

async function run(scheme, acc = 5) {
  const ctx = await browser.newContext({ viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon, accuracy: acc }, permissions: ['geolocation'] });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, scheme }) => {
    const Real = Date, t0 = Real.now();
    const nå = () => now + (Real.now() - t0) * 20;   // klokka går 20× fort, så sporet får fart
    class Pinned extends Real { constructor(...a) { super(...(a.length ? a : [nå()])); } static now() { return nå(); } }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '1');
  }, { now: NOW, scheme });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: NEARBY }) }));
  // Spesifikk etter generell: Playwright prøver den sist registrerte først.
  await page.route(/geocoder\/v1\/reverse.*layers=address/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [{ properties: { name: (Number(new URL(r.request().url()).searchParams.get('point.lat')) > HERE.lat + 0.0005 ? 'Lofsrudhøgda 3' : 'Stenbråtveien 14') }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    const navn = /Lofsrud/.test(body) ? 'Lofsrud' : 'Hauketo';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { stopPlace: {
      id: 'NSR:StopPlace:' + navn, name: navn, situations: [], estimatedCalls: CALLS[navn] } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('console', m => { if (/stedkart/.test(m.text())) console.log('  [k] ' + m.text()); }); page.on('pageerror', e => console.log('  ! sidefeil:', e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);
  await page.evaluate(() => window._settAutoTavle && window._settAutoTavle(true));
  await page.waitForTimeout(3000);
  const linje = () => page.evaluate(() => (document.getElementById('auto-her') || {}).innerText.replace(/\s+/g, ' ').trim());
  const overskrift = () => page.evaluate(() => (document.querySelector('#auto-where .set-label') || {}).textContent);
  console.log('\n══ ' + scheme + ' ±' + acc + ' ══');
  console.log('  linje: ' + await linje() + ' | overskrift: ' + await overskrift());
  await page.screenshot({ path: 'scratchpad/her-' + scheme + '-' + acc + '.png' });
  if (acc > 100) { await ctx.close(); return; }
  await page.locator('#auto-her [data-her="velg"]').click(); await page.waitForTimeout(1200);
  const adr = () => page.evaluate(() => (document.querySelector('.stedkart-adr') || {}).textContent);
  console.log('  chips: ' + await page.evaluate(() => [...document.querySelectorAll('.stedkart-chip')].map(e => e.textContent).join(',')) + ' · nål-midt: ' + await page.evaluate(() => { const k = document.querySelector('.stedkart-kart').getBoundingClientRect(); const n = document.querySelector('.stedkart-nal span').getBoundingClientRect(); return Math.round(n.left + n.width / 2 - (k.left + k.width / 2)) + ',' + Math.round(n.bottom - (k.top + k.height / 2)); }));
  console.log('  kart åpnet: ' + await page.evaluate(() => !!document.querySelector('.stedkart')) + ' · under nåla: ' + await adr());
  await page.screenshot({ path: 'scratchpad/stedkart-' + scheme + '.png' });
  // Dra kartet nedover (nåla havner nord for der den sto).
  const b = await page.locator('.stedkart-kart').boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + 160, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(1500);
  console.log('  etter dra: ' + await adr());
  await page.screenshot({ path: 'scratchpad/stedkart-dratt-' + scheme + '.png' });
  await page.locator('.stedkart-ok').click(); await page.waitForTimeout(2500);
  console.log('  bekreftet: ' + await linje() + ' | kart lukket: ' + await page.evaluate(() => !document.querySelector('.stedkart')));
  await page.locator('#auto-her [data-her="gps"]').first().click(); await page.waitForTimeout(2000);
  console.log('  gps igjen: ' + await linje());
  await ctx.close();
}
await run('light'); await run('dark'); await run('light', 150);
await browser.close(); server.close();
