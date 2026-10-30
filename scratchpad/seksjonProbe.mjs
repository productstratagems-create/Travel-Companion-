/**
 * Ligger bryteren sammen med lista den styrer?
 *
 * Det er et spørsmål om rekkefølge og nærhet på en skjerm, og ingen av
 * delene kan leses ut av HTML-en. `tests/sortPlass.test.js` binder
 * DOM-rekkefølgen; dette viser hva rekkefølgen BLIR.
 *
 * HVA SOM ER EKTE HER: de tre containerne er klippet ordrett ut av
 * index.html, så overskriften og bryteren er appens egne. Kortene bygges av
 * den sendte `kortHtml`. RADENE er stand-ins — formet som dem på
 * skjermbildet, men skrevet her. De er med fordi spørsmålet er om bryteren
 * står NÆRMERE radene enn kortene, og det kan ikke måles uten noe under.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import esbuild from 'esbuild';

const bunt = (await esbuild.build({
  entryPoints: ['src/views/auto.js'], bundle: true, format: 'iife',
  globalName: 'AUTO', platform: 'browser', write: false, logLevel: 'silent',
  define: { 'import.meta.env.VITE_GEOAPIFY_KEY': '""',
    'import.meta.env.VITE_STADIA_KEY': '""', '__APP_VERSION__': '"probe"' },
})).outputFiles[0].text;

/** De tre containerne, ordrett fra index.html. */
const idx = fs.readFileSync('index.html', 'utf8');
const skjelett = idx.slice(idx.indexOf('<div id="auto-dest-body">'),
  idx.indexOf('<div id="auto-body"></div>') + '<div id="auto-body"></div>'.length)
  .replace('id="auto-where-head" style="display:none"', 'id="auto-where-head"')
  .replace('id="auto-sort" style="display:none"', 'id="auto-sort"');

const T = (hh, mm) => new Date(2026, 9, 30, hh, mm, 0).getTime();
const rad = (kode, modus, farge, front, kai) => ({
  lines: [{ code: kode, colour: farge }], frontText: front,
  call: { serviceJourney: { line: { transportMode: modus, id: 'RUT:Line:' + kode } },
    quay: { publicCode: kai } },
});
const vei = (d, går, framme) => ({ i: 0, d, call: d.call, ms: går, at: framme });
const KORT = [
  { name: 'Jernbanetorget', options: [
    vei(rad('3', 'metro', 'f5a000', 'Kolsås', '1'), T(8, 48), T(9, 13)),
    vei(rad('74', 'bus', 'e60000', 'Jernbanetorget', 'E'), T(8, 51), T(9, 19))] },
  { name: 'Ekeberg camping', options: [
    vei(rad('74', 'bus', 'e60000', 'Jernbanetorget', 'E'), T(8, 41), T(9, 6))] },
];

/* STAND-INS. Formet som radene på skjermbildet; de er her for å måle avstand,
 * ikke for å påstå noe om hvordan en rad tegnes. */
const RADER = [
  ['FB10', '8a3a1a', 'mot OSL-ekspressen – Oslo lufthavn', 'plattform F', '22 min'],
  ['74', 'e60000', 'mot Jernbanetorget', 'plattform E', '7 min'],
  ['3', 'f5a000', 'mot Stortinget', 'spor 2', '11 min'],
].map(([k, f, mot, kai, tid]) =>
  '<button class="nearby-btn" type="button"><span class="line-badge" style="background:#'
  + f + '">' + k + '</span> <span>' + mot + '</span><br><span style="opacity:.7">'
  + kai + '</span> <span style="float:right">' + tid + '</span></button>').join('');

const css = ['tokens', 'base', 'components', 'settings', 'theme-light']
  .map(f => { try { return fs.readFileSync('src/style/' + f + '.css', 'utf8'); } catch (_) { return ''; } })
  .join('\n');

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 414, height: 760 }, deviceScaleFactor: 2 });
p.on('pageerror', e => console.error('  [side] ' + e.message));

const html = `<!doctype html><html data-theme="dark"><meta charset="utf-8">
  <style>${css}
    body{margin:0;padding:16px;font-family:-apple-system,system-ui,sans-serif}
    #v-auto > * + *{margin-top:.6rem}
    .nearby-btn{display:block;width:100%;text-align:left}
  </style>
  <div id="v-auto">${skjelett}</div>`;
