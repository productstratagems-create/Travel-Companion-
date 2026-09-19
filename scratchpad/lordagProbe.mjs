/**
 * Lørdag på Storaas Gjestegård: ingen buss i dag, men mandag 07:05.
 *
 * Reported with two screenshots: «vår app viser ingen avganger, men Entur har
 * avganger.» Entur had none that day either — its own message says «Vi finner
 * ingen reiser etter dette tidspunktet på lørdag. Vi viser første mulige
 * reise» and then lists MONDAY. The stop has no weekend service.
 *
 * So the app was right and unhelpful, and the sentence it used meant six
 * different things — including «we have not asked yet».
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether «Neste avgang herfra: man 07:05»
 * reads as an answer or as an error message, and whether the screen holds
 * still while the second question is in flight instead of flashing «ingen
 * avganger» and correcting itself. A unit test proves the strings; only the
 * screen shows the flicker.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4539;
const NOW = Date.parse('2026-05-26T07:42:00+02:00');
const iso = ms => new Date(ms).toISOString();

const HERE = { id: 'NSR:StopPlace:6021', name: 'Skullerud', lat: 59.8555, lon: 10.8280 };

/* STORAAS GJESTEGÅRD, LØRDAG. Nothing in the ninety-minute window the board
   asks for, and one bus on Monday morning — the reported case exactly. */
const MONDAY_MINS = 46 * 60 + 18;          // ~mandag 07:05 from a Saturday 08:47
const LATER = {
  realtime: false, cancellation: false,
  aimedDepartureTime: iso(NOW + MONDAY_MINS * 60000),
  expectedDepartureTime: iso(NOW + MONDAY_MINS * 60000),
  destinationDisplay: { frontText: 'Kongsberg knutepunkt' },
  quay: { id: 'NSR:Quay:415A', publicCode: 'A', name: 'Storaas' },
  situations: [],
  serviceJourney: { id: 'BRA:ServiceJourney:415', situations: [],
    line: { id: 'BRA:Line:415', publicCode: '415', transportMode: 'bus',
            presentation: { colour: 'e5006d' } },
    estimatedCalls: [] },
};
const SITS = [];
const CALLS = [];

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
    if (body.includes('estimatedCalls')) {
      // THE CAP, HONOURED. The real API returns at most numberOfDepartures,
      // and a fixture that ignores it cannot reproduce the reported fault at
      // all — the list would simply always be complete.
      // THE WHOLE FIXTURE IN ONE BRANCH. The board asks for 92 minutes and
      // gets nothing — Saturday at Storaas. The second question asks for two
      // days and gets the Monday bus. A mock answering both the same could
      // not reproduce the report at all.
      const m = body.match(/timeRange:(\d+)/);
      const range = m ? parseInt(m[1], 10) : 0;
      const wide = range > 6 * 3600;
      asks.push(Math.round(range / 60) + 'min');
      const send = () => route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { id: HERE.id, name: HERE.name,
          estimatedCalls: wide ? [LATER] : [], situations: [] } } }) });
      // THE SECOND QUESTION TAKES TIME, and the flicker is half the point:
      // «ingen avganger» shown for a moment and then corrected is exactly
      // what the vision calls out. An instant mock hid the very state worth
      // looking at — the fixture answering faster than reality can.
      if (wide) return void setTimeout(send, 1200);
      return send();
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name, name: HERE.name,
      category: ['metroStation'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  // No departures today, so no rows ever appear — waiting for one would
  // time out on the very case this probe exists for.
  await page.waitForSelector('#v-auto .set-label, #v-auto .dest-prev-empty', { timeout: 20000 });
  return { ctx, page };
}

/** Every time in a row, with which one is loud and which are struck. */
const { ctx, page } = await open(true);

// THE FLICKER IS HALF THE POINT. «Ingen avganger» shown for a moment and then
// corrected is the thing the vision calls out, so the screen is read twice:
// once the instant it lands, and once after the second question has answered.
const read = () => page.evaluate(() => {
  const e = document.querySelector('#v-auto .dest-prev-empty');
  return e ? e.textContent.replace(/\s+/g, ' ').trim() : '(ingen tom-melding)';
});

console.log('\n══ lørdag på Storaas Gjestegård ══');
console.log('   mens den leter    :', await read());
await page.waitForTimeout(2500);
console.log('   etter svaret      :', await read());
console.log('   vinduer spurt     :', asks.join(' → '));

fs.mkdirSync('scratchpad/shots', { recursive: true });
for (const theme of ['dark', 'light']) {
  await page.emulateMedia({ colorScheme: theme });
  await page.evaluate((t) => {
    localStorage.setItem('default::t.theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }, theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `scratchpad/shots/lordag-${theme}.png`,
    clip: { x: 0, y: 0, width: 390, height: 640 }, animations: 'disabled' });
}

await ctx.close();
await browser.close();
server.close();
console.log('');
