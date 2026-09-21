/**
 * ⋮ på eksakt samme sted — målt, ikke påstått.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: «same place» is a pixel claim. The three
 * header idioms have different padding (.6rem on the board, .75rem on the
 * rest), and «Utforsk» builds its own in JS — so the only way to know is to
 * navigate to every screen and read the button's centre in viewport
 * coordinates.
 *
 * It also measures the two things that would quietly undo the change: that
 * opening the menu does not push the page down (it used to, inside the
 * board), and that «del denne tavla» is on the board and nowhere else.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4571;
const NOW = Date.parse('2026-09-21T08:00:00+02:00');
const HERE = { id: 'NSR:StopPlace:6021', name: 'Ryen', lat: 59.8944, lon: 10.8133 };

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

async function open(dark) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', 'system');
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: here.lat, lon: here.lon }));
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: 'Ryen', to: 'Oslo S',
      stopId: here.id, toStopId: 'NSR:StopPlace:337', geo: 'Ryen', toGeo: 'Oslo S',
    }));
    localStorage.setItem('default::t.dir', '2');
  }, { now: NOW, here: HERE });

  await page.route('**/journey-planner/**', r => r.fulfill({ status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
      trip: { tripPatterns: [] } } }) }));
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{ properties: { id: HERE.id, label: HERE.name, name: HERE.name,
      category: ['metroStation'] }, geometry: { coordinates: [HERE.lon, HERE.lat] } }] }) }));
  await page.route(/tiles\.stadiamaps|tile\.openstreetmap|open-meteo|overpass|valhalla|geoapify|mobility|realtime/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  return { ctx, page };
}

/** The ⋮ that is actually on screen, and where its centre sits. */
const spot = page => page.evaluate(() => {
  const vis = [...document.querySelectorAll('[data-more]')].filter(b => {
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  if (vis.length !== 1) return { n: vis.length };
  const b = vis[0];
  // OVERLAP AND SIZE, the two faults the screenshots showed. Every other
  // button in the same header must be the same size as ⋮ and must not
  // intersect it.
  const br0 = b.getBoundingClientRect();
  const hdrEl = b.closest('.board-header-slim, .screen-header, .lei-header');
  const sibs = hdrEl ? [...hdrEl.querySelectorAll('button')].filter(x => x !== b) : [];
  const clash = sibs.filter(x => {
    const r = x.getBoundingClientRect();
    return r.width > 0 && r.right > br0.left && r.left < br0.right
      && r.bottom > br0.top && r.top < br0.bottom;
  }).length;
  const sizes = [b, ...sibs].filter(x => x.getBoundingClientRect().width > 0)
    .map(x => { const r = x.getBoundingClientRect();
      return (x.id || x.className.split(' ')[0] || '?') + ' '
        + Math.round(r.width) + 'x' + Math.round(r.height); });
  const r = b.getBoundingClientRect();
  const hdr = b.parentElement, hr = hdr.getBoundingClientRect();
  const view = b.closest('[id^="v-"]');
  const vs = view ? getComputedStyle(view) : {};
  return { n: 1, clash, sizes: [...new Set(sizes)].join(' '),
    x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
    hdr: hdr.className || hdr.id, hdrTop: Math.round(hr.top), hdrRight: Math.round(hr.right),
    // WHAT sits above the header, if anything — the 3px has to come from
    // somewhere, and a hardcoded -3px would be a magic number that drifts.
    above: (() => {
      const prev = hdr.previousElementSibling;
      const vt = view ? Math.round(view.getBoundingClientRect().top) : null;
      const cs = getComputedStyle(hdr);
      return (prev ? prev.tagName + '#' + (prev.id || '?') + ' h=' + Math.round(prev.getBoundingClientRect().height) : 'ingenting')
        + ' | view.top=' + vt + ' hdr.mt=' + cs.marginTop + ' pt=' + cs.paddingTop;
    })(),
    viewPadL: vs.paddingLeft, viewPadT: vs.paddingTop };
});

// The bottom bar, which is the door a reader actually uses.
const SCREENS = [
  ['tavla', 'v-board'], ['auto-reise', 'v-auto'],
  ['lagret', 'v-saved'], ['utforsk', 'v-leisure'],
];
const goTo = (p, view) => p.click(`.app-nav-btn[data-view="${view}"]`);

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 390 px ══`);
  const { ctx, page } = await open(dark);
  const seen = [];
  for (const [navn, view] of SCREENS) {
    try { await goTo(page, view); } catch (e) { console.log(`   ${navn}: kunne ikke navigere — ${e.message.split('\n')[0]}`); continue; }
    await page.waitForTimeout(500);
    const s = await spot(page);
    if (s.n !== 1) { console.log(`   ${navn.padEnd(12)} ⚠ ${s.n} synlige ⋮`); continue; }
    seen.push({ navn, ...s });
    await page.screenshot({ path: `scratchpad/prikker-${theme}-${navn}.png`, clip: { x: 0, y: 0, width: 390, height: 140 } });
    console.log(`   ${navn.padEnd(12)} ⋮ (${s.x}, ${s.y})  hdr «${s.hdr}» top=${s.hdrTop} right=${s.hdrRight}`
      + `  ${s.clash ? '⚠ OVERLAPP x' + s.clash : 'ingen overlapp'}  størrelser: ${s.sizes}`);
  }
  // THE COMPASS MUST BE INSIDE ITS MAP. It is absolutely positioned against
  // its wrapper, and a wrapper that is not a positioning context lets it
  // climb to whatever is — on auto-reise, the header, where it landed on
  // top of the ⋮. Rotating the map is what makes it appear at all.
  for (const [navn, view] of SCREENS) {
    try { await goTo(page, view); } catch { continue; }
    await page.waitForTimeout(400);
    const c = await page.evaluate(() => {
      const maps = [...document.querySelectorAll('.leaflet-container')]
        .filter(m => m.getBoundingClientRect().width > 0);
      if (!maps.length) return null;
      // Rotate every live map so the compass is shown.
      for (const m of maps) { if (m._leaflet_map) m._leaflet_map.setBearing(30); }
      const out = [];
      for (const btn of document.querySelectorAll('.map-compass')) {
        btn.style.display = 'flex';          // show it regardless of bearing
        const wrap = btn.parentElement;
        const map = wrap.querySelector('.leaflet-container');
        if (!map) { out.push('kompass uten kart'); continue; }
        const b = btn.getBoundingClientRect(), m = map.getBoundingClientRect();
        if (m.width === 0) continue;
        const inside = b.left >= m.left - 1 && b.right <= m.right + 1
          && b.top >= m.top - 1 && b.bottom <= m.bottom + 1;
        out.push(inside ? 'inne i kartet' : `UTENFOR (kompass ${Math.round(b.top)}, kart ${Math.round(m.top)})`);
      }
      return out;
    });
    if (c && c.length) console.log(`   kompass ${navn.padEnd(12)} ${c.join(' · ')}`);
  }

  const xs = [...new Set(seen.map(s => s.x))], ys = [...new Set(seen.map(s => s.y))];
  console.log(`   → spredning: x ${xs.length === 1 ? 'lik' : xs.join('/')}, `
    + `y ${ys.length === 1 ? 'lik' : ys.join('/')}`);

  // THE CONFLICT THE SCREENSHOT SHOWED: a traffic banner used to sit above
  // the header, pushing it down — and the pinned ⋮ landed on top of the
  // banner. The banner moved below the header, so this measures both: that
  // the row does not move, and that the two do not overlap.
  await goTo(page, 'v-board');
  await page.waitForTimeout(300);
  const withBanner = await page.evaluate(() => {
    const el = document.getElementById('service-alerts');
    el.style.display = 'block';
    el.innerHTML = '<div class="alert-box"><strong>Høstferie</strong><br>'
      + 'Det kjøres sjeldnere avganger i høstferien (uke 40). '
      + 'Sjekk Ruter-appen før du reiser.</div>';
    const b = document.querySelector('[data-more]');
    const br = b.getBoundingClientRect(), ar = el.getBoundingClientRect();
    const overlap = br.right > ar.left && br.left < ar.right
      && br.bottom > ar.top && br.top < ar.bottom;
    // And the three buttons must share a line.
    const row = [...document.querySelectorAll('.board-header-slim .board-more-btn')]
      .map(x => Math.round(x.getBoundingClientRect().top));
    return { y: Math.round(br.top + br.height / 2), overlap,
      sammeLinje: new Set(row).size === 1, knapper: row.length };
  });
  console.log(`   med trafikkmelding: ⋮ på y=${withBanner.y}, overlapp=${withBanner.overlap ? 'JA ⚠' : 'nei'}, `
    + `${withBanner.knapper} knapper på ${withBanner.sammeLinje ? 'samme linje' : 'ULIKE LINJER ⚠'}`);
  await page.screenshot({ path: `scratchpad/prikker-${theme}-banner.png` });

  // Opening the menu must not push the page down — it used to, inside the board.
  await goTo(page, 'v-board');
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => (document.getElementById('dep-list') || document.body).getBoundingClientRect().top);
  await page.click('[data-more]:not([style*="display: none"])').catch(() => {});
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => (document.getElementById('dep-list') || document.body).getBoundingClientRect().top);
  const share = await page.evaluate(() => {
    const s = document.getElementById('share-btn');
    return s ? getComputedStyle(s).display : 'mangler';
  });
  // OPACITY AS A NUMBER, in both themes. A screenshot needs someone to look
  // at it — and looking at one of two is exactly how the light menu shipped
  // unreadable over the map for four releases.
  const solid = await page.evaluate(() => {
    const m = document.getElementById('board-more-menu');
    if (!m) return 'mangler';
    const bg = getComputedStyle(m).backgroundColor;
    const a = /rgba?\(([^)]*)\)/.exec(bg);
    const parts = a ? a[1].split(',').map(x => x.trim()) : [];
    return { bg, alfa: parts.length > 3 ? Number(parts[3]) : 1 };
  });
  console.log(`   menyens bakgrunn: ${solid.bg} → alfa ${solid.alfa}`
    + (solid.alfa < 1 ? '  ⚠ GJENNOMSKINNELIG' : '  (ugjennomsiktig)'));
  console.log(`   meny på tavla: innhold flyttet ${Math.round(after - before)} px, «del denne tavla» = ${share}`);
  await page.screenshot({ path: `scratchpad/prikker-${theme}-meny.png` });
  await ctx.close();
}

await browser.close();
server.close();