await p.route('http://probe.local/', r => r.fulfill({ contentType: 'text/html', body: html }));
await p.goto('http://probe.local/');
await p.addScriptTag({ content: bunt });
/* TO TILSTANDER, fordi overskriften under sier to ulike ting: «andre
 * reisealternativer» når det står kort over, og bare «reisealternativer» når
 * det ikke gjør det. Ordet «andre» krever et første, og en førstegangsbruker
 * har ingen historikk — da tegnes kortene ikke i det hele tatt. */
const MED_KORT = process.argv[2] !== 'tom';

await p.evaluate(([kort, rader, medKort]) => {
  document.getElementById('auto-dest-body').innerHTML = medKort
    ? '<div class="set-label">dit du ofte skal</div>'
      + kort.map((x, i) => window.AUTO.kortHtml(x, i)).join('')
    : '';
  document.getElementById('auto-where-label').textContent =
    window.AUTO.listeOverskrift(medKort);
  document.getElementById('auto-body').innerHTML = rader;
  document.querySelectorAll('.pref-btn')[0].classList.add('active');
  document.querySelectorAll('.sort-word')[0].textContent = 'T-bane først';
  document.querySelectorAll('.sort-word')[1].textContent = 'Andre busser først';
}, [KORT, RADER, MED_KORT]);
await p.waitForTimeout(250);

const m = await p.evaluate(() => {
  const r = (s) => document.querySelector(s).getBoundingClientRect();
  const kort = r('#auto-dest-body'), hode = r('#auto-where-head'), liste = r('#auto-body');
  const sort = r('#auto-sort');
  return {
    overskrift: document.getElementById('auto-where-label').textContent,
    rekke: [['kort', Math.round(kort.top)], ['hode', Math.round(hode.top)],
      ['liste', Math.round(liste.top)]],
    tilKort: Math.round(sort.top - kort.bottom),
    tilListe: Math.round(liste.top - sort.bottom),
  };
});
await p.screenshot({ path: 'scratchpad/seksjoner' + (MED_KORT ? '' : '-tom') + '.png', fullPage: true });
await b.close();

console.log('overskrift: «' + m.overskrift + '»');
console.log('rekkefølge ovenfra:  ' + m.rekke.map(([n, y]) => n + '@' + y).join('  →  '));
console.log('bryteren står ' + m.tilKort + ' px under kortene og ' + m.tilListe + ' px over lista\n');

const feil = [];
/* ORDET «ANDRE» KREVER ET FØRSTE, og det er en påstand om PIKSLER her: står
 * det «andre» i en skjerm der ingenting står over, er det synlig galt. */
if (MED_KORT && !m.overskrift.startsWith('andre')) feil.push('mangler «andre» med kort over');
if (!MED_KORT && m.overskrift.includes('andre')) feil.push('sier «andre» uten noe over');
const y = Object.fromEntries(m.rekke);
/* REKKEFØLGEN MÅLES BARE NÅR DET FINNES KORT.
 *
 * Uten dem er `#auto-dest-body` tom, og en tom container har null høyde — så
 * `kort.top === hode.top`, og sammenligningen `<` er usann uten at noe er
 * galt. Første utgave meldte feil på nettopp det: instrumentet, ikke
 * skjermen. Det som gjelder i den tilstanden er at overskriften er den
 * RIKTIGE, og den måles like over. */
if (MED_KORT && !(y.kort < y.hode && y.hode < y.liste)) {
  feil.push('seksjonene står ikke i rekkefølgen kort → bryter → liste');
}
if (!MED_KORT && !(y.hode < y.liste)) feil.push('overskriften står ikke over lista');
/* NÆRHET ER PÅSTANDEN. «Ligge sammen med lista den påvirker» er ikke
 * oppfylt av rekkefølge alene: står bryteren like langt fra begge, hører den
 * fortsatt ingen steder. Den skal være nærmere lista enn kortene. */
if (MED_KORT && m.tilListe >= m.tilKort) {
  feil.push('bryteren står ' + m.tilListe + ' px fra lista og ' + m.tilKort
    + ' px fra kortene — ikke nærmere den den styrer');
}

if (feil.length) { console.error('PRØVEN FALT:'); feil.forEach(f => console.error('  · ' + f)); process.exitCode = 1; }
else console.log('✓ kort → bryter → liste, og bryteren er nærmest lista.');
console.log('\nbilde: scratchpad/seksjoner' + (MED_KORT ? '' : '-tom') + '.png');
