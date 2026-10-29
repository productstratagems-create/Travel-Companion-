/**
 * Leses ikonet på 60 piksler?
 *
 * Det er der det avgjøres — en hjemskjerm, ikke en designfil. Antall stopp
 * på skinna er derfor et MÅLERESULTAT og ikke et valg: fem prikker med
 * mellomrom kan bli grøt på et ikon så lite.
 *
 * Proben måler tre ting, og alle tre pleier å bli antatt:
 *
 *   1. ADSKILTE PRIKKER. Telles som lys/mørk-overganger langs skinnas rad.
 *      Smelter to prikker sammen, faller tallet — og da er tegningen for tett.
 *   2. SIKKERHETSSONEN. Hver ikke-bakgrunnspiksel i maskable-utgaven skal
 *      ligge innenfor sirkelen på 80 % av flaten. Ellers klipper Android
 *      det, og ingen oppdager det uten en Android med rund maske.
 *   3. KONTRAST. Gull mot nær-svart, regnet etter WCAG framfor vurdert.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { ikonSvg, målerad, SPENN_MASKABLE, STOPP } from '../scripts/_ikon-tegning.mjs';

const browser = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 600, height: 600 } });

/** Tegner en SVG i gitt størrelse og gir pikslene tilbake. */
async function piksler(svg, px) {
  await page.setContent('<body style="margin:0">' + svg + '</body>');
  const el = await page.$('svg');
  await el.evaluate((e, s) => { e.setAttribute('width', s); e.setAttribute('height', s); }, px);
  const buf = await el.screenshot({ type: 'png' });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { w: c.width, h: c.height, data: Array.from(d.data) };
  }, buf.toString('base64'));
}

const erBakgrunn = (r, g, b) => r < 40 && g < 40 && b < 40;

/* FØRSTE MÅLING TALTE SKINNA, IKKE PRIKKENE.
 *
 * Den så på MIDTRADEN — og der ligger skinna, som binder alle prikkene til
 * én sammenhengende lys stripe. Svaret var «1 flekk» for tre, fem og sju
 * stopp, altså nøyaktig like informativt for alle tre.
 *
 * Prikkene stikker ut OVER skinna: de har radius ~0,06·S mot skinnas halve
 * bredde på ~0,014·S. En rad litt over midten krysser derfor bare prikkene,
 * og det er den som svarer på om de er adskilte. */
function flekker(p) {
  const y = målerad(p.h);
  let n = 0, inne = false;
  for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    const lys = !erBakgrunn(p.data[i], p.data[i + 1], p.data[i + 2]);
    if (lys && !inne) n++;
    inne = lys;
  }
  return n;
}

/** Ligger alt innhold innenfor sirkelen på 80 % av flaten? */
function utenforSonen(p) {
  const cx = p.w / 2, cy = p.h / 2, R = p.w * 0.4;
  let verst = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (erBakgrunn(p.data[i], p.data[i + 1], p.data[i + 2])) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d > R) verst = Math.max(verst, d / R);
    }
  }
  return verst;  // 0 = alt innenfor; >1 = hvor langt utenfor
}

