/**
 * Kjøretøyet på «valgt avgang» — på den ferdige skjermen.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE her, og hvorfor denne proben finnes:
 * enhetstestene binder HVOR toget er. De binder ikke at markøren faktisk
 * tegnes, at en gjetning ser ut som en gjetning, eller at etiketten sier
 * «Bussen» når det er en buss. Forrige utgivelse endte med en mutant som
 * overlevde nettopp fordi kallestedet ikke ble nådd av noen test.
 *
 * Og: båndet er 130 px høyt, med to faste stoppnavn på. Om glyfen i det hele
 * tatt er leselig der er et skjermbilde, ikke et tall.
 *
 * Tre tilstander:
 *   bak      toget har ikke nådd ditt stopp — markøren skal ligge UTENFOR
 *            rammen, altså ikke være synlig i kartutsnittet
 *   inne     toget er på din strekning — markøren skal være der, nedtonet
 *   buss     samme, men linja er en buss — etiketten skal si «Bussen»
 *
 * Ingenting her når api.entur.io; sanntidstrinnet kan ikke prøves herfra, så
 * alle tre er rutetid — som er det du uansett vil se på t-banen.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4577;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();
const klokke = ms => new Date(ms).toLocaleTimeString('nb-NO',
  { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });

const LOEP = [
  { navn: 'Mortensrud',     lat: 59.8600, lon: 10.8300 },
  { navn: 'Ryen',           lat: 59.8800, lon: 10.8100 },
  { navn: 'Brynseng',       lat: 59.9000, lon: 10.7950 },
  { navn: 'Helsfyr',        lat: 59.9100, lon: 10.7900 },   // ← du går på her
  { navn: 'Tøyen',          lat: 59.9130, lon: 10.7780 },
  { navn: 'Jernbanetorget', lat: 59.9110, lon: 10.7500 },
];
const PAA = 3, AV = 5;
const STEG = 120_000;

/** `ut` = minutter til toget forlater Mortensrud. Negativt = alt i gang. */
const kall = (ut) => LOEP.map((s, i) => {
  const t = NOW + ut * 60_000 + i * STEG;
  return {
    quay: { publicCode: '1', latitude: s.lat, longitude: s.lon,
            stopPlace: { id: 'NSR:StopPlace:' + i, name: s.navn, latitude: s.lat, longitude: s.lon } },
    aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
    aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
    realtime: true,
  };
});

const avgang = (ut, mode, farge, kode) => {
  const calls = kall(ut);
  const dep = calls[PAA].expectedDepartureTime;
  return {
    aimedDepartureTime: dep, expectedDepartureTime: dep, realtime: true,
    cancellation: false,
    destinationDisplay: { frontText: 'Jernbanetorget' },
    quay: { publicCode: '1' },
    serviceJourney: {
      id: 'RUT:ServiceJourney:3-0810',
      line: { id: 'RUT:Line:3', publicCode: kode, transportMode: mode,
              presentation: { colour: farge } },
      estimatedCalls: calls,
    },
  };
};

const RUTE = { key: 'custom', from: 'Helsfyr', to: 'Jernbanetorget',
               stopId: 'NSR:StopPlace:3', toStopId: 'NSR:StopPlace:5',
               geo: 'Helsfyr', toGeo: 'Jernbanetorget', filter: null, line: null };

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

async function aapne(dark, dep) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, rute }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.dir', '2');
    localStorage.setItem('default::t.route', JSON.stringify(rute));
  }, { scheme: dark ? 'dark' : 'light', rute: RUTE });
  // Ingen nettverk. `_fetchSel` får ikke svar, og det er riktig: avgangen
  // bærer alt hele løpet, som er nettopp det den ville oppfrisket.
  await page.route(/journey-planner|geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.evaluate(d => window.tap(d), dep);
  await page.waitForTimeout(1800);
  /* ETIKETTEN FANTES IKKE I DOM I FØRSTE KUTT.
   *
   * En ikke-permanent Leaflet-tooltip bygges først når den åpnes, så proben
   * rapporterte «—» seks ganger og det så ut som et svar. Den må pekes på. */
  await page.evaluate(() => {
    const v = [...document.querySelectorAll('#sel-map .leaflet-marker-icon')]
      .find(e => e.querySelector('svg'));
    if (v) v.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  return { ctx, page };
}

/** Markøren selv — ikke at koden finnes, men at den står på skjermen. */
const les = page => page.evaluate(() => {
  const kart = document.getElementById('sel-map');
  const r = kart && kart.getBoundingClientRect();
  const ikoner = [...document.querySelectorAll('#sel-map .leaflet-marker-icon')];
  const svgMarkoerer = ikoner.filter(e => e.querySelector('svg')).length;
  // Kjøretøyglyfen er den eneste markøren med en <svg> som bærer en rotasjon
  // eller et kjøretøy-omriss; stoppene er <div> med border-radius.
  const veh = ikoner.find(e => e.querySelector('svg') && !e.className.includes('leaflet-div-icon-stop'));
  const svg = veh && veh.querySelector('svg');
  const inne = (() => {
    if (!veh || !r) return false;
    const b = veh.getBoundingClientRect();
    return b.left >= r.left - 4 && b.right <= r.right + 4 && b.top >= r.top - 4 && b.bottom <= r.bottom + 4;
  })();
  return {
    kartH: r ? Math.round(r.height) : null,
    // Vakt mot å måle feil element: er det flere svg-markører, er filteret
    // under ikke entydig og tallene over er ikke om kjøretøyet.
    svgMarkoerer,
    markoer: !!veh,
    synlig: inne,
    // fill-opacity 0.72 = regnet ut; 1 = målt. Frontlys bare på en måling.
    nedtonet: !!(svg && /fill-opacity="0\.72"/.test(svg.outerHTML)),
    etikett: (document.querySelector('.leaflet-tooltip.map-label') || {}).textContent || null,
    tittel: (veh && veh.getAttribute('title')) || null,
  };
});

const TILSTANDER = [
  { navn: 'bak ditt stopp',  dep: () => avgang(5, 'metro', 'e60000', '3') },
  { navn: 'inne i rammen',   dep: () => avgang(-8.4, 'metro', 'e60000', '3') },
  { navn: 'buss, i rammen',  dep: () => avgang(-8.4, 'bus', '1a7f37', '31') },
];

for (const dark of [true, false]) {
  const tema = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${tema} modus, 414 px ══`);
  for (const t of TILSTANDER) {
    const { ctx, page } = await aapne(dark, t.dep());
    const r = await les(page);
    console.log(`   ${t.navn.padEnd(18)} kart: ${String(r.kartH).padEnd(4)}px`
      + ` markør: ${r.markoer ? 'ja ' : 'nei'} i rammen: ${r.synlig ? 'ja ' : 'nei'}`
      + ` nedtonet: ${r.nedtonet ? 'ja ' : 'nei'} svg: ${r.svgMarkoerer}`
      + ` etikett: ${r.etikett ?? r.tittel ?? '—'}`);
    await page.screenshot({ path: `scratchpad/selveh-${tema}-${t.navn.split(',')[0].split(' ')[0]}.png` });
    await ctx.close();
  }
}

await browser.close();
server.close();
