/**
 * «Utforsk» finner reiser fram i tid, på en strekning uten GPS i den.
 *
 * Asked for in those words. The thing only a browser can settle is not that
 * the strings exist — unit tests pin those — but three things it cannot:
 *
 *   1. Whether «finn reiser» is reachable WITHOUT SCROLLING at 390 px. The
 *      vision's «ro»: the button that carries you onward must be visible.
 *      This codebase has measured that wrong four times, so it is measured
 *      against .app-nav's top, not window.innerHeight — the bottom bar is
 *      position:fixed and floats over the last 56 px of the page.
 *   2. Whether «man 21. 07:05» reads as an OPPLYSNING or as an error. Only
 *      a screenshot answers that, in both themes.
 *   3. Whether the request actually carried the chosen dateTime — the whole
 *      release is one argument reaching api.entur.io, and a mock that does
 *      not check it would pass with the feature removed.
 *
 * WHAT CANNOT BE VERIFIED FROM HERE: that Entur answers a dateTime a day out
 * the way it answers «now». The sandbox reaches neither api.entur.io nor the
 * geocoder, so both are mocked and fetchTrip's ladder falls back to today's
 * behaviour if the real API objects. Said out loud rather than discovered as
 * an empty list one morning.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4547;
const NOW = Date.parse('2026-09-19T08:47:00+02:00');      // lørdag
const iso = ms => new Date(ms).toISOString();

const HERE = { id: 'NSR:StopPlace:6021', name: 'Storaas Gjestegård', lat: 59.6480, lon: 9.6510 };
const DEST = { id: 'NSR:StopPlace:337', name: 'Oslo S', lat: 59.9106, lon: 10.7527 };

// MONDAY 07:05, the reported journey — two days out, so no board window and
// no «now» search could ever find it. That is the point.
const MON = Date.parse('2026-09-21T07:05:00+02:00');
const pattern = {
  duration: 5820,
  legs: [{
    mode: 'bus',
    aimedStartTime: iso(MON), expectedStartTime: iso(MON),
    aimedEndTime: iso(MON + 5820_000), expectedEndTime: iso(MON + 5820_000),
    fromPlace: { name: HERE.name, latitude: HERE.lat, longitude: HERE.lon },
    toPlace: { name: DEST.name, latitude: DEST.lat, longitude: DEST.lon },
    fromEstimatedCall: { expectedDepartureTime: iso(MON), aimedDepartureTime: iso(MON),
      realtime: false, cancellation: false, quay: { publicCode: 'A' },
      destinationDisplay: { frontText: 'Oslo S' } },
    toEstimatedCall: { expectedArrivalTime: iso(MON + 5820_000), aimedArrivalTime: iso(MON + 5820_000),
      quay: { publicCode: '8' } },
    serviceJourney: { id: 'BRA:ServiceJourney:415', situations: [],
      line: { id: 'BRA:Line:415', publicCode: '415', presentation: { colour: 'e5006d' } },
      estimatedCalls: [] },
    situations: [],
  }],
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
const asked = [];

async function open(dark, { withGps }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    ...(withGps
      ? { geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'] }
      : {}),
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, gps }) => {
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
      localStorage.setItem('default::t.weekendMode', '1');
      if (gps) localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
    }
    // NO POSITION AT ALL in the second run — the request says the route need
    // not be related to the GPS measurement, so the screen is driven once
    // with geolocation denied outright.
    if (!gps && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition = (_ok, err) => err && err({ code: 1, message: 'denied' });
      navigator.geolocation.watchPosition = (_ok, err) => { err && err({ code: 1, message: 'denied' }); return 0; };
    }
  }, { now: NOW, here: HERE, gps: withGps });

  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) {
      // ESCAPED. postData is the JSON envelope, so the query's quotes are
      // \" — a regex for a bare quote found nothing and reported the
      // feature missing. The instrument was wrong, for the seventh time.
      const dt = /dateTime:\\?"([^"\\]+)/.exec(body);
      asked.push({ dateTime: dt ? dt[1] : null, from: /from:\{[^}]*\}/.exec(body)?.[0] });
      // ONLY answers a question asked about Monday. A mock that answered
      // everything would pass with the whole feature removed — the fixture
      // measuring its own absence, which has happened five times here.
      const wantsMonday = dt && Date.parse(dt[1]) > NOW + 12 * 3600_000;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { situations: [] },
          trip: { tripPatterns: wantsMonday ? [pattern] : [] } } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { name: HERE.name, situations: [], estimatedCalls: [] } } }) });
  });
  await page.route('**/geocoder/**', r => {
    const url = r.request().url();
    const oslo = /oslo/i.test(url);
    const p = oslo ? DEST : HERE;
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ features: [{ properties: { id: p.id, label: p.name, name: p.name,
        category: ['railStation'] }, geometry: { coordinates: [p.lon, p.lat] } }] }) });
  });
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#exp-go', { timeout: 20000 });
  return { ctx, page };
}

/** Measured against the NAV BAR's top, not the viewport: it is position:fixed. */
const reachable = page => page.evaluate(() => {
  const btn = document.getElementById('exp-go');
  const nav = document.querySelector('.app-nav');
  if (!btn) return null;
  const floor = (nav && !nav.hidden) ? nav.getBoundingClientRect().top : window.innerHeight;
  const b = btn.getBoundingClientRect();
  return { bottom: Math.round(b.bottom), floor: Math.round(floor), ok: b.bottom <= floor };
});

