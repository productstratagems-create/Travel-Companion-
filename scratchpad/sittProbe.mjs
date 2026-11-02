/**
 * Underveis, med en reise som har gange imellom.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at linja under nedtellingen faktisk sier
 * gangen — «av på Jernbanetorget · gå til Oslo S · 5 min å gå» — og
 * «av på Nationaltheatret · 8 min å gå», ikke «ankommer Aker brygge», og at
 * setningen får plass på 414 px.
 *
 * Reisen plantes i `t.jny` slik `saveJny` skriver den. Etappenes verdier er
 * dem `legsFromTrip` gir for de samme fiksturene — det bindes i
 * tests/flereEtapper.test.js, så her måles bare skjermen.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4609;
const T0 = Date.parse('2026-11-02T08:00:00+01:00');
const iso = m => new Date(T0 + m * 60000).toISOString();
/* OSLO-TID, IKKE PROSESSENS. Første kjøring regnet `clk` i Nodes egen sone
   (UTC) mens nettleseren sto i Europe/Oslo — toppen sa «avg 07:00» og
   stopplista «08:06» på samme skjerm. Fiksturens feil, ikke appens; samme
   felle `tests/autoKort.test.js` har skrevet ned. */
const klk = m => new Date(T0 + m * 60000).toLocaleTimeString('nb-NO',
  { timeZone: 'Europe/Oslo', hour: '2-digit', minute: '2-digit' });
const tid = m => ({ time: iso(m), clk: klk(m) });
const stopp = (name, lat, lon, m) => ({ name, lat, lon, id: 'NSR:StopPlace:' + name.replace(/\W/g, ''),
  arr: iso(m), dep: iso(m), aimed: iso(m) });

const etappe = (o) => ({ lineRef: 'RUT:Line:' + o.lineCode, lineBg: '#f5a000',
  journeyId: 'SJ:' + o.lineCode, shape: null, ...o });

