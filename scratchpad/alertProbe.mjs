/**
 * Trafikkmeldinger som gjelder skjermen du står på.
 *
 * Reported with a screenshot from underveis: the reader was riding metro line
 * 3 toward Jernbanetorget, and the top of the screen said a BUS from Bjørndal
 * was 22 minutes late.
 *
 * Three structural causes, and this probe measures all three:
 *
 *   1. #service-alerts lived OUTSIDE every v-* div, and show() only toggles
 *      those — so one banner stood on every screen whatever it was about.
 *      MEASURED: navigate, and see whether the same text follows you.
 *   2. fetchTrip flattened every situation into one list keyed on id, throwing
 *      away which stop or leg it hung on.
 *   3. A situation carries no line of its own; only `affects` can say.
 *
 * The fixture is the reported screen: a delay notice for line 71 hung on
 * JERNBANETORGET — a stop the reader really is travelling to, so provenance
 * alone keeps it — while the reader rides line 3.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4523;
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
const PATTERNS = [6, 13, 21].map(m => ({
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

async function run(scheme, affectsOk) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
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

  let affectsAsked = 0;
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    if (body.includes('affects{')) {
      affectsAsked++;
      // THE LADDER. When the schema refuses the field, the app must shed it
      // and still deliver every departure.
      if (!affectsOk) return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: "Unknown type 'AffectedLine'" }], data: null }) });
    }
    if (!body.includes('trip('))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ data: { stopPlace: { estimatedCalls: [], situations: [] } } }) });
    // A schema that refused the field would not return it either. Serving it
    // anyway meant the «rejected» run silently exercised the happy path — and
    // the fallback, which is the one branch that cannot be verified against
    // the live API, was never measured at all.
    const strip = (x) => { const { affects, ...rest } = x; return rest; };
    const dress = (x) => (affectsOk ? x : strip(x));
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: {
        stopPlace: { situations: [dress(STENGT)] },
        dest: { situations: [dress(BJORNDAL)] },
        trip: { tripPatterns: JSON.parse(JSON.stringify(PATTERNS)).map(p => ({
          ...p, legs: p.legs.map(l => ({ ...l,
            serviceJourney: { ...l.serviceJourney,
              situations: (l.serviceJourney.situations || []).map(dress) } })) })) } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [] }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log(`\n══ ${scheme.toUpperCase()} · affects ${affectsOk ? 'godtatt' : 'AVVIST'} ══`);
  const board = await readAlerts(page);
  console.log('  tavla        :', board.varsler.map(v => v.foldet || v.tittel).join(' | ') || 'ingen');
  console.log('  affects spurt:', affectsAsked, affectsOk ? '' : '(og avvist → stigen skal ha falt tilbake)');

  // Into a departure, then aboard — the reported screen.
  await page.click('#dep-list .dep-row');
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1200);
  const sel = await readAlerts(page);
  console.log('  avgangsdetaljer:', sel.varsler.map(v => v.foldet || v.tittel).join(' | ') || 'ingen');

  const reis = await page.$('#s-ctas .cta-row .cta-btn:nth-child(2)');
  const kanReise = reis && await reis.isVisible().catch(() => false)
    && !(await reis.evaluate(b => b.disabled));
  if (kanReise) {
    await reis.click();
    await page.waitForTimeout(2000);
    const tr = await readAlerts(page);
    console.log('  underveis    :', tr.skjerm, '→',
      tr.varsler.map(v => v.foldet || v.tittel).join(' | ') || 'ingen');
    const bj = tr.varsler.find(v => (v.tittel || '').includes('22 minutter'));
    console.log('  Bjørndal-meldingen øverst:', bj ? 'JA — fortsatt feil' : 'nei');

    // Open the folded pile and require the message to still be reachable.
    const other = await page.$('#t-alerts .alerts-other');
    if (other && await other.isVisible().catch(() => false)) {
      await other.click(); await page.waitForTimeout(700);
      const op = await readAlerts(page);
      console.log('  etter å ha åpnet:',
        op.varsler.map(v => v.foldet || v.tittel).join(' | '));
    }
  } else {
    console.log('  underveis    : kunne ikke starte reisen fra denne fiksturen');
  }

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  await page.screenshot({ path: `scratchpad/shots/alert-${scheme}-${affectsOk ? 'ok' : 'avvist'}.png`,
    animations: 'disabled' });
  await ctx.close();
}

await run('dark', true);
await run('dark', false);
await run('light', true);
await browser.close();
server.close();
console.log('');
