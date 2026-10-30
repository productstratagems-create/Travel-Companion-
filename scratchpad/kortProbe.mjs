/**
 * Kortet, slik det faktisk ser ut — på telefonbredde, i begge moduser.
 *
 * Tre linjer der det før var to. «Ingenting skal hoppe, blafre eller kreve
 * skrolling for å se det avgjørende» er en påstand om PIKSLER, ikke om HTML,
 * og flere feil i denne kodebasen var usynlige i alle tall og åpenbare i ett
 * skjermbilde.
 *
 * Det som måles: at den navngitte veien står på sin EGEN linje under, ikke
 * ved siden av — kommentaren i settings.css:731 beskriver hvorfor et
 * høyrestilt tillegg brøt leserekkefølgen på 414 px, og den advarselen
 * gjelder fortsatt.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import esbuild from 'esbuild';

/* AUTO.JS KJØRES I NETTLESEREN, IKKE I NODE.
 *
 * Tre ting stoppet en rett `import` i Node, og de kom én om gangen:
 * `config.js` leser `import.meta.env`, Leaflet rører `window` ved import, og
 * `migrate()` kaller `localStorage` på modulnivå.
 *
 * Jeg holdt på å stable opp shims for alle tre — altså bygge en nettleser i
 * Node for å slippe å bruke den nettleseren prøven alt starter. Bunten
 * lastes derfor i SIDEN, der alle tre finnes på ekte. Det er også det ene
 * stedet målingen er sann: høyder og leserekkefølge er piksler.
 *
 * esbuild er samme verktøy Vite selv bruker og ligger alt i node_modules —
 * ingen ny avhengighet, ingen dev-server.
 */
const bunt = (await esbuild.build({
  entryPoints: ['src/views/auto.js'], bundle: true, format: 'iife',
  globalName: 'AUTO', platform: 'browser', write: false, logLevel: 'silent',
  define: { 'import.meta.env.VITE_GEOAPIFY_KEY': '""',
    'import.meta.env.VITE_STADIA_KEY': '""', '__APP_VERSION__': '"probe"' },
})).outputFiles[0].text;

const T = (hh, mm) => new Date(2026, 9, 30, hh, mm, 0).getTime();
const rad = (kode, modus, farge, front) => ({
  lines: [{ code: kode, colour: farge }], frontText: front,
  call: { serviceJourney: { line: { transportMode: modus, id: 'RUT:Line:' + kode } },
    quay: { publicCode: modus === 'bus' ? 'D' : '2' } },
});
const vei = (d, går, framme) => ({ i: 0, d, call: d.call, ms: går, at: framme });

const BUSS = rad('71', 'bus', 'e60000', 'Jernbanetorget');
const TBANE = rad('3', 'metro', 'f5a000', 'Stortinget');
const BUSS74 = rad('74', 'bus', 'e60000', 'Jernbanetorget');

/* Den rapporterte skjermen: buss raskest, T-bane fire minutter senere. */
const KORT = [
  { navn: 'Jernbanetorget, med T-bane som andre vei',
    x: { name: 'Jernbanetorget', options: [
      vei(BUSS, T(7, 19), T(7, 40)), vei(TBANE, T(7, 24), T(7, 44)),
      vei(BUSS74, T(7, 19), T(7, 50))] } },
  { navn: 'Ekeberg camping, bare én vei',
    x: { name: 'Ekeberg camping', options: [vei(BUSS74, T(7, 19), T(7, 44))] } },
  { navn: 'Et langt navn, som må brytes eller kuttes',
    x: { name: 'Nationaltheatret stasjon', options: [
      vei(TBANE, T(7, 24), T(7, 41)), vei(BUSS, T(7, 19), T(7, 46))] } },
];

