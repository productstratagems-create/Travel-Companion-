/**
 * Byttet, med ett svar — sett på skjermen.
 *
 * The unit tests bind the banner and the onward list to one verdict. What only
 * a browser can settle is whether the banner READS as the verdict it now
 * carries: «3 venter · 0 min byttetid» has to look like a warning and not like
 * a reassurance, and both conn-alert styles are the same grey box today.
 *
 * Three gaps are driven through the real screen — a change you cannot make, a
 * tight one, and a comfortable one — with the reader's «ekstra tid» set from
 * storage, because that setting is half of what the banner used to ignore.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4529;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

const NAMES = ['Oppsal', 'Skøyenåsen', 'Godlia', 'Hellerud', 'Helsfyr', 'Tøyen', 'Jernbanetorget'];
const LAT = 59.888, LON0 = 10.845, DLON = -0.018;
// Six-minute hops, not two-and-a-half. The first cut used a journey that
// ARRIVED before the nine minutes of silence were up, so the «stille» run
// measured an arrived screen — which suppresses the row by design — and
// reported it as silence. The instrument, not the code.
const STEP = 360_000;

/** The calls the tracking screen polls for, with a cancellation switch. */
const calls = (cancelIdx) => NAMES.map((name, i) => {
  const t = NOW + (i - 1) * STEP;
  return {
    quay: { latitude: LAT + i * 0.004, longitude: LON0 + i * DLON,
      stopPlace: { id: 'NSR:StopPlace:' + i, name, latitude: LAT + i * 0.004, longitude: LON0 + i * DLON } },
    aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
    aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
    realtime: true,
    ...(cancelIdx != null && i === cancelIdx ? { cancellation: true } : {}),
  };
});

/**
 * Two legs, changing at Hellerud. `gapMins` is the slack between arriving on
 * leg 0 and leg 1 departing — the whole variable this probe exists to sweep.
 *
 * The arrival is put four minutes out so the screen is in the «riding» phase,
 * which is the only one the connection banner renders in.
 */
