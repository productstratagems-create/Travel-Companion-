/**
 * Underveis, i de fire tilstandene den til nå var stum i.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether the two new rows are legible and in
 * the right order — «innstilt» above everything it invalidates, freshness
 * under the strip whose claim it qualifies — and whether the freshness row
 * stays SILENT while the feed is fresh. A unit test can prove the label text;
 * only a screenshot can show that a red bar and an amber caption on one 390px
 * screen do not read as an emergency when only one of them is meant to.
 *
 * The journey is seeded through localStorage, exactly as a reload would
 * restore it, and every network route is aborted — so the FIRST state measured
 * here is the honest one: a screen with no answer yet. The remaining three are
 * produced by driving the module's own clock through a mocked fetch, because
 * `_trackAt` is a module variable and unreachable from the page.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4521;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

const NAMES = ['Oppsal', 'Skøyenåsen', 'Godlia', 'Hellerud', 'Jernbanetorget'];
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

const JNY = {
  dest: 'Jernbanetorget', from: 'Oppsal', boardedAt: NOW - 150_000,
  lineCode: '3', lineBg: '#e60000', frontText: 'Jernbanetorget',
  arrival: { time: iso(NOW + 3 * STEP), clk: '—' },
  _toLat: LAT + 4 * 0.004, _toLon: LON0 + 4 * DLON,
  legs: [{
    lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#e60000', mode: 'metro',
    frontText: 'Jernbanetorget', journeyId: 'RUT:ServiceJourney:3-0810',
    fromStation: 'Oppsal', toStation: 'Jernbanetorget',
    depTime: { time: iso(NOW - STEP), clk: '08:05' },
    arrTime: { time: iso(NOW + 3 * STEP), clk: '08:17' },
    quay: '1',
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

/**
 * @param mode  'ingen-svar' | 'fersk' | 'innstilt' | 'stille' | 'frakoblet'
 */
async function run(scheme, mode) {
  const W = 390;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, jny }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(jny));
  }, { scheme, jny: JNY });

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
  const answer = mode !== 'ingen-svar';
  await page.route(/journey-planner/, r => {
    if (!answer) return r.abort();
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { serviceJourney: {
        estimatedCalls: calls(mode === 'innstilt' ? 0 : null) } } }) });
  });
  await page.route(/geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  // «stille» and «frakoblet»: an answer DID arrive once, then the feed stopped.
  // Reached by winding the page's clock forward past DEAD_AFTER_MS rather than
  // by waiting nine real minutes.
  if (mode === 'stille' || mode === 'frakoblet') {
    if (mode === 'frakoblet') {
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    } else {
      await page.unroute(/journey-planner/);
      await page.route(/journey-planner/, r => r.abort());
      // Nine minutes of nothing, in one step.
      await page.evaluate(() => {
        const real = Date.now;
        Date.now = () => real() + 9 * 60000;
      });
    }
    await page.waitForTimeout(1400);
  }

  const seen = await page.evaluate(() => {
    // The COLOURED element, not its wrapper. #t-cancel is a bare slot; the
    // style lives on the .jny-status-bar inside it, and reading the slot
    // reported the page's default ink for a bar that is in fact red.
    const t = (id) => {
      const host = document.getElementById(id);
      if (!host) return '(fins ikke)';
      if (getComputedStyle(host).display === 'none' || !host.textContent.trim()) return '(stille)';
      const el = host.firstElementChild || host;
      return el.textContent.trim() + '  [' + getComputedStyle(el).color + ']';
    };
    const strip = document.getElementById('j-strip');
    const cap = strip && strip.querySelector('.js-cap');
    const live = document.getElementById('t-live');
    const num = document.getElementById('t-num');
    const box = live && getComputedStyle(live).display !== 'none'
      ? live.getBoundingClientRect() : null;
    const sb = strip && getComputedStyle(strip).display !== 'none'
      ? strip.getBoundingClientRect() : null;
    return {
      innstilt: t('t-cancel'),
      fersk: t('t-live'),
      stripe: cap ? cap.textContent.trim() : '(ingen stripe)',
      tall: num ? num.textContent.trim() : '—',
      // The freshness row must sit UNDER the strip it qualifies, not above it.
      underStripa: (box && sb) ? box.top >= sb.bottom - 1 : null,
    };
  });

  console.log(`\n══ ${scheme} · ${mode} ══`);
  console.log('   innstilt-bar :', seen.innstilt);
  console.log('   sanntidslinje:', seen.fersk);
  console.log('   stripas caps :', seen.stripe);
  console.log('   store tallet :', seen.tall);
  console.log('   under stripa :', seen.underStripa === null ? '(ingen linje)' : seen.underStripa);

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/live-${scheme}-${mode}.png`,
    clip: { x: 0, y: 0, width: W, height: 844 }, animations: 'disabled' });
  await ctx.close();
}

for (const mode of ['ingen-svar', 'fersk', 'innstilt', 'stille', 'frakoblet']) {
  await run('dark', mode);
}
await run('light', 'innstilt');
await run('light', 'stille');
await browser.close();
server.close();
console.log('');
