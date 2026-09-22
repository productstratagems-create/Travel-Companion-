/**
 * Banneret får vite hva tavla viser, ikke hva den viste sist.
 *
 * Rapportert fra tavla, Mortensrud → Jernbanetorget: meldingen om buss for
 * T-bane mellom Skullerud og MORTENSRUD — avreisestoppet — lå foldet bort som
 * «en annen melding».
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at meldingen om din egen linje står ÅPEN
 * fra FØRSTE tegning. Regelen er riktig; feilen var at banneret ble spurt før
 * radene fantes. Bare en ekte tegning kan vise at rekkefølgen nå stemmer.
 *
 * OG: forrige prøve nådde aldri v-board — fiksturen var en auto-reise-økt.
 * Denne sjekker at `v-board` faktisk vises FØR noe måles.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4583;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const iso = ms => new Date(ms).toISOString();
const HERE = { lat: 59.8300, lon: 10.8050 };   // Hauketo, ~9 km sør for Oslo S

const stop = (name, m) => ({
  properties: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, label: name,
    category: [name.endsWith(' T') ? 'metroStation' : 'onstreetBus'] },
  geometry: { coordinates: [HERE.lon, HERE.lat + m / 111320] },
});
const NEARBY = [stop('Hauketo', 20), stop('Lofsrud', 400)];

/* Hauketo, ~9 km sør for Oslo S. Fem retninger: to gjennom sentrum, to ut
   av byen, og én som knapt flytter seg — den siste skal IKKE få merkelapp. */
const OSLO_S = { lat: 59.9139, lon: 10.7522 };
const pt = (lat, lon, name) => ({ name, id: 'NSR:StopPlace:' + name, lat, lon });

