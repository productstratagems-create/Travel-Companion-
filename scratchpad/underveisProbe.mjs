/**
 * Underveis: hvem svarte på «hvor er jeg nå»?
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at raden posisjonen peker på faktisk er
 * den som merkes «neste» på skjermen, at setningen om hvem som svarte står
 * der, og at avstanden vises framfor bare å bli regnet ut.
 *
 * Fiksturen er laget så KLOKKA OG POSISJONEN ER UENIGE. Ruteplanen mener du
 * så vidt har forlatt Mortensrud; GPS-en sier du er ved Ryen, to stopp
 * lenger fram. Uten uenighet måler prøven ingenting.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4597;
const NOW = Date.parse('2026-09-24T08:00:00+02:00');
const iso = (ms) => new Date(ms).toISOString();

/* Fire stopp nordover. Du sitter på og skal av på Manglerud. */
const STOPP = [
  ['NSR:StopPlace:Mo', 'Mortensrud', 59.8400, 10.8200, 0],
  ['NSR:StopPlace:Sk', 'Skullerud', 59.8500, 10.8200, 3],
  ['NSR:StopPlace:Ry', 'Ryen', 59.8600, 10.8200, 6],
  ['NSR:StopPlace:Ma', 'Manglerud', 59.8700, 10.8200, 9],
];
const call = ([id, name, lat, lon, m]) => ({
  quay: { latitude: lat, longitude: lon,
    stopPlace: { id, name, latitude: lat, longitude: lon } },
  aimedArrivalTime: iso(NOW + m * 60000), expectedArrivalTime: iso(NOW + m * 60000),
  aimedDepartureTime: iso(NOW + m * 60000), expectedDepartureTime: iso(NOW + m * 60000),
});

const TYPES = { '.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json' };
const server = http.createServer((req,res)=>{
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/,'')||'index.html';
  const f = path.join(DIST, rel);
  if(!f.startsWith(DIST)||!fs.existsSync(f)||fs.statSync(f).isDirectory()) return void res.writeHead(404).end('x');
  res.writeHead(200,{'content-type':TYPES[path.extname(f)]||'application/octet-stream'});
  res.end(fs.readFileSync(f));
});
await new Promise(r=>server.listen(PORT,r));
const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

/**
 * @param {'ved ryen'|'avslatt'|'gammel'} kind hva posisjonen er verdt
 */