const verdict = page => page.evaluate(() => {
  const v = document.querySelector('.exp-verdict');
  const rows = [...document.querySelectorAll('.exp-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim());
  const chosen = document.querySelector('.exp-when-chosen');
  return { verdict: v ? v.textContent.trim() : null, rows, chosen: chosen ? chosen.textContent.trim() : null };
});

async function drive(page) {
  await page.fill('#exp-from', 'Storaas');
  await page.waitForTimeout(400);
  await page.click('#exp-from-sugg .sugg-btn');
  await page.fill('#exp-to', 'Oslo');
  await page.waitForTimeout(400);
  await page.click('#exp-to-sugg .sugg-btn');
}

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  const { ctx, page } = await open(dark, { withGps: dark });
  console.log(`\n══ ${theme} modus, 390 px ${dark ? '(med GPS)' : '(POSISJON AVSLÅTT)'} ══`);

  const r0 = await reachable(page);
  console.log(`   «finn reiser» synlig  : ${r0.ok ? 'ja' : 'NEI'} (bunn ${r0.bottom}, gulv ${r0.floor})`);

  await drive(page);

  // «nå» — a Saturday with no service. The honest empty.
  await page.click('#exp-go');
  await page.waitForTimeout(600);
  const na = await verdict(page);
  console.log(`   svar på «nå»          : ${na.verdict || na.rows.join(' | ')}`);

  // Now the time this release exists for: Monday morning, two days out.
  await page.click('.exp-when-btn[data-when="velg"]');
  await page.waitForTimeout(150);
  await page.fill('#exp-at', '2026-09-21T06:00');
  await page.waitForTimeout(300);
  await page.click('#exp-go');
  await page.waitForTimeout(700);
  const man = await verdict(page);
  console.log(`   valgt tidspunkt       : ${man.chosen}`);
  console.log(`   svar på mandag        : ${man.rows.length ? man.rows.join(' | ') : '(' + man.verdict + ')'}`);
  console.log(`   «finn reiser» fortsatt: ${(await reachable(page)).ok ? 'synlig' : 'UNDER GULVET'}`);

  await page.screenshot({ path: `scratchpad/utforsk-${theme}.png`, fullPage: true });
  await ctx.close();
}

console.log('\n══ hva som faktisk ble spurt om ══');
for (const a of asked) console.log(`   dateTime=${a.dateTime}  ${a.from}`);
const future = asked.filter(a => a.dateTime && Date.parse(a.dateTime) > NOW + 12 * 3600_000);
console.log(`   spørsmål om et døgn fram: ${future.length} — ${future.length ? 'tidspunktet nådde API-et' : 'INGEN, funksjonen nådde ikke fram'}`);

await browser.close();
server.close();
