/**
 * A departure tomorrow, on the board.
 *
 * Reported from Storaas Gjestegård: bus 415 at 07:05, nineteen hours out,
 * shown as "07:05" with nothing to say it is not today — and a strip pill
 * reading "12411209", which was two minute-counts run together.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4496;
const NOW = Date.parse('2026-09-06T11:12:00+02:00');
const iso = ms => new Date(ms).toISOString();
const FROM = { id: 'NSR:StopPlace:16828', name: 'Storaas Gjestegård', lat: 59.66, lon: 9.65 };
const TO = { id: 'NSR:StopPlace:58366', name: 'Jernbanetorget, Oslo', lat: 59.911, lon: 10.750 };

/* Departures 1241 and 1209 minutes out — the reported case, to the minute. */
const leg = (mins, dur, code, colour) => ({
  mode: 'bus', distance: 60000,
  aimedStartTime: iso(NOW + mins * 60000), expectedStartTime: iso(NOW + mins * 60000),
  aimedEndTime: iso(NOW + (mins + dur) * 60000), expectedEndTime: iso(NOW + (mins + dur) * 60000),
  fromPlace: { name: FROM.name, quay: { id: 'NSR:Quay:1', publicCode: '1',
    stopPlace: { id: FROM.id, name: FROM.name }, latitude: FROM.lat, longitude: FROM.lon } },
  toPlace: { name: TO.name, quay: { id: 'NSR:Quay:2', publicCode: 'B',
    stopPlace: { id: TO.id, name: TO.name }, latitude: TO.lat, longitude: TO.lon } },
  line: { id: 'BRA:Line:' + code, publicCode: code, transportMode: 'bus',
    presentation: { colour, textColour: 'ffffff' } },
  serviceJourney: { id: 'BRA:ServiceJourney:' + code + mins, situations: [],
    line: { id: 'BRA:Line:' + code, publicCode: code, transportMode: 'bus',
      presentation: { colour } },
    estimatedCalls: [] },
  situations: [], pointsOnLink: null,
});
const PATTERNS = [
  { duration: 144 * 60, aimedStartTime: iso(NOW + 1209 * 60000),
    expectedStartTime: iso(NOW + 1209 * 60000), legs: [leg(1209, 144, '415', 'a8321f')] },
  { duration: 138 * 60, aimedStartTime: iso(NOW + 1241 * 60000),
    expectedStartTime: iso(NOW + 1241 * 60000), legs: [leg(1241, 138, '415', 'a8321f')] },
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

async function run(dark, shot) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 900 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, from, to }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', 'system');
    // There is no t.landing key: the landing screen is derived from these two.
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.weekendMode', '0');
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: from.name, to: to.name,
      stopId: from.id, toStopId: to.id, filter: null, geo: null, toGeo: null, line: null,
      _fromLat: from.lat, _fromLon: from.lon, _toLat: to.lat, _toLon: to.lon,
    }));
  }, { now: NOW, from: FROM, to: TO });

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
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [] }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 }).catch(async () => {
    await page.click('#status-dot').catch(() => {});
    await page.waitForTimeout(600);
    console.log('  ingen rader. panelet sier:');
    console.log((await page.$eval('#dbg-diag', e => e.textContent)).split('\n').map(l => '    ' + l).join('\n'));
    throw new Error('no rows');
  });
  await page.waitForTimeout(1200);

  if (dark) {
    console.log('\n══ stripa ══');
    const glyphs = await page.$$eval('#line-strip .ls-veh text', els => els.map(e => e.textContent));
    console.log('  merker:', JSON.stringify(glyphs));
    const cap = await page.$$eval('#line-strip [title]', els => els.map(e => e.getAttribute('title')));
    cap.slice(0, 2).forEach(t => console.log('  tooltip:', t));

    console.log('\n══ radene ══');
    const rows = await page.$$eval('#dep-list .dep-row', els => els.slice(0, 2).map(e => ({
      klokke: (e.querySelector('.dep-mins') || {}).textContent,
      avgang: (e.querySelector('.dep-dep') || {}).textContent,
      ank: (e.querySelector('.dep-arr') || {}).textContent,
    })));
    rows.forEach(r => console.log('  ', JSON.stringify(r)));
  }
  // The detail view is where jd-val sits: a large value in a narrow column,
  // the same shape as the big clock that broke on the row.
  await page.click('#dep-list .dep-row');
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  if (dark) {
    const jd = await page.$$eval('#v-selected .jd-val', els => els.map(e => e.textContent.trim()));
    console.log('\n══ detaljvisningen ══');
    console.log('  jd-val:', JSON.stringify(jd));
    const wrapped = await page.$$eval('#v-selected .jd-val',
      els => els.map(e => e.scrollHeight > e.clientHeight + 2));
    console.log('  brekker over linjer?', JSON.stringify(wrapped));
  }
  if (shot) await page.screenshot({ path: shot.replace('.png', '-detail.png'),
    animations: 'disabled' });
  await page.goBack().catch(() => {});
  await page.waitForTimeout(400);
  if (shot) await page.screenshot({ path: shot, animations: 'disabled' });
  await ctx.close();
}

fs.mkdirSync('scratchpad/shots', { recursive: true });
await run(true, 'scratchpad/shots/tomorrow-dark.png');
await run(false, 'scratchpad/shots/tomorrow-light.png');
await browser.close(); server.close();
