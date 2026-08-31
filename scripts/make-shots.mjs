#!/usr/bin/env node
/**
 * Take the screenshots that a link preview, an install dialog and the
 * install guide all need.
 *
 *   npm run build && node scripts/make-shots.mjs
 *
 * A script rather than photographs from a phone, for three reasons.
 *
 * The pictures have to be REPRODUCIBLE. `manifest.webmanifest` declares each
 * one's exact `sizes`, and a browser that finds a different size silently
 * falls back to the narrow "add to home screen" bar instead of the rich
 * install dialog — so the dimensions cannot drift, and neither can the
 * contents, or every run is a diff of noise.
 *
 * They have to be TRUE. Everything below is the real app: the real bundle
 * from `dist/`, the real render path. Only the network is stood in for, and
 * only because departures move. The clock is pinned so "om 3 min" is always
 * three minutes.
 *
 * And they have to be CHECKED IN, because GitHub Pages builds with
 * `npm run build` and must not have to start a browser.
 *
 * The mocking is the same shape the end-to-end probes use — one route
 * handler per upstream, fulfilling from fixtures rather than reaching out.
 * Nothing here can touch the network; the sandbox this runs in cannot reach
 * api.entur.io at all, which is precisely why the fixtures are explicit.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'public', 'shots');
const PORT = 4489;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('bygg først: npm run build');
  process.exit(1);
}

/* A fixed Tuesday afternoon. Every departure below is expressed as an offset
   from this, and the page's own clock is pinned to it, so the countdowns are
   the same in every run. */
const NOW = Date.parse('2026-05-26T15:41:00+02:00');

// ── the world the app sees ────────────────────────────────────────────────
const STOPS = {
  'Mortensrud':      { id: 'NSR:StopPlace:6013', lat: 59.8617, lon: 10.8285 },
  'Ryen':            { id: 'NSR:StopPlace:6024', lat: 59.8890, lon: 10.8110 },
  'Helsfyr':         { id: 'NSR:StopPlace:6041', lat: 59.9128, lon: 10.7955 },
  'Jernbanetorget':  { id: 'NSR:StopPlace:6098', lat: 59.9114, lon: 10.7500 },
  'Nationaltheatret':{ id: 'NSR:StopPlace:6106', lat: 59.9146, lon: 10.7331 },
};
const ORDER = Object.keys(STOPS);
const LINE = {
  id: 'RUT:Line:3', publicCode: '3', name: 'Mortensrud – Kolsås',
  transportMode: 'metro', presentation: { colour: 'f5a000', textColour: 'ffffff' },
};

const iso = ms => new Date(ms).toISOString();

/** Every call along the line, so the strip and the map have a whole route. */
function callsFor(departMs) {
  return ORDER.map((name, i) => {
    const t = iso(departMs + i * 5 * 60_000);
    const s = STOPS[name];
    return {
      quay: {
        id: s.id + ':1', publicCode: '2',
        latitude: s.lat, longitude: s.lon,
        stopPlace: { id: s.id, name, latitude: s.lat, longitude: s.lon },
      },
      aimedArrivalTime: t, expectedArrivalTime: t,
      aimedDepartureTime: t, expectedDepartureTime: t,
      destinationDisplay: { frontText: 'Nationaltheatret' },
      realtime: true,
    };
  });
}

function patternFor(departMs, n) {
  const calls = callsFor(departMs);
  const from = calls[0], to = calls[calls.length - 1];
  return {
    duration: (ORDER.length - 1) * 300,
    legs: [{
      mode: 'metro', distance: 11200,
      aimedStartTime: from.aimedDepartureTime, expectedStartTime: from.expectedDepartureTime,
      aimedEndTime: to.aimedArrivalTime, expectedEndTime: to.expectedArrivalTime,
      fromPlace: { name: 'Mortensrud', latitude: STOPS.Mortensrud.lat, longitude: STOPS.Mortensrud.lon },
      toPlace: { name: 'Nationaltheatret', latitude: STOPS.Nationaltheatret.lat, longitude: STOPS.Nationaltheatret.lon },
      line: LINE,
      serviceJourney: { id: 'RUT:ServiceJourney:' + n, line: LINE, estimatedCalls: calls },
      fromEstimatedCall: {
        expectedDepartureTime: from.expectedDepartureTime,
        aimedDepartureTime: from.aimedDepartureTime,
        realtime: true, quay: { publicCode: '2' },
        destinationDisplay: { frontText: 'Nationaltheatret' },
      },
      toEstimatedCall: {
        expectedArrivalTime: to.expectedArrivalTime,
        aimedArrivalTime: to.aimedArrivalTime, quay: { publicCode: '1' },
      },
    }],
  };
}

/* Four departures, a quarter of an hour apart, the first three minutes out —
   an ordinary board, not a staged best case. */
