/**
 * «Du pleier å reise hit» så like sikkert ut etter én tur som etter førti.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at de to styrkene er til å SKILLE uten
 * å telle piksler, at ordene faktisk står i raden, og — det som er lettest å
 * ødelegge — at raden IKKE vokser av at appen sier noe den alt visste.
 * `.nearby-dist` ligger på `flex: 0 0 100%`, så en etikett på feil sted blir
 * en tredje linje. Ingen test mot kildetekst kan se det.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4631;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');   // tirsdag, bøtte 3
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8300, lon: 10.8050 };

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name,
    category: ['onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Hauketo', 20), stop('Lofsrud', 350), stop('Bjørndal', 520)];
const pt = (lat, lon, name) => ({ name, id: 'NSR:StopPlace:' + name, lat, lon });

/* Tre retninger. Historikken peker på «Lysaker», så den raden skal merkes og
   de to andre ikke — naboskapet er selve målingen: en rad som vokser ved
   siden av to som ikke gjør det er synlig, et absolutt tall er det ikke. */
const DIRS = [
  /* STOPPET HETER NOE ANNET ENN RETNINGEN, og det er ikke pynt.
     `_maybeJump` kjører FØRST, og `autoJumpDest` bruker samme `JUMP_RATIO`
     som «sterk» — så er vanen sterk nok til merket, er den sterk nok til at
     appen flytter deg, og lista blir aldri tegnet. (Første kjøring av denne
     prøven målte `v-board`: instrumentet hadde rett, forventningen tok feil.)
     Merket er altså til for radene du kommer TILBAKE til — og her framtvinges
     den skjermen ved at `findJumpTarget` ikke finner destinasjonen blant
     stoppene framover, slik den ikke gjør når navnene ikke er de samme. */
  { line: 'L2', front: 'Lysaker', mins: 7, stops: [pt(59.921, 10.637, 'Lysaker stasjon')] },
  { line: 'L2', front: 'Ski', mins: 12, stops: [pt(59.719, 10.836, 'Ski')] },
  { line: '73', front: 'Brenna', mins: 19, stops: [pt(59.806, 10.822, 'Brenna')] },
];

const call = (line, front, mins, stops) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line + mins, publicCode: '1', name: 'spor 1' },
  serviceJourney: { id: 'sj:' + line + ':' + mins, situations: [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'rail',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: HERE.lat, longitude: HERE.lon,
        stopPlace: { id: 'NSR:StopPlace:Hauketo', name: 'Hauketo', latitude: HERE.lat, longitude: HERE.lon } },
        aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000) },
      ...stops.map((s, i) => ({
        quay: { latitude: s.lat, longitude: s.lon,
          stopPlace: { id: s.id, name: s.name, latitude: s.lat, longitude: s.lon } },
        aimedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedArrivalTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        aimedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000),
        expectedDepartureTime: iso(NOW + (mins + 8 + i * 6) * 60000) })),
    ] },
});
const CALLS = DIRS.map(d => call(d.line, d.front, d.mins, d.stops));

/** Historikk slik `recordSmartTrip` skriver den. `bucket: 3` er klokka 07. */
const histRow = (to, n, extra = {}) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Mortensrud', toName: to,
  toStopId: 'NSR:StopPlace:' + to, toLat: 59.91, toLon: 10.75,
  fromStopId: 'NSR:StopPlace:Mortensrud', bucket: 3, isWeekend: false,
  count: n, lastUsed: NOW, ...extra,
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

/* REISELOGGEN, som nå avgjør om en vane er fersk. `null` betyr at loggen er
   AV — og det er en tredje tilstand, ikke en tom liste: uten samtykke har
   appen ikke spurt, og skal ikke demotere på et svar den aldri ba om. */
