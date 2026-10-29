/**
 * Leses busstreken mot det kartet den faktisk ligger på?
 *
 * Sandkassen når ikke flisserveren, så bakgrunnen er DET RAPPORTERTE
 * KARTUTSNITTET SELV, klippet ut av skjermbildet. Ekte kartfarger, ekte
 * tilfelle — og det er den eneste bakgrunnen som kan svare på spørsmålet,
 * siden en syntetisk flate ville gjort målingen til en påstand om min egen
 * valgte gråtone.
 *
 * TO TALL, OG DE MÅLER TO ULIKE TING:
 *
 *   kontrast   blant pikslene der blekk FAKTISK landet: WCAG-forholdet mot
 *              den bakgrunnspikselen som lå der. En halvgjennomsiktig strek
 *              blander seg med kartet, så dette fanger `opacity` og kasingen.
 *   dekning    hvor stor del av korridorens lengde som bærer blekk i det hele
 *              tatt. Det er `dashArray` og ingenting annet, og det er grunnen
 *              til at kontrast alene ville sagt at dagens strek er i orden.
 *
 * `1 7` maler en åttedel av veien. En strek med god kontrast på tolv prosent
 * av lengden er ikke en lesbar strek — den er en punktrekke med fin kontrast.
 *
 *   node scratchpad/korridorProbe.mjs
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { corridorStyle } from '../src/ui/korridor.js';

const SKJERMBILDE = '/root/.claude/uploads/18688362-dda1-5039-af32-40c4f36222a7/fd0ea7c2-image.png';

/* Kartflata i skjermbildet (1170×2532), lest av på bildet. */
const KART = { x: 48, y: 492, w: 1074, h: 668 };

/* Buss 74s korridor slik den står på det rapporterte kartet: avlest langs den
 * røde streken, i kartflatas egne piksler. Den krysser skog, vei, bebyggelse
 * OG vann — og det er nettopp blandingen som gjør utsnittet verdt å måle. */
const KORRIDOR = [
  [768, 600], [757, 558], [690, 497], [655, 489], [640, 440],
  [613, 360], [545, 352], [520, 345], [470, 250], [416, 207],
  [391, 205], [393, 180], [455, 178], [432, 148], [360, 145],
  [310, 128], [285, 120],
];

/* WCAG VAR FEIL INSTRUMENT, og det tok tre forsøk å se.
 *
 * Første gate var «WCAG ≥ 3,0». Den falt for den nye streken OG for en strek
 * som er åpenbart synlig i bildet — så instrumentet, ikke tegningen, var
 * galt. WCAG-kontrast er et LUMINANS-forhold, bygd for svart tekst på hvitt.
 * RUT-rød #e60000 har luminans 0,046; et mørkt kart ligger rundt 0,02. Ingen
 * strekbredde, ingen kasing og ingen dekkevne kan flytte det forholdet over
 * 3 — rødt er ikke lysere enn mørk grå, det er RØDERE.
 *
 * Det øyet skiller her er kulør og metning. Målet må derfor være en
 * perseptuell fargeavstand, ikke et lysforhold: ΔE i CIE Lab.
 *
 *   ~2,3   akkurat merkbar forskjell
 *   ~25    to farger ingen forveksler
 *
 * WCAG rapporteres fortsatt, som det tallet det er, slik at kasingens bidrag
 * er synlig. Den er bare ikke porten.
 */
const GULV_DE = 25;        // trasé: en strek du ikke er i tvil om
const GULV_DE_GJETT = 15;  // akkord: svakere enn et svar, men ikke uleselig