const DIRS = [
  { line: 'L2', front: 'Lysaker', mins: 27, stops: [
    pt(59.87, 10.79, 'Nordstrand'), pt(59.9139, 10.7522, 'Oslo S'), pt(59.921, 10.637, 'Lysaker') ] },
  { line: 'L2', front: 'Stabekk', mins: 12, stops: [
    pt(59.88, 10.78, 'Ljan'), pt(59.9139, 10.7522, 'Oslo S'), pt(59.907, 10.611, 'Stabekk') ] },
  { line: 'L2', front: 'Ski', mins: 22, stops: [
    pt(59.80, 10.82, 'Kolbotn'), pt(59.719, 10.836, 'Ski') ] },
  { line: '73', front: 'Brenna', mins: 14, stops: [
    pt(59.815, 10.815, 'Bjørndal'), pt(59.806, 10.822, 'Brenna') ] },
  { line: '81', front: 'Fornebu', mins: 8, stops: [
    pt(59.832, 10.806, 'Hauketo vest') ] },
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
/* DEN RAPPORTERTE MELDINGEN. Den navngir linja gjennom `affects`, som er det
   som gjør regel 3 skarp — og som er nettopp det som gjorde den til «andres»
   da banneret ble spurt før radene fantes. */
const BUSS_FOR_BANE = { ...sit('s-3b', 'normal',
  'Linje 3 (Buss for T-bane 3B): Mellom Skullerud og Mortensrud fra kl. 21.00 til 02.00.',
  'Skullerud: Påstigning på holdeplass E, avstigning på holdeplass J.'),
  affects: [{ __typename: 'AffectedLine', line: { id: 'RUT:Line:L2' } }] };
const LINE_SITS = {
  'L2': [BUSS_FOR_BANE, sit('s-l2a', 'normal', 'L2 kjører ikke mellom Ski og Kolbotn',
          'Det settes opp buss for tog. Beregn 20 minutter ekstra.'),
         sit('s-l2b', 'slight', 'Heisen på Ljan er ute av drift',
          'Bruk trappen fra Nordstrandveien, eller gå av på Holmlia.')],
  '73': [sit('s-73', 'severe', '73 er innstilt mellom Bjørndal og Brenna',
          'Ingen avganger før klokken 10. Bruk linje 79 fra Bjørndal senter.')],
};
const STOP_SITS = [sit('s-stop', 'normal', 'Det kjøres sjeldnere avganger i høstferien (uke 40)',
  'Sjekk Ruter-appen før du reiser.')];
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
    // TAVLA, ikke auto-reise: en lagret rute Mortensrud → Jernbanetorget.
    localStorage.setItem('default::t.autoMode', '0');
    localStorage.setItem('default::t.landing', 'board');
    // VIRKER IKKE, og det er verdt å skrive ned framfor å prøve igjen:
    // `loadActiveRoute` (settings.js:1149) krever BÅDE from og to, så en
    // stopptavle uten destinasjon finnes ikke på tavla — ruta faller tilbake
    // til standardparet og tavla havner i gang-grenen (0 m).
    //
    // Tavlas banner krever derfor en TRIP-fikstur: `trip.tripPatterns` med
    // etapper som bærer situations. Denne prøven har bare et
    // stopPlace-svar, og når derfor aldri banneret.
    //
    // Det som ER målt herfra: at prøven kommer til v-board i det hele tatt
    // (synlig: ["v-board"]) — forrige runde gjorde ikke engang det.
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: 'Hauketo', stopId: 'NSR:StopPlace:Hauketo',
      to: '', toStopId: null, filter: null, line: null,
      geo: 'Hauketo', toGeo: '',
    }));
    // ÉN LAGT BORT FRA FØR, som på skjermbildet. Uten den måler prøven en
    // skjerm der den nye raden aldri har begge slagene i seg.

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
      body: JSON.stringify({ data: { stopPlace: { id: 'NSR:StopPlace:Hauketo', name: 'Hauketo',
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

  // MÅL DET DU TROR DU MÅLER, først: står vi på tavla i det hele tatt?
  const hvor = await page.evaluate(() => ({
    synlig: ['v-board', 'v-auto'].filter(v => {
      const e = document.getElementById(v); return e && e.style.display !== 'none';
    }),
    banner: (document.getElementById('service-alerts') || {}).style
      ? document.getElementById('service-alerts').style.display : '(finnes ikke)',
  }));
  console.log('\n══ ' + label + ' · ' + scheme + ' ══');
  console.log('  skjerm: ' + JSON.stringify(hvor));
  console.log('  diagnose: ' + JSON.stringify(await page.evaluate(() => ({
    rader: document.querySelectorAll('#dep-list .dep-row').length,
    liste: (document.getElementById('dep-list') || {}).textContent
      ? document.getElementById('dep-list').textContent.replace(/\s+/g, ' ').trim().slice(0, 70) : '-',
    meldinger: (window.__state && window.__state.serviceAlerts || []).length,
  }))));
  if (!hvor.synlig.includes('v-board')) {
    console.log('  ✗ prøven nådde aldri tavla — ingenting under er en måling.');
    await ctx.close(); return;
  }

  const les = () => page.evaluate(() => {
    const b = document.getElementById('service-alerts');
    return {
      fold: b.querySelector('.alerts-more')
        ? b.querySelector('.alerts-more').textContent.replace(/\s+/g, ' ').trim() : '(ingen fold)',
      apne: [...b.querySelectorAll('.service-alert')].map(e =>
        e.textContent.replace(/\s+/g, ' ').trim().slice(0, 46)),
    };
  });
  const a = await les();
  console.log('  fold: ' + a.fold);
  a.apne.forEach(x => console.log('   åpen: ' + x));
  // OG ETT TIKK SENERE: den skal ikke bytte side.
  await page.waitForTimeout(1500);
  const b = await les();
  console.log('  ett tikk senere — fold: ' + b.fold
    + ' · samme åpne: ' + (JSON.stringify(a.apne) === JSON.stringify(b.apne)));
  await page.screenshot({ path: 'scratchpad/tavla-' + label + '-' + scheme + '.png', fullPage: true });

  await ctx.close();
}

// WITH history on two stops on different lines, and WITHOUT any at all —
// the second is the ordinary first day, and the screen must be unchanged.
const HIST = [
  { key: 'oslo s|4|wd', fromName: 'Hauketo', toName: 'Oslo S', toStopId: 'NSR:StopPlace:Oslo S',
    // CLOSE COUNTS on purpose. A clear favourite triggers the auto-jump
    // (v1.110.0) and the screen goes straight to the board — the first cut
    // of this probe used 14 against 5 and measured the wrong screen.
    toLat: 59.9139, toLon: 10.7522, count: 6, lastUsed: NOW - 86400000 },
  { key: 'kolbotn|4|wd', fromName: 'Hauketo', toName: 'Kolbotn', toStopId: 'NSR:StopPlace:Kolbotn',
    toLat: 59.80, toLon: 10.82, count: 5, lastUsed: NOW - 3 * 86400000 },
];
await run('tavla', HIST, 'dark');
await run('tavla', HIST, 'light');
// AND THE CASE THAT MATTERS MOST: outside the city the app knows, the
// headings must not appear at all and the screen is what it was.

await browser.close(); server.close();
