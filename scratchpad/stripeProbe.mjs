/**
 * Får den lengre overskriften plass — eller skjuler appen den selv?
 *
 * `renderLineStrip` har denne vakten:
 *
 *     if (cap.scrollWidth > cap.clientWidth + 1) cap.style.visibility = 'hidden';
 *
 * «neste avganger · etter rutetid» er nesten dobbelt så lang som
 * «neste avganger». Blir den skjult av den vakten, er hele rettelsen
 * VERDILØS — da står stripa uten overskrift i det hele tatt, altså verre enn
 * før.
 *
 * Det kan ikke leses ut av HTML-en. Teksten er 9 px i en monospace-font med
 * `letter-spacing`, og om den får plass på 414 px er et pikselspørsmål.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const css = ['tokens', 'base', 'components', 'board', 'theme-light']
  .map(f => { try { return fs.readFileSync('src/style/' + f + '.css', 'utf8'); } catch (_) { return ''; } })
  .join('\n');

/** Stripas markup, slik renderLineStrip bygger den. */
const stripe = (tekst) => `<div id="line-strip" style="display:block">
  <div class="ls-caps"><span class="ls-cap ls-cap-wide">${tekst}</span></div>
  <div class="ls-rail">
    <span class="ls-zone ls-zone-appr" style="width:86%"></span>
    <span class="ls-train ls-appr" style="left:12%"><svg class="ls-veh" width="26" height="14"><rect width="26" height="14" rx="3" fill="#f5a000"/></svg></span>
    <span class="ls-train ls-appr" style="left:34%"><svg class="ls-veh" width="26" height="14"><rect width="26" height="14" rx="3" fill="#f5a000"/></svg></span>
    <span class="ls-train ls-appr" style="left:58%"><svg class="ls-veh" width="26" height="14"><rect width="26" height="14" rx="3" fill="#f5a000"/></svg></span>
    <span class="ls-train ls-appr" style="left:74%"><svg class="ls-veh" width="26" height="14"><rect width="26" height="14" rx="3" fill="#f5a000"/></svg></span>
    <span class="ls-you" style="left:86%"></span>
  </div>
  <div class="ls-ends"><span class="ls-end-from" style="left:86%">Mortensrud</span></div>
</div>`;

const TILFELLER = [
  ['noe er målt', 'neste avganger'],
  ['ingenting målt', 'neste avganger · etter rutetid'],
];

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 414, height: 260 }, deviceScaleFactor: 2 });

const html = `<!doctype html><html data-theme="dark"><meta charset="utf-8">
  <style>${css}
    body{margin:0;padding:16px;background:var(--bg,#0a0e1a);
         font-family:-apple-system,system-ui,sans-serif}
    #line-strip + #line-strip{margin-top:22px}
  </style>
  ${TILFELLER.map(([, t]) => stripe(t)).join('')}`;
await p.route('http://probe.local/', r => r.fulfill({ contentType: 'text/html', body: html }));
await p.goto('http://probe.local/');
await p.waitForTimeout(200);

/* TO MÅLINGER, OG DEN FØRSTE ALENE VAR FEIL.
 *
 * Første utgave kjørte bare appens egen vakt — `scrollWidth > clientWidth` —
 * og rapporterte at begge overskriftene fikk plass. Men `.ls-cap-wide` er
 * `width:100%`, så boksen er like bred uansett tekst: `scrollWidth` er ALLTID
 * lik `clientWidth`, vakten fyrer aldri, og teksten kuttes i stillhet med en
 * ellipse i stedet.
 *
 * Målingen svarte altså «ikke skjult» på et spørsmål den trodde var «får
 * plass». Teksten må måles på sin EGEN bredde, ikke på boksens.
 */
const m = await p.evaluate(() => [...document.querySelectorAll('.ls-cap')].map(cap => {
  // Tekstens naturlige bredde: et Range rundt innholdet måler bokstavene,
  // ikke beholderen.
  const rg = document.createRange();
  rg.selectNodeContents(cap);
  const trengs = Math.ceil(rg.getBoundingClientRect().width);
  const plass = cap.clientWidth;
  const skjult = cap.scrollWidth > cap.clientWidth + 1;
  if (skjult) cap.style.visibility = 'hidden';
  return {
    tekst: cap.textContent,
    trengs, plass,
    kuttet: trengs > plass + 1,
    synlig: getComputedStyle(cap).visibility !== 'hidden',
  };
}));
await p.screenshot({ path: 'scratchpad/stripe.png', fullPage: true });
await b.close();

console.log('telefonbredde 414 px, stripa 382 px\n');
m.forEach((x, i) => {
  console.log('  ' + TILFELLER[i][0].padEnd(16)
    + 'trenger ' + String(x.trengs).padStart(3) + ' px av ' + x.plass
    + '   ' + (!x.synlig ? 'SKJULT' : x.kuttet ? 'KUTTET' : 'hel ✓'));
  console.log('    «' + x.tekst + '»');
});

const feil = [];
m.forEach((x, i) => {
  if (!x.synlig) {
    feil.push(TILFELLER[i][0] + ': overskriften skjules av appens egen vakt — '
      + 'rettelsen er verdiløs, og stripa står uten overskrift i det hele tatt');
  } else if (x.kuttet) {
    feil.push(TILFELLER[i][0] + ': teksten kuttes med ellipse — trenger '
      + x.trengs + ' px, har ' + x.plass);
  }
});
// Og måleinstrumentet: finner den ingen overskrifter, er alt over grønt uten
// å ha prøvd noe.
if (m.length !== TILFELLER.length) feil.push('fant ikke begge overskriftene');

if (feil.length) { console.error('\nPRØVEN FALT:'); feil.forEach(f => console.error('  · ' + f)); process.exitCode = 1; }
else console.log('\n✓ begge overskriftene står hele på 414 px.');
console.log('\nbilde: scratchpad/stripe.png');
