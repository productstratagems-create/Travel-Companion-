/**
 * Does the map follow the list into the line?
 *
 * Reported with a screenshot: «Når bruker har klikket seg inn på en linje som
 * på bildet, så burde kartet gjenspeile listen.» The list had moved on to the
 * stops ahead — Skullerud 3, Bogerud 5, Bøler 7, … — while the band still
 * showed the neighbourhood around Mortensrud.
 *
 * The cause is one line: mapKey did not carry the open direction, so the guard
 * in _renderMap matched and the function returned BEFORE clearLayers(). The
 * map had been told nothing had changed.
 *
 * This drives the real screen and measures the thing that cannot be unit
 * tested: an 11 km line inside a 140px band. If the stops end up a handful of
 * pixels apart they are noise drawn «because they are in the list», and the
 * only way to know is to measure the gap and look at the picture.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4511;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

/* Mortensrud, and line 3 west toward Stortinget — the reported screen. The
   coordinates are the real ones, so the 11 km span is the real span. */
/* 300 m short of the platform, ON PURPOSE: inside AT_STOP_M the app advances
   into a direction by itself at startup (v1.101.0), and then there is no tap
   left to drive. This is the reader walking towards Mortensrud. */
const ME   = { lat: 59.8590, lon: 10.8285 };
const HOME = { lat: 59.8590, lon: 10.8285 };

const LINE3 = [
  ['Mortensrud',     59.8617, 10.8285],
  ['Skullerud',      59.8644, 10.8250],
  ['Bogerud',        59.8710, 10.8280],
  ['Bøler',          59.8790, 10.8300],
  ['Ulsrud',         59.8850, 10.8330],
  ['Oppsal',         59.8900, 10.8350],
  ['Skøyenåsen',     59.8950, 10.8280],
  ['Godlia',         59.9000, 10.8200],
  ['Hellerud',       59.9080, 10.8180],
  ['Brynseng',       59.9130, 10.8100],
  ['Helsfyr',        59.9160, 10.7950],
  ['Ensjø',          59.9150, 10.7830],
  ['Tøyen',          59.9160, 10.7700],
  ['Grønland',       59.9130, 10.7620],
  ['Jernbanetorget', 59.9115, 10.7500],
];

const mk = (name, lat, lon, cats) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name, category: cats },
  geometry: { coordinates: [lon, lat] },
});
const STOPS = [
  mk('Mortensrud', 59.8617, 10.8285, ['metroStation']),
  mk('Lofsrudveien', 59.8625, 10.8330, ['onstreetBus']),
  mk('Bjørnholt skole', 59.8640, 10.8360, ['onstreetBus']),
];

/* The stops along the line, as estimatedCalls with real coordinates. */
const callsFor = (from) => LINE3.map(([name, lat, lon], i) => ({
  quay: { latitude: lat, longitude: lon,
    stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, latitude: lat, longitude: lon } },
  aimedArrivalTime: iso(NOW + (from + i * 2) * 60000),
  expectedArrivalTime: iso(NOW + (from + i * 2) * 60000),
  aimedDepartureTime: iso(NOW + (from + i * 2) * 60000),
  expectedDepartureTime: iso(NOW + (from + i * 2) * 60000),
}));