async function run(kind, scheme) {
  const ctx = await browser.newContext({ viewport:{width:414,height:896}, deviceScaleFactor:2 });
  const page = await ctx.newPage();

  await page.addInitScript(({ now, scheme, kind, stopp }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a){ super(...(a.length?a:[now])); }
      static now(){ return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile','default');
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    // REISELOGGEN krever et ja. Uten samtykke skal ingenting lagres — og det
    // er også en påstand prøven måler, ved å kjøre ett tilfelle uten.
    localStorage.setItem('default::t.memoryConsent', kind === 'uten samtykke' ? '0' : '1');
    // EN LAGRET REISE, slik saveJny nå skriver den: stoppene i callPlace sin
    // form, ikke rå estimatedCalls. Sammen med `uten nett` under er dette
    // hele påstanden i lag 3 — og den eneste av mutantene ingen enhetstest
    // kunne drepe, fordi collectLegStopRows ikke er eksportert.
    const lagretStopp = kind === 'lagret' ? stopp.map(([id, name, lat, lon, m]) => ({
      id, name, lat, lon,
      arr: new Date(now + m * 60000).toISOString(),
      dep: new Date(now + m * 60000).toISOString(),
    })) : undefined;
    localStorage.setItem('default::t.jny', JSON.stringify({
      dest: 'Manglerud', from: 'Mortensrud', boardedAt: now - 60000,
      lineCode: '3', lineBg: '#f5a000', frontText: 'Manglerud',
      arrival: { time: new Date(now + 9*60000).toISOString(), clk: '08:09' },
      _toLat: 59.8700, _toLon: 10.8200,
      legs: [{ lineCode: '3', lineRef: 'RUT:Line:3', lineBg: '#f5a000',
        mode: 'metro', frontText: 'Manglerud', journeyId: 'RUT:ServiceJourney:1',
        fromStation: 'Mortensrud', toStation: 'Manglerud',
        depTime: { time: new Date(now).toISOString(), clk: '08:00' },
        arrTime: { time: new Date(now + 9*60000).toISOString(), clk: '08:09' },
        quay: { publicCode: '1' }, stops: lagretStopp }],
    }));
    // Posisjonen: ved Ryen, to stopp foran det klokka tror.
    //
    // `at` MÅ være med. Uten tidsstempel er alderen ukjent, og da skal
    // posisjonen IKKE vinne over ruteplanen — det er hele rettelsen i
    // v1.154.0. «uten alder» under er nettopp det tilfellet.
    if (kind === 'ved ryen' || kind === 'lagret') {
      localStorage.setItem('default::t.homeLL',
        JSON.stringify({ lat: 59.8600, lon: 10.8200, at: now - 5000 }));
    } else if (kind === 'uten alder') {
      localStorage.setItem('default::t.homeLL',
        JSON.stringify({ lat: 59.8600, lon: 10.8200 }));
    }
    window.__stopp = stopp;
    window.__kind = kind;
  }, { now: NOW, scheme, kind, stopp: STOPP });

  // Sporingsspørringen svares lokalt — sandkassen når ikke api.entur.io.
  await page.route('**/journey-planner/**', (route) => {
    // UTEN NETT for den lagrede reisa: det er tunnelen, og hele poenget.
    if (kind === 'lagret') return void route.abort();
    route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { serviceJourney: { id: 'RUT:ServiceJourney:1',
        estimatedCalls: STOPP.map(call) } } }) });
  });
  await page.route('**/geocoder/**', r => r.fulfill({ status:200,
    contentType:'application/json', body: JSON.stringify({ features: [] }) }));

  await page.goto('http://localhost:'+PORT+'/', { waitUntil:'networkidle' });
  await page.waitForTimeout(600);

  // Posisjonens kvalitet settes i state, ikke i lagringen.
  await page.evaluate((kind) => {
    const s = window.__state || null;
    void s;
    // Sporet: tre fikser som nærmer seg Ryen sørfra.
    window.__seed = kind;
  }, kind);

  // Til underveis.
  await page.evaluate(() => {
    if (window.jnyGoTracking) window.jnyGoTracking();
  });
  await page.waitForTimeout(1500);

  // SJEKK FØR DU MÅLER.
  const synlig = await page.evaluate(() => {
    const e = document.getElementById('v-track');
    return !!e && e.style.display !== 'none' && e.offsetHeight > 0;
  });
  console.log('\n══ ' + kind + ' · ' + scheme + ' ══');
  console.log('  på underveis: ' + synlig);
  if (!synlig) { await ctx.close(); return; }

  const diag = await page.evaluate(() => ({
    lagret: localStorage.getItem('default::t.homeLL'),
    sw: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
    bundle: [...document.querySelectorAll('script[src]')].map(e => e.getAttribute('src')).join(','),
  }));
  console.log('  lagret posisjon: ' + diag.lagret
    + ' · sw styrer siden: ' + diag.sw + ' · ' + diag.bundle);

  const m = await page.evaluate(() => ({
    kilde: (document.querySelector('#v-track .tc-source') || {}).textContent || '(mangler)',
    neste: (document.querySelector('#v-track .stop.next .stop-name') || {}).textContent || '(ingen)',
    avstand: (document.querySelector('#v-track .stop.next .stop-near') || {}).textContent || '(ingen)',
    rader: [...document.querySelectorAll('#v-track .stop .stop-name')].map(e => e.textContent.trim()),
    // STRIPEN, som sier det samme med sine egne ord. Den navngir sensoren som
    // plasserte TOGET; lista navngir den som plasserte DEG. Er de uenige på
    // samme skjerm, er det to påstander som ser like ut — og det var nettopp
    // det skjermbildet viste.
    stripe: (document.querySelector('#v-track .js-cap') || {}).textContent || '(mangler)',
  }));
  console.log('  kilde: ' + m.kilde.trim());
  console.log('  neste: ' + m.neste.trim() + ' · avstand: ' + m.avstand.trim());
  console.log('  rader: ' + JSON.stringify(m.rader));

  /* PLASSEN. Tallene som avgjør om skjermen er til å bruke i bevegelse.
   *
   * `stå av`-raden er den ENE opplysningen underveis-skjermen finnes for, og
   * påstanden som skal prøves er at den ligger under folden i dag. Folden er
   * 896 px minus bunnmenyen, som er position:fixed — den har lurt en tidligere
   * måling i dette repoet, så den trekkes fra her. */
  const plass = await page.evaluate(() => {
    const v = document.getElementById('v-track');
    // `.app-nav`, og ikke en gjetning. Første utgave lette etter
    // «.bottom-bar» som ikke finnes, fant ingenting, og satte folden til hele
    // vindushøyden — som gjorde at «stå av» så ut til å ligge OVER folden.
    const bunn = document.querySelector('.app-nav');
    const fold = window.innerHeight - (bunn ? bunn.getBoundingClientRect().height : 0);
    const synligeKart = [...document.querySelectorAll('#v-track .leaflet-container')]
      .filter(e => e.offsetHeight > 0);
    const topp = v.getBoundingClientRect().top + window.scrollY;
    const rad = [...document.querySelectorAll('#v-track .stop')]
      .find(e => /stå av/i.test(e.textContent));
    return {
      hoyde: Math.round(v.scrollHeight),
      fold: Math.round(fold),
      kart: synligeKart.map(e => Math.round(e.offsetHeight)),
      staaAv: rad ? Math.round(rad.getBoundingClientRect().top + window.scrollY - topp) : null,
      bunnFinnes: !!bunn,
      bunnHoyde: bunn ? Math.round(bunn.getBoundingClientRect().height) : null,
      bunnSkjult: bunn ? getComputedStyle(bunn).display === 'none' : null,
      // MÅLT, IKKE ESTIMERT. Jeg anslo «hva nå?» til 1600–1800 px ut fra
      // CSS-verdier; hele siden er 1469. Anslag av denne typen har tatt feil
      // hver gang i dette repoet.
      blokker: [
        ['reisestripe', '#j-strip'],
        ['nedtelling', '.track-center'],
        ['kortstabel', '#t-cards'],
        ['hva nå?', '#t-next'],
        ['søkefelt videre', '#t-walk-dest'],
      ].map(([navn, sel]) => {
        const e = document.querySelector(sel);
        if (!e || !e.offsetHeight) return navn + ': —';
        const r = e.getBoundingClientRect();
        return navn + ': ' + Math.round(r.top + window.scrollY - topp)
          + ' px (' + Math.round(r.height) + ')';
      }),
    };
  });
  const skjermer = (plass.hoyde / plass.fold).toFixed(1);
  console.log('  PLASS · høyde ' + plass.hoyde + ' px = ' + skjermer + ' skjermfulle'
    + ' · fold ' + plass.fold + ' px'
    + ' (app-nav: ' + (plass.bunnFinnes
        ? (plass.bunnSkjult ? 'skjult på denne skjermen' : plass.bunnHoyde + ' px')
        : 'finnes ikke') + ')');
  console.log('        · kart samtidig: ' + plass.kart.length
    + (plass.kart.length ? ' (' + plass.kart.join(' + ') + ' px = '
        + Math.round(plass.kart.reduce((a, b) => a + b, 0) / plass.hoyde * 100) + ' %)' : ''));
  console.log('        · «stå av» ligger på ' + plass.staaAv + ' px → '
    + (plass.staaAv != null && plass.staaAv < plass.fold ? 'OVER folden ✓' : 'UNDER folden ✗'));
  console.log('        · ' + plass.blokker.join('\n        · '));
  console.log('  stripe: ' + m.stripe.trim());

  /* REISELOGGEN. Turen skal etterlate seg noe et menneske kan lese.
   * Kartknappen trykkes, så `kart`-hendelsen finnes å lese tilbake. */
  const knapp = page.locator('#j-strip-map');
  if (await knapp.count()) { await knapp.click(); await page.waitForTimeout(400); }
  const logg = await page.evaluate(() => {
    const raw = localStorage.getItem('default::t.events');
    return raw ? JSON.parse(raw) : [];
  });
  console.log('  LOGG · ' + logg.length + ' hendelser'
    + (logg.length ? ': ' + logg.map(e => e.kind).join(', ') : ''));
  // ORDENE. Stripen sier «din gps»; loggen må ikke si «posisjon». Nøklene i
  // SRC_LABEL er fasiten, og dette er det eneste stedet det kan måles ende
  // til ende — enhetstesten logger sine egne verdier og beviser ingenting om
  // hva SKJERMEN faktisk skriver.
  const LOVLIGE = ['gps', 'rutetid'];
  const ulovlige = logg.filter(e => e.kind === 'kilde' && !LOVLIGE.includes(e.svarte));
  if (logg.some(e => e.kind === 'kilde')) {
    console.log('       · ord: ' + (ulovlige.length
      ? '✗ ' + ulovlige.map(e => e.svarte).join(', ') + ' — ikke appens egne'
      : '✓ appens egne (' + LOVLIGE.join('/') + ')'));
  }
  logg.forEach(e => {
    const felt = Object.keys(e).filter(k => k !== 'kind' && k !== 'at' && k !== 'pos');
    console.log('       · ' + e.kind + ' — ' + felt.map(f => f + ': ' + e[f]).join(' · '));
  });
  await page.screenshot({ path: 'scratchpad/underveis-' + kind + '-' + scheme + '.png', fullPage: true });
  await ctx.close();
}

// Den lagrede reisa, uten nett i det hele tatt: stopplista skal tegnes av
// det som ligger lagret, og posisjonen skal fortsatt kunne svare.
await run('lagret', 'dark');
await run('lagret', 'light');
await run('ved ryen', 'dark');
await run('ved ryen', 'light');
// En posisjon lagret før v1.154.0: den har ingen alder, og skal derfor tape
// for ruteplanen — og si hvorfor.
await run('uten alder', 'dark');
await run('avslatt', 'dark');
// OG UTEN SAMTYKKE skal loggen være tom. Løftet i privacy.html er at
// ingenting huskes før du sier ja.
await run('uten samtykke', 'dark');
await browser.close(); server.close();