const REISER = {
  // R13 Lillestrøm → Oslo S, BLI SITTENDE, fortsetter som L2 mot Ski
  sitt: { dest: 'Ski', from: 'Lillestrøm', boardedAt: T0, lineCode: 'R13', lineBg: '#e00',
    frontText: 'Ski', firstLegFrontText: 'Oslo S', arrival: tid(40),
    _toLat: 59.719, _toLon: 10.836,
    legs: [
      etappe({ lineCode: 'R13', mode: 'rail', frontText: 'Oslo S',
        fromStation: 'Lillestrøm', toStation: 'Oslo S', gåEtter: null,
        blisittende: true, garantert: true,
        depTime: tid(0), arrTime: tid(12), quay: '2',
        stops: [stopp('Lillestrøm', 59.953, 11.045, 0), stopp('Grorud', 59.961, 10.880, 6),
                stopp('Oslo S', 59.911, 10.753, 12)] }),
      etappe({ lineCode: 'L2', mode: 'rail', frontText: 'Ski',
        fromStation: 'Oslo S', toStation: 'Ski', gåEtter: null,
        depTime: tid(14), arrTime: tid(40), quay: '2',
        stops: [stopp('Oslo S', 59.911, 10.753, 14), stopp('Nordstrand', 59.861, 10.796, 22),
                stopp('Ski', 59.719, 10.836, 40)] }),
    ] },
  // (a) Ryen → Jernbanetorget, gå 5 min, Oslo S → Ski
  bytte: { dest: 'Ski', from: 'Ryen', boardedAt: T0, lineCode: '3', lineBg: '#f5a000',
    frontText: 'Ski', firstLegFrontText: 'Kolsås', arrival: tid(45),
    _toLat: 59.719, _toLon: 10.836,
    legs: [
      etappe({ lineCode: '3', mode: 'metro', frontText: 'Kolsås',
        fromStation: 'Ryen', toStation: 'Jernbanetorget', gåEtter: 5,
        depTime: tid(0), arrTime: tid(8), quay: '1',
        stops: [stopp('Ryen', 59.895, 10.806, 0), stopp('Brynseng', 59.909, 10.814, 3),
                stopp('Tøyen', 59.915, 10.774, 6), stopp('Jernbanetorget', 59.912, 10.750, 8)] }),
      etappe({ lineCode: 'L2', mode: 'rail', frontText: 'Ski',
        fromStation: 'Oslo S', toStation: 'Ski', gåEtter: null,
        depTime: tid(18), arrTime: tid(45), quay: '13',
        stops: [stopp('Oslo S', 59.911, 10.753, 18), stopp('Nordstrand', 59.861, 10.796, 26),
                stopp('Ski', 59.719, 10.836, 45)] }),
    ] },
  // (b) Mortensrud → Nationaltheatret, gå 8 min til Aker brygge
  tilFots: { dest: 'Aker brygge', from: 'Mortensrud', boardedAt: T0, lineCode: '3',
    lineBg: '#f5a000', frontText: 'Aker brygge', firstLegFrontText: 'Kolsås', arrival: tid(30),
    _toLat: 59.910, _toLon: 10.727,
    legs: [
      etappe({ lineCode: '3', mode: 'metro', frontText: 'Kolsås',
        fromStation: 'Mortensrud', toStation: 'Nationaltheatret', gåEtter: 8,
        depTime: tid(0), arrTime: tid(22), quay: '1',
        stops: [stopp('Mortensrud', 59.849, 10.829, 0), stopp('Jernbanetorget', 59.912, 10.750, 18),
                stopp('Stortinget', 59.913, 10.741, 20), stopp('Nationaltheatret', 59.914, 10.732, 22)] }),
    ] },
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

async function run(navn, jny, nåMin, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, jny, scheme }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    localStorage.setItem('default::t.jny', JSON.stringify(jny));
  }, { now: T0 + nåMin * 60000, jny, scheme });
  await page.route(/tiles|entur|open-meteo|overpass|valhalla|geoapify/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(3000);

  const m = await page.evaluate(() => {
    const vis = id => { const e = document.getElementById(id); return e && e.offsetParent !== null; };
    const la = document.getElementById('t-label');
    const r = la && la.getBoundingClientRect();
    return {
      skjerm: vis('v-track') ? 'v-track' : '(ikke underveis)',
      tall: (document.getElementById('t-num') || {}).textContent,
      under: (document.getElementById('t-lbl') || document.querySelector('.track-lbl') || {}).textContent,
      label: la ? la.textContent : null,
      teller: (document.getElementById('t-lbl') || document.querySelector('.track-lbl, #t-sub') || {}).textContent || null,
      kort: Array.from(document.querySelectorAll('.alight-card-eyebrow, .ct-detail')).map(e => e.textContent.replace(/\s+/g,' ').trim().slice(0,60)),
      banner: (document.querySelector('.conn-alert, .track-conn, [class*="conn"]') || {}).textContent || null,
      // FÅR DEN PLASS? En linje som blir klippet eller bryter rart er like
      // taus som den gamle.
      bredde: r ? Math.round(r.width) : null,
      flyter: la ? la.scrollWidth - la.clientWidth : null,
      høyde: r ? Math.round(r.height) : null,
    };
  });
  console.log('\n══ ' + navn + ' · ' + scheme + ' · t+' + nåMin + ' min · ' + m.skjerm);
  console.log('   «' + m.label + '»');
  console.log('   kort: ' + JSON.stringify(m.kort));
  if (m.banner) console.log('   banner: ' + m.banner.replace(/\s+/g, ' ').trim());
  console.log('   bredde ' + m.bredde + ' px · høyde ' + m.høyde + ' px · flyter ' + m.flyter + ' px');
  const f = path.join(ROOT, 'scratchpad', 'sitt-' + navn + '-' + scheme + '.png');
  await page.screenshot({ path: f });
  console.log('   → ' + f);
  await ctx.close();
}

for (const scheme of ['dark', 'light']) {
  await run('underveis', REISER.sitt, 11, scheme);
  await run('overgang', REISER.sitt, 13, scheme);
}
await browser.close(); server.close();
