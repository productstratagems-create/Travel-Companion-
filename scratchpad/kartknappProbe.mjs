/**
 * Samme øyeblikk, lest på fire steder.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: om de fire tallene på skjermen sier det
 * samme. Hver for seg var de alle riktige — det var PARET som var feil, og
 * paret finnes ikke i noen enhetstest. Det rapporterte skjermbildet viste
 * «0 MIN TIL ANKOMST» øverst og «om 1 min» nederst om samme ankomst, og
 * «GÅ AV NÅ» rett over «1 stopp igjen».
 *
 * Så proben stiller klokka 50 sekunder før ankomst — gulvet sier 0, runden
 * sier 1, altså nøyaktig det vinduet feilen bodde i — og skriver alle fire
 * på én linje. Tre tidspunkt til for å se at den ikke har flyttet terskelen.
 *
 * Fiksturen seeds via localStorage slik en reload gjenoppretter den.
 * Ingenting her når api.entur.io; sporingsspørringen svares lokalt.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4581;
/* KLOKKA ER FORANKRET VED MODULLASTING, OG DET HAR EN PRIS.
 *
 * Fiksturen regner ankomsten som NOW + sek, mens nettleseren bruker den
 * EKTE klokka. Det mørke kjøret er først; det lyse skjer åtte sideinnlastinger
 * senere, altså et halvt minutt ut i framtiden. Så «50 sekunder før ankomst»
 * er ~25 sekunder når det lyse kjøret går, og helten sier 0 der den sa 1.
 *
 * Det er ikke en regresjon — hvert kjør er internt konsistent, og det er
 * konsistensen v1.164.0 handler om. Men det betyr at to kjør ikke kan
 * sammenlignes direkte, og den påstanden ble faktisk gjort i v1.164.0 sin
 * utgivelsestekst («lys og mørk sier det samme»). Konklusjonen holdt;
 * instrumentet var svakere enn beskrivelsen.
 *
 * Skal to kjør sammenlignes, må klokka fryses per kontekst — ikke per modul. */
const NOW = Date.now();
const iso = ms => new Date(ms).toISOString();
const klokke = ms => new Date(ms).toLocaleTimeString('nb-NO',
  { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });

const NAMES = ['Mortensrud', 'Skullerud', 'Ryen', 'Brattlikollen', 'Lambertseter',
  'Manglerud', 'Helsfyr', 'Tøyen', 'Grønland', 'Jernbanetorget'];
const LAT = 59.888, LON0 = 10.845, DLON = -0.008;
const STEP = 120_000;

/** `sek` er sekunder igjen til ankomst Jernbanetorget. Alt annet avledes. */
const boardedFor = sek => 9 - sek / (STEP / 1000);

const calls = sek => NAMES.map((name, i) => {
  const t = NOW + (i - boardedFor(sek)) * STEP;
  return {
    quay: { latitude: LAT + i * 0.002, longitude: LON0 + i * DLON,
      stopPlace: { id: 'NSR:StopPlace:' + i, name, latitude: LAT + i * 0.002, longitude: LON0 + i * DLON } },
    aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
    aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
    realtime: true,
  };
});

const jny = sek => {
  const b = boardedFor(sek);
  const arr = NOW + sek * 1000;
  return {
    dest: 'Jernbanetorget', from: 'Mortensrud', boardedAt: NOW - b * STEP,
    lineCode: '3', lineBg: '#e60000', frontText: 'Jernbanetorget',
    arrival: { time: iso(arr), clk: klokke(arr) },
    _toLat: LAT + 9 * 0.002, _toLon: LON0 + 9 * DLON,
    legs: [{
      lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#e60000', mode: 'metro',
      frontText: 'Jernbanetorget', journeyId: 'RUT:ServiceJourney:3-0810',
      fromStation: 'Mortensrud', toStation: 'Jernbanetorget',
      depTime: { time: iso(NOW - b * STEP), clk: klokke(NOW - b * STEP) },
      arrTime: { time: iso(arr), clk: klokke(arr) },
      quay: '1', stops: calls(sek),
    }],
  };
};

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

