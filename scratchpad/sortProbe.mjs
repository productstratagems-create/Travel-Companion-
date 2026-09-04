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
const DIST = path.join(ROOT, 'dist'); const PORT = 4491;
const NOW = Date.parse('2026-05-26T07:42:00+02:00');
const iso = ms => new Date(ms).toISOString();

const HERE = { id: 'NSR:StopPlace:6021', name: 'Skullerud', lat: 59.8555, lon: 10.8280 };

// front, code, mode, lineId, quay, [minutes]
const DEPS = [
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
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name, name: HERE.name,
      category: ['metroStation'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
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

const { ctx, page } = await open(true);

console.log('\n══ standard (type) ══');
show(await rows(page));
console.log('   knapp aktiv:', await page.$eval('#auto-sort .pref-btn.active', b => b.dataset.val));

console.log('\n── to moduser på samme rad? ──');
const mixed = (await rows(page)).filter(r => r.badges.length > 1);
console.log('   rader med flere badger:', mixed.length ? JSON.stringify(mixed) : 'ingen');

console.log('\n── data-i peker på raden den viser ──');
const tap = (await rows(page)).find(r => r.name.includes('Kolsås'));
await page.click(`#v-auto .auto-dir[data-i="${tap.i}"]`);
await page.waitForTimeout(400);
console.log('   trykket "' + tap.name + '" → åpnet:',
  await page.$eval('#auto-body', e => (e.textContent.match(/mot [^\n·]{0,30}/) || ['?'])[0].trim()));
console.log('   bryter skjult når en retning er åpen:',
  await page.$eval('#auto-sort', e => e.style.display === 'none'));
await page.click('#v-auto .auto-back, #auto-body button').catch(() => {});

console.log('\n══ etter trykk på «Tid» ══');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#v-auto .auto-dir');
await page.click('#auto-sort .pref-btn[data-val="tid"]');
await page.waitForTimeout(200);
show(await rows(page));

console.log('\n── overlever tegneløkka (3 s) ──');
await page.waitForTimeout(3000);
console.log('   knapp fortsatt aktiv:', await page.$eval('#auto-sort .pref-btn.active', b => b.dataset.val));

console.log('\n── valget står etter reload ──');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#v-auto .auto-dir');
console.log('   knapp aktiv:', await page.$eval('#auto-sort .pref-btn.active', b => b.dataset.val));
console.log('   registerkall totalt:', hubCalls);

fs.mkdirSync('scratchpad/shots', { recursive: true });
await page.click('#auto-sort .pref-btn[data-val="type"]');
await page.waitForTimeout(300);
await page.screenshot({ path: 'scratchpad/shots/sort-dark.png', animations: 'disabled' });
await ctx.close();

const { ctx: c2, page: p2 } = await open(false);
await p2.screenshot({ path: 'scratchpad/shots/sort-light.png', animations: 'disabled' });
await c2.close();
console.log('\nskjermbilder: scratchpad/shots/sort-{dark,light}.png');

await browser.close(); server.close();