const lum = ([r, g, b]) => {
  const k = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
};
const wcag = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** sRGB → CIE Lab, D65. */
function lab([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = (0.2126 * R + 0.7152 * G + 0.0722 * B);
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
/** CIE76. Grov, og grov nok: vi spør om «kan de skilles», ikke om nyanser. */
const deltaE = (a, b) => {
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};

const b64 = fs.readFileSync(SKJERMBILDE).toString('base64');

const nettleser = await pw.chromium.launch({
  executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'],
});
const side = await nettleser.newPage({
  viewport: { width: KART.w, height: KART.h }, deviceScaleFactor: 1,
});

/** Tegner kartutsnittet, og korridoren oppå det om en stil er gitt. */
async function tegn(stil, medKasing) {
  const d = 'M' + KORRIDOR.map(p => p.join(' ')).join(' L');
  const strek = (s, ekstra = '') =>
    `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.weight}"`
    + ` stroke-opacity="${s.opacity}" stroke-linecap="${s.lineCap || 'butt'}"`
    + ` stroke-linejoin="round"`
    + (s.dashArray ? ` stroke-dasharray="${s.dashArray}"` : '') + ekstra + '/>';
  // Kasingen er drawRoute sin: --map-ink, weight + 3, opacity 0.35, heltrukken.
  const kasing = stil && medKasing
    ? `<path d="${d}" fill="none" stroke="#05070d" stroke-width="${stil.weight + 3}"`
      + ` stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  await side.setContent(`<style>
      html,body{margin:0;overflow:hidden;background:#000}
      #k{position:absolute;left:${-KART.x}px;top:${-KART.y}px}
      svg{position:absolute;left:0;top:0}
    </style>
    <img id="k" src="data:image/png;base64,${b64}">
    ${stil ? `<svg width="${KART.w}" height="${KART.h}">${kasing}${strek(stil)}</svg>` : ''}`);
  await side.waitForFunction(() => {
    const i = document.getElementById('k');
    return i && i.complete && i.naturalWidth > 0;
  });
  return side.evaluate(async ({ w, h }) => {
    const bl = await new Promise(r => {
      const i = document.getElementById('k');
      const c = document.createElement('canvas');
      c.width = i.naturalWidth; c.height = i.naturalHeight;
      c.getContext('2d').drawImage(i, 0, 0);
      r(null);
    });
    return null;
  }, { w: KART.w, h: KART.h }).then(() => side.screenshot());
}

/** Piksler ut av en PNG-buffer, via nettleserens egen dekoder. */
async function piksler(png) {
  return side.evaluate(async (b64png) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64png; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, d: Array.from(d) };
  }, png.toString('base64'));
}

const px = (p, x, y) => {
  const i = (Math.round(y) * p.w + Math.round(x)) * 4;
  return [p.d[i], p.d[i + 1], p.d[i + 2]];
};

/**
 * Prøvepunkter jevnt langs korridoren, hvert med sin NORMAL.
 *
 * Normalen trengs for kasingen: det den gjør er å gi streken en KANT, og en
 * kant måles på tvers av streken — ikke mot det som lå under den.
 */
function langs(steg = 1) {
  const ut = [];
  for (let i = 1; i < KORRIDOR.length; i++) {
    const [x0, y0] = KORRIDOR[i - 1], [x1, y1] = KORRIDOR[i];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let t = 0; t < len; t += steg) {
      ut.push([x0 + (x1 - x0) * (t / len), y0 + (y1 - y0) * (t / len), nx, ny]);
    }
  }
  return ut;
}

/** Avstand i RGB, bare som et mål på «nærmere denne fargen». */
const avst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* TO MÅLEFEIL, BEGGE FANGET AV AT TALLET VAR URIMELIG.
 *
 * 1. «Dekning 100 %» for en stiplet strek er umulig. Blekk ble målt som «noe
 *    er endret», og KASINGEN er heltrukken — så den fylte hver eneste prøve
 *    og rapporterte full dekning for en strek med luft i. Blekk må derfor
 *    bety «flyttet seg MOT linjefargen», ikke «endret».
 *
 * 2. «Laveste kontrast 1,01» for en strek som er godt synlig. Minimum over
 *    alle malte piksler plukker ett antialiasert endepiksel i en dash, der
 *    malingen er nær null. Et enkelt kantpiksel er ikke det du leser streken
 *    med. Derfor 10. persentil: det tåler kantene og faller fortsatt om
 *    selve streken blir svak.
 *
 * Begge ville rapportert grønt for en strek som er feil, og begge ble funnet
 * ved å lese tallet framfor å tro på det.
 */
function mål(medStrek, bare, farge, bredde) {
  const pts = langs();
  const kontraster = [];
  for (const [x, y, nx, ny] of pts) {
    const a = px(medStrek, x, y), b = px(bare, x, y);
    // Nærmere linjefargen enn bakgrunnen var: da landet det farge her, og
    // ikke bare kasingens mørke.
    if (avst(a, farge) > avst(b, farge) - 20) continue;
    /* KANTEN. Nabopikselen rett ut til siden, like utenfor selve streken.
     *
     * Dette er den ENESTE målingen som kan si noe om kasingen, og den
     * tredje feilen instrumentet gjorde: ΔE mot det som lå UNDER streken
     * svarer på «ser du fargen», ikke på «har streken en kant». Uten kanten
     * som egen måling overlevde kasing-mutanten prøven — og rapporterte til
     * og med litt HØYERE ΔE uten kasing, fordi kasingen mørkner akkurat de
     * antialiaserte randpikslene målingen sammenlignet.
     *
     * Begge sider måles, og den SVAKESTE teller: en strek som har kant mot
     * skogen og ingen mot veien er en strek som forsvinner i veien. */
    const d = bredde / 2 + 2;
    const kant = Math.min(
      deltaE(a, px(medStrek, x + nx * d, y + ny * d)),
      deltaE(a, px(medStrek, x - nx * d, y - ny * d)));
    kontraster.push({ de: deltaE(a, b), w: wcag(a, b), kant });
  }
  const pst = (felt, p = 0.1) => {
    const v = kontraster.map(k => k[felt]).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length * p)] : 0;
  };
  return { dekning: kontraster.length / pts.length, de: pst('de'), wcag: pst('w'),
    kant: pst('kant'), n: pts.length };
}

const RØD = '#e60000';   // RUTs bussfarge, som på skjermbildet

const I_DAG = { color: RØD, weight: 2, opacity: 0.55, dashArray: '1 7' };
const ETTER = corridorStyle('bus', RØD);
const ETTER_GJETT = corridorStyle('bus', RØD, { exact: false });

const bare = await piksler(await tegn(null, false));

const rader = [
  ['i dag   (rå L.polyline, ingen kasing)', I_DAG, false],
  ['etter   (drawRoute, med kasing)', ETTER, true],
  ['etter   (akkord — gjetning)', ETTER_GJETT, true],
];

console.log('bakgrunn: det rapporterte kartutsnittet, ' + KART.w + '×' + KART.h);
console.log('korridor: ' + langs().length + ' prøvepunkter langs buss 74\n');

const målt = [];
for (const [navn, stil, kasing] of rader) {
  const m = mål(await piksler(await tegn(stil, kasing)), bare, [230, 0, 0], stil.weight);
  målt.push({ navn, ...m, stil });
  console.log(navn.padEnd(40)
    + 'dekning ' + (m.dekning * 100).toFixed(0).padStart(3) + ' %'
    + '   ΔE ' + m.de.toFixed(1).padStart(5)
    + '   kant ' + m.kant.toFixed(1).padStart(5)
    + '   (wcag ' + m.wcag.toFixed(2) + ')');
}

/* ── OG SÅ SES DET ──────────────────────────────────────────────────────── */
await side.setViewportSize({ width: KART.w, height: KART.h * 2 + 12 });
const d = 'M' + KORRIDOR.map(p => p.join(' ')).join(' L');
const lag = (s, kasing, dy) => `<g transform="translate(0 ${dy})">`
  + (kasing ? `<path d="${d}" fill="none" stroke="#05070d" stroke-width="${s.weight + 3}" stroke-opacity="0.35" stroke-linecap="round" stroke-linejoin="round"/>` : '')
  + `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.weight}"`
  + ` stroke-opacity="${s.opacity}" stroke-linecap="${s.lineCap || 'butt'}" stroke-linejoin="round"`
  + (s.dashArray ? ` stroke-dasharray="${s.dashArray}"` : '') + '/></g>';
await side.setContent(`<style>
    html,body{margin:0;background:#000;overflow:hidden}
    .r{position:relative;width:${KART.w}px;height:${KART.h}px;overflow:hidden}
    .r+.r{margin-top:12px}
    img{position:absolute;left:${-KART.x}px;top:${-KART.y}px}
    svg{position:absolute;left:0;top:0}
    b{position:absolute;right:14px;top:12px;z-index:5;color:#fff;background:#000c;
      padding:6px 12px;border-radius:7px;font:600 15px system-ui;letter-spacing:.02em}
  </style>
  <div class="r"><img src="data:image/png;base64,${b64}">
    <svg width="${KART.w}" height="${KART.h}">${lag(I_DAG, false, 0)}</svg>
    <b>i dag — dekning ${(målt[0].dekning * 100).toFixed(0)} %</b></div>
  <div class="r"><img src="data:image/png;base64,${b64}">
    <svg width="${KART.w}" height="${KART.h}">${lag(ETTER, true, 0)}</svg>
    <b>etter — dekning ${(målt[1].dekning * 100).toFixed(0)} %</b></div>`);
await side.waitForTimeout(250);
await side.screenshot({ path: 'scratchpad/korridor-for-etter.png' });
await nettleser.close();

/* ── PORTEN ───────────────────────────────────────────────────────────────
 *
 * Linjene over er en rapport, og en rapport fanger ingen mutant: den leses av
 * noen som alt vet hva den skal si. Dette er påstanden, om stilen som sendes.
 */
const feil = [];
const etter = målt[1], gjett = målt[2], iDag = målt[0];

if (etter.de < GULV_DE) {
  feil.push(`busstreken skiller seg bare ΔE ${etter.de.toFixed(1)} fra kartet — under ${GULV_DE}`);
}
if (gjett.de < GULV_DE_GJETT) {
  feil.push(`akkord-streken skiller seg bare ΔE ${gjett.de.toFixed(1)} fra kartet — en gjetning`
    + ' skal være svakere enn et svar, ikke uleselig');
}
if (gjett.de >= etter.de) {
  feil.push('akkorden bruker like mye blekk som traséen — gjetningen sier ikke fra');
}
if (etter.dekning < 0.5) {
  feil.push(`busstreken bærer blekk på bare ${(etter.dekning * 100).toFixed(0)} % av lengden`);
}
/* KASINGEN HAR INGEN PORT HER, OG DET ER ET FUNN — ikke en forglemmelse.
 *
 * `kant` måler ΔE mot nabopikselen like utenfor streken, som er den eneste
 * målingen som i det hele tatt kan handle om en kasing. Den rapporterer
 *
 *     med kasing 34,1     uten kasing 29,7
 *
 * En ekte forbedring, og ikke en avgjørende en: begge ligger godt over det
 * som er synlig. Jeg prøvde deretter 1. persentil, for å treffe de få
 * stedene streken løper langs noe lyst — der en kasing faktisk tjener til
 * noe — og fikk 2,1 MED kasing, fordi prøvepunktene i endene av hver dash
 * har nabopiksler som fortsatt er strek. Målingen var forurenset, ikke
 * streng.
 *
 * Da stoppet jeg. Å justere instrumentet en fjerde gang til det sier det jeg
 * vil, er nettopp feilen dette repoet har gått i flest ganger.
 *
 * Kasingen blir værende av en annen og tilstrekkelig grunn: hvert eneste
 * andre kart i appen tegner korridorer gjennom `drawRoute`, og to måter å
 * tegne det samme på er kodebasens signaturfeil. Den påstanden er en
 * TOPOLOGI-påstand, og den bindes i `tests/korridor.test.js` der den hører
 * hjemme — ikke av en pikselmåling som ikke kan bære den.
 */
if (etter.dekning <= iDag.dekning * 2) {
  feil.push('busstreken er ikke vesentlig tettere enn den som ble rapportert som uleselig');
}

if (feil.length) {
  console.error('\nPRØVEN FALT:');
  feil.forEach(f => console.error('  · ' + f));
  process.exitCode = 1;
} else {
  console.log(`\n✓ dekning ${(iDag.dekning * 100).toFixed(0)} % → `
    + `${(etter.dekning * 100).toFixed(0)} %, ΔE ${iDag.de.toFixed(1)} → `
    + `${etter.de.toFixed(1)} (gulv ${GULV_DE}), kant ${etter.kant.toFixed(1)}, `
    + `akkorden ${gjett.de.toFixed(1)}.`);
}
console.log('\nfør/etter: scratchpad/korridor-for-etter.png');
