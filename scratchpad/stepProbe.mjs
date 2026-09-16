/**
 * Forrige og neste avgang, fra the list the reader actually saw.
 *
 * Asked for: «På dette viewet burde bruker kunne hoppe tilbake til forrige
 * avgang eller fremover til neste avgang», with «reis» at a third of its width
 * and the two steps either side.
 *
 * THE CLAIM THIS HAS TO PROVE is not that the buttons exist — a unit test can
 * do that — but that a step lands on exactly the row above or below the one
 * that was tapped, with the reader's own filters applied. So the probe walks
 * the board, records the row order, taps the middle one, and steps both ways.
 *
 * And it measures the shape: three buttons on a third each, with a clock face
 * on two of them, can be right in every number and read cramped. Widths and
 * truncation are read out of the DOM.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4515;
const NOW = Date.parse('2026-09-16T07:03:00+02:00');
const iso = ms => new Date(ms).toISOString();
const FROM = { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud', lat: 59.8617, lon: 10.8285 };
const TO = { id: 'NSR:StopPlace:Jernbanetorget', name: 'Jernbanetorget', lat: 59.9115, lon: 10.7500 };

/* Six departures. Two of them are BUSES, so the mode filter has something to
   remove — that is the case where the old «neste» row pointed at a departure
   the reader had switched off. One is CANCELLED, which the board makes
   untappable, so the steps must walk over it. */
const leg = (mins, dur, code, mode, colour, cancelled) => ({
  mode, distance: 11000,
  aimedStartTime: iso(NOW + mins * 60000), expectedStartTime: iso(NOW + mins * 60000),
  aimedEndTime: iso(NOW + (mins + dur) * 60000), expectedEndTime: iso(NOW + (mins + dur) * 60000),
  fromPlace: { name: FROM.name, quay: { id: 'NSR:Quay:2', publicCode: '2',
    stopPlace: { id: FROM.id, name: FROM.name }, latitude: FROM.lat, longitude: FROM.lon } },
  toPlace: { name: TO.name, quay: { id: 'NSR:Quay:B', publicCode: 'B',
    stopPlace: { id: TO.id, name: TO.name }, latitude: TO.lat, longitude: TO.lon } },
  line: { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode,
    presentation: { colour, textColour: 'ffffff' } },
  serviceJourney: { id: 'RUT:SJ:' + code + '-' + mins, situations: [],
    cancellation: !!cancelled,
    line: { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode,
      presentation: { colour } },
    estimatedCalls: [] },
  situations: [], pointsOnLink: null,
});
const pat = (mins, dur, code, mode, colour, cancelled) => ({
  duration: dur * 60, aimedStartTime: iso(NOW + mins * 60000),
  expectedStartTime: iso(NOW + mins * 60000),
  legs: [leg(mins, dur, code, mode, colour, cancelled)],
});
const PATTERNS = [
  pat(6,  25, '3',  'metro', 'f5a000'),          // 07:09
  pat(13, 25, '3',  'metro', 'f5a000'),          // 07:16
  pat(17, 40, '71', 'bus',   'e60000'),          // 07:20  ← bus
  pat(21, 25, '3',  'metro', 'f5a000', true),    // 07:24  ← CANCELLED
  pat(28, 25, '3',  'metro', 'f5a000'),          // 07:31
  pat(35, 40, '71', 'bus',   'e60000'),          // 07:38  ← bus
  pat(42, 25, '3',  'metro', 'f5a000'),          // 07:45
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

/** What the detail screen says it is showing, and what the buttons offer. */
const readSel = (page) => page.evaluate(() => {
  const txt = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; };
  const btns = Array.from(document.querySelectorAll('#s-ctas .cta-row .cta-btn')).map(b => {
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return { tekst: b.textContent.trim(), av: b.disabled,
      bredde: Math.round(r.width),
      flex: cs.flexGrow + '/' + cs.flexShrink + '/' + cs.flexBasis,
      pad: cs.paddingLeft + ' ' + cs.paddingRight, box: cs.boxSizing,
      kuttet: b.scrollWidth > b.clientWidth + 1 };
  });
  return {
    avgang: txt('.jd-val.departure'),
    ankomst: txt('.jd-val.arrival'),
    linje: txt('#v-selected .line-badge'),
    knapper: btns,
    gammelRad: !!document.getElementById('s-dep-list'),
  };
});

