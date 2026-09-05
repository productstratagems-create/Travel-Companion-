/**
 * Line 3 to Kolsås, as reported: twenty-four stops of which a handful are
 * somewhere you can change. Counts the rows, opens one stretch, and runs the
 * refused-fields world too — because a list that folds itself away because a
 * query failed would be worse than the long list it replaced.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4494;
const NOW = Date.parse('2026-09-04T21:16:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { id: 'NSR:StopPlace:6013', name: 'Mortensrud', lat: 59.8617, lon: 10.8285 };

/* The real line, and which stops really are interchanges. */
/* Two worlds. The first is what I ASSUMED when v1.81.0 shipped; the second is
   what was reported back — every stop clearing an absolute threshold of two,
   because an ordinary Oslo metro stop apparently has night buses, replacement
   buses or simply more lines registered than reasoning suggested. */
/* Line 3 westbound, with the rail-bound lines that really call at each stop.
   Line 2 joins at Hellerud — the junction the reader named. 1, 4 and 5 join
   in the tunnel. */
const RAILS = {
  Skullerud: ['3'], Bogerud: ['3'], Bøler: ['3'], Ulsrud: ['3'], Oppsal: ['3'],
  Skøyenåsen: ['3'], Godlia: ['3'],
  Hellerud: ['2', '3'], Brynseng: ['2', '3'], Helsfyr: ['2', '3'], Ensjø: ['2', '3'],
  Tøyen: ['1', '2', '3', '4', '5'], Grønland: ['1', '2', '3', '4', '5'],
  Jernbanetorget: ['1', '2', '3', '4', '5'], Stortinget: ['1', '2', '3', '4', '5'],
  Nationaltheatret: ['1', '2', '3', '4', '5'],
  Majorstuen: ['1', '2', '3', '4', '5'],
};
const NAMES = Object.keys(RAILS);
const THIN = NAMES.map(n => [n, RAILS[n].length]);
const FAT = THIN;
let STOPS = THIN;
let BUSSES = false;
const LINES = (n, name) => Array.from({ length: n }, (_, i) => ({
  id: 'RUT:Line:' + name + i, transportMode: i === 0 ? 'metro' : (i % 2 ? 'bus' : 'tram') }));

const CALLS = [{
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + 12 * 60000), expectedDepartureTime: iso(NOW + 12 * 60000),
  destinationDisplay: { frontText: 'Kolsås' },
  quay: { id: 'NSR:Quay:1', publicCode: '1', name: 'Mortensrud 1' },
  serviceJourney: { id: 'sj:3', situations: [],
    line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: 59.86, longitude: 10.82, stopPlace: {
          id: HERE.id, name: HERE.name, latitude: 59.86, longitude: 10.82 } },
        aimedArrivalTime: iso(NOW), expectedArrivalTime: iso(NOW),
        aimedDepartureTime: iso(NOW), expectedDepartureTime: iso(NOW) },
      ...STOPS.map(([name], i) => {
        const t = iso(NOW + (4 + i * 2) * 60000);
        return { quay: { latitude: 59.9, longitude: 10.7, stopPlace: {
          id: 'NSR:StopPlace:' + name, name, latitude: 59.9, longitude: 10.7 } },
          aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t,
          expectedDepartureTime: t };
      }),
    ] },
}];

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

async function run({ refuse, dark, shot, world }) {
  STOPS = THIN;
  BUSSES = world === 'fat';
  let hubCalls = 0;
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 1000 }, deviceScaleFactor: 2,
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
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.landing', 'auto');
    localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
  }, { now: NOW, here: HERE });

  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name,
      name: HERE.name, category: ['metroStation'] },
      geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('stopPlaces(')) {
      hubCalls++;
      const rich = body.includes('lines{');
      if (refuse && rich) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: "Cannot query field 'lines' on type 'Quay'" }] }) });
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlaces: NAMES.map((name, i) => ({
          id: 'NSR:StopPlace:' + name, transportMode: 'metro',
          quays: rich
            ? [{ id: 'q1', lines: [
                ...RAILS[name].map(l => ({ id: 'RUT:Line:' + l, transportMode: 'metro' })),
                // Different bus routes at every stop, which is the real world
                // and the thing that must NOT make every stop an anchor.
                ...(BUSSES ? [{ id: 'RUT:Line:B' + i, transportMode: 'bus' }] : []),
              ] }]
            : [{ id: 'q1' }, { id: 'q2' }],
        })) } }) });
    }
    if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: HERE.id, name: HERE.name, estimatedCalls: CALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#v-auto .auto-dir');
  await page.click('#v-auto .auto-dir');           // open "mot Kolsås"
  await page.waitForSelector('#v-auto .auto-stop-btn, #v-auto .auto-run');
  await page.waitForTimeout(1500);                  // let the register land

  const rows = () => page.$$eval('#v-auto .auto-stop-btn, #v-auto .auto-run', els =>
    els.map(e => (e.classList.contains('auto-run') ? '  … ' : '') +
      e.querySelector('.nearby-name').textContent.trim() + ' · ' +
      e.querySelector('.nearby-dist').textContent.trim() +
      (e.classList.contains('auto-hub') ? '   ← knutepunkt' : '')));

  console.log('\n══ ' + (world === 'fat' ? 'ulike BUSSLINJER på hvert stopp' :
    'ekte linje 3') + (refuse ? ', og linjefeltet avvises' : '') + ' ══');
  const r = await rows();
  r.forEach(x => console.log('   ' + x));
  console.log('   rader:', r.length, '| stopp på linja: 17 | registerkall:', hubCalls);

  if (shot) await page.screenshot({ path: shot, animations: 'disabled', fullPage: true });
  if (!refuse) {
    const run = await page.$('#v-auto .auto-run');
    if (run) {
      await run.click(); await page.waitForTimeout(300);
      const after = await rows();
      console.log('\n   etter å ha utvidet første strekning: ' + after.length + ' rader');
      await page.waitForTimeout(2500);
      console.log('   overlever tegneløkka:',
        (await page.$$('#v-auto .auto-stop-btn')).length, 'stopprader');
    }
  }
  if (shot) await page.screenshot({ path: shot.replace('.png', '-open.png'),
    animations: 'disabled', fullPage: true });
  await ctx.close();
}

fs.mkdirSync('scratchpad/shots', { recursive: true });
await run({ refuse: false, dark: true, world: 'thin', shot: 'scratchpad/shots/runs-dark.png' });
await run({ refuse: false, dark: true, world: 'fat' });
await run({ refuse: true, dark: true, world: 'thin' });
await run({ refuse: false, dark: false, world: 'thin', shot: 'scratchpad/shots/runs-light.png' });
await browser.close(); server.close();
