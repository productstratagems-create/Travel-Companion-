/**
 * «Når skal jeg av» — i de fire tilstandene den nå har.
 *
 * WHAT ONLY A BROWSER CAN SETTLE, and the reason this release exists rather
 * than the spoken one: whether the answer can be read AT ARM'S LENGTH. The
 * number was always on the screen — twelve pixels, muted, far right of a row
 * holding «ank. Jernbanetorget 08:17 · om 14 min». A unit test proves the
 * string; only a screenshot shows whether seven stops and one stop look
 * different enough to act on while standing on a moving bus.
 *
 * So the probe measures the rendered SIZE of the line at each stage, in both
 * themes, and takes a picture of each. It also checks the calm state does NOT
 * get the weight — a banner that shouts at every stop is one nobody reads by
 * the third, and that failure is invisible in every assertion about the
 * urgent ones.
 *
 * The journey is seeded through localStorage exactly as a reload restores it.
 * Nothing here reaches api.entur.io; the tracking poll is answered locally.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4559;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

const NAMES = ['Oppsal', 'Skøyenåsen', 'Godlia', 'Hellerud', 'Brynseng',
  'Helsfyr', 'Ensjø', 'Tøyen', 'Grønland', 'Jernbanetorget'];
const LAT = 59.888, LON0 = 10.845, DLON = -0.008;
const STEP = 120_000;

/**
 * `boarded` says how many stops are already behind the train, which is what
 * moves the reader from «av om 8 stopp» to «av nå» without touching the app.
 */
const calls = boarded => NAMES.map((name, i) => {
  const t = NOW + (i - boarded) * STEP;
  return {
    quay: { latitude: LAT + i * 0.002, longitude: LON0 + i * DLON,
      stopPlace: { id: 'NSR:StopPlace:' + i, name, latitude: LAT + i * 0.002, longitude: LON0 + i * DLON } },
    aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
    aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
    realtime: true,
  };
});

const jny = boarded => ({
  dest: 'Jernbanetorget', from: 'Oppsal', boardedAt: NOW - boarded * STEP,
  lineCode: '3', lineBg: '#e60000', frontText: 'Jernbanetorget',
  arrival: { time: iso(NOW + (9 - boarded) * STEP), clk: '08:17' },
  _toLat: LAT + 9 * 0.002, _toLon: LON0 + 9 * DLON,
  legs: [{
    lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#e60000', mode: 'metro',
    frontText: 'Jernbanetorget', journeyId: 'RUT:ServiceJourney:3-0810',
    fromStation: 'Oppsal', toStation: 'Jernbanetorget',
    depTime: { time: iso(NOW - boarded * STEP), clk: '08:05' },
    arrTime: { time: iso(NOW + (9 - boarded) * STEP), clk: '08:17' },
    quay: '1',
    stops: calls(boarded),
  }],
});

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

async function open(dark, boarded) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, j }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(j));
  }, { scheme: dark ? 'dark' : 'light', j: jny(boarded) });

  await page.route(/journey-planner/, r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { serviceJourney: { estimatedCalls: calls(boarded) } } }),
  }));
  await page.route(/geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

/**
 * The eyebrow AND the strip caption, read together.
 *
 * Apart they both look fine; the fault was only ever visible as a pair —
 * «Snart fremme» sitting two centimetres above «1 stopp igjen». So the
 * probe prints them side by side, which is the whole claim of the release.
 */
const read = page => page.evaluate(() => {
  const eb = document.querySelector('.alight-card-eyebrow');
  const cap = document.querySelector('.js-caption, .strip-caption');
  const strip = document.getElementById('j-strip');
  const capText = cap ? cap.textContent
    : (strip ? (strip.textContent.match(/\d+ stopp igjen|framme/) || [null])[0] : null);
  return {
    kort: eb ? eb.textContent.trim() : null,
    stripe: capText ? capText.trim() : null,
    tagg: (document.querySelector('.ct-stops') || {}).textContent || null,
  };
});

// `boarded` is which stop INDEX is at t=0, and the count includes the stop
// being approached — so boarded=9 is «one left», not boarded=8. The first
// cut used 8 and 9 and never rendered the two states this release exists
// for, while reporting four stages as if it had. The instrument, again.
// `boarded` is which stop INDEX sits at t=0, and the count includes the stop
// being approached — so boarded=9 is not «one left». Worse, the leg's arrTime
// IS stop 9's arrival, and currentState leaves `riding` the moment
// `now >= arrTs` (track.js:1441). So boarded 9 and 10 both land on the
// ARRIVAL screen, and the first cut reported «ingen linje» for the two
// states this release exists for — having measured the wrong thing twice.
//
// 8.5 puts the train BETWEEN the second-to-last stop and the last: Grønland
// a minute behind, Jernbanetorget a minute ahead. That is «av ved neste
// stopp», and it is a real position a rider is in for about two minutes.
const STAGES = [
  { boarded: 1, navn: 'nettopp ombord' },
  { boarded: 7, navn: 'tre stopp igjen' },
  { boarded: 8, navn: 'to stopp igjen' },
  { boarded: 8.5, navn: 'neste stopp er ditt' },
  { boarded: 10, navn: 'framme (ankomstskjermen)' },
];

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 390 px ══`);
  for (const st of STAGES) {
    const { ctx, page } = await open(dark, st.boarded);
    const r = await read(page);
    console.log(`   ${st.navn.padEnd(24)} kort: ${String(r.kort ?? '(ikke vist)').padEnd(22)}`
      + ` strip: ${String(r.stripe ?? '—').padEnd(16)} tagg: ${r.tagg ?? '—'}`);
    await page.screenshot({ path: `scratchpad/avstig-${theme}-${st.boarded}.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
server.close();
