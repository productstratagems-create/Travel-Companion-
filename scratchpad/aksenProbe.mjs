/**
 * Destinasjonen som overskrift.
 *
 * Den rapporterte skjermen fra Mortensrud: fire rader som alle når
 * Jernbanetorget, med hvert sitt klokkeslett under seg.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: om blokka faktisk gjør skjermen KORTERE
 * og svaret tidligere — det var hele poenget — og om den ligger over
 * skjermkanten uten å skrolle. Og at en leser uten historikk ser nøyaktig
 * dagens skjerm.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4583;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
// ~1 km fra stoppet, som på skjermbildet: 974 m å gå, 14 min gange.
const HERE = { lat: 59.8300, lon: 10.8050 };
const STOPP = { lat: 59.8300 + 950 / 111320, lon: 10.8050 };

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Mortensrud', 950)];

/* Hauketo, ~9 km sør for Oslo S. Fem retninger: to gjennom sentrum, to ut
   av byen, og én som knapt flytter seg — den siste skal IKKE få merkelapp. */
const OSLO_S = { lat: 59.9139, lon: 10.7522 };
const pt = (lat, lon, name) => ({ name, id: 'NSR:StopPlace:' + name, lat, lon });

// DEN RAPPORTERTE SKJERMEN, rad for rad: fire retninger, alle via
// Jernbanetorget, med hvert sitt klokkeslett.
const JBT = [pt(59.9139, 10.7522, 'Jernbanetorget')];
const DIRS = [
  ...[3, 18, 33].map(mins => ({ line: '3', front: 'Kolsås', mins, stops: JBT })),
  { line: '3', front: 'Stortinget', mins: 9, stops: JBT },
  ...[24, 39, 54].map(mins => ({ line: '3', front: 'Avløs', mins, stops: JBT })),
  ...[4, 19, 49].map(mins => ({ line: '74', front: 'Jernbanetorget', mins, stops: JBT })),
];

/* One departure, with its onward stops carrying REAL coordinates — the whole
   judgement is how close the journey comes to the centre, so a fixture that
   put every stop at one latitude would measure nothing. */
/* Meldinger som HENGER PÅ AVGANGEN, altså på linja — det eneste auto-reise
   noensinne lærer om en melding (affects spørres bare i tripGQL). To av dem
   har en rad; SPØKELSE har ingen, som en linje kuttet av knutepunkt-taket. */
/* Heading and body say DIFFERENT things, as Entur's do: the first draft of
   this fixture built the description out of the summary, and the screenshot
   showed every message twice — the fixture's fault, not the screen's. */
const sit = (id, sev, txt, body) => ({ id, severity: sev, validityPeriod: {},
  summary: [{ language: 'no', value: txt }],
  description: [{ language: 'no', value: body }] });
const LINE_SITS = {
  'L2': [sit('s-l2a', 'normal', 'L2 kjører ikke mellom Ski og Kolbotn',
          'Det settes opp buss for tog. Beregn 20 minutter ekstra.'),
         sit('s-l2b', 'slight', 'Heisen på Ljan er ute av drift',
          'Bruk trappen fra Nordstrandveien, eller gå av på Holmlia.')],
  '73': [sit('s-73', 'severe', '73 er innstilt mellom Bjørndal og Brenna',
          'Ingen avganger før klokken 10. Bruk linje 79 fra Bjørndal senter.')],
};
const STOP_SITS = [sit('s-stop', 'normal', 'Ruteendringer i høstferien på Hauketo',
  'Færre avganger mandag til fredag i uke 40.')];
const GHOST = sit('s-ghost', 'normal', 'Melding om en linje uten rad på skjermen',
  'Denne linja er kuttet av knutepunkt-taket og har ingen rad å stå på.');

