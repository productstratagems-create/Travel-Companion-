/**
 * Leses «anslag» fra «målt» på sju piksler?
 *
 * Merket er 7×10 px. Alt som skal skille et anslag fra en måling må overleve
 * den flata — og tre vanlige valg gjør det ikke: en prikket kant forsvinner,
 * lavere dekkevne kolliderer med `.pnd` («ingen data»), og en annen farge
 * ville løyet om nivået.
 *
 * Fylt mot hult er påstanden. Den måles her: hvor mye blekk hvert merke
 * bærer, i piksler, ved faktisk størrelse.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const css = fs.readFileSync('src/style/board.css', 'utf8');
const PIP = '<svg class="pp" viewBox="0 0 7 10"><circle cx="3.5" cy="2.5" r="1.75"/>'
  + '<path d="M0.5 10v-1C0.5 7 1.8 6 3.5 6S6.5 7 6.5 9V10z"/></svg>';

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 420, height: 160 }, deviceScaleFactor: 1 });

const merke = (kl) => `<span class="occ-pip ${kl}">${PIP}</span>`;
/* TOM NÅR INGEN BER OM NOE ANNET.
 *
 * Sto som `process.argv[2] || '1.2'`, altså en overstyring som ALLTID var
 * på. Prøven målte da sin egen defaultverdi og ikke `board.css`, og
 * rapporterte derfor samme tall uansett hva som ble sendt. En prøve som
 * overstyrer det den skal måle, måler seg selv.
 *
 * Et argument er fortsatt lov — det er det som gjorde det mulig å feie over
 * tykkelsene og finne 0,9 — men uten argument er det CSS-en som gjelder. */
const STROKE = process.argv[2] || '';
const VARIANTER = [
  ['målt   ', 'pc4'], ['anslag ', 'pc4 pest'], ['ingen  ', 'pnd'],
];

await p.setContent(`<style>
  :root{--accent-rgb:245,184,64;--ok:#4ade80;--warn:#fbbf24;--urgent:#fb923c}
  body{margin:0;background:#0a0806;display:flex;gap:40px;padding:20px}
  ${css}
  ${STROKE ? '.occ-pip.pest .pp{stroke-width:' + STROKE + '}' : ''}
  .b{position:relative;align-self:flex-start}
</style>${VARIANTER.map(([, kl]) => `<span class="b">${merke(kl)}</span>`).join('')}`);

const tall = await p.evaluate(async () => {
  const ut = [];
  for (const el of document.querySelectorAll('.occ-pip')) {
    const r = el.getBoundingClientRect();
    ut.push({ x: r.x, y: r.y, w: r.width, h: r.height });
  }
  return ut;
});

const png = await p.screenshot();
const data = await p.evaluate(async (b64) => {
  const img = new Image();
  await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return { w: c.width, d: Array.from(g.getImageData(0, 0, c.width, c.height).data) };
}, png.toString('base64'));

/**
 * BLEKKMENGDE, ikke antall piksler.
 *
 * Første utgave talte piksler som var ulik bakgrunnen. Det er feil mål for
 * fylt mot hult: et hult merke har omtrent samme OMRISS, og hver eneste
 * antialiaserte kantpiksel teller like mye som en heldekkende. Den målingen
 * rapporterte at det HULE merket bar MER blekk enn det fylte — 48 mot 39 —
 * som er umulig, og det var instrumentet.
 *
 * Summen av avstand fra bakgrunnen er det tallet som faktisk svarer på «hvor
 * mye farge ligger her».
 */
function blekk(bx) {
  let sum = 0;
  for (let y = Math.floor(bx.y); y < Math.ceil(bx.y + bx.h); y++) {
    for (let x = Math.floor(bx.x); x < Math.ceil(bx.x + bx.w); x++) {
      const i = (y * data.w + x) * 4;
      sum += Math.abs(data.d[i] - 10) + Math.abs(data.d[i + 1] - 8) + Math.abs(data.d[i + 2] - 6);
    }
  }
  return Math.round(sum / 100);
}

console.log('merket er 7×10 px — ' + Math.round(tall[0].w) + '×' + Math.round(tall[0].h) + ' målt\n');
const m = VARIANTER.map(([navn], i) => {
  const n = blekk(tall[i]);
  console.log('  ' + navn + ' ' + String(n).padStart(3) + ' blekk');
  return n;
});

/* Zoomet bilde, for øyet. */
await p.setViewportSize({ width: 300, height: 120 });
await p.setContent(`<style>
  :root{--accent-rgb:245,184,64;--ok:#4ade80;--warn:#fbbf24;--urgent:#fb923c}
  body{margin:0;background:#0a0806;color:#e8e8ea;font:13px system-ui;
       display:flex;gap:30px;padding:22px;align-items:center}
  ${css}
  ${STROKE ? '.occ-pip.pest .pp{stroke-width:' + STROKE + '}' : ''}
  figure{margin:0;text-align:center}
  .z{display:inline-block;transform:scale(7);transform-origin:center;line-height:0}
  figure{width:80px;height:80px;display:flex;flex-direction:column;
         align-items:center;justify-content:center}
  figcaption{margin-top:14px;font-size:11px}
</style>${VARIANTER.map(([navn, kl]) =>
  `<figure><span class="z">${merke(kl)}</span><figcaption>${navn.trim()}</figcaption></figure>`).join('')}`);
await p.screenshot({ path: 'scratchpad/pip.png' });
await b.close();

const feil = [];
// Forskjellen må være større enn antialiasering, og den må gå RIKTIG vei:
// et hult merke bærer mindre blekk enn et fylt.
if (m[1] >= m[0]) feil.push(`anslaget bærer ${m[1]} mot målingens ${m[0]} — ikke hult`);
if (m[0] - m[1] < m[0] * 0.2) feil.push(`bare ${m[0] - m[1]} skiller dem — under en femtedel av det fylte merket`);
// Og anslaget skal ikke forveksles med «ingen data», som er den andre
// svake tilstanden på samme merke.
if (Math.abs(m[1] - m[2]) < m[0] * 0.2) feil.push('anslag og «ingen data» bærer like mye blekk');

if (feil.length) { console.error('\nPRØVEN FALT:'); feil.forEach(f => console.error('  · ' + f)); process.exitCode = 1; }
else console.log(`\n✓ fylt ${m[0]} · hult ${m[1]} · ingen data ${m[2]} — tre ulike merker.`);
console.log('\nzoomet: scratchpad/pip.png');
