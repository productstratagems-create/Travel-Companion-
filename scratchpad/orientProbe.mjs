/**
 * Does the orientation screen actually orient you?
 *
 * auto-reise is where the app answers «where am I, where is the stop, how do
 * I get there, which departures matter». It answered the first three in text
 * — «du er ved Mortensrud T», «369 m» — and had no Leaflet import at all.
 *
 * The numbers can all be right and the screen still read worse: a 140px map
 * band that pushes the departures off the fold has traded one half of the
 * vision for the other. THAT IS DECIDED BY LOOKING, and by counting how many
 * direction rows survive above the fold. So this measures both.
 *
 * The reader stands 369 m from Mortensrud T — the distance from the reported
 * screenshot — with a 5 min walk. Departures at 2, 12 and 22 minutes: the
 * first is one they cannot make, and that is the whole point.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4507;
/* The clock is pinned so the departures are stable, but it must agree with
   the browser's real clock: the geolocation mock stamps pos.timestamp from
   the REAL clock, and posAgeMins compares that against Date.now(). Pinning
   them apart made the heading read «posisjon 24 min gammel» — an artifact of
   the probe, not of the app. */
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

/* You, and the stop you are walking to. ~369 m apart. */
const ME   = { lat: 59.8617, lon: 10.8285 };
const STOP = { lat: 59.8650, lon: 10.8285 };

const mk = (name, lat, lon, cats) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name, category: cats },
  geometry: { coordinates: [lon, lat] },
});
const STOPS = [
  mk('Mortensrud T', STOP.lat, STOP.lon, ['metroStation']),     // ~369 m
  mk('Lofsrudveien', 59.8672, 10.8330, ['onstreetBus']),        // further
  mk('Bjørnholt skole', 59.8690, 10.8360, ['onstreetBus']),     // further still
];

