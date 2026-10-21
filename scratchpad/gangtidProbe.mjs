/**
 * Når appen har MÅLT gangruta, står det målte tallet på skjermen.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE her: at `walkMinsTo` faktisk NÅS fra
 * gå-kortet på tavla. Enhetstestene binder at formelen ikke lenger er
 * skrevet ut der — men en mutant som lar kallet stå og gjør det uoppnåelig
 * (`false && …`) overlevde dem. Det er kortet selv som må si tallet.
 *
 * Fiksturen: to punkter 1000 m fra hverandre i luftlinje, og en lagret målt
 * rute på ~2000 m mellom dem. Gammel formel gir 1000 × 1,3 = 1300 m. Ny
 * leser den målte. Kjøres to ganger — med og uten den lagrede ruta — og
 * forskjellen mellom dem er hele påstanden.
 *
 * Ingenting her når api.entur.io; tavla svares lokalt med NULL avganger,
 * som er nettopp det som utløser gå-kortet.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4573;

const FRA = { lat: 59.9000, lon: 10.7500 };
const TIL = { lat: 59.9090, lon: 10.7500 };
/** Den lange veien rundt — samme punkter som tests/gangtid.test.js bruker. */
const RUTE = [[59.9000, 10.7500], [59.9000, 10.7600], [59.9090, 10.7600], [59.9090, 10.7500]];

/* FØRSTE KUTT MANGLET `geo` OG `stopId`.
 *
 * Tavla avviste da hele hentingen med «Mangler avgangssted» (entur.js:38),
 * `state.lastFetch` ble aldri satt, og gå-kortets vakt krever nettopp at den
 * ER satt. Proben rapporterte «kort: nei» fire ganger — et grønt tomrom som
 * så ut som et svar. Skjermbildet viste det; tallene gjorde det ikke. */
const RUTEVALG = {
  key: 'custom', from: 'Hjemme', to: 'Målet',
  stopId: 'NSR:StopPlace:9999', toStopId: null,
  geo: 'Hjemme', toGeo: 'Målet', filter: null, line: null,
  _fromLat: FRA.lat, _fromLon: FRA.lon,
  _toLat: TIL.lat, _toLon: TIL.lon,
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

async function open(dark, medMaaltRute) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: FRA.lat, longitude: FRA.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, dir, fra, rute, med }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.dir', '2');
    localStorage.setItem('default::t.route', JSON.stringify(dir));
    localStorage.setItem('default::t.homeLL', JSON.stringify(fra));
    localStorage.setItem('default::t.walkFrom', JSON.stringify({ name: 'Hjemme', lat: fra.lat, lon: fra.lon }));
    if (med) {
      // Samme nøkkel `walkKey` lager: fire desimaler, retningsbestemt.
      const r = n => Number(n).toFixed(4);
      const key = r(fra.lat) + ',' + r(fra.lon) + '>' + r(dir._toLat) + ',' + r(dir._toLon);
      localStorage.setItem('default::t.walkDist', JSON.stringify({ [key]: rute }));
    }
  }, { scheme: dark ? 'dark' : 'light', dir: RUTEVALG, fra: FRA, rute: 2019, med: medMaaltRute });

  // Tavla svarer med null avganger — det er dét som gir gå-kortet.
  await page.route(/journey-planner/, r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { trip: { tripPatterns: [] }, stopPlace: null } }),
  }));
  await page.route(/geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  return { ctx, page };
}

const read = page => page.evaluate(() => {
  const t = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
  return { min: t('.woc-mins'), avstand: t('.woc-dist'), kort: !!document.querySelector('.walk-only-card') };
});

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 414 px ══`);
  for (const med of [false, true]) {
    const { ctx, page } = await open(dark, med);
    const r = await read(page);
    console.log(`   ${(med ? 'med målt rute' : 'uten målt rute').padEnd(16)}`
      + ` kort: ${r.kort ? 'ja ' : 'nei'}  min: ${String(r.min ?? '—').padEnd(8)}`
      + ` avstand: ${r.avstand ?? '—'}`);
    await page.screenshot({ path: `scratchpad/gangtid-${theme}-${med ? 'maalt' : 'gjettet'}.png` });
    await ctx.close();
  }
}

await browser.close();
server.close();
