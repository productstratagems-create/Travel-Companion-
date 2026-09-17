/**
 * Fem posisjonstilstander som var én setning.
 *
 * «Ikke spurt», «leter», «avslått», «unøyaktig» og «gammel» all rendered as
 * the same «vi vet ikke hvor du er» — and «unøyaktig» could not be rendered at
 * all, because ACC_GATE threw the evidence away.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether five sentences on one small screen
 * read as five different situations or as five ways of saying the same thing.
 * A unit test proves the strings differ; only the screen shows whether the
 * difference lands.
 *
 * Each state is produced through the REAL path, not by poking state: geolocation
 * is granted, denied or failed at the context level, and the inaccurate case is
 * driven by feeding the page a genuinely noisy fix after a good one — which is
 * the only way ACC_GATE is exercised rather than described.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4527;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

const FROM = { id: 'NSR:StopPlace:Skullerud', name: 'Skullerud', lat: 59.8644, lon: 10.8250 };
const TO = { id: 'NSR:StopPlace:Jernbanetorget', name: 'Jernbanetorget', lat: 59.9115, lon: 10.7500 };
const L3 = 'RUT:Line:3', L71 = 'RUT:Line:71';

const CHAIN = [
  ['Skullerud', 59.8644, 10.8250], ['Bøler', 59.8790, 10.8300],
  ['Oppsal', 59.8900, 10.8350], ['Hellerud', 59.9080, 10.8180],
  ['Helsfyr', 59.9160, 10.7950], ['Tøyen', 59.9160, 10.7700],
  ['Jernbanetorget', 59.9115, 10.7500],
];

const sit = (id, summary, description, affects) => ({
  id, severity: 'normal',
  summary: [{ language: 'no', value: summary }],
  description: [{ language: 'no', value: description }],
  validityPeriod: { startTime: iso(NOW - 3600000), endTime: iso(NOW + 3600000) },
  ...(affects ? { affects } : {}),
});

/* THE REPORTED MESSAGE. Hangs on the destination stop; names line 71. */
const BJORNDAL = sit('sit-bjorndal',
  'Avgangen er ca. 22 minutter forsinket',
  'Avgangen fra Bjørndal kl. 08:10 i retning Jernbanetorget er ca. 22 minutter forsinket. Dette skyldes en ulykke.',
  [{ __typename: 'AffectedLine', line: { id: L71 } }]);

/* One that IS the reader's: it names their line. */
const MIN_LINJE = sit('sit-linje3',
  'Linje 3 kjører med redusert hastighet',
  'Mellom Helsfyr og Tøyen kjører linje 3 med redusert hastighet.',
  [{ __typename: 'AffectedLine', line: { id: L3 } }]);

/* And one with no line at all — a closed station. Must survive. */
const STENGT = sit('sit-stengt',
  'Skullerud: heisen er ute av drift',
  'Heisen ved Skullerud er ute av drift inntil videre.');