/** WCAG-kontrast mellom gull og bakgrunn. */
function kontrast(hex1, hex2) {
  const L = (h) => {
    const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const a = L(hex1), b = L(hex2);
  return ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toFixed(2);
}

console.log('kontrast gull/bakgrunn:', kontrast('#f5b840', '#0a0806'), '(WCAG AA stor tekst: 3.0)');
console.log();

const funn = [];
for (const stopp of [3, 5, 7]) {
  const rad = [];
  for (const px of [60, 120, 180]) {
    const p = await piksler(ikonSvg(stopp, 0.84), px);
    rad.push(px + 'px: ' + flekker(p) + ' flekker');
    if (px === 60) funn.push({ stopp, flekker: flekker(p) });
  }
  /* MASKABLE: 0,66 og ikke 0,78.
   *
   * Første regnestykke tok halvbredden av SKINNA og glemte at endeprikkene
   * stikker utenfor endepunktet sitt. Målt ble det 105 % av sonen — fem
   * prosent for bredt, og Android ville klippet prikkene i begge ender uten
   * at noen så det.
   *
   * Kravet er halv + stoppR ≤ 0,4·S. Med stoppR = 0,055·S gir det
   * halv ≤ 0,345·S, altså spenn ≤ 0,69. 0,66 gir margin. */
  const m = await piksler(ikonSvg(stopp, SPENN_MASKABLE), 512);
  const ut = utenforSonen(m);
  console.log(`${stopp} stopp  ${rad.join('  ')}   maskable utenfor sonen: `
    + (ut === 0 ? 'nei ✓' : (ut * 100).toFixed(0) + '% for bredt'));
  fs.writeFileSync(`scratchpad/ikon-${stopp}.svg`, ikonSvg(stopp, 0.84));
}


/* Hver prikk og hver skinnehalvdel skal gi sin egen flekk. Smelter de
 * sammen, er tegningen for tett for en hjemskjerm. */
console.log();
funn.forEach(f => {
  console.log(`  ${f.stopp} stopp på 60px → ${f.flekker} adskilte flekker`);
});

/* ── PORTEN ──────────────────────────────────────────────────────────────
 *
 * Linjene over er en rapport, og en rapport fanger ingen mutant: den blir
 * lest av et menneske som alt vet hva den skal si. Det som BINDER er
 * påstanden under, om tegningen som faktisk sendes.
 *
 * To mutanter faller her, og bare her — `vitest` kan ikke dekode piksler:
 *
 *   STOPP = 7             → 5 flekker der 7 kreves
 *   SPENN_MASKABLE = 0.84 → innhold utenfor Androids sikkerhetssone
 */
const feil = [];

const sendt = funn.find(f => f.stopp === STOPP);
if (!sendt) feil.push(`prøven målte aldri STOPP = ${STOPP}`);
else if (sendt.flekker !== STOPP) {
  feil.push(`STOPP = ${STOPP} gir bare ${sendt.flekker} adskilte flekker på 60 px`
    + ' — prikkene smelter sammen på en hjemskjerm');
}

const maskeUt = utenforSonen(await piksler(ikonSvg(STOPP, SPENN_MASKABLE), 512));
if (maskeUt !== 0) {
  feil.push(`maskable med spenn ${SPENN_MASKABLE} ligger `
    + `${(maskeUt * 100).toFixed(0)} % utenfor sikkerhetssonen — Android klipper den`);
}

if (feil.length) {
  console.error('\nPRØVEN FALT:');
  feil.forEach(f => console.error('  · ' + f));
  process.exitCode = 1;
} else {
  console.log(`\n✓ ${STOPP} stopp leses på 60 px, og maskable ligger innenfor sonen.`);
}

await browser.close();

/* ── OG SÅ SES DET, PÅ EN HJEMSKJERM ─────────────────────────────────────
 *
 * Tallene sier at fem er grensen. De sier ikke om tegningen er fin, eller om
 * den leses som «underveis» framfor «en strek». Det avgjøres av øyet, på en
 * mørk flate med naboer rundt — ikke av en SVG alene på hvit bakgrunn.
 */
const b2 = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p2 = await b2.newPage({ viewport: { width: 414, height: 420 }, deviceScaleFactor: 3 });

const rute = (svg, navn) => `
  <figure>
    <div class="ikon">${svg.replace('<svg ', '<svg class="i" ')}</div>
    <figcaption>${navn}</figcaption>
  </figure>`;

await p2.setContent(`<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:26px 18px;background:#1c1c20;font-family:-apple-system,system-ui,sans-serif;
       display:flex;gap:22px;justify-content:center;align-items:flex-start}
  figure{margin:0;text-align:center;width:72px}
  .ikon{width:60px;height:60px;margin:0 auto;border-radius:13.5px;overflow:hidden}
  .i{width:60px;height:60px;display:block}
  figcaption{color:#fff;font-size:11px;margin-top:6px;letter-spacing:.01em}
</style>
${[3,5,7].map(n => rute(ikonSvg(n, 0.84), n + ' stopp')).join('')}
${rute('<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">'
  + '<rect width="512" height="512" fill="#0a0806"/>'
  + '<path d="M186 110h140v46h-47v240h-46V156h-47z" fill="#f5b840"/></svg>', 'i dag')}
`);
await p2.screenshot({ path: 'scratchpad/ikon-hjemskjerm.png' });
await b2.close();
console.log('\nhjemskjerm-sammenligning: scratchpad/ikon-hjemskjerm.png');