async function run(scheme, width) {
  const W = width || 390;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 900 }, deviceScaleFactor: 2,
    colorScheme: scheme, hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, from, to, scheme }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.weekendMode', '0');
    // BUSES OFF. This is the reader's own filter, and the whole point of
    // stepping through the list they saw rather than the raw answer.
    localStorage.setItem('default::t.modes', JSON.stringify(
      { metro: true, bus: false, tram: false, rail: false, water: false }));
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: from.name, to: to.name,
      stopId: from.id, toStopId: to.id, filter: null, geo: null, toGeo: null, line: null,
      _fromLat: from.lat, _fromLon: from.lon, _toLat: to.lat, _toLon: to.lon,
    }));
  }, { now: NOW, from: FROM, to: TO, scheme });

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

  console.log(`\n══ ${scheme.toUpperCase()} · ${W} px ══`);

  // The order the reader sees, which is what a step must follow.
  const rows = await page.$$eval('#dep-list .dep-row', els => els.map(e => ({
    tid: (e.querySelector('.dep-time') || {}).textContent?.trim()
      || e.textContent.replace(/\s+/g, ' ').trim().slice(0, 18),
    innstilt: e.classList.contains('cancelled'),
  })));
  console.log('  tavlas rader :', rows.map(r => r.tid + (r.innstilt ? '(innstilt)' : '')).join(' · '));

  // Tap a row in the middle, so there is something on both sides.
  const mid = Math.min(2, rows.length - 1);
  await page.$$eval('#dep-list .dep-row', (els, i) => els[i].click(), mid);
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1200);

  const start = await readSel(page);
  console.log('  åpnet        :', start.avgang, '· linje', start.linje);
  console.log('  knapperaden  :', start.knapper.map(b =>
    `«${b.tekst}»${b.av ? '(av)' : ''} ${b.bredde}px${b.kuttet ? ' KUTTET' : ''}`).join('  |  '));
  start.knapper.forEach(b => console.log('     ', b.tekst.padEnd(10),
    'flex', b.flex, '· pad', b.pad, '·', b.box));
  console.log('  gammel «neste»-rad nederst:', start.gammelRad ? 'FINNES ENNÅ' : 'borte');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/step-${scheme}-${W}.png`, animations: 'disabled' });

  // ── Step back, then forward twice, reading where we land each time ──────
  const stepAndRead = async (which) => {
    const sel = which === 'prev' ? '#s-ctas .cta-row .cta-btn:first-child'
                                 : '#s-ctas .cta-row .cta-btn:last-child';
    const before = await readSel(page);
    const btn = await page.$(sel);
    const disabled = await btn.evaluate(b => b.disabled);
    if (disabled) return { fra: before.avgang, til: null, av: true };
    await btn.click();
    await page.waitForTimeout(1100);
    const after = await readSel(page);
    return { fra: before.avgang, til: after.avgang, linje: after.linje };
  };

  const back = await stepAndRead('prev');
  console.log('  ← forrige    :', back.fra, '→', back.av ? 'DEAKTIVERT' : back.til + ' (linje ' + back.linje + ')');
  const f1 = await stepAndRead('next');
  console.log('  neste →      :', f1.fra, '→', f1.av ? 'DEAKTIVERT' : f1.til + ' (linje ' + f1.linje + ')');
  const f2 = await stepAndRead('next');
  console.log('  neste →      :', f2.fra, '→', f2.av ? 'DEAKTIVERT' : f2.til + ' (linje ' + f2.linje + ')');

  // Walk to the very end and check the button switches off rather than wrapping.
  for (let i = 0; i < 8; i++) {
    const b = await page.$('#s-ctas .cta-row .cta-btn:last-child');
    if (await b.evaluate(x => x.disabled)) break;
    await b.click(); await page.waitForTimeout(900);
  }
  const end = await readSel(page);
  console.log('  i enden      :', end.avgang, '·',
    end.knapper.map(b => `«${b.tekst}»${b.av ? '(av)' : ''}`).join(' | '));

  await page.screenshot({ path: `scratchpad/shots/step-${scheme}-${W}-ende.png`, animations: 'disabled' });

  // ONE TIMER, not one per step. startSelRefresh clears its own, so this
  // should hold — but it is the easy mistake here and it would never show on
  // screen.
  const timers = await page.evaluate(() => {
    let n = 0; const real = window.setInterval;
    window.setInterval = function (...a) { n++; return real.apply(this, a); };
    return new Promise(res => setTimeout(() => res(n), 3000));
  });
  console.log('  nye intervaller på 3 s:', timers, '(skal være 0 i ro)');

  await ctx.close();
}

await run('dark', 390);
await run('light', 390);
await run('dark', 414);
await browser.close();
server.close();
console.log('\nSkjermbilder: scratchpad/shots/step-*.png\n');
