/**
 * Nedtellinger som har en horisont — og en stoppregel som ikke er fire regler.
 *
 * «19t 53m igjen» was a real string on the detail screen and on the board row.
 * The number is right and useless. This puts a departure 40 minutes out and
 * one 19h53m out IN THE SAME LIST, because the question is not «is the far one
 * handled» but «do the two read as different kinds of fact when they sit
 * beside each other».
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether the calm row reads as calm rather
 * than as broken. r-far carries no colour at all, which is a decision that
 * looks like an omission in the source and can only be judged on the screen.
 * And whether a clock face fits where a countdown sat — «i morgen 07:42» is
 * nearly three times the width of «40 min», in a hero that is clamped to
 * 16vw.
 *
 * GPS is seeded near the departure stop on purpose: without it isWalkActive is
 * false, `showReach` never fires, and the board row this probe exists to look
 * at is not rendered at all.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4525;
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

async function run(scheme, affectsOk) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    // 300 m from Skullerud. Without a fix isWalkActive is false, showReach
    // never fires, and the .dep-reach row this probe exists to read is not in
    // the DOM at all — the fixture would have measured its own absence.
    permissions: ['geolocation'],
    geolocation: { latitude: 59.8671, longitude: 10.8250, accuracy: 12 },
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

  console.log(`\n══ ${scheme.toUpperCase()} ══`);

  const rows = await page.evaluate(() => Array.from(
    document.querySelectorAll('#dep-list .dep-row')).map(r => {
      const reach = r.querySelector('.dep-reach');
      const mins = r.querySelector('.dep-mins');
      return {
        klasse: (r.className.match(/r-(?:far|ok|soon|now)|missed/) || ['—'])[0],
        tall: mins ? mins.textContent.replace(/\s+/g, ' ').trim() : '—',
        rekkevidde: reach ? reach.textContent.replace(/\s+/g, ' ').trim() : '(ingen)',
        // The colour is the decision: r-far is deliberately uncoloured, and an
        // omission in CSS looks exactly like a mistake until it is measured.
        farge: reach ? getComputedStyle(reach).color : '—',
      };
    }));
  rows.forEach(r => console.log('   ', r.klasse.padEnd(7), r.tall.padEnd(10),
    r.rekkevidde.padEnd(22), r.farge));

  // Into the far departure — the hero is where a clock face has to fit in
  // type clamped to 16vw.
  const far = await page.$('#dep-list .dep-row.r-far');
  if (far) {
    await far.click();
    await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(1500);
    const hero = await page.evaluate(() => {
      const t = document.querySelector('.leaveby-time');
      const l = document.querySelector('.leaveby-label');
      const sub = document.querySelector('.leaveby-sub');
      if (!t) return null;
      // THE TEXT RUN, not the element. .leaveby-time is a block and always
      // fills the column, so its width was 358px whatever it said — a number
      // that described the layout and not the type. Same lesson as v1.101.1.
      const rng = document.createRange();
      rng.selectNodeContents(t);
      const rects = Array.from(rng.getClientRects()).filter(r => r.width > 0);
      const box = rects.length
        ? { left: Math.min(...rects.map(r => r.left)),
            right: Math.max(...rects.map(r => r.right)),
            width: Math.max(...rects.map(r => r.right)) - Math.min(...rects.map(r => r.left)) }
        : t.getBoundingClientRect();
      return {
        tekst: t.textContent.replace(/\s+/g, ' ').trim(),
        klasse: t.className,
        etikett: l ? l.textContent.trim() : '—',
        under: sub ? sub.textContent.replace(/\s+/g, ' ').trim() : '—',
        // Does the clock face fit, or does it run off a 390px screen?
        bredde: Math.round(box.width),
        utenfor: box.left < -1 || box.right > 391,
      };
    });
    console.log('   helt      :', hero ? hero.tekst + '  [' + hero.klasse + ']' : '(ingen)');
    console.log('   etikett   :', hero ? hero.etikett : '—');
    console.log('   under     :', hero ? hero.under : '—');
    console.log('   bredde    :', hero ? hero.bredde + ' px' + (hero.utenfor ? '  UTENFOR KANTEN' : '') : '—');
    await page.screenshot({ path: `scratchpad/shots/horisont-${scheme}-detalj.png`,
      clip: { x: 0, y: 0, width: 390, height: 620 }, animations: 'disabled' });
    await page.goBack().catch(() => {});
    await page.waitForTimeout(600);
  } else {
    console.log('   (ingen r-far-rad — fiksturen traff ikke horisonten)');
  }

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  // The LIST, not the top of the page. The two rows are the comparison this
  // probe exists to make, and a fixed clip from the top put them below the
  // fold — a screenshot of the wrong thing is the same mistake as measuring
  // the wrong element.
  const list = await page.$('#dep-list');
  if (list) await list.screenshot({ path: `scratchpad/shots/horisont-${scheme}-tavle.png`,
    animations: 'disabled' });
  await ctx.close();
}

await run('dark', true);
await run('light', true);
await browser.close();
server.close();
console.log('');
