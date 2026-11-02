/**
 * «Ser ut som du er på» — i en ekte nettleser, med en ekte klokke.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at posisjonsfiksene faktisk når sporet
 * og Kalman-filteret slik at farten blir over terskelen, at kortet vises over
 * «du er ved» og ikke flytter noe, og at knappen åpner underveis på riktig
 * tur. Klokka kan ikke låses her: farten måles mellom fikser med tid
 * imellom. Så prøven går i ekte tid, med fikser hvert annet sekund.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4613;
const LAT = 59.9100;
const lon = (m) => 10.7600 + m / 55_800;           // østover langs samme breddegrad
const FART = 10;                                    // m/s, bussen og deg

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

async function run(scheme, påBussen) {
  const T0 = Date.now();
  const iso = ms => new Date(ms).toISOString();
  /* Bussen: stopp hver 400 m, passerer 0 m ved T0. Du: samme sted og fart —
     eller, i kontrollkjøringen, til fots. */
  const stopp = [-2, -1, 0, 1, 2, 3, 4].map(i => {
    const m = i * 400, t = iso(T0 + (m / FART) * 1000);
    return { quay: { latitude: LAT, longitude: lon(m), publicCode: 'A',
      stopPlace: { id: 'NSR:StopPlace:P' + (i + 2), name: ['Carl Berners plass', 'Sinsen', 'Hasle',
        'Økern', 'Risløkka', 'Vollebekk', 'Linderud'][i + 2], latitude: LAT, longitude: lon(m) } },
      aimedArrivalTime: t, expectedArrivalTime: t, aimedDepartureTime: t, expectedDepartureTime: t };
  });
  const call = (id, linje, front, skiftMs) => ({
    realtime: true, cancellation: false,
    aimedDepartureTime: stopp[2].aimedDepartureTime, expectedDepartureTime: iso(T0 + skiftMs),
    destinationDisplay: { frontText: front },
    quay: { id: 'NSR:Quay:A', publicCode: 'A', name: 'A' },
    serviceJourney: { id, situations: [],
      line: { id: 'RUT:Line:' + linje, publicCode: linje, transportMode: 'bus',
        presentation: { colour: 'e60000' } },
      estimatedCalls: stopp.map(s => ({ ...s,
        expectedDepartureTime: iso(new Date(s.expectedDepartureTime).getTime() + skiftMs),
        expectedArrivalTime: iso(new Date(s.expectedArrivalTime).getTime() + skiftMs) })) },
  });
  // 31 er den du sitter på; 25 går samme vei fem minutter senere.
  const CALLS = [call('RUT:SJ:31-1', '31', 'Linderud', 0), call('RUT:SJ:25-1', '25', 'Linderud', 5 * 60_000)];

  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: LAT, longitude: lon(0), accuracy: 10 }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.memoryConsent', '1');
  }, { scheme });
  // Nærmeste stopp følger deg langs gata, som i en ekte buss.
  await page.route('**/geocoder/**', r => {
    const u = new URL(r.request().url());
    const lo = Number(u.searchParams.get('point.lon')) || lon(0);
    const nær = stopp.slice().sort((a, b) => Math.abs(a.quay.longitude - lo) - Math.abs(b.quay.longitude - lo))
      .slice(0, 2).map(s => ({ properties: { id: s.quay.stopPlace.id, name: s.quay.stopPlace.name,
        label: s.quay.stopPlace.name, category: ['onstreetBus'] },
        geometry: { coordinates: [s.quay.longitude, s.quay.latitude] } }));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ features: nær }) });
  });
  await page.route('**/journey-planner/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { stopPlace: { id: 'NSR:StopPlace:P2', name: 'Hasle',
      situations: [], estimatedCalls: CALLS } } }) }));
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime|stop-places/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  // Ekte tid: en fiks hvert annet sekund i 30 sekunder.
  for (let t = 0; t <= 30; t += 2) {
    const m = påBussen ? FART * (Date.now() - T0) / 1000 : 1.3 * (Date.now() - T0) / 1000;
    await ctx.setGeolocation({ latitude: LAT, longitude: lon(m), accuracy: 10 });
    await page.waitForTimeout(2000);
  }
  const m = await page.evaluate(() => {
    const k = document.getElementById('auto-ombord');
    const hvor = document.getElementById('auto-where');
    return {
      kort: k && k.style.display !== 'none' ? k.textContent.replace(/\s+/g, ' ').trim() : null,
      over: k && hvor ? k.getBoundingClientRect().bottom <= hvor.getBoundingClientRect().top + 1 : null,
      knapper: k ? k.querySelectorAll('.ombord-valg').length : 0,
      høyde: k ? Math.round(k.getBoundingClientRect().height) : 0,
      duErVed: hvor ? hvor.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : null,
    };
  });
  console.log('\n══ ' + (påBussen ? 'på bussen' : 'til fots') + ' · ' + scheme);
  console.log('   kort: ' + (m.kort || '(ingen)'));
  console.log('   over «du er ved»: ' + m.over + ' · knapper: ' + m.knapper + ' · høyde ' + m.høyde + ' px');
  console.log('   du er ved: ' + m.duErVed);
  const f = path.join(ROOT, 'scratchpad', 'ombord-' + (påBussen ? 'buss' : 'gaa') + '-' + scheme + '.png');
  await page.screenshot({ path: f });
  console.log('   → ' + f);

  if (påBussen && m.knapper) {
    await page.click('.ombord-valg');
    await page.waitForTimeout(1500);
    const u = await page.evaluate(() => ({
      skjerm: ['v-track', 'v-auto'].find(id => { const e = document.getElementById(id); return e && e.offsetParent !== null; }),
      topp: (document.querySelector('#v-track') || {}).textContent ? document.querySelector('#v-track').textContent.replace(/\s+/g, ' ').trim().slice(0, 90) : null,
    }));
    console.log('   etter trykk: ' + u.skjerm + ' — ' + u.topp);
  }
  await ctx.close();
}

await run('dark', true);
await run('dark', false);
await run('light', true);
await browser.close(); server.close();
