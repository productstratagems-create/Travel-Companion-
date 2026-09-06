/**
 * The auto-reise list, on a Skullerud-shaped stop: five modes, two of which
 * share a front text. Measures the order in both sort modes, that the switch
 * survives the once-a-second redraw, and that tapping a row opens the
 * direction it names.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4492;
const NOW = Date.parse('2026-05-26T07:42:00+02:00');
const iso = ms => new Date(ms).toISOString();

// The journey's own calls START where we stand — stopsAhead cuts at that
// stop, and without it there is nothing it can call "ahead".
const ONWARD = ['Mortensrud', 'Skullerud', 'Bogerud', 'Bøler', 'Ulsrud', 'Oppsal', 'Skøyenåsen',
  'Godlia', 'Hellerud', 'Brynseng', 'Helsfyr', 'Ensjø', 'Tøyen', 'Grønland',
  'Jernbanetorget', 'Stortinget', 'Nationaltheatret', 'Majorstuen'];
const HERE = { id: 'NSR:StopPlace:6021', name: 'Skullerud', lat: 59.8555, lon: 10.8280 };

// front, code, mode, lineId, quay, [minutes]
const DEPS = [
  // The shared stretch: lines 1-5 all leave westbound with the same front
  // text. This is where "one row is one line" costs the most.
  ['Nationaltheatret', '1',   'metro', 'RUT:Line:1',   '2', [4, 14]],
  ['Nationaltheatret', '2',   'metro', 'RUT:Line:2',   '2', [6, 16]],
  ['Nationaltheatret', '4',   'metro', 'RUT:Line:4',   '2', [8, 18]],
  ['Grorud T',        '79',  'bus',   'RUT:Line:79',  'J', [2, 12, 19]],
  ['Mortensrud',      '3',   'metro', 'RUT:Line:3',   '1', [3, 10]],
  ['Mortensrud',      '76',  'bus',   'RUT:Line:76',  'J', [19]],
  ['Nationaltheateret','70E','bus',   'RUT:Line:70E', 'D', [5, 20, 35]],
  ['Åsbråten',        '79',  'bus',   'RUT:Line:79',  'E', [5, 18]],
  ['Kolsås',          '3',   'metro', 'RUT:Line:3',   '2', [7, 22, 37]],
  ['Ljabru',          '19',  'tram',  'RUT:Line:19',  'C', [9, 21]],
  ['Lillestrøm',      'R14', 'rail',  'NSB:Line:R14', '3', [11, 41]],
  ['OSL-ekspressen',  'FB10','bus',   'FLI:Line:FB10','J', [32]],
];
const CALLS = DEPS.flatMap(([front, code, mode, lineId, quay, mins]) =>
  mins.map(m => ({
    realtime: true, cancellation: false,
    aimedDepartureTime: iso(NOW + m * 60000), expectedDepartureTime: iso(NOW + m * 60000),
    destinationDisplay: { frontText: front },
    quay: { id: 'NSR:Quay:' + code + quay, publicCode: quay, name: 'Skullerud ' + quay },
    situations: [],
    serviceJourney: {
      id: 'RUT:ServiceJourney:' + code + ':' + m, situations: [],
      line: { id: lineId, publicCode: code, transportMode: mode,
              presentation: { colour: mode === 'metro' ? 'f5a000' : mode === 'rail' ? '5a6b7d' : 'e5006d' } },
      // The real line, so a shortcut has something to match against.
      estimatedCalls: ONWARD.map((name, k) => {
        const t = iso(NOW + (m + 4 + k * 2) * 60000);
        return { quay: { latitude: 59.9, longitude: 10.8,
          stopPlace: { id: 'NSR:StopPlace:' + name, name, latitude: 59.9, longitude: 10.8 } },
          aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t,
          expectedDepartureTime: t };
      }),
    },
  })));

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

let EMPTY = false;
let HIST = false;
let STANDING_AT = false;
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let hubCalls = 0;

async function open(dark) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, hist }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    // Seeded ONCE. addInitScript runs on every navigation, so re-seeding here
    // would wipe the very preference under test on a reload.
    if (!localStorage.getItem('__seeded')) {
      localStorage.setItem('__seeded', '1');
      localStorage.setItem('__activeProfile', 'default');
      localStorage.setItem('default::t.theme', 'system');
      localStorage.setItem('default::t.autoMode', '1');
      localStorage.setItem('default::t.landing', 'auto');
    // Mortensrud is where this reader departs from, fourteen times over.
    localStorage.setItem('default::t.freqDep', JSON.stringify([
      { name: 'Mortensrud', count: 14, lastUsed: now, stopId: 'NSR:StopPlace:Mortensrud' },
      { name: 'Granebakken', count: 2, lastUsed: now, stopId: 'NSR:StopPlace:Granebakken' },
    ]));
      localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
    }
    if (hist) {
      // Two on this line, one on another, and one that is not a stop at all.
      localStorage.setItem('default::t.freqArr', JSON.stringify([
        { name: 'Bergen', count: 40, lastUsed: now, stopId: 'NSR:StopPlace:Bergen' },
        { name: 'Nationaltheatret', count: 21, lastUsed: now, stopId: 'NSR:StopPlace:Nationaltheatret' },
        { name: 'Helsfyr', count: 4, lastUsed: now, stopId: 'NSR:StopPlace:Helsfyr' },
      ]));
    }
  }, { now: NOW, here: HERE, hist: HIST });

  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('stopPlaces(')) { hubCalls++; return route.fulfill({ status: 200,
      contentType: 'application/json', body: JSON.stringify({ data: { stopPlaces: [] } }) }); }
    if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: HERE.id, name: HERE.name, estimatedCalls: CALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route('**/geocoder/**', r => {
    if (EMPTY) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ features: [
        // Places that are not stops at all: the filter must reject them and
        // the screen must still say something useful.
        { properties: { id: 'x1', name: 'Ryen skole', label: 'Ryen skole', category: ['school'] },
          geometry: { coordinates: [HERE.lon, HERE.lat] } },
      ] }) });
    // Deliberately in the order Pelias would give: the prominent venue first,
    // the kerb the reader is standing on last.
    const at = (m) => [HERE.lon, HERE.lat + m / 111320];
    const f = (id, name, cats, m) => ({
      properties: { id, name, label: name, category: cats }, geometry: { coordinates: at(m) } });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: [
      // The reported screen, stop for stop: Mortensrud with seven alternatives.
      f(HERE.id, 'Mortensrud', ['metroStation'], 649),
      f('NSR:StopPlace:71', 'Olasrudveien', ['onstreetBus'], 369),
      f('NSR:StopPlace:72', 'Granebakken', ['onstreetBus'], 429),
      f('NSR:StopPlace:73', 'Stenbråten', ['onstreetBus'], 496),
      f('NSR:StopPlace:74', 'Maikollen', ['onstreetBus'], 548),
      f('NSR:StopPlace:75', 'Kantarellen legesenter', ['onstreetBus'], 625),
      f('NSR:StopPlace:76', 'Kantarellen', ['onstreetBus'], 639),
      f('NSR:StopPlace:77', 'Kantarellen terrasse', ['onstreetBus'], 644),
      f('NSR:StopPlace:78', 'For langt unna', ['onstreetBus'], 900),
      // Only present in the "standing right at one" run: a stop the reader
      // has never used, thirty metres away. It must win regardless.
      ...(STANDING_AT ? [f('NSR:StopPlace:79', 'Ryenkrysset', ['onstreetBus'], 30)] : []),
    ] }) });
  });
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#v-auto .auto-dir', { timeout: 20000 });
  return { ctx, page };
}

const rows = (page) => page.$$eval('#v-auto .auto-dir', els => els.map(e => ({
  badges: [...e.querySelectorAll('.auto-badges *')].map(b => b.textContent.trim()).filter(Boolean),
  name: e.querySelector('.nearby-name').textContent.trim(),
  quay: e.querySelector('.auto-quay') ? e.querySelector('.auto-quay').textContent.trim() : '',
  i: e.dataset.i,
})));
const show = (rs) => rs.forEach(r => console.log(
  '   ' + ('[' + r.badges.join(' ') + ']').padEnd(12) + r.name.padEnd(30) + r.quay.padEnd(14) + 'data-i=' + r.i));

const where = (page) => page.$eval('#auto-where', e => e.textContent.replace(/\s+/g, ' ').trim());
const alts = (page) => page.$$eval('#v-auto .auto-stop-btn', els => els.map(e =>
  e.textContent.replace(/\s+/g, ' ').trim()));


async function look(hist, dark, shot) {
  HIST = hist;
  const { ctx, page } = await open(dark);
  // Not the first row: "mot Mortensrud" is the direction back to where we
  // stand, and stopsAhead cuts everything at the stop you are at.
  await page.click('#v-auto .auto-dir:has-text("Kolsås")');
  await page.waitForSelector('#v-auto .auto-stop-btn').catch(async () => {
    console.log('  ingen stopprader. skjerm:',
      (await page.$eval('#v-auto', e => e.innerText)).replace(/\s+/g,' ').slice(0,240));
    throw new Error('x');
  });
  await page.waitForTimeout(700);

  const short = await page.$$eval('#v-auto .auto-fav-stop', els => els.map(e =>
    e.querySelector('.nearby-name').textContent.trim() + ' · '
    + e.querySelector('.nearby-dist').textContent.trim()));
  const all = await page.$$eval('#v-auto .auto-stop-btn', els => els.length);
  const labels = await page.$$eval('#v-auto .set-label', els => els.map(e => e.textContent.trim()));
  console.log('\n══ ' + (hist ? 'med reisehistorikk' : 'uten historikk') + ' ══');
  console.log('  snarveier:', short.length ? short.join('  |  ') : '(ingen)');
  console.log('  overskrifter:', JSON.stringify(labels));
  console.log('  stopprader totalt:', all, '(17 på linja + snarveiene)');

  if (shot) await page.screenshot({ path: shot, animations: 'disabled' });
  if (hist) {
    // The shortcut must open the stop it names, not the row at the same index.
    await page.click('#v-auto .auto-fav-stop');
    await page.waitForTimeout(900);
    const head2 = await page.$eval('.station-name-btn, #station-name-btn',
      e => e.textContent.replace(/\s+/g, ' ').trim()).catch(() => '(fant ikke)');
    console.log('  trykk på første snarvei åpner:', head2);
  }
  await ctx.close();
}

fs.mkdirSync('scratchpad/shots', { recursive: true });
await look(false, true, 'scratchpad/shots/short-none.png');
await look(true, true, 'scratchpad/shots/short-dark.png');
await look(true, false, 'scratchpad/shots/short-light.png');
await browser.close(); server.close();