const call = (line, front, mins, stops) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NOW + mins * 60000), expectedDepartureTime: iso(NOW + mins * 60000),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line, publicCode: '1', name: 'spor 1' },
  serviceJourney: { id: 'sj:' + line + ':' + mins, situations: LINE_SITS[line] || [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'rail',
      presentation: { colour: 'f5a000' } },
    estimatedCalls: [
      { quay: { latitude: STOPP.lat, longitude: STOPP.lon,
        stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud', latitude: STOPP.lat, longitude: STOPP.lon } },
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
/* EN RAD SOM ER GÅTT. dirRows filtrerer den bort, så meldingen dens har ingen
   rad å stå på — og skal dermed bli igjen i banneret. Det er nettopp denne
   som forsvinner hvis `delivered` utledes fra _dirs i stedet for de levende
   radene. */
const GONE = call('99', 'Spøkelse', -9, [pt(59.80, 10.82, 'Kolbotn')]);
GONE.serviceJourney.situations = [GHOST];
CALLS.push(GONE);

const histRow = (to, id, n) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Mortensrud', toName: to, toStopId: id,
  toLat: 59.91, toLon: 10.75, fromStopId: 'NSR:StopPlace:Mortensrud',
  bucket: 3, isWeekend: false, count: n, lastUsed: NOW,
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

async function run(label, hist, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    geolocation: { latitude: HERE.lat, longitude: HERE.lon }, permissions: ["geolocation"],
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, here, hist, scheme }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    // EXPLICIT. The context's colorScheme alone changed nothing — the app
    // reads t.theme, so both screenshots came out identical (byte for byte)
    // and «lys modus» was the dark screen under another name.
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    localStorage.setItem('default::t.autoMode', '1');
    localStorage.setItem('default::t.homeLL', JSON.stringify(here));
    localStorage.setItem('default::t.smartHist', JSON.stringify(hist));
    // The shortcuts over the stop list read t.freqArr, which the same
    // _recordChoice writes — so a reader with history has both. Without this
    // the probe measured a screen no real reader ever sees.
    localStorage.setItem('default::t.freqArr', JSON.stringify(
      hist.map(h => ({ name: h.toName, stopId: h.toStopId, lat: h.toLat, lon: h.toLon,
        count: h.count, lastUsed: h.lastUsed }))));
  }, { now: NOW, here: HERE, hist, scheme });

  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: NEARBY }) }));
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('trip(')) return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { situations: [] }, dest: { situations: [] },
        trip: { tripPatterns: [] } } }) });
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud',
        situations: STOP_SITS, estimatedCalls: CALLS } } }) });
  });
  await page.route(/tiles|open-meteo|overpass|valhalla|geoapify|mobility|realtime/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3500);

  const read = () => page.evaluate(() => {
    const t = document.getElementById('auto-toast');
    return {
      skjerm: ['v-board', 'v-auto'].find(v => {
        const el = document.getElementById(v);
        return el && el.style.display !== 'none';
      }) || '?',
      stripe: t && t.style.display !== 'none' ? t.textContent.replace(/\s+/g, ' ').trim() : null,
      // The list in DOM ORDER, headings and rows together — the only way
      // to see that the groups are contiguous and that the reader's own
      // sort survives inside each one.
      liste: Array.from(document.querySelectorAll(
        '#auto-body .auto-side, #auto-body .auto-dir, #auto-body .auto-inline-stop'))
        .map(e => (e.classList.contains('auto-side') ? '── '
          : e.classList.contains('auto-inline-stop') ? '       ↳ ' : '   ')
          + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 46)),
      // RELEVANCE, measured: every indented stop must belong to the row
      // above it, not to some other line.
      // HOW BIG IS THE TARGET, next to the row it belongs to. A stop that
      // is harder to hit than the line above it is not really offered.
      treff: (() => {
        const row = document.querySelector('#auto-body .auto-dir');
        const stop = document.querySelector('#auto-body .auto-inline-stop');
        if (!row || !stop) return null;
        const r = row.getBoundingClientRect(), s = stop.getBoundingClientRect();
        const cs = getComputedStyle(stop);
        return { rad: Math.round(r.height) + 'x' + Math.round(r.width),
          stopp: Math.round(s.height) + 'x' + Math.round(s.width),
          venstre: Math.round(s.left - r.left) + ' px innrykk',
          // THE RIGHT EDGE is the one that can be wrong without looking it:
          // a positive number means the stop hangs past the line above it.
          hoyre: Math.round(s.right - r.right) + ' px utenfor radens høyrekant' };
      })(),
      // BANNERET: hva står det igjen med, og hvor i dokumentet.
      banner: (() => {
        const b = document.getElementById('auto-alerts');
        const where = document.getElementById('auto-where');
        const pos = b && where
          ? (b.compareDocumentPosition(where) & Node.DOCUMENT_POSITION_PRECEDING
            ? 'under «du er ved»' : 'OVER «du er ved»') : '?';
        if (!b || b.style.display === 'none') return { pos, linjer: ['(tomt)'] };
        return { pos, linjer: [...b.children].map(e =>
          e.className.replace(/ .*/, '') + ': ' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 52)) };
      })(),
      // MERKENE, og hvor store de er å treffe.
      merker: [...document.querySelectorAll('#auto-body .auto-dir-alert')].map(m => {
        const r = m.getBoundingClientRect();
        const a = m.querySelector(':scope') || m;
        const after = getComputedStyle(m, '::after');
        return { tekst: m.textContent.trim(), boks: Math.round(r.height) + 'x' + Math.round(r.width),
          treff: parseInt(after.height, 10) + 'x' + parseInt(after.width, 10),
          alvorlig: m.classList.contains('sev-severe'), apen: m.getAttribute('aria-expanded') };
      }),
      // Destinasjonen må ikke ha flyttet seg fordi merket kom til.
      navnVenstre: (() => {
        const n = [...document.querySelectorAll('#auto-body .auto-dir .nearby-name')]
          .map(e => Math.round(e.getBoundingClientRect().left));
        return [...new Set(n)].join(', ');
      })(),
      apneMeldinger: [...document.querySelectorAll('#auto-body .auto-dir-msg .sa-title')]
        .map(e => e.textContent.trim().slice(0, 46)),
      feilplassert: (() => {
        const rows = [...document.querySelectorAll('#auto-body .auto-dir')];
        let bad = 0;
        for (const r of rows) {
          let n = r.nextElementSibling;
          while (n && n.classList.contains('auto-inline-stop')) {
            if (n.dataset.dir !== r.dataset.i) bad++;
            n = n.nextElementSibling;
          }
        }
        return bad;
      })(),
    };
  });

  console.log('\n══ ' + label + ' · ' + scheme + ' ══');
  const sett = await page.evaluate(() => {
    const blokk = [...document.querySelectorAll('#auto-body .auto-dest')].map(b => ({
      navn: b.querySelector('.auto-dest-name').textContent.trim(),
      framme: b.querySelector('.auto-dest-at').textContent.trim(),
      hvordan: b.querySelector('.auto-dest-how').textContent.replace(/\s+/g, ' ').trim(),
      treff: Math.round(b.getBoundingClientRect().height),
      // OVER SKJERMKANTEN? Det som fører videre skal være synlig uten å skrolle.
      synlig: b.getBoundingClientRect().bottom < window.innerHeight,
    }));
    const rader = [...document.querySelectorAll('#auto-body .auto-dir')].length;
    const innrykk = [...document.querySelectorAll('#auto-body .auto-inline-stop')].length;
    return { blokk, rader, innrykk,
      hoyde: Math.round(document.getElementById('auto-body').getBoundingClientRect().height) };
  });
  sett.blokk.forEach(b => console.log('  ▸ ' + b.navn + ' · ' + b.framme
    + '\n      ' + b.hvordan + '\n      trykkflate ' + b.treff + ' px · over skjermkanten: ' + b.synlig));
  console.log('  retningsrader: ' + sett.rader + ' · innrykk: ' + sett.innrykk
    + ' · lista er ' + sett.hoyde + ' px høy');
  await page.screenshot({ path: 'scratchpad/aksen-' + label + '-' + scheme + '.png', fullPage: true });

  await ctx.close();
}

