/**
 * Samme reise, tre skjermer, ett kartspråk.
 *
 * Reported with a screenshot: «Måten multi-stopps reiser tegnes opp i kart er
 * uklart og vanskelig å tyde. Både linjene og prikken. Hva betyr de?»
 *
 * Mortensrud → Ljan, bus 73 onto bus 81 with a walk between. Both are RUT
 * buses, so both corridors carried the same colour and the same dash — one
 * unbroken red string, and the change was not on the map at all.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: whether three word-markers on a 390px map
 * read as a story or as more clutter on a map that already has six symbols.
 * The numbers below say they are present and where; only the screenshot says
 * whether they help.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4535;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

const FROM = { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud', lat: 59.8570, lon: 10.8280 };
const TO = { id: 'NSR:StopPlace:Ljanstasjon', name: 'Ljan stasjon', lat: 59.8430, lon: 10.7820 };
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

/* THE REPORTED JOURNEY: bus 73 from Mortensrud, three minutes on foot at
   Hauketo, bus 81 on to Ljan. Both buses are RUT red — which is the whole
   point: the seam between them was invisible. */
const B73 = 'RUT:Line:73', B81 = 'RUT:Line:81';
const RED = 'e5006d';
const P = (name, lat, lon) => ({ name, latitude: lat, longitude: lon,
  quay: { id: 'NSR:Quay:' + name.replace(/\W/g, ''), publicCode: 'B',
    stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name },
    latitude: lat, longitude: lon } });

const MORTENSRUD = P('Mortensrud', 59.8570, 10.8280);
const HAUKETO = P('Hauketo', 59.8420, 10.8020);
const HAUKETO_SKOLE = P('Hauketo skole', 59.8446, 10.8065);
const LJAN = P('Ljan stasjon', 59.8430, 10.7820);

const chain = (a, b, n, t0) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const lat = a.latitude + (b.latitude - a.latitude) * f;
    const lon = a.longitude + (b.longitude - a.longitude) * f;
    const nm = i === 0 ? a.name : i === n ? b.name : 'Stopp ' + i;
    const ts = iso(NOW + (t0 + i * 2) * 60000);
    out.push({ quay: { latitude: lat, longitude: lon,
      stopPlace: { id: 'NSR:StopPlace:' + nm.replace(/\W/g, ''), name: nm, latitude: lat, longitude: lon } },
      aimedArrivalTime: ts, expectedArrivalTime: ts,
      aimedDepartureTime: ts, expectedDepartureTime: ts });
  }
  return out;
};

const transit = (lineId, code, from, to, t0, dur) => ({
  mode: 'bus', distance: 4000,
  aimedStartTime: iso(NOW + t0 * 60000), expectedStartTime: iso(NOW + t0 * 60000),
  aimedEndTime: iso(NOW + (t0 + dur) * 60000), expectedEndTime: iso(NOW + (t0 + dur) * 60000),
  fromPlace: { name: from.name, latitude: from.latitude, longitude: from.longitude, quay: from.quay },
  toPlace: { name: to.name, latitude: to.latitude, longitude: to.longitude, quay: to.quay },
  line: { id: lineId, publicCode: code, transportMode: 'bus', presentation: { colour: RED } },
  situations: [],
  serviceJourney: { id: 'RUT:ServiceJourney:' + code + '-' + t0, situations: [],
    line: { id: lineId, publicCode: code, transportMode: 'bus', presentation: { colour: RED } },
    estimatedCalls: chain(from, to, 4, t0) },
  fromEstimatedCall: { expectedDepartureTime: iso(NOW + t0 * 60000),
    aimedDepartureTime: iso(NOW + t0 * 60000), realtime: true,
    quay: { publicCode: 'B' }, destinationDisplay: { frontText: to.name } },
  toEstimatedCall: { expectedArrivalTime: iso(NOW + (t0 + dur) * 60000),
    aimedArrivalTime: iso(NOW + (t0 + dur) * 60000), quay: { publicCode: 'B' } },
  pointsOnLink: null,
});

