/**
 * «Din vanlige 08:12 …» — og tausheten når den går som den skal.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether the line reads as an observation
 * or as an error message, and — the half no assertion covers — whether the
 * ORDINARY case is silent. A note that appears every morning is one nobody
 * reads on the morning it matters. So the probe drives four cases and the
 * first one expects nothing at all.
 *
 * Nothing new is asked of api.entur.io; the board is answered locally.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4563;
// OSLO-LOKAL, ikke containerens tidssone. `new Date(2026,8,21,7,50)` bygges
// i Node-prosessens sone (UTC her), mens sida kjører Europe/Oslo — så 07:50
// ble 09:50 i nettleseren, favoritten kl 08:12 var passert, og prøven meldte
// taushet i alle fire tilfellene. Måleinstrumentet, for sjuende gang.
const NOW = Date.parse('2026-09-21T07:50:00+02:00');   // mandag 07:50 i Oslo
const iso = ms => new Date(ms).toISOString();

const HERE = { id: 'NSR:StopPlace:6021', name: 'Ryen', lat: 59.8944, lon: 10.8133 };

/**
 * A departure at HH:MM today, as a TRIP PATTERN.
 *
 * The route has a destination, so the board takes the fetchTrip path and
 * `state.deps` are adapted trip patterns — not stop-board calls. A fixture
 * of estimatedCalls produced an empty board and would have measured
 * nothing at all.
 */
const DEST = { name: 'Oslo S', lat: 59.9106, lon: 10.7527 };
const dep = (hhmm, o) => {
  // Same reason: an explicit +02:00 rather than setHours in the wrong zone.
  const start = Date.parse('2026-09-21T' + hhmm + ':00+02:00');
  const end = start + 14 * 60000;
  return {
    duration: 840,
    legs: [{
      mode: 'metro',
      aimedStartTime: iso(start), expectedStartTime: iso(start),
      aimedEndTime: iso(end), expectedEndTime: iso(end),
      fromPlace: { name: HERE.name, latitude: HERE.lat, longitude: HERE.lon },
      toPlace: { name: DEST.name, latitude: DEST.lat, longitude: DEST.lon },
      fromEstimatedCall: {
        expectedDepartureTime: iso(start), aimedDepartureTime: iso(start),
        realtime: true, cancellation: !!(o && o.cancelled),
        quay: { publicCode: 'A' }, destinationDisplay: { frontText: 'Oslo S' },
      },
      toEstimatedCall: { expectedArrivalTime: iso(end), aimedArrivalTime: iso(end),
        quay: { publicCode: '2' } },
      serviceJourney: { id: 'RUT:ServiceJourney:3-' + hhmm, situations: [],
        line: { id: 'RUT:Line:3', publicCode: (o && o.line) || '3',
                presentation: { colour: 'e60000' } },
        estimatedCalls: [] },
      situations: [],
    }],
  };
};

/** The starred 08:12 — a statement the reader made, not an inference. */
const FAV = {
  type: 'timed', id: 'tfav_1', label: '3 08:12',
  from: 'Ryen', to: 'Oslo S', line: '3', lineColour: 'e60000',
  departureHHMM: '08:12', createdAt: NOW - 86400000,
  stopId: HERE.id, toStopId: 'NSR:StopPlace:337',
};

const CASES = [
  { navn: 'går som vanlig', deps: [dep('08:12'), dep('08:24')] },
  { navn: 'flyttet',        deps: [dep('08:19'), dep('08:31')] },
  { navn: 'innstilt',       deps: [dep('08:12', { cancelled: true }), dep('08:24')] },
  // 08:24 is twelve minutes past the starred 08:12 — a full headway,
  // so the next service, not yours delayed. This case is what showed
  // the tolerance was too generous at twelve.
  { navn: 'borte',          deps: [dep('08:24'), dep('08:36')] },
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
let hubCalls = 0;
const asks = [];

async function open(dark, deps) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, fav }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('__activeProfile', 'default');
      localStorage.setItem('default::t.theme', 'system');
      localStorage.setItem('default::t.autoMode', '0');
      localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
      localStorage.setItem('default::t.favs', JSON.stringify([fav]));
      localStorage.setItem('default::t.route', JSON.stringify({
        key: 'custom-out', from: 'Ryen', to: 'Oslo S',
        stopId: here.id, toStopId: 'NSR:StopPlace:337',
        geo: 'Ryen', toGeo: 'Oslo S',
      }));
      localStorage.setItem('default::t.dir', '2');
    }
  }, { now: NOW, here: HERE, fav: FAV });

  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { situations: [] },
          dest: { situations: [] }, trip: { tripPatterns: deps } } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: HERE.id, name: HERE.name,
        latitude: HERE.lat, longitude: HERE.lon, estimatedCalls: [], situations: [] } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name, name: HERE.name,
      category: ['metroStation'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility|realtime/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 20000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

/**
 * The line, and whether it is visible WITHOUT SCROLLING — measured against
 * the nav bar's top, which is position:fixed and floats over the page.
 */
const read = page => page.evaluate(() => {
  const el = document.getElementById('board-usual');
  const vis = el && getComputedStyle(el).display !== 'none';
  if (!vis) return { tekst: null, kind: el ? el.dataset.kind : null, dbg2: el ? el.dataset.dbg : null };
  const nav = document.querySelector('.app-nav');
  const floor = (nav && !nav.hidden) ? nav.getBoundingClientRect().top : window.innerHeight;
  const b = el.getBoundingClientRect();
  return {
    tekst: el.textContent.trim(),
    kind: (el.className.match(/board-usual-(\S+)/) || [])[1] || null,
    synlig: b.top >= 0 && b.bottom <= floor,
  };
});

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 390 px — starret 3 kl 08:12, klokka er 07:50 ══`);
  for (const c of CASES) {
    const { ctx, page } = await open(dark, c.deps);
    const r = await read(page);
  if (process.env.DBG) {
    console.log('     dbg:', JSON.stringify(await page.evaluate(() => ({
      favs: JSON.parse(localStorage.getItem('default::t.favs') || 'null'),
      dir: (window.__cfg && window.__cfg.dirs) ? null : undefined,
      rows: document.querySelectorAll('#dep-list .dep-row').length,
      kind: (document.getElementById('board-usual')||{}).dataset?.kind,
    dbg2: (document.getElementById('board-usual')||{}).dataset?.dbg,
      hdr: (document.querySelector('#board-title, .board-route, header')||{}).textContent,
    }))));
  }
    console.log(`   ${c.navn.padEnd(16)} ${r.tekst ? (r.synlig ? '✓' : '⚠ under folden') : '(taus)'}`
      + `  ${String(r.kind || '—').padEnd(14)} ${r.tekst || r.dbg2 || ''}`);
    await page.screenshot({ path: `scratchpad/vanlig-${theme}-${c.navn.replace(/ /g, '_')}.png` });
    await ctx.close();
  }
}

await browser.close();
server.close();