async function open(dark, sek) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 896 }, deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light', hasTouch: true, isMobile: true,
    timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ scheme, j }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(j));
  }, { scheme: dark ? 'dark' : 'light', j: jny(sek) });
  await page.route(/journey-planner/, r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { serviceJourney: { estimatedCalls: calls(sek) } } }),
  }));
  await page.route(/geocoder|tiles|realtime|open-meteo|overpass|valhalla|geoapify|mobility|basemaps/,
    r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  return { ctx, page };
}

/** De fire tallene om samme ankomst, lest sammen. Hver for seg løy ingen. */
const read = page => page.evaluate(() => {
  const txt = s => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; };
  const rader = [...document.querySelectorAll('.stop-rel')].map(e => e.textContent.trim());
  return {
    helt: txt('#t-num'), heltLbl: txt('#t-lbl'),
    // FEMTE LESER, UTELATT I FØRSTE KUTT. Proben rapporterte grønt på fire
    // tall mens stripen øverst sa «1 STOPP IGJEN» rett over «GÅ AV NÅ» —
    // funnet i skjermbildet, ikke i tallene. Måleinstrumentet igjen.
    stripe: txt('.js-cap'),
    /* #410: PILLEN I KANTEN AV HELE STRIPEN, IKKE I CAPTION-RADEN.
     *
     * Den rapporterte feilen var at bygget var riktig og skjermen feil:
     * `el.style.display = 'block'` slo stilarket, så pillen la seg UNDER
     * innholdet i stedet for ved siden av. Derfor måles geometrien, ikke
     * bare at elementene finnes. */
    geo: (() => {
      const q = s => document.querySelector(s);
      const strip = q('#j-strip'), body = q('.js-body'),
            pill = q('.js-map-hint'), rail = q('.js-rail');
      const r = e => e ? e.getBoundingClientRect() : null;
      const S = r(strip), B = r(body), P = r(pill), R = r(rail);
      if (!S || !P) return null;
      return {
        stripeH: Math.round(S.height),
        stripeW: Math.round(S.width),
        railW: R ? Math.round(R.width) : null,
        railPct: R ? Math.round(100 * R.width / S.width) : null,
        // Ved siden av, ikke under: pillen skal starte til HØYRE for kroppen.
        vedSiden: !!(B && P.left >= B.right - 2),
        // Loddrett midtstilt mot stripen, innenfor to piksler.
        midtstilt: Math.abs((P.top + P.bottom) / 2 - (S.top + S.bottom) / 2) <= 2,
        iKanten: Math.abs(S.right - P.right) <= 14,
        ord: (pill && pill.textContent.trim()) || null,
      };
    })(),
    kort: txt('.alight-card-eyebrow'),
    tagg: txt('.ct-stops'),
    // Raden for selve avstigningsstoppet er den siste som står igjen.
    rad: rader.length ? rader[rader.length - 1] : null,
  };
});

const STEG = [
  { sek: 50, navn: '50 s (det rapporterte vinduet)' },
  { sek: 110, navn: '1 min 50 s' },
  { sek: 170, navn: '2 min 50 s' },
  { sek: 320, navn: '5 min 20 s' },
];

for (const dark of [true, false]) {
  const theme = dark ? 'mørk' : 'lys';
  console.log(`\n══ ${theme} modus, 414 px ══`);
  for (const st of STEG) {
    const { ctx, page } = await open(dark, st.sek);
    const r = await read(page);
    console.log(`   ${st.navn.padEnd(30)} helt: ${String(r.helt ?? '—').padEnd(9)}`
      + `${String(r.heltLbl ?? '—').padEnd(14)} kort: ${String(r.kort ?? '(ikke vist)').padEnd(22)}`
      + ` rad: ${String(r.rad ?? '—').padEnd(10)} tagg: ${String(r.tagg ?? '(tier)').padEnd(15)}`
      + ` stripe: ${r.stripe ?? '—'}`);
    const g = r.geo;
    console.log(g
      ? `       \u2514 pille: «${g.ord}» ved siden: ${g.vedSiden ? 'ja ' : 'NEI'}`
        + ` midtstilt: ${g.midtstilt ? 'ja ' : 'nei'} i kanten: ${g.iKanten ? 'ja ' : 'nei'}`
        + ` | stripe ${g.stripeH}px  skinne ${g.railW}/${g.stripeW}px (${g.railPct}%)`
      : '       \u2514 (ingen stripe/pille på skjermen)');
    await page.screenshot({ path: `scratchpad/kartknapp-${theme}-${st.sek}s.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
server.close();