const PATTERNS = [3, 18, 33, 48, 63, 78].map((m, i) => patternFor(NOW + m * 60_000, i));

/* A plain May afternoon in Oslo: eleven degrees, dry, light wind. Boring on
   purpose — the screenshot is about the departures, not the weather. */
const WEATHER = (() => {
  const hourly = { time: [], temperature_2m: [], apparent_temperature: [],
    precipitation: [], precipitation_probability: [], weather_code: [], wind_speed_10m: [] };
  const top = new Date(NOW); top.setMinutes(0, 0, 0);
  for (let i = 0; i < 12; i++) {
    hourly.time.push(new Date(top.getTime() + i * 3600_000).toISOString().slice(0, 16));
    hourly.temperature_2m.push(11 - Math.floor(i / 4));
    hourly.apparent_temperature.push(10 - Math.floor(i / 4));
    hourly.precipitation.push(0);
    hourly.precipitation_probability.push(5);
    hourly.weather_code.push(2);
    hourly.wind_speed_10m.push(3);
  }
  return {
    current: { temperature_2m: 11, apparent_temperature: 10, precipitation: 0,
      wind_speed_10m: 3, weather_code: 2, is_day: 1 },
    hourly,
    daily: { sunrise: ['2026-05-26T04:22'], sunset: ['2026-05-26T22:14'] },
  };
})();

// ── a flat base map ───────────────────────────────────────────────────────
/* The tile server cannot be reached from here, and a screenshot of grey
   "tile failed" squares would be worse than no screenshot. These are flat
   tiles in the app's own map colour: the route, the stops and the vehicle
   are drawn by the app on top, which is the part of the map worth showing.
   Written by hand because a PNG encoder is thirty lines and a dependency is
   forever. */
