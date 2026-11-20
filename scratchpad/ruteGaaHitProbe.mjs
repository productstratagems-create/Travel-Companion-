/**
 * Beste holdeplass i Rute (v1.218.173).
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at knappen står under overskriften uten
 * å skyve tavla ut av syne, at kortet sier «bedre herfra: Lofsrud», at gangen
 * tegnes på kartet, og at fra-stoppet står til du trykker «bruk dette stoppet».
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4613;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8300, lon: 10.8050 };
const stop = (name, m) => ({ properties: { id: 'NSR:StopPlace:' + name, name, label: name, category: ['onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] } });
const NEARBY = [stop('Hauketo', -60), stop('Lofsrud', 300)];
const RÅD = { tripPatterns: [{ legs: [
  { mode: 'foot', expectedStartTime: iso(NOW), expectedEndTime: iso(NOW + 4 * 60000), pointsOnLink: { length: 300, points: null } },
  { mode: 'bus', expectedStartTime: iso(NOW + 6 * 60000), expectedEndTime: iso(NOW + 26 * 60000),
    fromPlace: { name: 'Lofsrud', latitude: HERE.lat + 300 / 111320, longitude: HERE.lon, quay: { stopPlace: { id: 'NSR:StopPlace:Lofsrud' } } },
    fromEstimatedCall: { quay: { publicCode: 'A' }, destinationDisplay: { frontText: 'Jernbanetorget' } },
    serviceJourney: { line: { publicCode: '76', presentation: { colour: 'e60000' } } } },
] }] };
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
  await page.addInitScript(({ now, scheme, here }) => {
    const Real = Date;
    class Pinned extends Real { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.landing', 'board');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.route', JSON.stringify({ key: 'custom-out', from: 'Hauketo', stopId: 'NSR:StopPlace:Hauketo',
      to: 'Jernbanetorget', toStopId: 'NSR:StopPlace:Jernbanetorget', filter: null, line: null, geo: null, toGeo: null }));
  }, { now: NOW, scheme, here: HERE });
  let rådSøk = 0;
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: NEARBY }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(') && body.includes('from:{coordinates') && !body.includes('directMode')) {
      rådSøk++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { trip: RÅD } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);
  const les = () => page.evaluate(() => {
    const el = document.getElementById('rute-gaahit');
    const r = JSON.parse(localStorage.getItem('default::t.route') || 'null');
    return { synlig: el && el.style.display !== 'none', tekst: el ? el.textContent.replace(/\s+/g, ' ').trim() : null,
      fra: r && r.from, bunn: el ? Math.round(el.getBoundingClientRect().bottom) : null,
      stier: document.querySelectorAll('#board-map path, .leaflet-overlay-pane path').length };
  });
  console.log('\n══ ' + scheme + ' ══');
  console.log('  før trykk:', JSON.stringify(await les()), 'rådsøk:', rådSøk);
  const knapp = page.locator('#rute-gaahit .rute-gaa-be');
  if (!(await knapp.count())) { console.log('  ! ingen knapp'); await page.screenshot({ path: 'scratchpad/rutegaa-' + scheme + '.png' }); await ctx.close(); return; }
  await knapp.click(); await page.waitForTimeout(1500);
  console.log('  etter trykk:', JSON.stringify(await les()), 'rådsøk:', rådSøk);
  await page.screenshot({ path: 'scratchpad/rutegaa-' + scheme + '.png' });
  const bruk = page.locator('#rute-gaahit .rute-gaa-bruk');
  if (await bruk.count()) { await bruk.click(); await page.waitForTimeout(1500); console.log('  etter «bruk»:', JSON.stringify(await les())); }
  await ctx.close();
}
await run('light'); await run('dark');
await browser.close(); server.close();