const ARR_IN = 4 * 60_000;
const JNY = (gapMins) => ({
  dest: 'Jernbanetorget', from: 'Oppsal', boardedAt: NOW - 150_000,
  lineCode: '3', lineBg: '#e60000', frontText: 'Jernbanetorget',
  arrival: { time: iso(NOW + ARR_IN + gapMins * 60_000 + 600_000), clk: '—' },
  _toLat: LAT + 4 * 0.004, _toLon: LON0 + 4 * DLON,
  legs: [{
    lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#e60000', mode: 'metro',
    frontText: 'Hellerud', journeyId: 'RUT:ServiceJourney:3-0810',
    fromStation: 'Oppsal', toStation: 'Hellerud',
    depTime: { time: iso(NOW - 150_000), clk: '08:05' },
    arrTime: { time: iso(NOW + ARR_IN), clk: '08:14' },
    quay: '1',
  }, {
    lineCode: '5', lineRef: 'RUT:Line:5', lineBg: '#0b91ef', mode: 'metro',
    frontText: 'Jernbanetorget', journeyId: 'RUT:ServiceJourney:5-0820',
    fromStation: 'Hellerud', toStation: 'Jernbanetorget',
    depTime: { time: iso(NOW + ARR_IN + gapMins * 60_000), clk: '08:' + String(14 + gapMins).padStart(2, '0') },
    arrTime: { time: iso(NOW + ARR_IN + gapMins * 60_000 + 600_000), clk: '08:30' },
    quay: '4',
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

/** @param gapMins slack between arriving on leg 0 and leg 1 leaving */
async function run(scheme, gapMins, extraMins, serveCalls) {
  const W = 390;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, jny, extra }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(jny));
    // HALF OF WHAT THE BANNER USED TO IGNORE. The reader's «ekstra tid» is a
    // setting, so it has to come through storage rather than be passed in.
    localStorage.setItem('default::t.walkBuf', String(extra));
  }, { scheme, jny: JNY(gapMins), extra: extraMins });

  // The journey-planner POST is answered HERE, so the probe controls whether
  // an answer arrives at all — that is the difference between «henter» and
  // «ingen nytt», and it cannot be faked from the page.
  // THE FEED ANSWERS FIRST in every mode but «ingen-svar».
  //
  // The first cut aborted from the start for «stille» and «frakoblet» and then
  // opened the route for 900ms — but the poll runs every trackRefreshMs (20s),
  // so no second request was ever made and no answer ever landed. Both modes
  // measured «nothing has arrived yet», which is a different state with a
  // different label, and reported it as silence after news. The instrument, a
  // third time: an answer must arrive on the FIRST poll, at startTracking,
  // and the silence has to begin after it.

  // THE INSTRUMENT'S OWN BUG, FOUND BY RUNNING IT. Serving estimatedCalls made
  // _fetchTrack overwrite leg.arrTime and leg.depTime from the mocked calls —
  // so the gap this probe exists to sweep was destroyed before anything was
  // measured, and a 20-minute change reported as «5 venter». The banner reads
  // only the stored leg times, so the honest fixture is no answer at all.
  // NOT ENOUGH, and said rather than left looking measured: with calls served
  // the tracking map still draws zero paths from this fixture, so the change
  // to THIS screen's drawing is bound by the seam test in tests/mapVoice.test.js
  // and has not been seen. Four goes at the fixture did not produce it; a
  // fifth would have been sunk cost.
  //
  // `serveCalls` splits the two questions this probe now answers. The banner
  // reads the STORED leg times, so serving calls would overwrite the gap it
  // sweeps — but the MAP has nothing to draw without them. One fixture cannot
  // be both, so it is a switch rather than a compromise.
  await page.route(/journey-planner/, r => {
    if (!serveCalls) return r.abort();
    const body = r.request().postData() || '';
    // Leg 0 runs Oppsal→Hellerud, leg 1 Hellerud→Jernbanetorget: two slices of
    // the same chain, so the change lands where the seeded journey says it does.
    const leg1 = body.includes('5-0820');
    const all = calls(null);
    const slice = leg1 ? all.slice(3) : all.slice(0, 4);
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { serviceJourney: { estimatedCalls: slice } } }) });
  });
  await page.route(/geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  await page.waitForTimeout(900);

  // FORCE ONE MORE RENDER, with the app's own debug hook. _simBytt sets leg 0's
  // arrival and calls renderTrack — so if the stops have landed, the map gets
  // a render that cannot have been skipped by a matching struct key. It is the
  // difference between «the drawing is broken» and «the drawing never ran».
  if (serveCalls) {
    await page.evaluate(() => window._simBytt && window._simBytt(6));
    await page.waitForTimeout(1200);
  }

  console.log(`\n══ ${scheme} · ${gapMins} min mellomrom · ekstra ${extraMins} ══`);

  const seen = await page.evaluate(() => {
    const el = document.querySelector('#t-conn-alert .conn-alert');
    if (!el) return { banner: '(stille)', klasse: '—', farge: '—' };
    const cs = getComputedStyle(el);
    return {
      banner: el.textContent.replace(/\s+/g, ' ').trim(),
      klasse: (el.className.match(/conn-alert-\w+/) || ['—'])[0],
      // Both conn-alert styles are the same grey box today. If «you cannot
      // make this» and «hurry» look identical, the verdict is correct and
      // still invisible — which is what only a screenshot can say.
      farge: cs.color + ' / ' + cs.borderColor,
    };
  });
  // AND THE MAP'S OWN VOCABULARY. Underveis drew every mode as one solid
  // weight-4 stroke, a fourth hand-rolled `1,8` for the legs still to come,
  // and three unlabelled circles where the board says PÅ/BYTT/AV.
  const kart = await page.evaluate(() => {
    // THE WRAPPER, NOT THE MAP. _renderTrackMap hides #t-map-wrap and tears
    // the map down when it has nothing to draw — and a child of a hidden
    // parent keeps its OWN computed display, so asking #t-map returned
    // «block» for a map that was gone. This probe reported «the map is
    // visible, zero paths» four times about a map that had been removed.
    // Fourth instrument error this session: wrong element, again.
    const wrap = document.getElementById('t-map-wrap');
    const m = document.getElementById('t-map');
    const wrapVis = wrap ? getComputedStyle(wrap).display : '(ingen wrap)';
    if (!m || !wrap || wrapVis === 'none') return { skjult: wrapVis };
    const streker = Array.from(m.querySelectorAll('path'))
      .map(p => (p.getAttribute('stroke-dasharray') || 'heltrukket')
        + '@' + (p.getAttribute('stroke-width') || '?'))
      // drawRoute's casing is the same under every line; counting it would
      // drown the difference this probe is about.
      .filter(x => !/heltrukket@(5|7|9)$/.test(x));
    const box = m.getBoundingClientRect();
    const words = Array.from(m.querySelectorAll('.leaflet-marker-icon'))
      .filter(e => /^(på|bytt|av)$/i.test(e.textContent.trim()));
    const ord = words.map(e => e.textContent.trim());
    // INSIDE THE FRAME, not merely drawn. The fit must cover every leg — with
    // only the ridden leg framed, «AV» sits off the edge and the reader is
    // shown half a journey. A marker outside the box measures as present and
    // reads as absent.
    const utenfor = words.filter(e => {
      const r = e.getBoundingClientRect();
      return r.left < box.left - 1 || r.right > box.right + 1
        || r.top < box.top - 1 || r.bottom > box.bottom + 1;
    }).map(e => e.textContent.trim());
    // The BEADS, which is what the early frame actually decides. The final fit
    // at the bottom of the block re-frames with every point, so leaving the
    // onward legs out of the early one does not move the view — it moves the
    // projection stopsReadable measures against, and so changes which stops
    // get a bead. That is the only observable the early frame owns.
    const perler = Array.from(m.querySelectorAll('.leaflet-marker-icon'))
      .filter(e => !/^(på|bytt|av)$/i.test(e.textContent.trim())).length;
    return { streker: [...new Set(streker)], ord, utenfor, perler,
      paths: m.querySelectorAll('path').length };
  });
  console.log('   kart  :', !kart ? '(ingen)'
    : kart.skjult ? 'wrapperen er ' + kart.skjult + ' — kartet er revet'
    : kart.streker.join('  |  ') + '   ord: ' + (kart.ord.join(' → ') || '(ingen)')
      + '   [paths ' + kart.paths + ' · perler ' + kart.perler + ' · utenfor kanten: '
        + (kart.utenfor.length ? kart.utenfor.join(', ') : 'ingen') + ']');
  // THE GATE CHAIN, first false one is the answer. Four rounds of guessing at
  // the fixture produced nothing; this asks the app instead.
  if (serveCalls) {
    const port = await page.evaluate(() => {
      const g = window.__trackGates;
      return g ? g() : null;
    });
    const inni = await page.evaluate(() => {
      const m = document.getElementById('t-map');
      if (!m) return null;
      const r = m.getBoundingClientRect();
      return {
        str: Math.round(r.width) + '×' + Math.round(r.height),
        paner: Array.from(m.querySelectorAll('.leaflet-pane'))
          .map(p => p.className.replace('leaflet-pane ', '') + ':' + p.children.length),
        svg: m.querySelectorAll('svg').length,
        canvas: m.querySelectorAll('canvas').length,
        markers: m.querySelectorAll('.leaflet-marker-icon').length,
        fliser: m.querySelectorAll('img.leaflet-tile').length,
      };
    });
    console.log('   inni  :', inni ? inni.str + ' · ' + inni.paner.join(' ')
      + ' · svg ' + inni.svg + ' canvas ' + inni.canvas
      + ' · markører ' + inni.markers + ' · fliser ' + inni.fliser : '(ingen)');
    console.log('   porter:', port
      ? 'fase ' + port.phase + ' · bein ' + port.i + ' · stops ' + port.stops
        + ' · pts ' + port.pts + ' · fra «' + port.from + '» til «' + port.to + '»'
      : '(ingen diagnose eksponert)');
  }
  console.log('   banner:', seen.banner);
  console.log('   klasse:', seen.klasse, '  farge:', seen.farge);

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  const tm = await page.$('#t-map');
  if (serveCalls && tm && await tm.isVisible().catch(() => false)) {
    await tm.screenshot({ path: `scratchpad/shots/kart-${scheme}-underveis.png`,
      animations: 'disabled', timeout: 4000 }).catch(() => {});
  }
  await page.screenshot({ path: `scratchpad/shots/bytt-${scheme}-${gapMins}-${extraMins}.png`,
    clip: { x: 0, y: 0, width: W, height: 620 }, animations: 'disabled' });
  await ctx.close();
}

// 2 min with 5 min extra is the reported case: margin 2 − 3 − 5 = −6, which
// the old banner called «2 min byttetid».
for (const [gap, extra] of [[2, 5], [6, 0], [3, 0], [20, 0]]) {
  await run('dark', gap, extra);
}
await run('light', 2, 5);
await run('light', 6, 0);
// And the map, which needs the calls the banner runs deliberately withhold.
await run('dark', 8, 0, true);
await run('light', 8, 0, true);
await browser.close();
server.close();
console.log('');