const foot = (from, to, t0) => ({
  mode: 'foot', distance: 320,
  aimedStartTime: iso(NOW + t0 * 60000), expectedStartTime: iso(NOW + t0 * 60000),
  aimedEndTime: iso(NOW + (t0 + 3) * 60000), expectedEndTime: iso(NOW + (t0 + 3) * 60000),
  fromPlace: { name: from.name, latitude: from.latitude, longitude: from.longitude, quay: from.quay },
  toPlace: { name: to.name, latitude: to.latitude, longitude: to.longitude, quay: to.quay },
  pointsOnLink: null,
});

const PATTERNS = [6, 24].map(m => ({
  duration: 30 * 60, aimedStartTime: iso(NOW + m * 60000), expectedStartTime: iso(NOW + m * 60000),
  legs: [
    transit(B73, '73', MORTENSRUD, HAUKETO, m, 11),
    foot(HAUKETO, HAUKETO_SKOLE, m + 11),
    transit(B81, '81', HAUKETO_SKOLE, LJAN, m + 14, 9),
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
        // A FOOT LEG HAS NO serviceJourney, and the handler inherited from
        // alertProbe assumed every leg did — it threw before a single pixel
        // was drawn. The walk is half of what this probe is about.
        trip: { tripPatterns: JSON.parse(JSON.stringify(PATTERNS)).map(p => ({
          ...p, legs: p.legs.map(l => (l.serviceJourney
            ? { ...l, serviceJourney: { ...l.serviceJourney,
                situations: (l.serviceJourney.situations || []).map(dress) } }
            : l)) })) } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [{
      properties: { id: TO.id, name: TO.name, label: TO.name, category: ['railStation'] },
      geometry: { coordinates: [TO.lon, TO.lat] } }] }) }));
  await page.route(/tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  await page.waitForTimeout(2000);

  console.log(`\n══ ${scheme} ══`);

  const seen = await page.evaluate(() => {
    const wrap = document.querySelector('#board-map');
    const box = wrap ? wrap.getBoundingClientRect() : null;
    // The word-markers, and WHERE they are — a marker outside the map's own
    // box is drawn and invisible, which measures as present and reads as
    // absent.
    const pts = Array.from(document.querySelectorAll('#board-map .leaflet-marker-icon'))
      .map(el => ({ t: el.textContent.trim(), r: el.getBoundingClientRect() }))
      .filter(x => /^(på|bytt|av)$/i.test(x.t));
    const inside = (r) => box && r.left >= box.left - 1 && r.right <= box.right + 1
      && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    // Do any two of them overlap? Three words on a small map is exactly where
    // «more intuitive» turns into «more clutter».
    let kolliderer = 0;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i].r, b = pts[j].r;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
        && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) kolliderer++;
    }
    const strokes = Array.from(document.querySelectorAll('#board-map path'))
      .map(p => (p.getAttribute('stroke-dasharray') || 'heltrukket')
        + '@' + (p.getAttribute('stroke-width') || '?'));
    return {
      ord: pts.map(p => p.t),
      utenfor: pts.filter(p => !inside(p.r)).map(p => p.t),
      kolliderer,
      streker: [...new Set(strokes)],
    };
  });
  console.log('   vendepunkter:', seen.ord.join(' → ') || '(ingen)');
  console.log('   utenfor kart:', seen.utenfor.join(', ') || 'ingen');
  console.log('   overlapp    :', seen.kolliderer);
  console.log('   tavla   :', seen.streker.filter(x => !/heltrukket@(5|7|9)$/.test(x)).join('  |  '));

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  // A map that is not on screen cannot be photographed, and the detail map is
  // hidden until the trip has a shape to draw. Skip rather than hang — a probe
  // that times out reports nothing about the thing it was measuring.
  const shoot = async (sel, navn) => {
    const el = await page.$(sel);
    if (!el || !(await el.isVisible().catch(() => false))) {
      console.log('   (' + navn + ': kartet er ikke synlig)');
      return;
    }
    await el.screenshot({ path: `scratchpad/shots/kart-${scheme}-${navn}.png`,
      animations: 'disabled', timeout: 4000 }).catch(() => {});
  };
  await shoot('#board-map', 'tavla');

  // THE FRAME AND THE BEHAVIOUR. One button, one open state, one height —
  // measured rather than asserted, because «looks and feels the same» is a
  // claim about pixels.
  const frameOf = (sel, btnSel) => page.evaluate(([s, b]) => {
    const el = document.querySelector(s), btn = document.querySelector(b);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      h: Math.round(el.getBoundingClientRect().height),
      radius: cs.borderTopLeftRadius,
      knapp: btn ? btn.textContent.trim() : '(ingen)',
      tittel: btn ? btn.getAttribute('title') : '—',
      aria: btn ? btn.getAttribute('aria-expanded') : '—',
      // The controls, by purpose.
      zoom: !!el.querySelector('.leaflet-control-zoom'),
      skala: !!el.querySelector('.leaflet-control-scale'),
      apen: el.classList.contains('expanded'),
      sideLast: document.documentElement.classList.contains('map-open'),
    };
  }, [sel, btnSel]);

  const lukket = await frameOf('#board-map', '#board-map-expand');
  await page.click('#board-map-expand');
  await page.waitForTimeout(500);
  const apen = await frameOf('#board-map', '#board-map-expand');
  await page.click('#board-map-expand');
  await page.waitForTimeout(500);
  const igjen = await frameOf('#board-map', '#board-map-expand');
  const row = (n, f) => '   ' + n.padEnd(8) + f.h + ' px · hjørne ' + f.radius
    + ' · knapp ' + f.knapp + ' «' + f.tittel + '» aria ' + f.aria
    + ' · zoom ' + f.zoom + ' skala ' + f.skala + ' · siden slipper ' + f.sideLast;
  console.log(row('lukket', lukket));
  console.log(row('åpen', apen));
  console.log(row('igjen', igjen));

  // THE SAME JOURNEY ON THE OTHER TWO SCREENS. That is the whole question:
  // a bus was dotted here and solid there, and a change was a word here and an
  // unlabelled circle there.
  const strokesOf = (sel) => page.evaluate((s) => {
    const m = document.querySelector(s);
    if (!m) return { streker: ['(ingen kart)'], ord: [] };
    const streker = Array.from(m.querySelectorAll('path'))
      .map(p => (p.getAttribute('stroke-dasharray') || 'heltrukket')
        + '@' + (p.getAttribute('stroke-width') || '?'))
      // The casing under every coloured line is drawn by drawRoute and is the
      // same on all three; counting it would drown the difference.
      .filter(x => !/heltrukket@(5|7|9)$/.test(x));
    const ord = Array.from(m.querySelectorAll('.leaflet-marker-icon'))
      .map(e => e.textContent.trim()).filter(t => /^(på|bytt|av)$/i.test(t));
    return { streker: [...new Set(streker)], ord };
  }, sel);

  // force: something in the page intercepts the hit test on this fixture (the
  // alerts banner the inherited mock serves sits over the list). The row's own
  // handler is what this probe needs, not the hit test.
  await page.click('#dep-list .dep-row', { force: true });
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1600);
  const sel = await strokesOf('#sel-map');
  console.log('   detalj  :', sel.streker.join('  |  '), sel.ord.length ? ' ord: ' + sel.ord.join(' → ') : '');
  await shoot('#sel-map', 'detalj');

  const reis = await page.$('#s-ctas .cta-row .cta-btn:nth-child(2)');
  if (reis && await reis.isVisible().catch(() => false) && !(await reis.evaluate(b => b.disabled))) {
    await reis.click({ force: true });
    await page.waitForTimeout(2200);
    const tr = await strokesOf('#t-map');
    console.log('   underveis:', tr.streker.join('  |  '), tr.ord.length ? ' ord: ' + tr.ord.join(' → ') : ' (ingen ord)');
    await shoot('#t-map', 'underveis');
  } else {
    console.log('   underveis: kunne ikke starte reisen fra denne fiksturen');
  }
  await ctx.close();
}

await run('dark', true);
await run('light', true);
await browser.close();
server.close();
console.log('');
