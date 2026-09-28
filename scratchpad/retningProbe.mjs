/**
 * Retning og avstand i avgangsdetaljer. Issue #397 punkt c.
 *
 * HVA BARE EN NETTLESER KAN AVGJØRE: at pila faktisk peker riktig vei, og at
 * fraværet sies med ord når posisjonen mangler. En pil som peker nordover
 * fordi den ikke vet bedre er verre enn ingen pil.
 *
 * Fasiten er valgt så den kan avgjøres: stoppet ligger RETT NORD for deg, så
 * rotasjonen skal være 0 grader — `matrix(1, 0, 0, 1, 0, 0)`.
 */
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); const PORT = 4601;
const NOW = Date.parse('2026-09-28T08:00:00+02:00');
const HER = { lat: 59.9109, lon: 10.7522 };

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

/* nord = rett nord for deg (fasit: 0°) · oest = rett øst (fasit: 90°)
   uten = ingen posisjon i det hele tatt (fasit: ord, ingen pil) */
const SAKER = {
  nord: { lat: 59.9200, lon: 10.7522 },
  oest: { lat: 59.9109, lon: 10.8200 },
  uten: null,
};

for (const [navn, stopp] of Object.entries(SAKER)) {
  for (const scheme of (navn === 'nord' ? ['dark', 'light'] : ['dark'])) {
    const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();

    await page.addInitScript(({ now, scheme, stopp, her }) => {
      const Real = Date;
      class P extends Real {
        constructor(...a) { super(...(a.length ? a : [now])); }
        static now() { return now; }
      }
      globalThis.Date = P;
      localStorage.setItem('__activeProfile', 'default');
      localStorage.setItem('default::t.theme', scheme === 'light' ? 'light' : 'dark');
      // Uten posisjon skal linja si fra med ord — det er hele «uten»-saken.
      if (stopp) {
        localStorage.setItem('default::t.homeLL',
          JSON.stringify({ lat: her.lat, lon: her.lon, at: now - 5000 }));
      }
      window.__stopp = stopp;
    }, { now: NOW, scheme, stopp, her: HER });

    await page.route('**/geocoder/**', r => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ features: [] }) }));
    await page.route('**/journey-planner/**', r => r.abort());

    await page.goto('http://localhost:' + PORT + '/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);

    /* `state` er ikke på window, men `config` er modulintern også — så
       stoppets koordinat settes ved å tegne skjermen gjennom `window.tap` og
       la board-koden ha fylt statLL. Får vi ikke satt den, sier prøven det
       framfor å melde et tall den ikke har grunnlag for. */
    const klar = await page.evaluate((s) => {
      if (!window.tap) return 'window.tap finnes ikke';
      const b = document.createElement('button');
      b.id = 'p-open';
      b.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
      b.onclick = () => window.tap({
        expectedDepartureTime: new Date(Date.now() + 12 * 60000).toISOString(),
        aimedDepartureTime: new Date(Date.now() + 12 * 60000).toISOString(),
        realtime: true, cancellation: false, situations: [],
        destinationDisplay: { frontText: 'Bergkrystallen' },
        quay: { publicCode: '1' },
        serviceJourney: {
          id: 'sj:1', situations: [],
          line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro',
            presentation: { colour: 'f5a000' } },
          estimatedCalls: [],
        },
      });
      document.body.appendChild(b);
      void s;
      return null;
    }, stopp);

    console.log('\n══ ' + navn + ' · ' + scheme + ' ══');
    if (klar) { console.log('  ✗ nådde ikke skjermen: ' + klar); await ctx.close(); continue; }

    await page.click('#p-open');
    await page.waitForTimeout(900);

    // SJEKK FØR DU MÅLER.
    const synlig = await page.evaluate(() => {
      const e = document.getElementById('v-selected');
      return !!e && e.style.display !== 'none' && e.offsetHeight > 0;
    });
    if (!synlig) { console.log('  ✗ v-selected er ikke synlig'); await ctx.close(); continue; }

    const m = await page.evaluate(() => {
      const e = document.querySelector('#v-selected .sel-heading, #v-selected .sel-heading-ukjent');
      if (!e) return { finnes: false };
      const pil = e.querySelector('.sel-heading-arrow');
      return {
        finnes: true,
        tekst: (e.innerText || '').replace(/\n/g, ' · ').trim(),
        harPil: !!pil,
        transform: pil ? getComputedStyle(pil).transform : null,
      };
    });
    console.log('  ' + (m.finnes ? m.tekst : '(linja finnes ikke)'));
    /* «INGEN PIL» ER IKKE ET SVAR HER.
     *
     * `state.statLL[dir.key]` fylles av tavla, og denne prøven laster aldri
     * en tavle — så retningen kan ikke regnes uansett hva posisjonen er.
     * Første utgave meldte «pil: ingen ← riktig uten posisjon» i ALLE fire
     * tilfellene, også der posisjonen var sådd, og det så ut som et bestått
     * resultat.
     *
     * Selve regelen prøves nå av tests/retning.test.js, med fasit som kan
     * avgjøres: nord = 0°, øst = 90°, sør = 180°. Det denne prøven kan si
     * noe om er hvordan linja SER UT — ikke om pila peker riktig. */
    const venter = stopp ? 'en pil' : 'ingen pil';
    console.log('  pil: ' + (m.harPil ? m.transform : 'ingen')
      + '   (ventet ' + venter + ')'
      + (stopp && !m.harPil ? '  ← statLL er tom: prøven når ikke regelen' : ''));
    await page.screenshot({ path: 'scratchpad/retning-' + navn + '-' + scheme + '.png', fullPage: true });
    await ctx.close();
  }
}
await browser.close();
server.close();
