/**
 * Det appen lagrer uten å spørre, slik det faktisk ser ut.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at vanelista og sletteknappen er
 * SYNLIGE når samtykkebryteren er av — det var hele feilen — og at
 * koordinatene får plass på 414 px uten å flyte ut av raden.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4593;
const NOW = Date.parse('2026-09-08T07:41:00+02:00');
const DAG = 86400000;

const vane = (to, n, dager, over = {}) => ({
  key: to.toLowerCase() + '|3|wd', fromName: 'Mortensrud', toName: to,
  toStopId: 'NSR:StopPlace:' + to, toLat: 59.91387, toLon: 10.75225,
  fromStopId: 'NSR:StopPlace:Mortensrud', bucket: 3, isWeekend: false,
  count: n, lastUsed: NOW - dager * DAG, ...over,
});
const HIST = [
  vane('Lysaker', 40, 1),
  vane('Jernbanetorget', 12, 9, { bucket: 8, isWeekend: true }),
  // Et sted du har skrevet inn selv: ingen stoppId, men koordinater.
  vane('Grünerløkka skatepark', 3, 20, { toStopId: null, fromStopId: null }),
  // Utenfor vinduet — skal ikke stå i lista, og ikke bli igjen i lageret.
  vane('Ski', 99, 200),
];

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

async function run(samtykke, scheme) {
  const ctx = await browser.newContext({
    viewport: { width: 414, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme,
    hasTouch: true, isMobile: true, timezoneId: 'Europe/Oslo', locale: 'nb-NO',
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ now, hist, scheme, samtykke }) => {
    const Real = Date;
    class Pinned extends Real {
      constructor(...a) { super(...(a.length ? a : [now])); }
      static now() { return now; }
    }
    globalThis.Date = Pinned;
    localStorage.setItem('__activeProfile', 'default');
    localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
    localStorage.setItem('default::t.smartHist', JSON.stringify(hist));
    if (samtykke) localStorage.setItem('default::t.memoryConsent', '1');
  }, { now: NOW, hist: HIST, scheme, samtykke });
  await page.route(/tiles|entur|open-meteo|overpass|valhalla|geoapify/, r => r.abort());
  page.on('pageerror', e => console.log('  ! sidefeil:', e.message));

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  // Innstillinger. Knappen er den eneste veien dit en leser har.
  await page.evaluate(() => {
    const b = document.getElementById('prefs-btn') || document.querySelector('[id*="pref"]');
    if (b) b.click();
  });
  await page.waitForTimeout(1200);

  const m = await page.evaluate(() => {
    const synlig = (id) => {
      const e = document.getElementById(id);
      if (!e) return 'FINNES IKKE';
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return (r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'))
        ? Math.round(r.width) + 'x' + Math.round(r.height) : 'SKJULT';
    };
    const rader = Array.from(document.querySelectorAll('#mem-vane .mem-row'));
    const el = document.getElementById('mem-vane');
    return {
      vaneliste: synlig('mem-vane'),
      slettknapp: synlig('mem-clear'),
      loggliste: synlig('mem-list'),
      hvorfor: (document.querySelector('.mem-vane-why') || {}).textContent
        ? document.querySelector('.mem-vane-why').textContent.replace(/\s+/g, ' ').trim() : null,
      rader: rader.map(r => r.textContent.replace(/\s+/g, ' ').trim()),
      // FLYTER NOE UT? Raden er 414 px minus luft; koordinater er lange.
      flyt: rader.map(r => {
        const b = r.getBoundingClientRect(), p = el.getBoundingClientRect();
        return Math.round(r.scrollWidth - r.clientWidth) + ' / ut ' + Math.round(b.right - p.right);
      }),
      lagerEtter: JSON.parse(localStorage.getItem('default::t.smartHist') || '[]')
        .map(e => e.toName),
    };
  });

  console.log('\n══ samtykke ' + (samtykke ? 'PÅ' : 'AV') + ' · ' + scheme);
  console.log('   vaneliste ' + m.vaneliste + ' · slettknapp ' + m.slettknapp
    + ' · loggliste ' + m.loggliste);
  console.log('   ' + m.hvorfor);
  m.rader.forEach((r, i) => console.log('   · ' + r + '   [' + m.flyt[i] + ']'));
  console.log('   lager etter visning: ' + m.lagerEtter.join(', '));

  const f = path.join(ROOT, 'scratchpad',
    'vanesyn-' + (samtykke ? 'ja' : 'nei') + '-' + scheme + '.png');
  const sec = await page.$('#v-prefs');
  await (sec || page).screenshot({ path: f });
  console.log('   → ' + f);
  await ctx.close();
}

await run(false, 'dark');
await run(true, 'dark');
await run(false, 'light');
await browser.close(); server.close();
