/**
 * Does the orientation screen actually orient you?
 *
 * auto-reise is where the app answers «where am I, where is the stop, how do
 * I get there, which departures matter». It answered the first three in text
 * — «du er ved Mortensrud T», «369 m» — and had no Leaflet import at all.
 *
 * The numbers can all be right and the screen still read worse: a 140px map
 * band that pushes the departures off the fold has traded one half of the
 * vision for the other. THAT IS DECIDED BY LOOKING, and by counting how many
 * direction rows survive above the fold. So this measures both.
 *
 * The reader stands 369 m from Mortensrud T — the distance from the reported
 * screenshot — with a 5 min walk. Departures at 2, 12 and 22 minutes: the
 * first is one they cannot make, and that is the whole point.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4507;
/* The clock is pinned so the departures are stable, but it must agree with
   the browser's real clock: the geolocation mock stamps pos.timestamp from
   the REAL clock, and posAgeMins compares that against Date.now(). Pinning
   them apart made the heading read «posisjon 24 min gammel» — an artifact of
   the probe, not of the app. */
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

/* You, and the stop you are walking to. ~369 m apart. */
const ME   = { lat: 59.8617, lon: 10.8285 };
const STOP = { lat: 59.8650, lon: 10.8285 };

/* THE REPORTED SCREEN, built on purpose.
   The screenshot read «Mortensrud» with «6014 m ▾» straight across it, then
   «15 min gange · posisjon 8 min gammel» wrapped to two lines. Three things
   have to be true at once to get there, and the happy fixture above has none
   of them:
     - a FOUR-DIGIT distance, so the right-hand string is long;
     - a stale fix, so «posisjon N min gammel» is on the end;
     - and the two numbers DISAGREEING, which needs the distance and the walk
       measured from different points.
   The last one is the mechanism: findNearestStation measures from the
   position it was called with (homeLL), while walkMinsTo prefers
   state.walkFromLL — the «gå fra» place set in settings, restored from
   storage at module load. Nothing in findNearestStation reads it. So with
   «gå fra» set they measure from two different places, permanently. */
const FAR_HOME = { lat: 59.9160, lon: 10.8285 };   // ~6 km north of the stop
const WALK_FROM = { lat: 59.8542, lon: 10.8285 };  // ~1.2 km south of it
const STALE_MIN = 8;

const mk = (name, lat, lon, cats) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name, category: cats },
  geometry: { coordinates: [lon, lat] },
});
const STOPS = [
  mk('Mortensrud T', STOP.lat, STOP.lon, ['metroStation']),     // ~369 m
  mk('Lofsrudveien', 59.8672, 10.8330, ['onstreetBus']),        // further
  mk('Bjørnholt skole', 59.8690, 10.8360, ['onstreetBus']),     // further still
];
/* The reported set. The name is ONE WORD on purpose: «Bjørnholt skole» has a
   space and can wrap, «Mortensrud» cannot — so when the row squeezes it to
   nothing it runs out of its own box instead of breaking. That is the
   difference between a fixture that reproduces this and one that does not. */
const STOPS_HARD = [
  mk('Mortensrud', 59.8690, 10.8285, ['metroStation']),
  mk('Lofsrudveien', 59.8672, 10.8330, ['onstreetBus']),
];

const dep = (front, mins, code, mode, colour) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + code, publicCode: code, name: 'Spor ' + code },
  serviceJourney: { id: 'sj:' + front + mins, situations: [],
    line: { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode,
      presentation: { colour } },
    estimatedCalls: [{ quay: { latitude: 59.88, longitude: 10.82,
      stopPlace: { id: 'NSR:StopPlace:Ryen', name: 'Ryen', latitude: 59.88, longitude: 10.82 } },
      aimedArrivalTime: iso(NOW + (mins + 7) * 60000), expectedArrivalTime: iso(NOW + (mins + 7) * 60000),
      aimedDepartureTime: iso(NOW + (mins + 7) * 60000), expectedDepartureTime: iso(NOW + (mins + 7) * 60000) }] },
});
/* 2 minutes is unreachable on a 5 minute walk; 12 and 22 are not. */
/* FIVE directions, as on the reported screen — Kolsås, Stortinget, Holmlia,
   Bjørndal, Jernbanetorget. The heading grew by ~20px when it became two
   lines, and «does that push a departure off the fold» can only be answered
   against a realistic number of rows. Two would have flattered it. */
