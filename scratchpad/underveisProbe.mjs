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
  const ctx = await browser.newContext({ viewport:{width:414,height:900}, deviceScaleFactor:2 });
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
        quay: { publicCode: '1' } }],
    }));
    // Posisjonen: ved Ryen, to stopp foran det klokka tror.
    //
    // `at` MÅ være med. Uten tidsstempel er alderen ukjent, og da skal
    // posisjonen IKKE vinne over ruteplanen — det er hele rettelsen i
    // v1.154.0. «uten alder» under er nettopp det tilfellet.
    if (kind === 'ved ryen') {
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
  console.log('  stripe: ' + m.stripe.trim());
  await page.screenshot({ path: 'scratchpad/underveis-' + kind + '-' + scheme + '.png', fullPage: true });
  await ctx.close();
}

await run('ved ryen', 'dark');
await run('ved ryen', 'light');
// En posisjon lagret før v1.154.0: den har ingen alder, og skal derfor tape
// for ruteplanen — og si hvorfor.
await run('uten alder', 'dark');
await run('avslatt', 'dark');
await browser.close(); server.close();
