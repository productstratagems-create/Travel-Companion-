/**
 * Skjermens to kanter, med kartet åpnet.
 *
 * Rapportert med skjermbilde (bytte 74 → 12 på Jernbanetorget, avgangen har
 * gått, kartet utvidet og siden skrollet):
 *
 *   1. TOPPEN. Reiseløpets tekst («Aker brygge · ank. plattform …») ligger
 *      oppå telefonens statuslinje — klokka og batteriet står midt i den.
 *   2. BUNNEN. Knappene «← 23:18 · andre avganger · 23:33 →» er halvveis
 *      under bunnmenyen, og «andre avganger» er brukket over to linjer.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: hva som faktisk ligger øverst i
 * statuslinjens felt, og hvor knappene ender i forhold til menyen. Chromium
 * har ingen hakk, så innsettet overstyres via CDP (det iPhonen melder).
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4611;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();
const SAFE_TOP = 47, SAFE_BOTTOM = 34;          // iPhone med Dynamic Island

const FROM = { id: 'NSR:StopPlace:Bjorvika', name: 'Bjørvika', lat: 59.9075, lon: 10.7560 };
const TO = { id: 'NSR:StopPlace:Majorstuen', name: 'Majorstuen', lat: 59.9297, lon: 10.7146 };

const P = (name, code, lat, lon) => ({ name, latitude: lat, longitude: lon,
  quay: { id: 'NSR:Quay:' + name.replace(/\W/g, '') + code, publicCode: code,
    stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name },
    latitude: lat, longitude: lon } });
const START = P('Bjørvika', 'A', 59.9075, 10.7560);
const JBT_A = P('Jernbanetorget', 'A', 59.91165, 10.74985);
const JBT_B = P('Jernbanetorget', 'B', 59.91170, 10.74975);
const MAJ = P('Majorstuen', 'C', 59.9297, 10.7146);

const chain = (a, b, n, t0) => Array.from({ length: n + 1 }, (_, i) => {
  const f = i / n, nm = i === 0 ? a.name : i === n ? b.name : 'Stopp ' + i;
  const lat = a.latitude + (b.latitude - a.latitude) * f;
  const lon = a.longitude + (b.longitude - a.longitude) * f;
  const ts = iso(NOW + (t0 + i * 2) * 60000);
  return { quay: { latitude: lat, longitude: lon,
    stopPlace: { id: 'NSR:StopPlace:' + nm.replace(/\W/g, ''), name: nm, latitude: lat, longitude: lon } },
    aimedArrivalTime: ts, expectedArrivalTime: ts, aimedDepartureTime: ts, expectedDepartureTime: ts };
});
const transit = (mode, code, colour, from, to, t0, dur, front) => {
  const line = { id: 'RUT:Line:' + code, publicCode: code, transportMode: mode, presentation: { colour } };
  return { mode, distance: 3000,
    aimedStartTime: iso(NOW + t0 * 60000), expectedStartTime: iso(NOW + t0 * 60000),
    aimedEndTime: iso(NOW + (t0 + dur) * 60000), expectedEndTime: iso(NOW + (t0 + dur) * 60000),
    fromPlace: { name: from.name, latitude: from.latitude, longitude: from.longitude, quay: from.quay },
    toPlace: { name: to.name, latitude: to.latitude, longitude: to.longitude, quay: to.quay },
    line, situations: [],
    serviceJourney: { id: 'RUT:ServiceJourney:' + code + '-' + t0, situations: [], line,
      estimatedCalls: chain(from, to, 4, t0) },
    fromEstimatedCall: { expectedDepartureTime: iso(NOW + t0 * 60000),
      aimedDepartureTime: iso(NOW + t0 * 60000), realtime: true,
      quay: { publicCode: from.quay.publicCode }, destinationDisplay: { frontText: front } },
    toEstimatedCall: { expectedArrivalTime: iso(NOW + (t0 + dur) * 60000),
      aimedArrivalTime: iso(NOW + (t0 + dur) * 60000), quay: { publicCode: to.quay.publicCode } },
    pointsOnLink: null };
};
const foot = (from, to, t0) => ({ mode: 'foot', distance: 60,
  aimedStartTime: iso(NOW + t0 * 60000), expectedStartTime: iso(NOW + t0 * 60000),
  aimedEndTime: iso(NOW + (t0 + 1) * 60000), expectedEndTime: iso(NOW + (t0 + 1) * 60000),
  fromPlace: { name: from.name, latitude: from.latitude, longitude: from.longitude, quay: from.quay },
  toPlace: { name: to.name, latitude: to.latitude, longitude: to.longitude, quay: to.quay },
  pointsOnLink: null });

// Første avgang går om 20 s — slik at skjermen står i «avgått» når vi måler,
// som i skjermbildet («andre avganger» i midten).
const PATTERNS = [0.33, 15].map(m => ({
  duration: 48 * 60, aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
  legs: [
    transit('bus', '74', 'e60000', START, JBT_A, m, 6, 'Jernbanetorget'),
    foot(JBT_A, JBT_B, m + 6),
    transit('tram', '12', '0b91ef', JBT_B, MAJ, m + 9, 15, 'Majorstuen'),
  ],
}));

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
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  let innsett = 'overstyrt';
  try {
    await cdp.send('Emulation.setSafeAreaInsetsOverride',
      { insets: { top: SAFE_TOP, bottom: SAFE_BOTTOM, left: 0, right: 0 } });
  } catch (e) { innsett = 'IKKE STØTTET (' + e.message.slice(0, 60) + ')'; }

  await page.addInitScript(({ from, to, scheme }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.weekendMode', '0');
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: from.name, to: to.name,
      stopId: from.id, toStopId: to.id, filter: null, geo: null, toGeo: null, line: null,
      _fromLat: from.lat, _fromLon: from.lon, _toLat: to.lat, _toLon: to.lon,
    }));
  }, { from: FROM, to: TO, scheme });

  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (!body.includes('trip('))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { estimatedCalls: [], situations: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
        trip: { tripPatterns: PATTERNS } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [] }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|stop-places/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  await page.click('#dep-list .dep-row', { force: true });
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1500);
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/kant-${scheme}-foravgang.png` });
  const før = await page.evaluate(() => {
    const r = document.querySelector('#s-ctas .cta-row').getBoundingClientRect();
    const nav = document.querySelector('.app-nav').getBoundingClientRect();
    return { rad: Math.round(r.top) + '–' + Math.round(r.bottom), meny: Math.round(nav.top),
      knapper: document.querySelectorAll('#s-ctas .cta-btn').length };
  });
  console.log(`\n   [før avgang, kart lukket] knapperad ${før.rad}, meny fra ${før.meny}, ${før.knapper} knapper`);
  // Vent til avgangen har gått og midtknappen er «andre avganger».
  await page.waitForFunction(() => /andre avganger/i.test(
    (document.querySelector('#s-ctas .cta-row .cta-btn:nth-child(2)') || {}).textContent || ''),
    null, { timeout: 40000 });
  const btn = await page.$('#sel-map-expand');
  if (btn) { await btn.click({ force: true }); await page.waitForTimeout(600); }

  const mål = (navn) => page.evaluate(({ navn, SAFE_TOP }) => {
    const nav = document.querySelector('.app-nav');
    const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : innerHeight;
    const row = document.querySelector('#s-ctas .cta-row');
    const r = row.getBoundingClientRect();
    const knapper = [...row.children].map(b => {
      const cs = getComputedStyle(b);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
      const inner = b.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return { t: b.textContent.trim(), h: Math.round(b.getBoundingClientRect().height),
        linjer: Math.round(inner / lh), klippet: b.scrollWidth > b.clientWidth };
    });
    // Hva ligger øverst i statuslinjens felt? Tre punkter over bredden.
    const topp = [40, 207, 374].map(x => {
      const e = document.elementFromPoint(x, Math.round(SAFE_TOP / 2));
      return e ? (e.id ? '#' + e.id : e.tagName.toLowerCase()) + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') : '—';
    });
    const tekstUnder = [...document.querySelectorAll('#s-content *')].filter(e => {
      if (e.children.length || !e.textContent.trim()) return false;
      const b = e.getBoundingClientRect();
      return b.height > 0 && b.top < SAFE_TOP && b.bottom > 0;
    }).map(e => e.textContent.trim().slice(0, 30));
    // Stripa over statuslinja er et pseudo-element uten pekerhendelser —
    // elementFromPoint ser rett gjennom den. Les den direkte.
    const st = getComputedStyle(document.body, '::before');
    const stripe = st.content === 'none' ? 'ingen'
      : st.position + ' ' + st.height + ' z' + st.zIndex;
    return { navn, stripe, scrollY: Math.round(scrollY),
      maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
      radTopp: Math.round(r.top), radBunn: Math.round(r.bottom), navTopp: Math.round(navTop),
      skjultUnderMeny: Math.max(0, Math.round(r.bottom - navTop)), knapper, topp, tekstUnder };
  }, { navn, SAFE_TOP });

  const skriv = m => {
    console.log(`   [${m.navn}] scrollY ${m.scrollY}/${m.maxScroll}`);
    console.log(`     TOPP  stripe over statusfeltet: ${m.stripe} (feltet er ${SAFE_TOP}px)`);
    console.log(`           øverst under den: ${m.topp.join(' | ')}`);
    console.log(`           tekst i statusfeltet: ${m.tekstUnder.length ? m.tekstUnder.join(' · ') : '(ingen)'}`);
    console.log(`     BUNN  knapperad ${m.radTopp}–${m.radBunn}, meny fra ${m.navTopp}: ${m.skjultUnderMeny} px under menyen`);
    console.log(`           ${m.knapper.map(k => `«${k.t}» ${k.h}px ${k.linjer} linje(r)${k.klippet ? ' KLIPPET' : ''}`).join('  ·  ')}`);
  };

  console.log(`\n══ ${scheme} · innsett ${innsett} ══`);
  // Som i skjermbildet: kartets topp skrollet opp mot statuslinja.
  await page.evaluate(() => {
    const m = document.querySelector('#sel-map');
    scrollTo(0, scrollY + m.getBoundingClientRect().top - 150);
  });
  await page.waitForTimeout(300);
  const a = await mål('som skjermbildet'); skriv(a);
  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/kant-${scheme}.png` });
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(200);
  skriv(await mål('øverst'));
  await page.evaluate(() => scrollTo(0, 1e6)); await page.waitForTimeout(200);
  skriv(await mål('nederst'));
  await page.screenshot({ path: `scratchpad/shots/kant-${scheme}-bunn.png` });
  await ctx.close();
}

await run('dark');
await run('light');
await browser.close();
server.close();
console.log('');
