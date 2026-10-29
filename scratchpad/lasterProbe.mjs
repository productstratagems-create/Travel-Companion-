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
const DIST = path.join(ROOT, 'dist'); const PORT = 4601;
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
  await page.addInitScript(({ scheme, j, steder }) => {
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme);
    localStorage.setItem('default::t.jny', JSON.stringify(j));
    localStorage.setItem('default::t.recentDests', JSON.stringify(steder));
  }, { scheme: dark ? 'dark' : 'light', j: jny(sek), steder: STEDER });
  await page.route(/journey-planner/, r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { serviceJourney: { estimatedCalls: calls(sek) } } }),
  }));
  /* VÆR OG STEDER SKAL FEILE — det er hele poenget. Resten får være som
   * før, slik rapporten beskrev: 5G på, tavla virket. */
  await page.route(/open-meteo/, r => r.fulfill({ status: 503, body: 'nede' }));
  await page.route(/overpass|geoapify/, r => r.abort());
  await page.route(/geocoder|tiles|realtime|valhalla|mobility|basemaps/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  // «Hva nå?»-folden må åpnes — chipene finnes ikke i DOM mens den er lukket,
  // og en probe som målte den lukkede ville meldt «ingen chips» som et svar.
  await page.evaluate(() => {
    const h = document.querySelector('.hn-head');
    if (h) h.click();
  });
  await page.waitForTimeout(700);
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
    /* TRYKKFLATENE, LEST FRA ::after — IKKE FRA KNAPPENE.
     *
     * Knappens eget rektangel er ~24 px høyt; flaten som faktisk tar trykket
     * er 44 px og vokst utover. Måler proben knappen, melder den grønt på
     * nøyaktig det den finnes for å fange. */
    /* SEKSJONENES TEKST, ikke at koden finnes.
     * Og klassen med, siden hele poenget er at «feilet» ikke skal se ut som
     * «venter». */
    seksjoner: ['hn-weather-content', 'hn-places-content'].map(id => {
      const e = document.getElementById(id);
      const inner = e && e.firstElementChild;
      return { id, tekst: e ? e.textContent.trim() : null,
               klasse: inner ? inner.className : null };
    }),
    chips: (() => {
      const flate = (el) => {
        const r = el.getBoundingClientRect();
        const a = getComputedStyle(el, '::after');
        const h = parseFloat(a.height) || r.height;
        const w = a.width === 'auto' ? r.width : (parseFloat(a.width) || r.width);
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, w, h };
      };
      const overlapper = (a, b) =>
        a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
        a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

      const chips = [...document.querySelectorAll('.hn-recent-chip')];
      if (!chips.length) return null;
      const flater = [];
      chips.forEach(c => {
        const p = c.querySelector('.hn-recent-pick');
        const d = c.querySelector('.hn-recent-del');
        if (p) flater.push({ rolle: 'velg', chip: p.dataset.label, ...flate(p) });
        if (d) flater.push({ rolle: 'slett', chip: d.dataset.label, ...flate(d) });
      });
      const kollisjoner = [];
      for (let i = 0; i < flater.length; i++)
        for (let j = i + 1; j < flater.length; j++)
          if (overlapper(flater[i], flater[j]))
            kollisjoner.push(flater[i].rolle + '/' + flater[i].chip.slice(0, 10)
              + ' \u2715 ' + flater[j].rolle + '/' + flater[j].chip.slice(0, 10));
      const h = chips[0].getBoundingClientRect().height;
      const rad = chips[0].parentElement.getBoundingClientRect();
      // Hvor mange linjer raden brekker til, målt på ulike topp-posisjoner.
      const linjer = new Set(chips.map(c => Math.round(c.getBoundingClientRect().top))).size;
      return {
        antall: chips.length,
        pilleH: Math.round(h),
        blokkH: Math.round(rad.height),
        linjer,
        radW: Math.round(rad.width),
        bredder: chips.map(c => Math.round(c.getBoundingClientRect().width)),
        minFlate: Math.round(Math.min(...flater.map(f => Math.min(f.w, f.h)))),
        kollisjoner,
      };
    })(),
    kort: txt('.alight-card-eyebrow'),
    tagg: txt('.ct-stops'),
    // Raden for selve avstigningsstoppet er den siste som står igjen.
    rad: rader.length ? rader[rader.length - 1] : null,
  };
});

