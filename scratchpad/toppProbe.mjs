/**
 * Kan siden skrolles — altså kan toppen gli bort?
 *
 * WHAT ONLY A BROWSER CAN SETTLE: «same place» is a pixel claim. The three
 * header idioms have different padding (.6rem on the board, .75rem on the
 * rest), and «Utforsk» builds its own in JS — so the only way to know is to
 * navigate to every screen and read the button's centre in viewport
 * coordinates.
 *
 * It also measures the two things that would quietly undo the change: that
 * opening the menu does not push the page down (it used to, inside the
 * board), and that «del denne tavla» is on the board and nowhere else.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4579;
const NOW = Date.parse('2026-09-21T08:00:00+02:00');
const HERE = { id: 'NSR:StopPlace:6021', name: 'Ryen', lat: 59.8944, lon: 10.8133 };

/* TWELVE departures. With an empty board nothing can overflow, and the first
   cut of this probe reported «0 px» on every screen — a fixture measuring its
   own absence, which is the instrument error this codebase has made six
   times. */
const DEST = { name: 'Oslo S', lat: 59.9106, lon: 10.7527 };
const TRIPS = Array.from({ length: 12 }, (_, n) => {
  const start = NOW + (5 + n * 9) * 60000, end = start + 14 * 60000;
  const t = ms => new Date(ms).toISOString();
  return { duration: 840, legs: [{
    mode: 'metro',
    aimedStartTime: t(start), expectedStartTime: t(start),
    aimedEndTime: t(end), expectedEndTime: t(end),
    fromPlace: { name: HERE.name, latitude: HERE.lat, longitude: HERE.lon },
    toPlace: { name: DEST.name, latitude: DEST.lat, longitude: DEST.lon },
    fromEstimatedCall: { expectedDepartureTime: t(start), aimedDepartureTime: t(start),
      realtime: true, cancellation: false, quay: { publicCode: '1' },
      destinationDisplay: { frontText: 'Oslo S' } },
    toEstimatedCall: { expectedArrivalTime: t(end), aimedArrivalTime: t(end), quay: { publicCode: '2' } },
    serviceJourney: { id: 'sj' + n, situations: [],
      line: { id: 'RUT:Line:3', publicCode: '3', presentation: { colour: 'e60000' } },
      estimatedCalls: [] },
    situations: [] }] };
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

async function open(dark) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 600 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', 'system');
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: 'Ryen', to: 'Oslo S',
      stopId: here.id, toStopId: 'NSR:StopPlace:337', geo: 'Ryen', toGeo: 'Oslo S',
    }));
    localStorage.setItem('default::t.dir', '2');
  }, { now: NOW, here: HERE });

  await page.route('**/journey-planner/**', r => r.fulfill({ status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
      trip: { tripPatterns: [] } } }) }));
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name, name: HERE.name,
      category: ['metroStation'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility|realtime/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

/**
 * WHAT CAN ACTUALLY BE MEASURED HERE. Playwright has no collapsing address
 * bar, so `dvh` and `vh` are the same number in this browser — the reported
 * symptom cannot be reproduced. What CAN be answered is the thing underneath
 * it: is the document taller than the visible area, so that the top can
 * slide away the moment real chrome takes its share?
 *
 * The viewport is deliberately short (600 px), so a screen that can overflow
 * does.
 */
const scrollable = page => page.evaluate(() => {
  const d = document.documentElement;
  const over = d.scrollHeight - d.clientHeight;
  // Try to scroll, then read where the first heading ended up.
  window.scrollTo(0, 400);
  const y = window.scrollY;
  const hdr = document.querySelector(
    '#v-board:not([style*="display: none"]) .board-header-slim,'
    + ' #v-auto:not([style*="display: none"]) .screen-header,'
    + ' #v-saved:not([style*="display: none"]) .screen-header,'
    + ' #v-leisure:not([style*="display: none"]) .lei-header');
  const top = hdr ? Math.round(hdr.getBoundingClientRect().top) : null;
  window.scrollTo(0, 0);
  return { over: Math.max(0, over), scrolled: Math.round(y), top };
});

const SCREENS = [
  ['tavla', 'v-board'], ['auto-reise', 'v-auto'],
  ['lagret', 'v-saved'], ['utforsk', 'v-leisure'],
];
const goTo = (p, view) => p.click(`.app-nav-btn[data-view="${view}"]`);

for (const dark of [true]) {
  const { ctx, page } = await open(dark);
  console.log('\n══ 390x600 ══');
  console.log('   NB: denne prøven KAN IKKE verifisere rettelsen. Playwright har');
  console.log('   ingen adressefelt som folder seg sammen, så 100vh og 100dvh er');
  console.log('   samme tall her. Den viser bare at ingen skjerm overflyter av seg');
  console.log('   selv — det egentlige beviset er kildevakten og telefonen din.');
  for (const [navn, view] of SCREENS) {
    try { await goTo(page, view); } catch { continue; }
    await page.waitForTimeout(450);
    const r = await scrollable(page);
    console.log(`   ${navn.padEnd(12)} kan skrolle ${String(r.over).padStart(4)} px`
      + `  · skrollet ${String(r.scrolled).padStart(4)} px`
      + `  · overskrift havnet på y=${r.top}`
      + (r.top !== null && r.top < 0 ? '  ⚠ UNDER TOPPEN' : ''));
  }
  await page.screenshot({ path: 'scratchpad/topp-auto.png' });
  await ctx.close();
}

await browser.close();
server.close();
