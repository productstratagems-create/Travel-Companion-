/**
 * Does the app go where you always go — and say so?
 *
 * Asked for from the Mortensrud screen: «Jernbanetorget er det mest
 * sannsynlige. Gå derfor automatisk dit, men legg på en snarvei tilbake til
 * forrige side.»
 *
 * Three states, because the third is the one that can do harm:
 *   1. clear history   → the board, with the strip above it
 *   2. tap the strip   → back to the direction list, the same rows
 *   3. a close contest → the list stands, exactly as today
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4498;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8617, lon: 10.8285 };

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Mortensrud', 20), stop('Lofsrud', 400)];

const JBT = { name: 'Jernbanetorget', id: 'NSR:StopPlace:6' };
const HEL = { name: 'Hellerud', id: 'NSR:StopPlace:7' };

/* Two directions from Mortensrud, as on the reported screen. Both reach
   Jernbanetorget; line 3 towards Kolsås leaves first. */
const call = (line, front, mins, stops) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line, publicCode: '1', name: 'spor 1' },
  serviceJourney: { id: 'sj:' + line + ':' + mins, situations: [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'metro',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: HERE.lat, longitude: HERE.lon,
        stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud', latitude: HERE.lat, longitude: HERE.lon } },
        aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000) },
      ...stops.map((s, i) => ({
        quay: { latitude: 59.9 + i / 1000, longitude: 10.75,
          stopPlace: { id: s.id, name: s.name, latitude: 59.9 + i / 1000, longitude: 10.75 } },
        aimedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        aimedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000) })),
    ] },
});
const CALLS = [
  call('3', 'Kolsås', 7, [HEL, JBT]),
  call('3', 'Stortinget', 13, [JBT]),
];

const histRow = (to, id, n) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Mortensrud', toName: to, toStopId: id,
  toLat: 59.91, toLon: 10.75, fromStopId: 'NSR:StopPlace:Mortensrud',
  bucket: 3, isWeekend: false, count: n, lastUsed: NOW,
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

async function run(label, hist, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, hist }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.smartHist', JSON.stringify(hist));
    // The shortcuts over the stop list read t.freqArr, which the same
    // _recordChoice writes — so a reader with history has both. Without this
    // the probe measured a screen no real reader ever sees.
    localStorage.setItem('default::t.freqArr', JSON.stringify(
      hist.map(h => ({ name: h.toName, stopId: h.toStopId, lat: h.toLat, lon: h.toLon,
        count: h.count, lastUsed: h.lastUsed }))));
  }, { now: NOW, here: HERE, hist });

  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: NEARBY }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
        trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Mortensrud', estimatedCalls: CALLS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  const read = () => page.evaluate(() => {
    const t = document.getElementById('auto-toast');
    return {
      skjerm: ['v-board', 'v-auto'].find(v => {
        const el = document.getElementById(v);
        return el && el.style.display !== 'none';
      }) || '?',
      stripe: t && t.style.display !== 'none' ? t.textContent.replace(/\s+/g, ' ').trim() : null,
      overskrift: (document.getElementById('station-name') || {}).textContent || null,
      mål: (document.getElementById('dir-dest') || {}).textContent || null,
      retninger: Array.from(document.querySelectorAll('#auto-body .auto-dir'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim().slice(0, 30)),
      // Seeded at 12. If the jump were recorded as a choice it would read 13
      // — and the prediction would be feeding on its own output.
      teller: (JSON.parse(localStorage.getItem('default::t.freqArr') || '[]')
        .find(e => e.name === 'Jernbanetorget') || {}).count,
    };
  });

  console.log('\n══ ' + label + ' · ' + scheme + ' ══');
  const a = await read();
  console.log('  skjerm     :', a.skjerm);
  console.log('  stripe     :', a.stripe);
  if (a.skjerm === 'v-board') console.log('  tavla      :', a.overskrift, '→', a.mål);
  if (a.retninger.length) a.retninger.forEach(r => console.log('    retning:', r));
  console.log('  Jernbanetorget teller:', a.teller, '(seedet 12 \u2014 13 ville betydd at hoppet ble talt)');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: 'scratchpad/shots/jump-' + label + '-' + scheme + '.png', animations: 'disabled' });

  if (a.stripe) {
    await page.click('.auto-toast-back');
    await page.waitForTimeout(1500);
    const b = await read();
    console.log('  ── etter trykk på stripa ──');
    console.log('  skjerm     :', b.skjerm);
    b.retninger.forEach(r => console.log('    retning:', r));
    await page.screenshot({ path: 'scratchpad/shots/jump-' + label + '-tilbake-' + scheme + '.png', animations: 'disabled' });

    // The screen the reader actually pointed at: the stops inside a
    // direction, with «ofte brukt» above the full line. After a jump and a
    // tap back it must be exactly what it was before — the jump skips it, it
    // does not change it.
    await page.click('#auto-body .auto-dir');
    await page.waitForTimeout(800);
    const c = await page.evaluate(() => ({
      tilbakeknapp: (document.querySelector('.auto-back-dir') || {}).textContent || null,
      merkelapper: Array.from(document.querySelectorAll('#auto-body .set-label'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      snarveier: Array.from(document.querySelectorAll('#auto-body .auto-fav-stop'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()),
      alle: Array.from(document.querySelectorAll('#auto-body .auto-stop-btn:not(.auto-fav-stop)'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()),
    }));
    console.log('  ── stopplista, etter \u00e5 ha trykket inn selv ──');
    console.log('  tilbake  :', c.tilbakeknapp);
    console.log('  merkelapper:', c.merkelapper.join(' | '));
    c.snarveier.forEach(x => console.log('    ofte brukt:', x));
    c.alle.forEach(x => console.log('    stopp     :', x));
    await page.screenshot({ path: 'scratchpad/shots/jump-' + label + '-stopplista-' + scheme + '.png', animations: 'disabled' });
  }
  await ctx.close();
}

await run('klar', [histRow('Jernbanetorget', JBT.id, 12), histRow('Hellerud', HEL.id, 2)], 'dark');
await run('jevnt', [histRow('Jernbanetorget', JBT.id, 6), histRow('Hellerud', HEL.id, 5)], 'dark');
await run('klar', [histRow('Jernbanetorget', JBT.id, 12), histRow('Hellerud', HEL.id, 2)], 'light');
await browser.close(); server.close();
