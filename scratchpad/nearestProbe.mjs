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
      estimatedCalls: [{
        quay: { latitude: 59.86, longitude: 10.80,
                stopPlace: { id: 'NSR:StopPlace:9', name: front, latitude: 59.86, longitude: 10.80 } },
        aimedArrivalTime: iso(NOW + (m + 12) * 60000), expectedArrivalTime: iso(NOW + (m + 12) * 60000),
        aimedDepartureTime: iso(NOW + (m + 12) * 60000), expectedDepartureTime: iso(NOW + (m + 12) * 60000),
      }],
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
  await page.addInitScript(({ now, here }) => {
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
  }, { now: NOW, here: HERE });

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

const { ctx, page } = await open(true);
console.log('\n══ du er ved ══');
console.log('  ' + await where(page));
console.log('\n══ hvor langt ned starter avgangene ══');
const firstDepTop = () => page.$eval('#v-auto .auto-dir', e => Math.round(e.getBoundingClientRect().top));
console.log('  første avgang starter på y =', await firstDepTop(), 'px  (skjermen er 860 høy)');
console.log('  alternativer synlige:', (await page.$$('#v-auto .auto-alt')).length);

console.log('\n══ sammensl\u00e5tt ved f\u00f8rste \u00e5pning ══');
const head = () => page.$eval('#v-auto .auto-stop', e => e.textContent.replace(/\\s+/g, ' ').trim());
const altsShown = () => page.$$eval('#v-auto .auto-alt', els =>
  els.filter(e => e.offsetParent !== null).length);
console.log('  overskrift:', await head());
console.log('  alternativer synlige:', await altsShown());
console.log('  er knapp:', await page.$eval('#v-auto .auto-stop', e => e.tagName));
console.log('  aria-expanded:', await page.$eval('#v-auto .auto-stop', e => e.getAttribute('aria-expanded')));

console.log('\n══ ett trykk utvider ══');
await page.click('#auto-stop-toggle');
await page.waitForTimeout(200);
console.log('  overskrift:', await head());
console.log('  alternativer synlige:', await altsShown());
console.log('  f\u00f8rste avgang p\u00e5 y =', await firstDepTop());

console.log('\n── overlever tegnel\u00f8kka (3 s) ──');
await page.waitForTimeout(3000);
console.log('  fortsatt utvidet:', await altsShown());

console.log('\n══ nytt trykk sl\u00e5r sammen ══');
await page.click('#auto-stop-toggle');
await page.waitForTimeout(200);
console.log('  alternativer synlige:', await altsShown());
console.log('  f\u00f8rste avgang p\u00e5 y =', await firstDepTop());

console.log('\n── valget st\u00e5r etter reload ──');
await page.click('#auto-stop-toggle');
await page.waitForTimeout(150);
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#v-auto .auto-dir');
console.log('  alternativer synlige:', await altsShown());

console.log('\n── velge et alternativ lar lista st\u00e5 \u00e5pen ──');
await page.click('#v-auto .auto-alt');
await page.waitForTimeout(600);
console.log('  du er ved:', await head());
console.log('  alternativer synlige:', await altsShown());
await page.click('#auto-stop-toggle');
await page.waitForTimeout(200);

console.log('\n══ leserens eget valg ══');
console.log('\n══ st\u00e5r du rett ved et ubrukt stopp, vinner det ══');
STANDING_AT = true;
const c9 = await browser.newContext({
  viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark',
  hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
});
const p9 = await c9.newPage();
await p9.addInitScript((now) => {
  const Real = Date;
  class Pinned extends Real {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  globalThis.Date = Pinned;
  localStorage.setItem('__activeProfile', 'default');
  localStorage.setItem('default::t.autoMode', '1');
  localStorage.setItem('default::t.landing', 'auto');
  localStorage.setItem('default::t.freqDep', JSON.stringify([
    { name: 'Mortensrud', count: 14, lastUsed: now, stopId: 'NSR:StopPlace:6021' },
  ]));
}, NOW);
await p9.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ features: [
    { properties: { id: 'NSR:StopPlace:6021', name: 'Mortensrud', label: 'Mortensrud',
      category: ['metroStation'] },
      geometry: { coordinates: [HERE.lon, HERE.lat + 649 / 111320] } },
    { properties: { id: 'NSR:StopPlace:79', name: 'Ryenkrysset', label: 'Ryenkrysset',
      category: ['onstreetBus'] },
      geometry: { coordinates: [HERE.lon, HERE.lat + 30 / 111320] } },
  ] }) }));
