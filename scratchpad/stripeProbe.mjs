/**
 * Neste stasjon på linja — og at ingen to etiketter går oppå hverandre.
 *
 * Asked for: «I dette viewet ønsker jeg at neste stasjon også skrives ut på
 * linjen.» The name was computed all along and spent on a title attribute
 * that a phone has no way to show.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether three labels fit. The ends are
 * absolutely positioned at left:0 and right:0 with max-width 46%, the new one
 * sits at its dot's own percent, and real station names are up to sixteen
 * characters of 9px mono. So this runs the train along the whole line and
 * measures every pair of text runs for overlap at each position.
 *
 * Text runs, not element boxes — that distinction is what v1.101.1 got wrong:
 * an element-only sweep could not see the stop name overflow its own box,
 * because the name was a bare text node.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4519;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

/* Long real names on purpose. «Nationaltheatret» is sixteen characters, and
   the question is whether it fits beside «Jernbanetorget» at 9px. */
const NAMES = ['Helsfyr', 'Ensjø', 'Tøyen', 'Grønland', 'Nationaltheatret', 'Jernbanetorget'];
const LAT = 59.914, LON0 = 10.795, DLON = -0.012;
const STEP = 120_000, DWELL = 30_000;

const CALLS = NAMES.map((name, i) => {
  const arr = NOW + i * STEP;
  return {
    quay: { latitude: LAT, longitude: LON0 + i * DLON,
      stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name,
        latitude: LAT, longitude: LON0 + i * DLON } },
    aimedArrivalTime: iso(arr), expectedArrivalTime: iso(arr),
    aimedDepartureTime: iso(arr + DWELL), expectedDepartureTime: iso(arr + DWELL),
  };
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

async function run(scheme, width) {
  const W = width || 390;
  const ctx = await browser.newContext({
    viewport: { width: W, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
  }, { scheme });
  await page.route(/journey-planner|geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(800);

  console.log(`\n══ ${scheme.toUpperCase()} · ${W} px ══`);

  /* The markup here MIRRORS renderJourneyStrip rather than calling it: the
     built bundle is not importable by path from the page. So the split is
     explicit — the unit tests bind what the renderer emits, and this binds how
     the shipped CSS lays that markup out. If the two drift, the unit tests are
     the ones that catch it.

     Anchor thresholds are the module's own (15 / 85) and INSET its own (0.05);
     a copy here would be a second definition, so they are named as mirrored
     and the unit tests pin the originals. */
  const measure = await page.evaluate(({ names }) => {
    const host = document.createElement('div');
    host.id = 'probe-strip';
    host.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:0 1rem';
    document.body.appendChild(host);

    const INSET = 0.05, total = names.length - 1;
    const pct = (f) => 100 * (INSET + (f / total) * (1 - 2 * INSET));
    const anchor = (p) => p <= 15 ? 'left:0;text-align:left'
      : p >= 85 ? 'right:0;text-align:right'
      : 'left:' + p.toFixed(2) + '%;transform:translateX(-50%)';

    const out = [];
    for (let nextIdx = 1; nextIdx <= total; nextIdx++) {
      const isDest = nextIdx === total;
      host.innerHTML =
        '<div id="j-strip" style="display:block">'
        + '<div class="js-caps"><span class="js-cap">' + (total - nextIdx + 1) + ' stopp igjen · etter rutetid</span></div>'
        + '<div class="js-rail"><span class="js-done" style="width:' + pct(nextIdx - 1).toFixed(2) + '%"></span>'
        + names.map((_, i) => '<span class="js-tick' + (i === 0 || i === total ? ' js-end' : '')
            + '" style="left:' + pct(i).toFixed(2) + '%"></span>').join('')
        + '<span class="js-train" style="left:' + pct(nextIdx - 0.5).toFixed(2) + '%"></span></div>'
        + (isDest ? '' : '<div class="js-next"><span class="js-next-name" style="' + anchor(pct(nextIdx)) + '">'
            + names[nextIdx] + '</span></div>')
        + '<div class="js-ends"><span class="js-end-from">' + names[0] + '</span>'
        + '<span class="js-end-to">' + names[total] + '</span></div>'
        + '</div>';

      // Every run of TEXT, measured where it paints. Element boxes are not
      // enough — v1.101.1 learned that the hard way.
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      const runs = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const rng = document.createRange(); rng.selectNodeContents(n);
        for (const r of rng.getClientRects()) {
          if (r.width > 0 && r.height > 0) runs.push({ t: n.textContent.trim(), r });
        }
      }
      const hits = [];
      for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i].r, b = runs[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1 && oy > 1) hits.push(`«${runs[i].t}» ✕ «${runs[j].t}»`);
      }
      const lab = host.querySelector('.js-next-name');
      const box = host.querySelector('#j-strip').getBoundingClientRect();
      const lr = lab && lab.getBoundingClientRect();
      out.push({
        neste: isDest ? '(endestasjon — utelatt)' : names[nextIdx],
        pct: Math.round(pct(nextIdx)),
        utenfor: lr ? (lr.left < box.left - 1 || lr.right > box.right + 1) : false,
        kuttet: lab ? lab.scrollWidth > lab.clientWidth + 1 : false,
        overlapp: hits,
        h: Math.round(box.height),
      });
    }
    host.remove();
    return out;
  }, { names: NAMES });

  measure.forEach(m => console.log(
    '  ', String(m.pct + '%').padStart(4), m.neste.padEnd(26),
    m.utenfor ? 'UTENFOR KANTEN' : '', m.kuttet ? 'kuttet' : '',
    m.overlapp.length ? 'OVERLAPP: ' + m.overlapp.join(' | ') : 'ingen overlapp'));
  console.log('   stripas høyde:', measure[0].h, 'px');

  // And look at it. Three labels at 9px can measure clear and still read as
  // clutter — that is decided by seeing, not by a rectangle test.
  await page.evaluate(({ names }) => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;right:0;top:40px;padding:0 1rem;'
      + 'background:var(--bg,#0f172a);z-index:9999';
    const INSET = 0.05, total = names.length - 1, nextIdx = 2;
    const pct = (f) => 100 * (INSET + (f / total) * (1 - 2 * INSET));
    host.innerHTML = '<div id="j-strip" style="display:block">'
      + '<div class="js-caps"><span class="js-cap">4 stopp igjen · etter rutetid</span></div>'
      + '<div class="js-rail"><span class="js-done" style="width:' + pct(1.5).toFixed(2) + '%"></span>'
      + names.map((_, i) => '<span class="js-tick' + (i < 1.5 ? ' js-past' : '')
          + (i === 0 || i === total ? ' js-end' : '') + '" style="left:' + pct(i).toFixed(2) + '%"></span>').join('')
      + '<span class="js-train js-live" style="left:' + pct(1.5).toFixed(2) + '%"></span></div>'
      + '<div class="js-next"><span class="js-next-name" style="left:' + pct(nextIdx).toFixed(2)
        + '%;transform:translateX(-50%)">' + names[nextIdx] + '</span></div>'
      + '<div class="js-ends"><span class="js-end-from">' + names[0] + '</span>'
      + '<span class="js-end-to">' + names[total] + '</span></div></div>';
    document.body.appendChild(host);
  }, { names: NAMES });
  await page.waitForTimeout(300);
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/stripe-${scheme}-${W}.png`,
    clip: { x: 0, y: 30, width: W, height: 110 }, animations: 'disabled' });
  await ctx.close();
}

await run('dark', 390);
await run('light', 390);
await run('dark', 360);
await browser.close();
server.close();
console.log('');