const dep = (front, mins, code, mode, colour) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + code, publicCode: String(code), name: 'Spor ' + code },
  serviceJourney: { id: 'sj:' + front + mins, situations: [],
    line: { id: 'RUT:Line:' + code, publicCode: String(code), transportMode: mode,
      presentation: { colour } },
    estimatedCalls: callsFor(mins) },
});
const CALLS = [
  dep('Stortinget', 3, 3, 'metro', 'f5a000'),
  dep('Stortinget', 18, 3, 'metro', 'f5a000'),
  dep('Kolsås', 9, 3, 'metro', 'f5a000'),
  dep('Bjørndal', 6, 71, 'bus', 'e60000'),
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

/** Everything drawn on the band, with where it actually sits. */
const readMap = (page) => page.evaluate(() => {
  const el = document.querySelector('#auto-map');
  if (!el) return null;
  const box = el.getBoundingClientRect();
  const pt = (r) => ({ x: Math.round(r.left - box.left + r.width / 2),
                       y: Math.round(r.top - box.top + r.height / 2) });
  const markers = Array.from(el.querySelectorAll('.leaflet-marker-icon')).map(m => pt(m.getBoundingClientRect()));
  const dots = Array.from(el.querySelectorAll('path.leaflet-interactive')).map(m => pt(m.getBoundingClientRect()));
  const paths = Array.from(el.querySelectorAll('svg path'))
    .map(p => p.getAttribute('d') || '')
    .filter(d => (d.match(/L/g) || []).length >= 2);
  // THE LINE'S OWN VERTICES, IN ORDER. A first version measured gaps between
  // DOM-adjacent markers, which are not spatially adjacent — the number it
  // produced (9px) described nothing. The polyline's path is the stop chain
  // in travel order, which is exactly what «are the beads touching» is about.
  const verts = (d) => (d.match(/[ML]\s*(-?[\d.]+)[, ](-?[\d.]+)/g) || []).map(m => {
    const n = m.match(/(-?[\d.]+)[, ](-?[\d.]+)/);
    return { x: Math.round(+n[1]), y: Math.round(+n[2]) };
  });
  const lineVerts = paths.length ? verts(paths[paths.length - 1]) : [];
  return { markers, dots, polys: paths.length, lineVerts,
    box: { w: Math.round(box.width), h: Math.round(box.height) } };
});

async function run(scheme, width) {
  const W = width || 390;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: ME.lat, longitude: ME.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, home, scheme }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.landing', 'auto');
    localStorage.setItem('default::t.homeLL', JSON.stringify(home));
    localStorage.setItem('default::t.theme', scheme);
    // A history that makes Jernbanetorget a «ofte brukt» shortcut, so the map
    // can be checked for marking what the list marks.
    localStorage.setItem('default::t.freqArr', JSON.stringify(
      [{ name: 'Jernbanetorget', stopId: 'NSR:StopPlace:Jernbanetorget', n: 12, last: now }]));
  }, { now: NOW, home: HOME, scheme });

  let fetches = 0;
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ features: STOPS }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    fetches++;
    if (body.includes('directMode:foot') || body.includes('directMode: foot')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { trip: { tripPatterns: [{ legs: [{ pointsOnLink: { points: '', length: 200 } }] }] } } }) });
    }
    if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Mortensrud', estimatedCalls: CALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route(/valhalla|open-meteo|overpass|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  await page.waitForSelector('#v-auto .auto-dir', { timeout: 10000 });

  console.log(`\n══ ${scheme.toUpperCase()} · ${W} px ══`);

  const before = await readMap(page);
  console.log('  FØR (orientering):', before.markers.length, 'nåler ·', before.dots.length,
    'prikker ·', before.polys, 'linjer');
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/linje-${scheme}-${W}-for.png`, animations: 'disabled' });

  // Open «3 mot Stortinget» exactly as the reader does.
  const rows = await page.$$eval('#auto-body .auto-dir .nearby-name', e => e.map(x => x.textContent.trim()));
  const idx = rows.findIndex(t => /Stortinget/.test(t));
  await page.$$eval('#auto-body .auto-dir', (els, i) => els[i].click(), idx);
  await page.waitForTimeout(2500);

  const after = await readMap(page);
  console.log('  ETTER (linja)    :', after.markers.length, 'nåler ·', after.dots.length,
    'prikker ·', after.polys, 'linjer');
  const listet = await page.$$eval('#auto-body .auto-stop-btn .nearby-name', e => e.map(x => x.textContent.trim()));
  console.log('  stopp i lista    :', listet.length, '→', listet.slice(0, 4).join(', '), '…', listet[listet.length - 1]);

  // THE MEASUREMENT THAT DECIDES THE DESIGN: how far apart do the stops sit?
  const v = after.lineVerts;
  const gaps = [];
  for (let i = 1; i < v.length; i++) {
    gaps.push(Math.round(Math.hypot(v[i].x - v[i - 1].x, v[i].y - v[i - 1].y)));
  }
  gaps.sort((a, b) => a - b);
  const inside = after.markers.filter(p => p.x >= 0 && p.y >= 0 && p.x <= after.box.w && p.y <= after.box.h);
  console.log('  linjas knekkpunkt:', v.length, '· n\u00e5ler innenfor b\u00e5ndet:', inside.length, 'av', after.markers.length);
  console.log('  avstand langs linja px: min', gaps[0], '\u00b7 median', gaps[Math.floor(gaps.length / 2)],
    '\u00b7 maks', gaps[gaps.length - 1], '(terskel 21)');
  console.log('  kartet endret seg:', JSON.stringify(before) !== JSON.stringify(after));

  await page.screenshot({ path: `scratchpad/shots/linje-${scheme}-${W}-etter.png`, animations: 'disabled' });

  // A tap on the map must POINT, not choose: the screen must stay on v-auto.
  const nails = await page.$$('#auto-map .leaflet-marker-icon');
  if (nails.length) {
    await nails[nails.length - 1].click({ force: true }).catch(() => {});
    await page.waitForTimeout(1200);
    const view = await page.evaluate(() => {
      const v = Array.from(document.querySelectorAll('[id^="v-"]')).find(e => e.style.display !== 'none');
      return { skjerm: v && v.id,
        markert: Array.from(document.querySelectorAll('#auto-body .auto-stop-btn.picked'))
          .map(e => e.querySelector('.nearby-name').textContent.trim()) };
    });
    console.log('  etter kartrykk   : skjerm', view.skjerm, '· markert', JSON.stringify(view.markert));
  }

  // One map, no new requests, over ten seconds of 1 Hz rendering.
  const f0 = fetches;
  const panes0 = await page.evaluate(() => document.querySelectorAll('#auto-map .leaflet-map-pane').length);
  await page.waitForTimeout(10000);
  const panes1 = await page.evaluate(() => document.querySelectorAll('#auto-map .leaflet-map-pane').length);
  console.log('  over 10 s        : kart', panes0, '→', panes1, '· nye kall', fetches - f0);

  await page.screenshot({ path: `scratchpad/shots/linje-${scheme}-${W}-markert.png`, animations: 'disabled' });
  await ctx.close();
}

await run('dark', 390);
await run('light', 390);
await run('dark', 414);
await browser.close();
server.close();
console.log('\nSkjermbilder: scratchpad/shots/linje-*.png\n');