await p9.route('**/journey-planner/**', r => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify({ data: { stopPlace: null } }) }));
await p9.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
p9.on('pageerror', e => console.log('  ! sidefeil:', e.message));
await p9.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await p9.waitForSelector('#v-auto .auto-stop');
await p9.waitForTimeout(1200);
console.log('  du er ved:', (await p9.$eval('#v-auto .auto-stop', e =>
  e.textContent.replace(/\s+/g, ' ').trim())));
await c9.close();
STANDING_AT = false;

console.log('\n══ sorter-bryteren ══');
console.log('  ' + await page.$eval('#auto-sort', e => e.textContent.replace(/\\s+/g, ' ').trim()));
console.log('  aktiv:', await page.$eval('#auto-sort .pref-btn.active', b => b.textContent.trim()));
console.log('  bryter bredere enn skjermen?', await page.$eval('#auto-sort',
  e => e.scrollWidth > e.clientWidth));
const first = () => page.$$eval('#v-auto .auto-dir', els => els.slice(0, 3).map(e =>
  e.querySelector('.auto-badges').textContent.trim() + ' ' + e.querySelector('.nearby-name').textContent.trim()));
console.log('\n  T-bane først:'); (await first()).forEach(r => console.log('   ', r));
await page.click('#auto-sort .pref-btn[data-val="desc"]');
await page.waitForTimeout(200);
console.log('  aktiv n\u00e5:', await page.$eval('#auto-sort .pref-btn.active', b => b.textContent.trim()));
console.log('  Tog f\u00f8rst:'); (await first()).forEach(r => console.log('   ', r));
await page.waitForTimeout(2500);
console.log('  overlever tegnel\u00f8kka:', await page.$eval('#auto-sort .pref-btn.active', b => b.textContent.trim()));
await page.click('#auto-sort .pref-btn[data-val="asc"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'scratchpad/shots/near-dark.png', animations: 'disabled' });
await ctx.close();

const { ctx: cl, page: pl } = await open(false);
await pl.screenshot({ path: 'scratchpad/shots/near-light.png', animations: 'disabled' });
await cl.close();

console.log('\n══ den tomme veien (ingen stopp i n\u00e6rheten) ══');
EMPTY = true;
const ctx3 = await browser.newContext({
  viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: 'dark',
  hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
});
const p3 = await ctx3.newPage();
await p3.addInitScript((now) => {
  const Real = Date;
  class Pinned extends Real {
    constructor(...a) { super(...(a.length ? a : [now])); }
    static now() { return now; }
  }
  globalThis.Date = Pinned;
  localStorage.setItem('__activeProfile', 'default');
  localStorage.setItem('default::t.autoMode', '1');
  localStorage.setItem('default::t.landing', 'auto');
}, NOW);
await p3.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
  body: JSON.stringify({ features: [{ properties: { id: 'x1', name: 'Ryen skole',
    label: 'Ryen skole', category: ['school'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
await p3.route('**/journey-planner/**', r => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify({ data: { stopPlace: null } }) }));
await p3.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
p3.on('pageerror', e => console.log('  ! sidefeil:', e.message));
await p3.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await p3.waitForTimeout(2500);
console.log('  sorter-bryter skjult?', await p3.$eval('#auto-sort', e => getComputedStyle(e).display === 'none'));
console.log('  skjermtekst:', (await p3.$eval('#v-auto', e => e.textContent.replace(/\s+/g,' ').trim())).slice(0, 180));
await p3.screenshot({ path: 'scratchpad/shots/near-empty.png', animations: 'disabled' });
await ctx3.close();

await browser.close(); server.close();
