/**
 * Is the walk time back — on the screen, not only in the numbers?
 *
 * Reported: «Jeg får uansett ikke opp gangtid lenger.» The gate is
 * isWalkActive, and it compared the route's stopId with state.nearestStation
 * — stops[0], the very nearest stop. Since v1.76.0/v1.77.0 that is the kerb
 * 35 m away, not the station 300 m away the route departs from, so the
 * equality answered no and BOTH surfaces went dark at once.
 *
 * This drives exactly that situation: reader stands by the kerb, route
 * departs from the metro station. Before the fix the header is hidden and no
 * row carries .dep-reach; after it, both are there.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4495;
const NOW = Date.parse('2026-09-06T08:12:00+02:00');
const iso = ms => new Date(ms).toISOString();

const HERE  = { lat: 59.8617, lon: 10.8285 };            // by the kerb
const KERB  = { name: 'Skullerudstubben', id: 'NSR:StopPlace:6060', off: 35,  cat: 'onstreetBus' };
const METRO = { name: 'Skullerud',        id: 'NSR:StopPlace:6083', off: 300, cat: 'metroStation' };

const feat = s => ({
  properties: { id: s.id, name: s.name, label: s.name, category: [s.cat] },
  geometry: { coordinates: [HERE.lon, HERE.lat + s.off / 111320] },
});

/* Three departures, far enough apart that r-ok / r-soon / r-now all show. */
const MINS = [22, 14, 10];
const PATTERNS = MINS.map((m, i) => ({
  startTime: iso(NOW + m * 60000), endTime: iso(NOW + (m + 18) * 60000),
  legs: [{
    mode: 'metro', distance: 6000,
    aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
    aimedEndTime: iso(NOW + (m + 18) * 60000), expectedEndTime: iso(NOW + (m + 18) * 60000),
    realtime: true,
    line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro', presentation: { colour: 'f5a000' } },
    fromEstimatedCall: { quay: { id: 'NSR:Quay:1', publicCode: '1' }, destinationDisplay: { frontText: 'Kolsås' },
      aimedDepartureTime: iso(NOW + m * 60000), expectedDepartureTime: iso(NOW + m * 60000), realtime: true },
    fromPlace: { name: METRO.name, quay: { id: 'NSR:Quay:1', stopPlace: { id: METRO.id, name: METRO.name } },
      latitude: HERE.lat + METRO.off / 111320, longitude: HERE.lon },
    toPlace: { name: 'Nationaltheatret', quay: { id: 'NSR:Quay:9', stopPlace: { id: 'NSR:StopPlace:9', name: 'Nationaltheatret' } },
      latitude: 59.914, longitude: 10.734 },
    serviceJourney: { id: 'sj:' + i, situations: [],
      estimatedCalls: [{ quay: { id: 'NSR:Quay:9', latitude: 59.914, longitude: 10.734,
        stopPlace: { id: 'NSR:StopPlace:9', name: 'Nationaltheatret', latitude: 59.914, longitude: 10.734 } },
        aimedArrivalTime: iso(NOW + (m + 18) * 60000), expectedArrivalTime: iso(NOW + (m + 18) * 60000),
        aimedDepartureTime: iso(NOW + (m + 18) * 60000), expectedDepartureTime: iso(NOW + (m + 18) * 60000) }] },
  }],
}));

const ROUTE = {
  key: 'custom-out', from: METRO.name, to: 'Nationaltheatret',
  stopId: METRO.id, toStopId: 'NSR:StopPlace:9', filter: null,
  geo: null, toGeo: null, line: null,
  _fromLat: HERE.lat + METRO.off / 111320, _fromLon: HERE.lon,
  _toLat: 59.914, _toLon: 10.734,
};

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
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, route, here }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.route', JSON.stringify(route));
    localStorage.setItem('default::t.dir', '2');
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.weekendMode', '0');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.walkSpeed', 'middels');
  }, { now: NOW, route: ROUTE, here: HERE });

  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [feat(KERB), feat(METRO)] }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    // tripGQL ALSO contains startTime and estimatedCalls — split on 'trip(' .
    if (!body.includes('trip('))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { estimatedCalls: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
        trip: { tripPatterns: PATTERNS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 }).catch(async () => {
    await page.click('#status-dot').catch(() => {});
    await page.waitForTimeout(600);
    console.log('  ingen rader. panelet sier:');
    console.log(await page.$eval('#dbg-diag', e => e.textContent).catch(() => '(intet panel)'));
    throw new Error('no rows');
  });
  await page.waitForTimeout(4000);

  const read = await page.evaluate(() => {
    const ws = document.getElementById('walk-summary');
    return {
      nearest: (window.__state && window.__state.nearestStation && window.__state.nearestStation.name) || null,
      head: ws && ws.style.display !== 'none' ? ws.textContent.trim() : null,
      reach: Array.from(document.querySelectorAll('#dep-list .dep-reach'))
        .map(e => e.className.replace('dep-reach ', '') + ' · ' + e.textContent.trim()),
      rows: document.querySelectorAll('#dep-list .dep-row').length,
    };
  });
  console.log('\n══ ' + scheme + ' ══');
  console.log('  du er ved   :', read.nearest, '(kantsteinen — ruta går fra ' + METRO.name + ')');
  console.log('  gangtid i hodet:', read.head === null ? 'SKJULT' : read.head);
  console.log('  rader       :', read.rows);
  read.reach.forEach(r => console.log('    igjen:', r));
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/walk-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}

await run('dark');
await run('light');
await browser.close(); server.close();