async function run(label, hist, scheme, logg) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ['geolocation'],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, hist, scheme, logg }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.smartHist', JSON.stringify(hist));
    if (logg) {
      localStorage.setItem('default::t.memoryConsent', '1');
      localStorage.setItem('default::t.events', JSON.stringify(logg));
    }
    localStorage.setItem('default::t.freqArr', JSON.stringify(
      hist.map(h => ({ name: h.toName, stopId: null, lat: h.toLat, lon: h.toLon,
        count: h.count, lastUsed: now }))));
  }, { now: NOW, here: HERE, hist, scheme, logg: logg || null });

  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: NEARBY }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
        trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'NSR:StopPlace:Hauketo', name: 'Hauketo',
        situations: [], estimatedCalls: CALLS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  const kart = await page.evaluate(() => {
    const m = document.getElementById('auto-map');
    return {
      markører: m.querySelectorAll('.leaflet-marker-icon').length,
      linjer: Array.from(m.querySelectorAll('path')).filter(p => !p.getAttribute('stroke-dasharray')).length,
      etiketter: Array.from(m.querySelectorAll('.leaflet-tooltip')).map(t => t.textContent),
      kort: (document.querySelector('#auto-dests, .dest-card, [class*="dest-"]') || {}).textContent ? 'ja' : 'nei',
    };
  });
  console.log('   KART: markører ' + kart.markører + ' · heltrukne stier ' + kart.linjer + ' · etiketter ' + JSON.stringify(kart.etiketter));
  const m = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#v-auto .auto-dir'));
    const rad = r => {
      const v = r.querySelector('.auto-vane');
      const cs = v && getComputedStyle(v);
      const rcs = getComputedStyle(r);
      return {
        tekst: r.textContent.replace(/\s+/g, ' ').trim().slice(0, 44),
        aria: r.getAttribute('aria-label'),
        klasse: (r.className.match(/auto-usual\S*/g) || []).join(' ') || '—',
        kant: rcs.borderColor,
        høyde: Math.round(r.getBoundingClientRect().height),
        merke: v ? v.textContent.trim() : null,
        // FARGEN OG STØRRELSEN PÅ ORDENE, ikke bare at de finnes: et merke
        // i samme farge som bakgrunnen er et merke ingen leser.
        merkeFarge: cs ? cs.color : null,
        merkeStr: cs ? cs.fontSize : null,
        bg: rcs.backgroundColor,
      };
    };
    return { skjerm: document.getElementById('v-auto')
      && document.getElementById('v-auto').style.display !== 'none',
      synlige: Array.from(document.querySelectorAll('[id^="v-"]'))
        .filter(e => e.style.display !== 'none').map(e => e.id),
      logg: (document.getElementById('log') || {}).textContent
        ? document.getElementById('log').textContent.replace(/\s+/g, ' ').slice(-400) : null,
      rader: rows.map(rad) };
  });

  console.log('\n══ ' + label + ' · ' + scheme + (m.skjerm ? '' : '   (IKKE auto-skjermen!)'));
  m.rader.forEach(r => {
    console.log('   ' + r.klasse.padEnd(28) + ' h=' + String(r.høyde).padEnd(4)
      + (r.merke ? '«' + r.merke + '» ' + r.merkeStr + ' ' + r.merkeFarge : '(umerket)'));
    console.log('      ' + r.tekst);
    console.log('      aria: ' + r.aria);
  });
  const h = m.rader.map(r => r.høyde);
  const merket = m.rader.filter(r => r.merke), umerket = m.rader.filter(r => !r.merke);
  if (merket.length && umerket.length) {
    const d = merket[0].høyde - umerket[0].høyde;
    console.log('   RO: merket rad ' + merket[0].høyde + ' px mot umerket '
      + umerket[0].høyde + ' px → ' + (d === 0 ? 'ingen vekst' : d + ' px VEKST'));
  }
  console.log('   alle radhøyder: ' + h.join(', '));

  if (!m.skjerm) console.log('   synlige: ' + (m.synlige || []).join(', ')
    + '\n   logg: ' + m.logg);
  const f = path.join(ROOT, 'scratchpad', 'kortkart-' + label + '-' + scheme + '.png');
  const body = m.skjerm ? await page.$('#v-auto') : null;
  await (body || page).screenshot({ path: f });
  console.log('   → ' + f);
  await ctx.close();
}

const MED = [histRow('Lysaker stasjon', 3)];
const UTEN = [];
for (const scheme of ['dark', 'light']) {
  await run('med-kort', MED, scheme);
  await run('uten-kort', UTEN, scheme);
}
await browser.close(); server.close();
