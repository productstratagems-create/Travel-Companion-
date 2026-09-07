/**
 * The strip, read off the rail.
 *
 * Reported with a screenshot: "Avgangene på strip stokkes om og flere
 * avganger med 1t labelen bør heller clustres." The strip read
 * 5t · 47 · 1t+1 · 2 — 47 minutes standing LEFT of a departure an hour later,
 * and the departures past the hour split across two glyphs.
 *
 * Measured cause: the axis ran to the FURTHEST departure, so one five hours
 * out squeezed 2, 17 and 47 min between 73.6% and 85.5% of the rail, and
 * clustering then decided membership on hairline differences in axis units on
 * an axis that is not linear. Which glyph led flipped as the minutes ticked.
 *
 * This drives the screenshot's own set and reads every glyph's left% and
 * label out of the DOM, twice a minute apart, so the shuffling would show.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4496;
const NOW = Date.parse('2026-09-06T23:15:00+02:00');
const iso = ms => new Date(ms).toISOString();

const FROM = { name: 'Mortensrud', id: 'NSR:StopPlace:6098', lat: 59.8617, lon: 10.8285 };
const TO   = { name: 'Jernbanetorget', id: 'NSR:StopPlace:6', lat: 59.9114, lon: 10.7503 };
const MINS = [2, 17, 47, 65, 70, 310];

const pattern = (m, i) => ({
  startTime: iso(NOW + m * 60000), endTime: iso(NOW + (m + 25) * 60000),
  legs: [{
    mode: 'metro', distance: 12000,
    aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
    aimedEndTime: iso(NOW + (m + 25) * 60000), expectedEndTime: iso(NOW + (m + 25) * 60000),
    realtime: true,
    line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro', presentation: { colour: 'f5a000' } },
    fromEstimatedCall: { quay: { id: 'NSR:Quay:1', publicCode: '1' },
      destinationDisplay: { frontText: 'Jernbanetorget' },
      aimedDepartureTime: iso(NOW + m * 60000), expectedDepartureTime: iso(NOW + m * 60000), realtime: true },
    fromPlace: { name: FROM.name, quay: { id: 'NSR:Quay:1', stopPlace: { id: FROM.id, name: FROM.name } },
      latitude: FROM.lat, longitude: FROM.lon },
    toPlace: { name: TO.name, quay: { id: 'NSR:Quay:9', stopPlace: { id: TO.id, name: TO.name } },
      latitude: TO.lat, longitude: TO.lon },
    serviceJourney: { id: 'sj:' + i, situations: [],
      line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro', presentation: { colour: 'f5a000' } },
      estimatedCalls: [{ quay: { id: 'NSR:Quay:9', latitude: TO.lat, longitude: TO.lon,
        stopPlace: { id: TO.id, name: TO.name, latitude: TO.lat, longitude: TO.lon } },
        aimedArrivalTime: iso(NOW + (m + 25) * 60000), expectedArrivalTime: iso(NOW + (m + 25) * 60000),
        aimedDepartureTime: iso(NOW + (m + 25) * 60000), expectedDepartureTime: iso(NOW + (m + 25) * 60000) }] },
  }],
});
const PATTERNS = MINS.map(pattern);

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
    viewport: { width: 414, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
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
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  await page.waitForTimeout(1500);
  const dbg = await page.evaluate(() => {
    const el = document.getElementById('line-strip');
    return { finnes: !!el, display: el && el.style.display, html: el ? el.innerHTML.length : 0,
      rader: document.querySelectorAll('#dep-list .dep-row').length };
  });
  console.log('  strip:', JSON.stringify(dbg));
  await page.waitForSelector('#line-strip .ls-train', { timeout: 15000 });
  await page.waitForTimeout(1500);

  const read = () => page.$$eval('#line-strip .ls-train', els => els.map(e => ({
    venstre: Number(parseFloat(e.style.left).toFixed(1)),
    merke: (e.querySelector('text') || {}).textContent || '',
    n: Number(e.dataset.count),
  })).sort((a, b) => a.venstre - b.venstre));

  console.log('\n══ ' + scheme + ' ══');
  const a = await read();
  a.forEach(g => console.log('   ' + String(g.venstre).padStart(5) + '%  ' + g.merke.padEnd(4)
    + (g.n > 1 ? '+' + (g.n - 1) : '')));
  console.log('  rekkefølge:', a.map(g => g.merke + (g.n > 1 ? '+' + (g.n - 1) : '')).join(' · '));

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/strip-' + scheme + '.png', animations: 'disabled' });
  await ctx.close();
}

await run('dark');
await run('light');
await browser.close(); server.close();
