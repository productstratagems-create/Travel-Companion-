/**
 * Ankomstskjermen, fire minutter før du er framme.
 *
 * Reported with a screenshot: «Hvordan kan vi rydde og forenkle det som kommer
 * under «Utforsk Jernbanetorget» og helt ned til bunnen av viewet. Til dels
 * uklar hensikt og flyt.»
 *
 * The journey is Oppsal → Jernbanetorget, four minutes out — so the arrival
 * panel is open and the destination IS the arrival stop. That combination is
 * the whole report: the map frames where you came from, the destination field
 * is prefilled with the place you are standing (giving «Gå · 13 m»), and four
 * doors offer two intents.
 *
 * WHAT ONLY A BROWSER CAN SETTLE: how many kilometres the map spans, and how
 * many pixels the panel is. Both are claims about the screen.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4537;
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();

/* The reported line: metro 3 inbound. You are near Skøyenåsen; the journey
   ends at Jernbanetorget, eight kilometres west. */
const CHAIN = [
  ['Oppsal', 59.8900, 10.8350], ['Skøyenåsen', 59.9010, 10.8230],
  ['Hellerud', 59.9080, 10.8180], ['Helsfyr', 59.9160, 10.7950],
  ['Tøyen', 59.9160, 10.7700], ['Grønland', 59.9130, 10.7620],
  ['Jernbanetorget', 59.9115, 10.7500],
];
const YOU = { lat: 59.9010, lon: 10.8230 };        // Skøyenåsen, still riding
const ARR = { lat: 59.9115, lon: 10.7500 };        // Jernbanetorget

const ARR_IN = 4 * 60_000;
const JNY = {
  dest: 'Jernbanetorget', from: 'Oppsal', boardedAt: NOW - 600_000,
  lineCode: '3', lineBg: '#e60000', frontText: 'Jernbanetorget',
  arrival: { time: iso(NOW + ARR_IN), clk: '08:58' },
  // The destination IS the arrival stop — the reported case, and what makes
  // the prefill point at the place you are standing.
  _toLat: ARR.lat, _toLon: ARR.lon,
  legs: [{
    lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#e60000', mode: 'metro',
    frontText: 'Jernbanetorget', journeyId: 'RUT:ServiceJourney:3-0842',
    fromStation: 'Oppsal', toStation: 'Jernbanetorget',
    depTime: { time: iso(NOW - 600_000), clk: '08:42' },
    arrTime: { time: iso(NOW + ARR_IN), clk: '08:58' },
    quay: '1',
  }],
};

const calls = () => CHAIN.map(([name, lat, lon], i) => {
  const t = NOW - 600_000 + i * 160_000;
  return {
    quay: { latitude: lat, longitude: lon,
      stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, latitude: lat, longitude: lon } },
    aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
    aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
    realtime: true,
  };
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

async function run(scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
    permissions: ['geolocation'], geolocation: { latitude: YOU.lat, longitude: YOU.lon, accuracy: 12 },
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, jny, you }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(jny));
    localStorage.setItem('default::t.homeLL', JSON.stringify(you));
  }, { scheme, jny: JNY, you: YOU });

  await page.route(/journey-planner/, r => {
    const body = r.request().postData() || '';
    if (body.includes('serviceJourney(')) return r.fulfill({ status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { serviceJourney: { estimatedCalls: calls() } } }) });
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { stopPlace: { id: 'NSR:StopPlace:Jernbanetorget',
        name: 'Jernbanetorget', estimatedCalls: [], situations: [] } } }) });
  });
  await page.route(/geocoder/, r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ features: [] }) }));
  await page.route(/bysykkel|gbfs|scooter|entur\.io\/mobility|open-meteo|overpass|valhalla|geoapify/,
    r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await page.route(/tiles\.stadiamaps/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const m = await page.evaluate(() => {
    const panel = document.querySelector('.hn-panel');
    const map = document.getElementById('hn-map');
    const head = document.querySelector('.hn-head');
    const R = 6371, r = Math.PI / 180;
    let spenn = null;
    if (map && window.__arrBounds) spenn = window.__arrBounds;
    // The map's span in kilometres, read off the scale the reader sees: the
    // distance between the two corners of the container.
    const kmAcross = (() => {
      if (!map) return null;
      const el = map.querySelector('.leaflet-container') || map;
      const w = el.getBoundingClientRect().width;
      const sc = document.querySelector('#hn-map .leaflet-control-scale-line');
      if (!sc) return null;
      const txt = sc.textContent.trim();
      const px = parseFloat(getComputedStyle(sc).width);
      const val = parseFloat(txt);
      const km = /km/.test(txt) ? val : val / 1000;
      return px > 0 ? Math.round((km * w / px) * 10) / 10 : null;
    })();
    // Every door the reader is offered, in the order they meet them.
    const doors = [];
    const push = (sel, label) => {
      const e = document.querySelector(sel);
      if (e && e.offsetParent !== null) doors.push(label + ': ' + e.textContent.replace(/\s+/g, ' ').trim().slice(0, 34));
    };
    push('#t-explore-btn', 'utforsk');
    push('.hn-section-label', 'seksjon');
    push('#hn-places-details summary', 'foldet');
    push('#t-new-btn', 'knapp');
    const felt = document.getElementById('t-walk-dest');
    const res = document.getElementById('t-walk-result');
    const mob = document.getElementById('hn-mobility-content');
    return {
      panelH: panel ? Math.round(panel.getBoundingClientRect().height) : null,
      fraHode: (panel && head)
        ? Math.round(panel.getBoundingClientRect().bottom - head.getBoundingClientRect().top) : null,
      kmAcross,
      felt: felt ? (felt.value || '(tomt)') : '(fins ikke)',
      gang: res ? res.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '',
      mobil: mob ? mob.textContent.replace(/\s+/g, ' ').trim().slice(0, 50) : '',
      doors,
    };
  });

  console.log(`\n══ ${scheme} ══`);
  console.log('   dører      :', m.doors.length);
  m.doors.forEach(d => console.log('                ', d));
  console.log('   feltet     :', m.felt);
  console.log('   gangsvar   :', m.gang || '(ingen)');
  console.log('   mobilitet  :', m.mobil || '(ingen)');
  console.log('   kart spenn :', m.kmAcross != null ? m.kmAcross + ' km bredt' : '(ingen skala)');
  console.log('   panelhøyde :', m.fraHode, 'px fra «fremme ved» til bunnen');

  fs.mkdirSync('scratchpad/shots', { recursive: true });
  const panel = await page.$('.hn-panel');
  if (panel) await panel.screenshot({ path: `scratchpad/shots/framme-${scheme}.png`,
    animations: 'disabled', timeout: 5000 }).catch(() => {});
  await ctx.close();
}

await run('dark');
await run('light');
await browser.close();
server.close();
console.log('');