const css = ['tokens', 'base', 'components', 'settings', 'theme-light']
  .map(f => { try { return fs.readFileSync('src/style/' + f + '.css', 'utf8'); } catch (_) { return ''; } })
  .join('\n');

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function skjerm(tema) {
  const p = await b.newPage({ viewport: { width: 414, height: 420 }, deviceScaleFactor: 2 });
  p.on('pageerror', e => console.error('  [side] ' + e.message));
  /* EN EKTE OPPRINNELSE, IKKE about:blank.
   *
   * `setContent` gir siden en opprinnelse der `localStorage` NEKTES, og
   * bunten kastet derfor under import — «Access is denied for this
   * document». Det var ikke prøvens feil: `storage.js` kalte `localStorage`
   * på modulnivå uten try/catch, og den feilen er ekte i Safaris private
   * modus. Den er rettet. Men prøven skal uansett kjøre i de omgivelsene
   * appen kjører i, ikke i et hjørne av nettleseren ingen bruker. */
  const html = `<!doctype html><html data-theme="${tema}"><meta charset="utf-8">
    <style>${css}
      body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif}
      .set-label{display:block;margin:0 0 .4rem}
      #v-auto > * + *{margin-top:.5rem}
    </style>
    <div id="v-auto"><span class="set-label">dit du ofte skal</span>
    </div>`;
  await p.route('http://probe.local/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await p.goto('http://probe.local/');
  await p.addScriptTag({ content: bunt });
  // Kortene bygges av DEN SENDTE funksjonen, i nettleseren. Fiksturene er
  // rene data og går inn som JSON.
  await p.evaluate(([kort]) => {
    document.getElementById('v-auto').insertAdjacentHTML('beforeend',
      kort.map((k, i) => window.AUTO.kortHtml(k.x, i)).join(''));
    // Det midterste kortet holdt inne: slik ×-en faktisk ser ut.
    const rader = document.querySelectorAll('.auto-dest-rad');
    if (rader[1]) rader[1].classList.add('vis-slett');
  }, [KORT]);
  await p.waitForTimeout(200);
  const mål = await p.evaluate(() => [...document.querySelectorAll('.auto-dest')].map(el => {
    const how = el.querySelector('.auto-dest-how');
    const mer = el.querySelector('.auto-dest-more');
    const r = (n) => n ? n.getBoundingClientRect() : null;
    return {
      h: Math.round(el.getBoundingClientRect().height),
      how: r(how) && { y: Math.round(r(how).top), x: Math.round(r(how).left) },
      mer: r(mer) && { y: Math.round(r(mer).top), x: Math.round(r(mer).left),
        h: Math.round(r(mer).height), tekst: mer.textContent.trim() },
      howH: r(how) && Math.round(r(how).height),
      badge: !!el.querySelector('.line-badge'),
      del: (() => {
        const rad = el.closest('.auto-dest-rad');
        const d = rad && rad.querySelector('.auto-dest-del');
        const r = d && d.getBoundingClientRect();
        return r && r.width > 0
          ? { b: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left) }
          : null;
      })(),
      kortH: Math.round(el.getBoundingClientRect().right),
      // Der teksten FORAN tellingen slutter. Et Range over tekstnoden, fordi
      // en span-boks ikke vet hvor setningen den står i tok slutt.
      gap: (() => {
        if (!mer) return null;
        const f = mer.previousSibling;
        if (!f || f.nodeType !== 3) return null;
        const rg = document.createRange();
        rg.selectNodeContents(f);
        const rects = [...rg.getClientRects()];
        const siste = rects[rects.length - 1];
        return siste ? Math.round(r(mer).left - siste.right) : null;
      })(),
      bredde: Math.round(el.getBoundingClientRect().width),
    };
  }));
  await p.screenshot({ path: 'scratchpad/kort-' + tema + '.png' });
  await p.close();
  return mål;
}

const mørk = await skjerm('dark');
const lys = await skjerm('light');
await b.close();

console.log('kortbredde: ' + mørk[0].bredde + ' px (telefon 414, 16 px luft)\n');
mørk.forEach((m, i) => {
  console.log(KORT[i].navn);
  console.log('  høyde ' + String(m.h).padStart(3) + ' px   merke: ' + (m.badge ? 'ja' : 'NEI')
    + (m.mer ? '   tellingen: «' + m.mer.tekst + '»' : '   (ingen telling)')
    + (m.del ? '   ×: ' + m.del.b + '×' + m.del.h + ' px' : ''));
});

const feil = [];
mørk.forEach((m, i) => {
  if (!m.badge) feil.push(KORT[i].navn + ': ingen linjemerke');
  /* ×-EN: fingerstor, og den skal ikke ligge oppå kortets eget trykkfelt.
   * `track.css:233` er et målt bevis på hva som skjer når to trykkflater
   * overlapper — sytten kollisjoner, funnet med nøyaktig en slik måling. */
  if (m.del) {
    if (m.del.b < 44 || m.del.h < 44) {
      feil.push(KORT[i].navn + ': ×-en er ' + m.del.b + '×' + m.del.h + ' px — under 44');
    }
    if (m.del.x < m.kortH - 1) feil.push(KORT[i].navn + ': ×-en overlapper kortet');
  }
  if (!m.mer) return;
  /* SAMME AVSNITT, IKKE EGEN LINJE OG IKKE HØYRESTILT.
   *
   * To ting måles her, og begge har gått galt før. Et høyrestilt flex-barn
   * brøt leserekkefølgen på 414 px (settings.css:731). Et eget blokk-barn
   * leste som et nytt utsagn, og det var rapporten mot v1.181.0. Tellingen
   * skal flyte med teksten: den begynner på en av de linjene `how` alt
   * dekker, ikke under dem. */
  const bunn = m.how.y + m.howH;
  if (m.mer.y >= bunn) feil.push(KORT[i].navn + ': tellingen står under avsnittet, ikke i det');
  if (!m.mer.tekst.startsWith('·')) feil.push(KORT[i].navn + ': tellingen henger ikke på setningen');
  /* OG DEN FØLGER SETNINGEN, den er ikke dyttet til kanten.
   *
   * `float:right` overlevde de to påstandene over: teksten begynte fortsatt
   * med «·» og lå fortsatt innenfor avsnittets boks — den hoppet bare til
   * høyre kant av linja, som er nøyaktig leserekkefølgen settings.css:731
   * advarer mot. Målingen var for svak, ikke tegningen for god.
   *
   * `gap` er avstanden fra der teksten foran slutter til der tellingen
   * begynner, målt med et Range over tekstnoden. Flyter den med, er den
   * null. */
  if (m.gap != null && m.gap > 6) {
    feil.push(KORT[i].navn + ': tellingen står ' + m.gap + ' px fra teksten foran — dyttet til kanten');
  }
});
// Og kortet skal fortsatt få plass til to over skjermkanten på en telefon.
const sum = mørk[0].h + mørk[1].h;
if (sum > 260) feil.push('to kort er ' + sum + ' px — for høyt til å stå over folden');

if (feil.length) { console.error('\nPRØVEN FALT:'); feil.forEach(f => console.error('  · ' + f)); process.exitCode = 1; }
else console.log('\n✓ merke på hvert kort, tellingen inne i avsnittet, to kort ' + sum + ' px.');
console.log('\nbilder: scratchpad/kort-dark.png · scratchpad/kort-light.png');
