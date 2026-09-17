/**
 * Lista over stopp i nærheten, foldet.
 *
 * Reported with a screenshot: eight nearby stops between «fra stasjon» and
 * «til stopp eller stasjon», so the second field was off the bottom of the
 * phone.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: how far down the form the second field
 * actually sits, in pixels, against the bottom navigation — which is
 * position:fixed and 56px tall, a floor this session has measured wrongly
 * before. And whether the folded row reads as a control rather than as a
 * heading.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4533;

/* The reported set, names and all. Three Kantarellen variants are real: Entur
   lists a legesenter, a terrasse and the stop itself. */
const NEAR = [
  ['Olasrudveien', 340], ['Granebakken', 520], ['Stenbråten', 540],
  ['Maikollen', 610], ['Kantarellen legesenter', 700], ['Kantarellen', 710],
  ['Kantarellen terrasse', 720], ['Mortensrud', 730],
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

async function run(scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    permissions: ['geolocation'],
    geolocation: { latitude: 59.8570, longitude: 10.8280, accuracy: 12 },
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.dep', 'Mortensrud');
    localStorage.setItem('default::t.dest', 'Jernbanetorget');
  }, { scheme });

  // The reverse geocoder is what fills nearestStations — the list this probe
  // is about. Serving it empty would have measured the list's absence.
  await page.route(/geocoder/, r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: NEAR.map(([name, d], i) => ({
      properties: { id: 'NSR:StopPlace:' + i, name, label: name, category: ['onstreetBus'] },
      geometry: { coordinates: [10.8280 + i * 0.0004, 59.8570 + i * 0.0004] },
    })) }) }));
  await page.route(/journey-planner/, r => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ data: {} }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  // Into the form, the way a reader gets there.
  // THE WAY A READER GETS THERE: tapping the route header. window._showSettings
  // only FILLS the form — nav.js navigates — and calling it alone left the
  // probe measuring rectangles on a screen that was never displayed, which are
  // zeros. It reported «788 px over menyen» for a field nobody could see. The
  // same shape as v1.110.0's startBoard(), one release later, and the reason
  // to drive the real control rather than the function behind it.
  await page.click('#station-name-btn');
  await page.waitForTimeout(900);

  const read = () => page.evaluate(() => {
    const t = document.getElementById('set-nearby-toggle');
    const l = document.getElementById('set-nearby-list');
    const arr = document.getElementById('set-arr');
    const nav = document.querySelector('.app-nav');
    // The floor is the nav's own top, not innerHeight — .app-nav is
    // position:fixed and this session has measured against the wrong one.
    const floor = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    const ab = arr ? arr.getBoundingClientRect() : null;
    return {
      knapp: t ? t.textContent.replace(/\s+/g, ' ').trim() : '(fins ikke)',
      aria: t ? t.getAttribute('aria-expanded') : '—',
      listeSynlig: l ? getComputedStyle(l).display !== 'none' : false,
      rader: document.querySelectorAll('#set-nearby-list .nearby-btn').length,
      tilFeltSynlig: ab ? Math.round(floor - ab.bottom) : null,
    };
  });

  console.log(`\n══ ${scheme} ══`);
  const lukket = await read();
  console.log('   lukket :', lukket.knapp, '| aria', lukket.aria,
    '| liste', lukket.listeSynlig, '| «til»-feltet', lukket.tilFeltSynlig, 'px over menyen');
  await page.screenshot({ path: `scratchpad/shots/nearby-${scheme}-lukket.png`,
    clip: { x: 0, y: 0, width: 390, height: 788 }, animations: 'disabled' });

  await page.click('#set-nearby-toggle');
  await page.waitForTimeout(400);
  const apen = await read();
  console.log('   åpen   :', apen.knapp, '| aria', apen.aria,
    '| rader', apen.rader, '| «til»-feltet', apen.tilFeltSynlig, 'px over menyen');
  await page.screenshot({ path: `scratchpad/shots/nearby-${scheme}-apen.png`,
    clip: { x: 0, y: 0, width: 390, height: 788 }, animations: 'disabled' });

  // Leaving and coming back must fold it again — that is the stated rule.
  const back = await page.$('#v-settings .nav-back');
  if (back) await back.click();
  await page.waitForTimeout(400);
  await page.click('#station-name-btn');
  await page.waitForTimeout(700);
  const igjen = await read();
  console.log('   tilbake:', igjen.knapp, '| liste', igjen.listeSynlig);
  await ctx.close();
}

fs.mkdirSync('scratchpad/shots', { recursive: true });
await run('dark');
await run('light');
await browser.close();
server.close();
console.log('');