/* FEM STEDER, OG LENGDENE ER VALGT MED VILJE.
 * «Oslo» er kort nok til at `min-width` er det eneste som holder de to
 * trykkflatene fra hverandre; den lange skal bli avkortet. */
const STEDER = [
  { label: 'Oslo', lat: 59.911, lon: 10.75 },
  { label: 'Stortinget, Oslo', lat: 59.913, lon: 10.74 },
  { label: 'Lutvann leir, Oslo', lat: 59.93, lon: 10.86 },
  { label: 'Akershus festning, Oslo', lat: 59.907, lon: 10.736 },
  { label: 'Nationaltheatret stasjon, Oslo sentrum', lat: 59.914, lon: 10.733 },
];

const STEG = [
  { sek: 50, navn: '50 s (det rapporterte vinduet)' },
  { sek: 110, navn: '1 min 50 s' },
  { sek: 170, navn: '2 min 50 s' },
  { sek: 320, navn: '5 min 20 s' },
];

/** Samlet for dommen til slutt. */
const funn = [];

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
    r.seksjoner.forEach(x => console.log(
      `       \u2514 ${x.id.padEnd(20)} \u00ab${x.tekst ?? '\u2014'}\u00bb  klasse: ${x.klasse ?? '\u2014'}`));
    funn.push(...r.seksjoner);
    const c = r.chips;
    console.log(c
      ? `       \u2514 chips: ${c.antall}  pille ${c.pilleH}px  blokk ${c.blokkH}px p\u00e5 ${c.linjer} linjer  minste trykkflate ${c.minFlate}px`
        + `  kollisjoner: ${c.kollisjoner.length ? c.kollisjoner.join(' | ') : 'ingen'}`
        + `\n         rad ${c.radW}px \u2014 chips: ${c.bredder.join(', ')}`
      : '       \u2514 (ingen chips i DOM — ble folden åpnet?)');
    /* SKJERMBILDET MÅ INNEHOLDE MOTIVET.
     *
     * Første kutt tok bare utsnittet, og panelet ligger under folden — så
     * bildet viste en skjerm uten en eneste chip på. Det så ut som et svar. */
    const omr = await page.$('.hn-recent-chips');
    if (omr) {
      await omr.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: `scratchpad/laster-${theme}-${st.sek}s.png`, fullPage: false });
    await ctx.close();
  }
}

await browser.close();
server.close();

/* EN PRØVE SOM BARE RAPPORTERER, LAR DEG LESE FEIL SVAR SOM ET SVAR.
 *
 * Mutasjonsprøven krympet --chip-h til 30 og utskriften sa pent «minste
 * trykkflate 30px, kollisjoner: ingen» — helt riktig, og helt ubrukelig hvis
 * ingen leser tallet. Så den feller dommen selv. */
/* DOMMEN. En probe som bare rapporterer, lar deg lese feil svar som et svar.
 * Her er feilen én bestemt ting: at seksjonen fortsatt sier «laster» eller
 * «henter» når tjenesten har svart med en feil. */
const STO_FAST = funn.filter(f => f.tekst && /laster|henter/i.test(f.tekst));
const TOMME = funn.filter(f => !f.tekst);
if (STO_FAST.length || TOMME.length) {
  console.error('\nFEIL: ' + STO_FAST.length + ' seksjon(er) sier fortsatt \u00abhenter\u00bb'
    + ' etter at tjenesten har feilet, og ' + TOMME.length + ' er tomme.');
  process.exit(1);
}
console.log('\nAlle seksjoner sier hva som skjedde.');