const CALLS = [
  dep('Stortinget', 2, '3', 'metro', 'f5a000'),
  dep('Stortinget', 12, '3', 'metro', 'f5a000'),
  dep('Stortinget', 22, '3', 'metro', 'f5a000'),
  dep('Kolsås', 4, '3', 'metro', 'f5a000'),
  dep('Kolsås', 18, '3', 'metro', 'f5a000'),
  dep('Helsfyr', 6, '70', 'bus', 'e60000'),
  dep('Helsfyr', 26, '70', 'bus', 'e60000'),
  dep('Holmlia stasjon', 9, '73', 'bus', 'e60000'),
  dep('Holmlia stasjon', 29, '73', 'bus', 'e60000'),
  dep('Bjørndal', 15, '71', 'bus', 'e60000'),
  dep('Jernbanetorget', 19, '74', 'bus', 'e60000'),
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

async function run(scheme, width, hard) {
  const W = width || 414;
  const HOME = hard ? FAR_HOME : ME;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HOME.lat, longitude: HOME.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, me, scheme, walkFrom }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.landing', 'auto');
    localStorage.setItem('default::t.homeLL', JSON.stringify(me));
    // The app reads its theme from storage, not from prefers-color-scheme —
    // DEFAULT_THEME is 'dark' and the inline boot script stamps it. Setting
    // colorScheme on the context alone left the "light" run rendering dark.
    localStorage.setItem('default::t.theme', scheme);
    if (walkFrom) localStorage.setItem('default::t.walkFrom', JSON.stringify(walkFrom));
  }, { now: NOW + (hard ? STALE_MIN * 60000 : 0), me: HOME, scheme, walkFrom: hard ? WALK_FROM : null });

  let valhalla = 0, enturFoot = 0;
  await page.route('**/geocoder/**', route => route.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ features: hard ? STOPS_HARD : STOPS }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('directMode:foot') || body.includes('directMode: foot')) {
      enturFoot++;
      // A route that bends around the block, so it is visibly not the crow line.
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { trip: { tripPatterns: [{ legs: [{
          pointsOnLink: { points: '', length: 470 } }] }] } } }) });
    }
    if (body.includes('estimatedCalls')) return route.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'x', name: 'Mortensrud T', estimatedCalls: CALLS } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, trip: { tripPatterns: [] } } }) });
  });
  await page.route(/valhalla/, r => { valhalla++; return r.abort(); });
  await page.route(/open-meteo|overpass|geoapify|mobility/, r => r.abort());
  await page.route(/tiles|basemaps|stadiamaps/, r => r.fulfill({ status: 200,
    contentType: 'image/png', body: Buffer.alloc(0) }));
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#v-auto .auto-stop', { timeout: 15000 });
  await page.waitForTimeout(5000);

  console.log(`\n══ ${scheme.toUpperCase()} · ${W} px · ${hard ? 'RAPPORTERT TILFELLE' : 'enkelt'} ══`);

  const head = await page.$eval('#v-auto .auto-stop', e => e.textContent.replace(/\s+/g, ' ').trim());
  console.log('  overskrift   :', head);

  // DOES ANYTHING IN THE HEADING SIT ON TOP OF ANYTHING ELSE?
  // Reported by screenshot: «Mortensrud» with «6014 m ▾» straight across it.
  // A generic collision check rather than a check for this one pair, so it
  // also catches the next fact somebody adds to this row.
  const clash = await page.evaluate(() => {
    const root = document.querySelector('#v-auto .auto-stop');
    if (!root) return null;
    // Every run of text, measured where it actually paints. Element boxes are
    // not enough: the stop name is a bare text node whose parent also holds
    // the caret, so an element-only sweep never sees the name at all.
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const leaves = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const rng = document.createRange();
      rng.selectNodeContents(n);
      for (const r of rng.getClientRects()) {
        if (r.width > 0 && r.height > 0) {
          leaves.push({ t: n.textContent.replace(/\s+/g, ' ').trim().slice(0, 22), r });
        }
      }
    }
    const hits = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i].r, b = leaves[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 1) hits.push(`«${leaves[i].t}» ✕ «${leaves[j].t}» (${Math.round(ox)}×${Math.round(oy)} px)`);
      }
    }
    const box = root.getBoundingClientRect();
    const spill = leaves.filter(x => x.r.right > box.right + 1).map(x => `«${x.t}» stikker ${Math.round(x.r.right - box.right)} px utenfor`);
    return { hits, spill, høyde: Math.round(box.height) };
  });
  console.log('  overlapp     :', clash.hits.length ? clash.hits.join(' | ') : 'ingen');
  if (clash.spill.length) console.log('  utenfor kant :', clash.spill.join(' | '));
  console.log('  overskriftens høyde:', clash.høyde, 'px');

  const hasMap = await page.$eval('#auto-map-wrap', e => getComputedStyle(e).display !== 'none').catch(() => false);
  const mapBox = await page.$eval('#auto-map', e => { const r = e.getBoundingClientRect();
    return { h: Math.round(r.height), w: Math.round(r.width) }; }).catch(() => null);
  console.log('  kartbånd     :', hasMap ? `synlig ${mapBox.w}×${mapBox.h}` : 'SKJULT');

  // What is actually drawn on it.
  const layers = await page.evaluate(() => {
    const el = document.querySelector('#auto-map');
    if (!el) return null;
    return {
      markers: el.querySelectorAll('.leaflet-marker-icon').length,
      dots: el.querySelectorAll('path.leaflet-interactive').length,
      lines: el.querySelectorAll('svg path[stroke-dasharray]').length,
    };
  });
  console.log('  på kartet    :', JSON.stringify(layers));

  // WHERE the things are, not just how many. The screenshot showed the stop
  // marker missing entirely with the walk line running off the top edge.
  const geom = await page.evaluate(() => {
    const el = document.querySelector('#auto-map');
    const box = el.getBoundingClientRect();
    const inside = (r) => r.top >= box.top - 1 && r.bottom <= box.bottom + 1
                       && r.left >= box.left - 1 && r.right <= box.right + 1;
    return {
      boks: { w: Math.round(box.width), h: Math.round(box.height) },
      nåler: Array.from(el.querySelectorAll('.leaflet-marker-icon')).map(m => {
        const r = m.getBoundingClientRect();
        return { y: Math.round(r.top - box.top), x: Math.round(r.left - box.left), innenfor: inside(r) };
      }),
      prikk: Array.from(el.querySelectorAll('path.leaflet-interactive')).map(m => {
        const r = m.getBoundingClientRect();
        return { y: Math.round(r.top - box.top), x: Math.round(r.left - box.left), innenfor: inside(r) };
      }),
    };
  });
  console.log('  geometri     :', JSON.stringify(geom));

  // The reach marks — the whole reason the walk is surfaced.
  const rows = await page.$$eval('#v-auto .auto-dir', els => els.map(e => ({
    mot: e.querySelector('.nearby-name').textContent.trim(),
    tider: Array.from(e.querySelectorAll('.nearby-dist span'))
      .filter(s => !s.classList.contains('auto-t-more'))
      .map(s => s.textContent.trim() + ' <' +
        (['r-ok', 'r-soon', 'r-now', 'missed'].find(c => s.classList.contains(c)) || 'umerket') + '>')
      .join('  '),
  })));
  console.log('  ── radene ──');
  rows.forEach(r => console.log(`    ${r.mot.padEnd(18)} ${r.tider}`));

  // How much of the screen the departures still get. This is the trade the
  // band makes, and it is the one that can only be settled by measuring.
  const fold = await page.evaluate(() => {
    const h = window.innerHeight;
    return Array.from(document.querySelectorAll('#v-auto .auto-dir'))
      .filter(e => e.getBoundingClientRect().top < h).length;
  });
  console.log('  retningsrader over falsen:', fold, 'av', rows.length);

  // The ladder is Valhalla → Entur foot → cord. One attempt at each rung is
  // correct; more than one of EITHER over five seconds would be the key guard
  // failing, and the screen redraws every second.
  // ONE MAP, not one a second. The screen redraws at 1 Hz; a Leaflet instance
  // torn down and rebuilt on every tick would churn tiles and lose the frame.
  const paneCount = () => page.evaluate(() => document.querySelectorAll('#auto-map .leaflet-map-pane').length);
  const panesFirst = await paneCount();
  await page.waitForTimeout(6000);
  console.log('  kart-instanser: ', panesFirst, '→', await paneCount(), 'etter 6 s (skal være 1 → 1)');

  console.log('  gangrute: valhalla-forsøk', valhalla, '· entur-foot', enturFoot,
    '(1 av hver = stigen, ikke ett per sekund)');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/orient-${scheme}-${W}-${hard ? 'hard' : 'lett'}.png`, animations: 'disabled' });
  await page.screenshot({ path: `scratchpad/shots/orient-${scheme}-${W}-${hard ? 'hard' : 'lett'}-full.png`, fullPage: true, animations: 'disabled' });

  // Tapping a stop on the map must do exactly what tapping the row does.
  const before = await page.$eval('#v-auto .auto-stop-name', e => e.textContent.trim());
  await page.evaluate(() => document.querySelector('#auto-map').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  // The primary stop is drawn first; an ALTERNATIVE is what must be tappable.
  const pins = await page.$$('#auto-map .leaflet-marker-icon');
  const pin = pins[1] || pins[0];
  if (pin) {
    await pin.click({ force: true }).catch(e => console.log('  (klikk:', e.message.split('\n')[0], ')'));
    await page.waitForTimeout(1200);
    const after = await page.$eval('#v-auto .auto-stop-name', e => e.textContent.trim());
    console.log(`  trykk på kartnål: «${before}» → «${after}»`);
  } else {
    console.log('  trykk på kartnål: INGEN NÅL Å TRYKKE PÅ');
  }

  await ctx.close();
}

/* The happy case first, so the regression is visible, then the reported one. */
await run('dark', 390, false);
await run('dark', 390, true);
await run('light', 390, true);
await run('dark', 414, true);
await browser.close();
server.close();
console.log('\nSkjermbilder: scratchpad/shots/orient-*.png\n');
