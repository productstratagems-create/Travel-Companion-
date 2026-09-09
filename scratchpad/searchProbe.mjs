/**
 * Can you look up a stop in a city you are not standing in?
 *
 * Reported after v1.96.0: «Finner ikke stopp i Bergen», typed from Oslo. The
 * suggestion list dropped every feature more than 80 km from the reader —
 * first measured from Oslo S, then from the reader, and both did the same
 * damage: Bergen is 306 km away, and 306 km is the journey, not a mistake.
 *
 * Drives the real settings screen with a mocked geocoder that answers with
 * Bergen stops, and reads the suggestion list out of the DOM.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4503;
const NOW = Date.parse('2026-09-10T08:00:00+02:00');
const OSLO = { lat: 59.9139, lon: 10.7522 };

/* What the geocoder answers for "Nonneseter" — all of it in Bergen. */
const FEATURES = [
  { properties: { id: 'NSR:StopPlace:Nonneseter', name: 'Nonneseter', label: 'Nonneseter, Bergen',
    category: ['tramStop', 'onstreetBus'] }, geometry: { coordinates: [5.3327, 60.3894] } },
  { properties: { id: 'NSR:StopPlace:Bystasjonen', name: 'Bergen busstasjon',
    label: 'Bergen busstasjon', category: ['StopPlace'] }, geometry: { coordinates: [5.3330, 60.3890] } },
  { properties: { id: 'NSR:StopPlace:Strandkaien', name: 'Strandkaiterminalen',
    label: 'Strandkaiterminalen', category: ['ferryStop'] }, geometry: { coordinates: [5.3180, 60.3960] } },
];

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

async function run(scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, oslo }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.weekendMode', '0');
    // The reader is in Oslo. That is the whole point.
    localStorage.setItem('default::t.homeLL', JSON.stringify(oslo));
  }, { now: NOW, oslo: OSLO });

  let focusSent = null;
  await page.route('**/geocoder/**', route => {
    const u = new URL(route.request().url());
    if (u.pathname.includes('autocomplete')) {
      focusSent = u.searchParams.get('focus.point.lat') + ',' + u.searchParams.get('focus.point.lon');
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ features: FEATURES }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) });
  });
  await page.route('**/journey-planner/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { estimatedCalls: [] }, trip: { tripPatterns: [] } } }) }));
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);

  // Open the route form. The ⋯ menu is the reader's way in; drive the same
  // door the menu drives when the button ids differ between builds.
  // The station name in the header is the reader's door into the route form.
  await page.click('#station-name-btn');
  await page.waitForTimeout(1000);
  const shown = await page.evaluate(() => {
    const el = document.getElementById('v-settings');
    return { display: el && el.style.display, dep: !!document.getElementById('set-dep') };
  });
  console.log('  skjema      :', JSON.stringify(shown));
  const box = await page.$('#set-dep');
  if (!box) { console.log('  fant ikke skjemaet'); await ctx.close(); return; }
  await box.click();
  await box.type('Nonneseter', { delay: 40 });
  await page.waitForTimeout(1200);

  const sugg = await page.$$eval('.stop-sugg button', els => els.map(e => e.textContent.replace(/\s+/g, ' ').trim()));
  console.log('\n══ ' + scheme + ' ══');
  console.log('  du står i    : Oslo (' + OSLO.lat + ', ' + OSLO.lon + ')');
  console.log('  fokus sendt  :', focusSent);
  console.log('  forslag      :', sugg.length ? sugg.join(' · ') : '(ingen)');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/search-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}

await run('dark');
await run('light');
await browser.close(); server.close();
