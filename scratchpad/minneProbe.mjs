/**
 * «Hva appen husker» — sett med et menneskes øyne.
 *
 * WHAT ONLY A BROWSER CAN SETTLE, and the reason this release ships nothing
 * that USES the log: whether the list is uncomfortable to read. If it is, we
 * are storing the wrong things — and that is a judgement no assertion makes.
 * The unit tests prove every field has a label; only the screen shows whether
 * a week of your own movements laid out in one column feels acceptable.
 *
 * It also checks the two things that would quietly undo the whole design:
 * that the section is silent and empty before consent, and that turning
 * consent off EMPTIES the store rather than merely hiding it.
 *
 * Nothing here reaches api.entur.io. The log is seeded through localStorage
 * exactly as the app would have written it.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4567;
// Oslo-local, not the container's zone — the fixture has been wrong that way
// seven times in this codebase.
const NOW = Date.parse('2026-09-21T08:30:00+02:00');
const MIN = 60000;

/** A week of an ordinary commuter, written the way the app writes it. */
const EVENTS = [
  { kind: 'reise', at: NOW - 6 * 1440 * MIN, fra: 'Ryen', til: 'Oslo S', linje: '3',
    pos: { lat: 59.89440, lon: 10.81330, noyaktighet: 12 } },
  { kind: 'gange', at: NOW - 6 * 1440 * MIN + 4 * MIN, meter: 640, sekunder: 540,
    pos: { lat: 59.89512, lon: 10.81004, noyaktighet: 8 } },
  { kind: 'sok', at: NOW - 4 * 1440 * MIN, valgt: 'Ullevål sykehus',
    pos: { lat: 59.91060, lon: 10.75270, noyaktighet: 3422 } },
  { kind: 'reise', at: NOW - 4 * 1440 * MIN + 9 * MIN, fra: 'Oslo S', til: 'Ullevål sykehus', linje: '5',
    pos: { lat: 59.91060, lon: 10.75270, noyaktighet: 3422 } },
  { kind: 'reise', at: NOW - 1440 * MIN, fra: 'Ryen', til: 'Oslo S', linje: '3',
    pos: { lat: 59.89440, lon: 10.81330, noyaktighet: 15 } },
  { kind: 'sok', at: NOW - 120 * MIN, valgt: 'Grünerløkka' },
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

async function open(dark, { consent }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, evts, scheme, ok }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    if (ok) {
      localStorage.setItem('default::t.memoryConsent', '1');
      localStorage.setItem('default::t.events', JSON.stringify(evts));
    }
  }, { now: NOW, evts: EVENTS, scheme: dark ? 'dark' : 'light', ok: consent });

  await page.route(/journey-planner|geocoder|realtime|open-meteo|overpass|valhalla|geoapify|mobility/,
    r => r.abort());
  // Tiles are allowed through in this one probe: the map IS the disclosure,
  // and an empty grey box would not show whether it discloses anything.
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  // THE REAL DOOR, not a forced display. `prefs-btn` calls _showPrefs()
  // before show('v-prefs') — which is exactly the ordering that broke the
  // map — so a probe that force-shows the screen itself would measure a
  // path no reader takes.
  // The button lives inside the ⋯ menu, which is closed. Opening it is part
  // of the path a reader actually walks.
  await page.click('#board-more-btn');
  await page.waitForTimeout(200);
  await page.click('#prefs-btn');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = [...document.querySelectorAll('#v-prefs .set-section')]
      .find(x => (x.textContent || '').includes('hva appen husker'));
    if (s) s.scrollIntoView();
  });
  await page.waitForTimeout(900);
  return { ctx, page };
}

const read = page => page.evaluate(() => ({
  bryter: (document.getElementById('mem-consent') || {}).checked,
  skjult: (document.getElementById('mem-body') || {}).hidden,
  linjer: [...document.querySelectorAll('.mem-row')].map(r => r.textContent.replace(/\s+/g, ' ').trim()),
  kart: (() => {
    const el = document.getElementById('mem-map');
    if (!el) return 'mangler';
    const b = el.getBoundingClientRect();
    // The markers, not the tiles: the sandbox cannot reach Stadia Maps, so
    // a grey box is expected — an empty SVG layer is not.
    const paths = [...el.querySelectorAll('.leaflet-overlay-pane path')];
    // INSIDE the frame, not merely drawn. fitBounds run before the container
    // has a size projects the points somewhere off-screen, and the layer
    // still reports them — the v1.102/v1.116/v1.117 lesson, a fourth time.
    const inside = paths.filter(p => {
      const r = p.getBoundingClientRect();
      return r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
    }).length;
    return Math.round(b.width) + 'x' + Math.round(b.height) + ' px, '
      + paths.length + ' tegnet, ' + inside + ' synlige';
  })(),
  lagret: (localStorage.getItem('default::t.events') || '').length,
}));

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 390 px ══`);

  // 1. Before consent: nothing shown, nothing stored.
  const a = await open(dark, { consent: false });
  const ra = await read(a.page);
  console.log(`   før samtykke   : bryter=${ra.bryter} skjult=${ra.skjult} linjer=${ra.linjer.length} lagret=${ra.lagret} tegn`);
  await a.page.screenshot({ path: `scratchpad/minne-${theme}-av.png` });
  await a.ctx.close();

  // 2. With consent and a week of history — the thing to LOOK AT.
  const b = await open(dark, { consent: true });
  const rb = await read(b.page);
  console.log(`   etter samtykke : ${rb.linjer.length} linjer, kart=${rb.kart}`);
  for (const l of rb.linjer) console.log('      ' + l);
  await b.page.screenshot({ path: `scratchpad/minne-${theme}-pa.png`, fullPage: true });

  // 3. Withdrawing consent must EMPTY the store, not just hide it.
  await b.page.click('#mem-consent');
  await b.page.waitForTimeout(400);
  const rc = await read(b.page);
  console.log(`   slått av igjen : skjult=${rc.skjult} lagret=${rc.lagret} tegn`
    + (rc.lagret ? '  ⚠ LOGGEN LIGGER IGJEN' : '  (tømt)'));
  await b.ctx.close();
}

await browser.close();
server.close();
