/**
 * Hva en fremmed faktisk ser først.
 *
 * firstRun.js exists because the first screen used to be an empty two-field
 * form, and its own doc says so: «You cannot *try* something that demands to
 * be filled in first.» The example board was the answer.
 *
 * But the ladder's LAST rung is 'auto', not 'example' (v1.61.0), so the
 * example board is reached only by a reader who has turned auto-reise OFF —
 * which a first-time visitor cannot have done. This runs the real bundle with
 * nothing stored and the location permission in its true first-visit state:
 * NOT granted, not denied, just unanswered, because that is what a browser
 * shows while its own prompt is up.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4531;

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

/**
 * @param perm 'prompt'  the honest first visit — the browser is still asking
 *             'denied'  they said no
 *             'granted' they said yes, and a fix arrives
 */
async function run(scheme, perm) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    permissions: perm === 'granted' ? ['geolocation'] : [],
    ...(perm === 'granted'
      ? { geolocation: { latitude: 59.9127, longitude: 10.7461, accuracy: 14 } } : {}),
  });
  const page = await ctx.newPage();
  // NOTHING SEEDED. That is the whole fixture: no route, no journey, no mode,
  // no theme — a stranger opening the link for the first time.
  await page.addInitScript(({ scheme }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
  }, { scheme });

  // Entur answers with departures, so «nothing on screen» can only mean the
  // app never asked — not that the network was down.
  // REAL DEPARTURES. «A working board» is the entire claim of this release, and
  // an empty one would have let the probe report success while a stranger saw
  // a heading and nothing under it.
  const NOW = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const pattern = (m) => ({
    duration: 240, aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
    legs: [{
      mode: 'metro', distance: 1800,
      aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
      aimedEndTime: iso(NOW + (m + 4) * 60000), expectedEndTime: iso(NOW + (m + 4) * 60000),
      fromPlace: { name: 'Jernbanetorget', quay: { id: 'NSR:Quay:1', publicCode: '1',
        stopPlace: { id: 'NSR:StopPlace:58366', name: 'Jernbanetorget' },
        latitude: 59.9112, longitude: 10.7503 } },
      toPlace: { name: 'Nationaltheatret', quay: { id: 'NSR:Quay:9', publicCode: '9',
        stopPlace: { id: 'NSR:StopPlace:58404', name: 'Nationaltheatret' },
        latitude: 59.9147, longitude: 10.7332 } },
      line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro',
        presentation: { colour: 'f5a000' } },
      situations: [],
      fromEstimatedCall: { expectedDepartureTime: iso(NOW + m * 60000),
        aimedDepartureTime: iso(NOW + m * 60000), realtime: true,
        quay: { publicCode: '1' }, destinationDisplay: { frontText: 'Nationaltheatret' } },
      toEstimatedCall: { expectedArrivalTime: iso(NOW + (m + 4) * 60000),
        aimedArrivalTime: iso(NOW + (m + 4) * 60000), quay: { publicCode: '9' } },
      serviceJourney: { id: 'RUT:ServiceJourney:3-' + m, situations: [],
        line: { id: 'RUT:Line:3', publicCode: '3', presentation: { colour: 'f5a000' } },
        estimatedCalls: [] },
      pointsOnLink: null,
    }],
  });
  await page.route(/journey-planner/, r => r.fulfill({ status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: {
      stopPlace: { situations: [] }, dest: { situations: [] },
      trip: { tripPatterns: [3, 8, 14, 21].map(pattern) } } }) }));
  // THE GEOCODER ANSWERS, because the example board looks up its two stop
  // names through it. Stubbing it empty made the board report «Fant ikke
  // Jernbanetorget» — a broken first impression produced by the fixture, not
  // by the app, and exactly the kind of number that describes nothing. On the
  // 'granted' run it also served the reverse lookup no stops, which is a real
  // state with words of its own and must NOT fall back.
  const STOPS = {
    Jernbanetorget: { id: 'NSR:StopPlace:58366', lat: 59.9112, lon: 10.7503 },
    Nationaltheatret: { id: 'NSR:StopPlace:58404', lat: 59.9147, lon: 10.7332 },
  };
  await page.route(/geocoder/, r => {
    const u = r.request().url();
    const hit = Object.keys(STOPS).find(n => decodeURIComponent(u).includes(n));
    // The reverse lookup (no text) is what fills nearestStations.
    const name = hit || (perm === 'granted' ? 'Jernbanetorget' : null);
    if (!name) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ features: [] }) });
    const st = STOPS[name];
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ features: [{
        properties: { id: st.id, name, label: name, category: ['metroStation'] },
        geometry: { coordinates: [st.lon, st.lat] } }] }) });
  });
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  // PAST THE FALLBACK WINDOW. The first run of this probe waited 2500 ms
  // against a 4000 ms window and reported that nothing had changed — it was
  // measuring the moment before the thing it exists to measure.
  await page.waitForTimeout(6000);

  const seen = await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('[id^="v-"]'))
      .find(e => e.style.display !== 'none' && e.offsetParent !== null);
    // Every run of readable text on the screen, in order — the only honest
    // answer to «what does a stranger see».
    const out = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.textContent.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      let p = n.parentElement, vis = true;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (cs.display === 'none' || cs.visibility === 'hidden') { vis = false; break; }
        p = p.parentElement;
      }
      if (vis) out.push(t);
    }
    return {
      skjerm: v ? v.id : '(ingen)',
      demoNote: (() => {
        const el = document.getElementById('demo-note');
        if (!el) return '(fins ikke)';
        return getComputedStyle(el).display === 'none'
          ? '(skjult)' : el.textContent.replace(/\s+/g, ' ').trim();
      })(),
      avganger: document.querySelectorAll('#dep-list .dep-row').length,
      tekst: out.slice(0, 14),
    };
  });

  console.log(`\n══ ${scheme} · tillatelse: ${perm} ══`);
  console.log('   skjerm    :', seen.skjerm);
  console.log('   demo-note :', seen.demoNote);
  console.log('   avganger  :', seen.avganger);
  console.log('   tekst     :', seen.tekst.join(' | '));

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/forste-${scheme}-${perm}.png`,
    clip: { x: 0, y: 0, width: 390, height: 700 }, animations: 'disabled' });
  await ctx.close();
}

for (const perm of ['prompt', 'denied', 'granted']) await run('dark', perm);
await run('light', 'prompt');
await browser.close();
server.close();
console.log('');