// WITH history on two stops on different lines, and WITHOUT any at all —
// the second is the ordinary first day, and the screen must be unchanged.
const HIST = [
  // JERNBANETORGET, som på skjermbildet — de innrykkede stoppene vises bare
  // for destinasjoner leseren faktisk bruker, og første utgave av denne
  // prøven hadde Oslo S i historikken og målte derfor en skjerm helt uten
  // innrykk. Måleinstrumentet, igjen.
  { key: 'jernbanetorget|4|wd', fromName: 'Mortensrud', toName: 'Jernbanetorget',
    toStopId: 'NSR:StopPlace:Jernbanetorget',
    toLat: 59.9139, toLon: 10.7522, count: 6, lastUsed: NOW - 86400000 },
  { key: 'oslo s|4|wd', fromName: 'Hauketo', toName: 'Oslo S', toStopId: 'NSR:StopPlace:Oslo S',
    // CLOSE COUNTS on purpose. A clear favourite triggers the auto-jump
    // (v1.110.0) and the screen goes straight to the board — the first cut
    // of this probe used 14 against 5 and measured the wrong screen.
    toLat: 59.9139, toLon: 10.7522, count: 6, lastUsed: NOW - 86400000 },
  { key: 'kolbotn|4|wd', fromName: 'Hauketo', toName: 'Kolbotn', toStopId: 'NSR:StopPlace:Kolbotn',
    toLat: 59.80, toLon: 10.82, count: 5, lastUsed: NOW - 3 * 86400000 },
];
await run('med-historikk', HIST, 'dark');
await run('med-historikk', HIST, 'light');
await run('uten-historikk', [], 'dark');
// AND THE CASE THAT MATTERS MOST: outside the city the app knows, the
// headings must not appear at all and the screen is what it was.

await browser.close(); server.close();