const leg = (mins) => ({
  mode: 'metro', distance: 11000,
  aimedStartTime: iso(NOW + mins * 60000), expectedStartTime: iso(NOW + mins * 60000),
  aimedEndTime: iso(NOW + (mins + 25) * 60000), expectedEndTime: iso(NOW + (mins + 25) * 60000),
  fromPlace: { name: FROM.name, quay: { id: 'NSR:Quay:2', publicCode: '2',
    stopPlace: { id: FROM.id, name: FROM.name }, latitude: FROM.lat, longitude: FROM.lon } },
  toPlace: { name: TO.name, quay: { id: 'NSR:Quay:B', publicCode: 'B',
    stopPlace: { id: TO.id, name: TO.name }, latitude: TO.lat, longitude: TO.lon } },
  line: { id: L3, publicCode: '3', transportMode: 'metro', presentation: { colour: 'f5a000' } },
  situations: [],
  serviceJourney: { id: 'RUT:ServiceJourney:3-' + mins, situations: [MIN_LINJE],
    line: { id: L3, publicCode: '3', transportMode: 'metro', presentation: { colour: 'f5a000' } },
    estimatedCalls: CHAIN.map(([name, lat, lon], i) => ({
      quay: { latitude: lat, longitude: lon,
        stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, latitude: lat, longitude: lon } },
      aimedArrivalTime: iso(NOW + (mins + i * 4) * 60000),
      expectedArrivalTime: iso(NOW + (mins + i * 4) * 60000),
      aimedDepartureTime: iso(NOW + (mins + i * 4) * 60000),
      expectedDepartureTime: iso(NOW + (mins + i * 4) * 60000),
    })) },
  pointsOnLink: null,
});
const PATTERNS = [40, 1193].map(m => ({
  duration: 25 * 60, aimedStartTime: iso(NOW + m * 60000),
  expectedStartTime: iso(NOW + m * 60000), legs: [leg(m)],
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

/** Every alert visible right now, wherever on the page it lives. */
const readAlerts = (page) => page.evaluate(() => {
  const boxes = Array.from(document.querySelectorAll('[id$="alerts"], #service-alerts'))
    .filter(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none');
  const vis = (e) => {
    let n = e;
    while (n && n !== document.body) {
      if (getComputedStyle(n).display === 'none') return false;
      n = n.parentElement;
    }
    return true;
  };
  const out = [];
  boxes.forEach(b => {
    if (!vis(b)) return;
    b.querySelectorAll('.service-alert').forEach(a => {
      const t = a.querySelector('.sa-title');
      out.push({ boks: b.id, tittel: (t ? t.textContent : a.textContent).trim().slice(0, 44) });
    });
    const other = b.querySelector('.alerts-other');
    if (other) out.push({ boks: b.id, foldet: other.textContent.replace(/\s+/g, ' ').trim() });
  });
  const v = Array.from(document.querySelectorAll('[id^="v-"]')).find(e => e.style.display !== 'none');
  return { skjerm: v && v.id, varsler: out };
});

async function run(scheme, tilstand) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    // 300 m from Skullerud. Without a fix isWalkActive is false, showReach
    // never fires, and the .dep-reach row this probe exists to read is not in
    // the DOM at all — the fixture would have measured its own absence.
    // The permission is what separates «avslått» from the rest, and it is
    // granted or withheld HERE rather than by writing to state — otherwise the
    // probe would be testing its own fixture.
    permissions: tilstand === 'avslatt' ? [] : ['geolocation'],
    ...(tilstand === 'avslatt' || tilstand === 'ikke-spurt' ? {}
      : { geolocation: { latitude: 59.8671, longitude: 10.8250, accuracy: 12 } }),
  });
  const page = await ctx.newPage();
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
    if (body.includes('affects{')) {
      // THE LADDER. When the schema refuses the field, the app must shed it
      // and still deliver every departure.
      // The affects ladder is alertProbe's question, not this one. Always
      // accepted here, so nothing about traffic messages varies between runs.
    }
    if (!body.includes('trip('))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { estimatedCalls: [], situations: [] } } }) });
    // A schema that refused the field would not return it either. Serving it
    // anyway meant the «rejected» run silently exercised the happy path — and
    // the fallback, which is the one branch that cannot be verified against
    // the live API, was never measured at all.
      const dress = (x) => x;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: {
        stopPlace: { situations: [dress(STENGT)] },
        dest: { situations: [dress(BJORNDAL)] },
        trip: { tripPatterns: JSON.parse(JSON.stringify(PATTERNS)).map(p => ({
          ...p, legs: p.legs.map(l => ({ ...l,
            serviceJourney: { ...l.serviceJourney,
              situations: (l.serviceJourney.situations || []).map(dress) } })) })) } } }) });
  });
  // THE INSTRUMENT'S OWN BUG, FOUND BY RUNNING IT. This was inherited from
  // alertProbe as an empty feature list, which is right for a probe about
  // alerts and fatal for one about walk timing: state.nearestStations is
  // filled from the REVERSE GEOCODER, not from the geolocation fix, so an
  // empty answer left isWalkActive false, rcls null and .dep-reach absent —
  // and the first run duly reported that the row it exists to read was not
  // there. Serving the departure stop is what makes the measurement possible
  // at all.
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{
      properties: { id: FROM.id, name: FROM.name, label: FROM.name,
        category: ['metroStation', 'onstreetBus'] },
      geometry: { coordinates: [FROM.lon, FROM.lat] },
    }] }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  await page.waitForTimeout(2000);

  // «unøyaktig»: a good fix, then a genuinely noisy one. This is the only way
  // to exercise ACC_GATE rather than describe it — the gate only engages once
  // a fix already exists, so the order matters and a single noisy fix would
  // have been accepted and proved nothing.
  if (tilstand === 'unoyaktig') {
    await page.waitForTimeout(1200);
    await ctx.setGeolocation({ latitude: 59.8674, longitude: 10.8253, accuracy: 180 });
    await page.waitForTimeout(1500);
  }
  if (tilstand === 'gammel') {
    await page.waitForTimeout(1200);
    // Two minutes of nothing, in one step. The watch stays open; it simply has
    // nothing new to say, which is exactly the tunnel case.
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 150000; });
    await page.waitForTimeout(1500);
  }
  await page.waitForTimeout(700);

  console.log(`\n══ ${scheme} · ${tilstand} ══`);

  const seen = await page.evaluate(() => {
    const txt = (el) => {
      if (!el) return '(fins ikke)';
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || !el.textContent.trim()) return '(stille)';
      return el.textContent.replace(/\s+/g, ' ').trim();
    };
    return {
      tavla: txt(document.getElementById('walk-summary')),
      // What the app believes, so a sentence on screen can be checked against
      // the state it claims to describe.
      tro: {
        spurt: !!(window.__state && window.__state.posAsked),
        feil: window.__state ? window.__state.gpsError : '?',
      },
    };
  });
  console.log('   gangsammendrag:', seen.tavla);

  // And auto-reise, which is the screen a position-first mode fails on.
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.app-nav button, .app-nav a'))
      .find(e => /auto/i.test(e.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(1500);
  const auto = await page.evaluate(() => {
    const v = document.getElementById('v-auto');
    if (!v || getComputedStyle(v).display === 'none') return '(ikke på auto-skjermen)';
    const empty = v.querySelector('.dest-prev-empty');
    const head = v.querySelector('.auto-stop-facts');
    return (empty ? 'tom: ' + empty.textContent.replace(/\s+/g, ' ').trim() : '')
      + (head ? ' | fakta: ' + head.textContent.replace(/\s+/g, ' ').trim() : '')
      // The note's OWN colour, not the facts line's. v1.108.0 left them in the
      // same ink and said so out loud; this is what checks the repair — and it
      // is also the only thing that catches a renderer that stops passing the
      // verdict at all, which no unit test on a pure function can see.
      + (() => {
          const n = v.querySelector('.auto-pos-note');
          if (!n) return '';
          // HOW MANY LINES THE NOTE ITSELF OCCUPIES, measured as text runs
          // rather than as a box: a span that wraps mid-phrase reports two
          // client rects, and «posisjonen er / unøyaktig (±56 m)» split across
          // a line break is the reported fault. An element box would have said
          // nothing — it is one box either way.
          const rng = document.createRange(); rng.selectNodeContents(n);
          const rects = Array.from(rng.getClientRects()).filter(r => r.width > 1);
          const facts = v.querySelector('.auto-stop-facts');
          const fr = facts ? facts.getBoundingClientRect() : null;
          return '  [notat ' + getComputedStyle(n).color
            + ' · ' + rects.length + ' linje' + (rects.length === 1 ? '' : 'r')
            + ' · faktalinja ' + (fr ? Math.round(fr.height) : '?') + ' px]';
        })()
      || '(ingen tekst)';
  });
  console.log('   auto-reise    :', auto);

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/pos-${scheme}-${tilstand}.png`,
    clip: { x: 0, y: 0, width: 390, height: 500 }, animations: 'disabled' });
  await ctx.close();
}

for (const t of ['ikke-spurt', 'avslatt', 'unoyaktig', 'gammel', 'ok']) {
  await run('dark', t);
}
await run('light', 'unoyaktig');
await run('light', 'avslatt');
await browser.close();
server.close();
console.log('');