const dep = (front, mins, code, mode, colour) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + code, publicCode: code, name: 'Spor ' + code },
  serviceJourney: { id: 'sj:' + front + mins, situations: [],
    line: { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode,
      presentation: { colour } },
    estimatedCalls: [{ quay: { latitude: 59.88, longitude: 10.82,
      stopPlace: { id: 'NSR:StopPlace:Ryen', name: 'Ryen', latitude: 59.88, longitude: 10.82 } },
      aimedArrivalTime: iso(NOW + (mins + 7) * 60000), expectedArrivalTime: iso(NOW + (mins + 7) * 60000),
      aimedDepartureTime: iso(NOW + (mins + 7) * 60000), expectedDepartureTime: iso(NOW + (mins + 7) * 60000) }] },
});
/* 2 minutes is unreachable on a 5 minute walk; 12 and 22 are not. */
const CALLS = [
  dep('Stortinget', 2, '3', 'metro', 'f5a000'),
  dep('Stortinget', 12, '3', 'metro', 'f5a000'),
  dep('Stortinget', 22, '3', 'metro', 'f5a000'),
  dep('Helsfyr', 6, '70', 'bus', 'e60000'),
  dep('Helsfyr', 26, '70', 'bus', 'e60000'),
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
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: ME.lat, longitude: ME.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, me, scheme }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.landing', 'auto');
    localStorage.setItem('default::t.homeLL', JSON.stringify(me));
    // The app reads its theme from storage, not from prefers-color-scheme —
    // DEFAULT_THEME is 'dark' and the inline boot script stamps it. Setting
    // colorScheme on the context alone left the "light" run rendering dark.
    localStorage.setItem('default::t.theme', scheme);
  }, { now: NOW, me: ME, scheme });

  let valhalla = 0, enturFoot = 0;
  await page.route('**/geocoder/**', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ features: STOPS }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('directMode:foot') || body.includes('directMode: foot')) {
      enturFoot++;
      // A route that bends around the block, so it is visibly not the crow line.
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { trip: { tripPatterns: [{ legs: [{
          pointsOnLink: { points: '', length: 470 } }] }] } } }) });
    }
    if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Mortensrud T', estimatedCalls: CALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route(/valhalla/, r => { valhalla++; return r.abort(); });
  await page.route(/open-meteo|overpass|geoapify|mobility/, r => r.abort());
  await page.route(/tiles|basemaps|stadiamaps/, r => r.fulfill({ status: 200,
    contentType: 'image/png', body: Buffer.alloc(0) }));
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#v-auto .auto-stop', { timeout: 15000 });
  await page.waitForTimeout(5000);

  console.log(`\n══ ${scheme.toUpperCase()} ══`);

  const head = await page.$eval('#v-auto .auto-stop', e => e.textContent.replace(/\s+/g, ' ').trim());
  console.log('  overskrift   :', head);

  const hasMap = await page.$eval('#auto-map-wrap', e => getComputedStyle(e).display !== 'none').catch(() => false);
  const mapBox = await page.$eval('#auto-map', e => { const r = e.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width) }; }).catch(() => null);
  console.log('  kartbånd     :', hasMap ? `synlig ${mapBox.w}×${mapBox.h}` : 'SKJULT');

  // What is actually drawn on it.
  const layers = await page.evaluate(() => {
    const el = document.querySelector('#auto-map');
    if (!el) return null;
    return {
      markers: el.querySelectorAll('.leaflet-marker-icon').length,
      dots: el.querySelectorAll('path.leaflet-interactive').length,
      lines: el.querySelectorAll('svg path[stroke-dasharray]').length,
    };
  });
  console.log('  på kartet    :', JSON.stringify(layers));

  // WHERE the things are, not just how many. The screenshot showed the stop
  // marker missing entirely with the walk line running off the top edge.
  const geom = await page.evaluate(() => {
    const el = document.querySelector('#auto-map');
    const box = el.getBoundingClientRect();
    const inside = (r) => r.top >= box.top - 1 && r.bottom <= box.bottom + 1
                       && r.left >= box.left - 1 && r.right <= box.right + 1;
    return {
      boks: { w: Math.round(box.width), h: Math.round(box.height) },
      nåler: Array.from(el.querySelectorAll('.leaflet-marker-icon')).map(m => {
        const r = m.getBoundingClientRect();
        return { y: Math.round(r.top - box.top), x: Math.round(r.left - box.left), innenfor: inside(r) };
      }),
      prikk: Array.from(el.querySelectorAll('path.leaflet-interactive')).map(m => {
        const r = m.getBoundingClientRect();
        return { y: Math.round(r.top - box.top), x: Math.round(r.left - box.left), innenfor: inside(r) };
      }),
    };
  });
  console.log('  geometri     :', JSON.stringify(geom));

  // The reach marks — the whole reason the walk is surfaced.
  const rows = await page.$$eval('#v-auto .auto-dir', els => els.map(e => ({
    mot: e.querySelector('.nearby-name').textContent.trim(),
    tider: Array.from(e.querySelectorAll('.nearby-dist span'))
      .filter(s => !s.classList.contains('auto-t-more'))
      .map(s => s.textContent.trim() + ' <' +
        (['r-ok', 'r-soon', 'r-now', 'missed'].find(c => s.classList.contains(c)) || 'umerket') + '>')
      .join('  '),
  })));
  console.log('  ── radene ──');
  rows.forEach(r => console.log(`    ${r.mot.padEnd(18)} ${r.tider}`));

  // How much of the screen the departures still get. This is the trade the
  // band makes, and it is the one that can only be settled by measuring.
  const fold = await page.evaluate(() => {
    const h = window.innerHeight;
    return Array.from(document.querySelectorAll('#v-auto .auto-dir'))
      .filter(e => e.getBoundingClientRect().top < h).length;
  });
  console.log('  retningsrader over falsen:', fold, 'av', rows.length);

  // The ladder is Valhalla → Entur foot → cord. One attempt at each rung is
  // correct; more than one of EITHER over five seconds would be the key guard
  // failing, and the screen redraws every second.
  // ONE MAP, not one a second. The screen redraws at 1 Hz; a Leaflet instance
  // torn down and rebuilt on every tick would churn tiles and lose the frame.
  const paneCount = () => page.evaluate(() => document.querySelectorAll('#auto-map .leaflet-map-pane').length);
  const panesFirst = await paneCount();
  await page.waitForTimeout(6000);
  console.log('  kart-instanser: ', panesFirst, '→', await paneCount(), 'etter 6 s (skal være 1 → 1)');

  console.log('  gangrute: valhalla-forsøk', valhalla, '· entur-foot', enturFoot,
    '(1 av hver = stigen, ikke ett per sekund)');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/orient-${scheme}.png`, animations: 'disabled' });
  await page.screenshot({ path: `scratchpad/shots/orient-${scheme}-full.png`, fullPage: true, animations: 'disabled' });

  // Tapping a stop on the map must do exactly what tapping the row does.
  const before = await page.$eval('#v-auto .auto-stop-name', e => e.textContent.trim());
  await page.evaluate(() => document.querySelector('#auto-map').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  // The primary stop is drawn first; an ALTERNATIVE is what must be tappable.
  const pins = await page.$$('#auto-map .leaflet-marker-icon');
  const pin = pins[1] || pins[0];
  if (pin) {
    await pin.click({ force: true }).catch(e => console.log('  (klikk:', e.message.split('\n')[0], ')'));
    await page.waitForTimeout(1200);
    const after = await page.$eval('#v-auto .auto-stop-name', e => e.textContent.trim());
    console.log(`  trykk på kartnål: «${before}» → «${after}»`);
  } else {
    console.log('  trykk på kartnål: INGEN NÅL Å TRYKKE PÅ');
  }

  await ctx.close();
}

await run('dark');
await run('light');
await browser.close();
server.close();
console.log('\nSkjermbilder: scratchpad/shots/orient-*.png\n');
