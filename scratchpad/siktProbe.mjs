/**
 * Hvilken avgang er den du sikter mot?
 *
 * Reported with a screenshot: «Noen avgangstider er gjennomstrekede, antar
 * fordi de er utenfor gangrekkevidde? Hvordan kan dette bli mer intuitivt?» —
 * and «antar» is the report. The strike was right and unexplained.
 *
 * The sharper fault was underneath it: the row lit the FIRST time and dimmed
 * the rest, so at «nå · 15 · 30 min» with fourteen minutes on foot the bright
 * number was the one you cannot reach and the one to walk for was at 55%.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether «the loud one is the one you aim
 * for» actually reads that way among struck neighbours at 390px, in both
 * themes — and whether bold is enough when the same number may also be amber
 * for urgency. The numbers below say which span is loud; only the screen says
 * whether the eye lands on it.
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

/** Every time in a row, with which one is loud and which are struck. */
const tider = (page) => page.$$eval('#v-auto .auto-dir', els => els.map(e => {
  const spans = [...e.querySelectorAll('.auto-t-next, .auto-t-dim')];
  const style = (el) => {
    const cs = getComputedStyle(el);
    return { vekt: cs.fontWeight, op: Math.round(parseFloat(cs.opacity) * 100),
      strek: cs.textDecorationLine.includes('line-through') };
  };
  return {
    navn: e.querySelector('.nearby-name').textContent.trim(),
    tider: spans.map(sp => ({ t: sp.textContent.trim(), loud: sp.classList.contains('auto-t-next'),
      ...style(sp) })),
  };
}));

const vis = (rs) => rs.slice(0, 6).forEach(r => console.log(
  '   ' + r.navn.padEnd(26)
  + r.tider.map(t => (t.loud ? '[' + t.t + ']' : ' ' + t.t + ' ')
      + (t.strek ? '̶' : '') + '(v' + t.vekt + ' o' + t.op + ')').join(' · ')));

// THE REPORTED CASE: a walk long enough that the first departures are gone.
// The fixture stands the reader AT the stop, so nothing was ever out of reach
// and the fault could not appear. Moved ~1 km away, as the screenshot was.
const { ctx, page } = await open(true);
console.log('\n══ ved stoppet (ingenting utenfor rekkevidde) ══');
vis(await tider(page));

await ctx.setGeolocation({ latitude: HERE.lat - 0.0088, longitude: HERE.lon - 0.0040 });
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#v-auto .auto-dir', { timeout: 20000 });
await page.waitForTimeout(1200);
const gange = await page.$eval('#v-auto .auto-stop-facts', e => e.textContent.trim()).catch(() => '(ingen)');
console.log('\n══ ca. en kilometer unna ══');
console.log('   ' + gange);
vis(await tider(page));

// THE ONE ASSERTION THIS PROBE EXISTS FOR: the loud one must be one you can
// still make. A bright number you cannot reach is the reported fault.
const galt = (await tider(page)).filter(r => r.tider.some(t => t.loud && t.strek));
console.log('\n   rader der den framhevede er gjennomstrøket:',
  galt.length ? galt.map(r => r.navn).join(', ') : 'ingen');

fs.mkdirSync('scratchpad/shots', { recursive: true });
for (const theme of ['dark', 'light']) {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((t) => {
    localStorage.setItem('default::t.theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(400);
  const el = await page.$('#auto-body');
  if (el) await el.screenshot({ path: `scratchpad/shots/sikt-${theme}.png`, animations: 'disabled' });
}

await ctx.close();
await browser.close();
server.close();
console.log('');