function flatTile(r, g, b) {
  const W = 256;
  const raw = Buffer.alloc(W * (W * 3 + 1));
  for (let y = 0; y < W; y++) {
    const row = y * (W * 3 + 1);
    raw[row] = 0;                                  // filter: none
    for (let x = 0; x < W; x++) {
      const o = row + 1 + x * 3;
      // A barely-there grid, so the map reads as a map and not as a fill.
      const grid = (x % 64 === 0 || y % 64 === 0) ? 6 : 0;
      raw[o] = r + grid; raw[o + 1] = g + grid; raw[o + 2] = b + grid;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4);
  ihdr[8] = 8; ihdr[9] = 2;   // 8-bit, truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
const TILE_DARK = flatTile(0x1a, 0x18, 0x16);
const TILE_LIGHT = flatTile(0xe8, 0xe4, 0xdd);

// ── serve the real bundle ─────────────────────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const file = path.join(DIST, rel);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end('nope');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(r => server.listen(PORT, r));
const BASE = `http://localhost:${PORT}/`;

/* The share card. Deliberately self-contained and system-font: this page is
   never served, it exists for one screenshot, and a webfont that fails to
   load would silently change the picture. */
const CARD_HTML = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:1200px;height:630px;display:flex;align-items:center;gap:72px;
    padding:0 80px;background:#0a0806;color:#f7f2e8;overflow:hidden;
    font-family:"Helvetica Neue",Arial,sans-serif;
    background-image:radial-gradient(90% 70% at 18% 40%,rgba(245,160,0,.13),transparent 70%)}
  .copy{flex:1;min-width:0}
  .eyebrow{font-size:22px;letter-spacing:.32em;text-transform:uppercase;
    color:#f5a000;margin-bottom:26px}
  h1{font-size:82px;line-height:.98;letter-spacing:-.02em;font-weight:800}
  h1 em{font-style:normal;color:#f5a000}
  p{font-size:29px;line-height:1.4;color:#c9bfae;margin-top:26px;max-width:19em}
  .url{font-family:ui-monospace,"SFMono-Regular",Menlo,monospace;font-size:20px;
    color:#8b8073;margin-top:38px;letter-spacing:.02em}
  .phone{flex:0 0 300px;height:551px;border-radius:34px;overflow:hidden;
    border:2px solid rgba(247,242,232,.16);box-shadow:0 30px 70px rgba(0,0,0,.6)}
  .phone img{width:100%;display:block}
</style>
<div class="copy">
  <div class="eyebrow">reisefølge for oslo</div>
  <h1>Ikke bare når banen&nbsp;går —<br><em>når du må gå.</em></h1>
  <p>Sanntids avganger, hele traseen på kartet, og hva som venter deg framme.</p>
  <div class="url">productstratagems-create.github.io/Travel-Companion-</div>
</div>
<div class="phone"><img src="__IMG__" alt=""></div>`;

// ── the browser ───────────────────────────────────────────────────────────
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

async function mock(page, dark) {
  await page.route('**/journey-planner/**', route => {
    const body = route.request().postData() || '';
    let data;
    if (body.includes('serviceJourney(')) {
      data = { serviceJourney: { estimatedCalls: callsFor(NOW + 3 * 60_000) } };
    } else if (body.includes('startTime:')) {
      data = { stopPlace: { estimatedCalls: [] } };
    } else {
      data = { stopPlace: { situations: [] }, trip: { tripPatterns: PATTERNS } };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.route('**/realtime/**', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify({ data: { vehicles: [] } }) }));
  await page.route('**/geocoder/**', route => {
    const text = new URL(route.request().url()).searchParams.get('text') || 'Mortensrud';
    const name = ORDER.find(k => k.toLowerCase() === text.toLowerCase()) || 'Mortensrud';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      features: [{
        properties: { id: STOPS[name].id, label: name, name, category: ['metroStation'] },
        geometry: { coordinates: [STOPS[name].lon, STOPS[name].lat] },
      }],
    }) });
  });
  await page.route(/tiles\.stadiamaps\.com|tile\.openstreetmap/, r =>
    r.fulfill({ status: 200, contentType: 'image/png', body: dark ? TILE_DARK : TILE_LIGHT }));
  /* Weather, because the departure detail asks for it and a screenshot
     that says "laster vær…" is a picture of a loading state. */
  await page.route(/api\.open-meteo\.com/, r => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(WEATHER) }));
  await page.route(/overpass|valhalla|geoapify|mobility|entur\.io\/(?!.*journey)/, r => r.abort());
}

async function openBoard({ width, height, dark }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
    hasTouch: true, isMobile: width < 700, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  /* Pin the page's clock. Timers keep running — the app needs them to finish
     loading — but every time it READS the clock it gets the same instant, so
     "om 3 min" is three minutes in every run. */
  await page.addInitScript((now) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', 'system');
    /* A remembered position at the departure stop. Without one the app has
       nowhere to ask the weather about, and the departure detail sits on
       "laster vær…" for ever — a loading state is the one thing a screenshot
       must not show. */
    localStorage.setItem('default::t.homeLL', JSON.stringify({ lat: 59.8617, lon: 10.8285 }));
    localStorage.setItem('default::t.route', JSON.stringify({
      key: 'custom-out', from: 'Mortensrud', to: 'Nationaltheatret',
      stopId: 'NSR:StopPlace:6013', toStopId: 'NSR:StopPlace:6106',
      filter: null, geo: null, toGeo: null, line: null,
      _fromLat: 59.8617, _fromLon: 10.8285, _toLat: 59.9146, _toLon: 10.7331,
    }));
  }, NOW);
  await mock(page, dark);
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#dep-list .dep-row', { timeout: 15000 });
  // Let the map settle: tiles are local, so this is layout, not network.
  await page.waitForTimeout(2500);
  return { ctx, page };
}

async function shot(name, opts, prepare) {
  const { ctx, page } = await openBoard(opts);
  if (prepare) await prepare(page);
  const rows = await page.locator('#dep-list .dep-row').count();
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, animations: 'disabled' });
  await ctx.close();
  const { width, height } = pngSize(fs.readFileSync(file));
  console.log(`${name.padEnd(24)} ${width}×${height}  ${rows} rader`);
  return file;
}

/** Read a PNG's real pixel size back out of its header. The manifest has to
 *  declare it exactly, and the device scale factor means it is not the
 *  viewport. Guessing here is how `screenshots` silently stops working. */
function pngSize(buf) {
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

fs.mkdirSync(OUT, { recursive: true });
const PHONE = { width: 414, height: 760, dark: true };
await shot('board-narrow.png', PHONE);
await shot('board-narrow-light.png', { ...PHONE, dark: false });

/* The departure you tapped: the whole line, where the train actually is,
   and when it lands. The second screenshot has to show something the first
   one does not, or it is just another picture of the same list. */
await shot('journey-narrow.png', PHONE, async (page) => {
  await page.locator('#dep-list .dep-row').first().click();
  await page.waitForSelector('#v-selected', { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(2500);
});

/* The share card is COMPOSED, not screenshotted at 1200×630. The app is a
   phone app; a desktop-width capture of it is mostly empty margin, which is
   exactly what a link preview should not be. So: the phone shot, the name
   and the promise, on the app's own background. */
await composeCard('og.png', path.join(OUT, 'board-narrow.png'));

async function composeCard(name, phoneShot) {
  const img = 'data:image/png;base64,' + fs.readFileSync(phoneShot).toString('base64');
  const ctx = await browser.newContext({
    viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.setContent(CARD_HTML.replace('__IMG__', img), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, animations: 'disabled' });
  await ctx.close();
  const { width, height } = pngSize(fs.readFileSync(file));
  console.log(`${name.padEnd(24)} ${width}×${height}  (delekort)`);
}

await browser.close();
server.close();
