/**
 * Leses «rekker ikke» — uten en nabo å sammenligne med?
 *
 * Det er hele saken. `opacity:.4` sa «mindre viktig», ikke «denne rekker du
 * ikke», og en oppmerksom leser som studerte skjermbildene konkluderte med at
 * funksjonen ikke fantes. En forskjell du bare kan se ved å sammenligne med
 * naboen, er ingen forskjell når alle naboene er like — og når du har gått
 * for sent hjemmefra, ER alle radene missed.
 *
 * To tilstander måles derfor:
 *
 *   blandet   tre missed over to du rekker — slik skjermbildet så ut
 *   alle      fem missed, ingen nabo å sammenligne med
 *
 * Og to tall: at teksten er lesbar mot bakgrunnen (ΔE i Lab, fordi WCAG er
 * et luminansforhold og rødt på mørkt er en kulørforskjell — lært i
 * v1.175.0), og at raden fortsatt leses som NEDTONET mot en normal rad.
 */
import fs from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';

const css = ['tokens', 'base', 'components', 'board', 'theme-light']
  .map(f => { try { return fs.readFileSync('src/style/' + f + '.css', 'utf8'); } catch (_) { return ''; } })
  .join('\n');

const rad = (kode, mot, spor, min, kls, linje) => `
  <div class="dep-row ${kls}">
    <div class="dep-mins">${min}</div>
    <div class="dep-mid">
      <div class="dep-line"><span class="line-badge" style="background:#f5a000">${kode}</span>
        <span class="dep-dest">${mot}</span></div>
      ${linje}
    </div>
    <div class="dep-spor"><div class="sl">spor</div><div class="sn">${spor}</div></div>
  </div>`;

const MISSED = (k, m, min) => rad(k, m, '2', min, 'missed',
  '<div class="dep-reach missed">rekker ikke</div>');
const OK = (k, m, min, ord) => rad(k, m, '1', min, 'r-ok',
  '<div class="dep-reach r-ok">' + ord + '</div>');

const TILFELLER = [
  ['blandet', [MISSED('3', 'mot Stortinget', '5'), MISSED('74', 'mot Jernbanetorget', '8'),
    MISSED('3', 'mot Kolsås', '12'), OK('3', 'mot Stortinget', '20', 'gå senest 10:12'),
    OK('74', 'mot Jernbanetorget', '29', 'gå senest 10:21')]],
  ['alle missed', [MISSED('3', 'mot Stortinget', '5'), MISSED('74', 'mot Jernbanetorget', '8'),
    MISSED('3', 'mot Kolsås', '12')]],
];

const lab = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [f(r), f(g), f(b)];
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const k = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [k(X), k(Y), k(Z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const dE = (a, b) => { const [l1,a1,b1]=lab(a),[l2,a2,b2]=lab(b); return Math.hypot(l1-l2,a1-a2,b1-b2); };

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

async function kjør(tema) {
  const p = await b.newPage({ viewport: { width: 414, height: 620 }, deviceScaleFactor: 2 });
  const html = `<!doctype html><html data-theme="${tema}"><meta charset="utf-8">
    <style>${css}
      body{margin:0;padding:12px;background:var(--bg,#0a0e1a);
           font-family:-apple-system,system-ui,sans-serif}
      h3{color:var(--text-muted);font:600 10px/1 system-ui;letter-spacing:.14em;
         text-transform:uppercase;margin:14px 0 6px}
    </style>
    ${TILFELLER.map(([n, r]) => '<h3>' + n + '</h3><div id="dep-list">' + r.join('') + '</div>').join('')}`;
  await p.route('http://probe.local/', r => r.fulfill({ contentType: 'text/html', body: html }));
  await p.goto('http://probe.local/');
  await p.waitForTimeout(200);

  const m = await p.evaluate(() => {
    /* HELE BOKSEN, IKKE MIDTPUNKTET.
     *
     * `.dep-reach` er et blokkelement over hele kolonnen, så midtpunktet
     * ligger langt til høyre for den korte teksten «rekker ikke» — og et søk
     * ±45 px rundt det leter i tomrom. Første utgave rapporterte derfor ΔE
     * 0,0: bakgrunn mot bakgrunn, for en tekst som står tydelig i bildet. */
    const px = (el) => {
      const r = el.getBoundingClientRect();
      return { x0: Math.round(r.left), x1: Math.round(r.right),
        y: Math.round(r.top + r.height / 2), yTopp: Math.round(r.top) };
    };
    const ord = [...document.querySelectorAll('.dep-reach.missed')];
    const normal = document.querySelector('.dep-row.r-ok .dep-dest');
    const dempet = document.querySelector('.dep-row.missed .dep-dest');
    return {
      antall: ord.length,
      ordPunkt: ord.map(px),
      // Opasiteten slik den faktisk er regnet, ikke slik CSS-en ser ut.
      radOpasitet: getComputedStyle(document.querySelector('.dep-row.missed')).opacity,
      normalPunkt: normal ? px(normal) : null,
      dempetPunkt: dempet ? px(dempet) : null,
      bakgrunn: getComputedStyle(document.body).backgroundColor,
    };
  });

  const png = await p.screenshot({ fullPage: true });
  const piksler = await p.evaluate(async (b64) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    return { w: c.width, h: c.height, d: Array.from(d) };
  }, png.toString('base64'));
  await p.screenshot({ path: 'scratchpad/rad-' + tema + '.png', fullPage: true });
  await p.close();

  /* Teksten måles der den FAKTISK er tegnet: den mørkeste raden av piksler i
   * ordets boks er bokstavene, bakgrunnen er den lyseste. Å lese `color` fra
   * CSS ville svart på hva vi BA OM, ikke på hva som står på skjermen — og
   * radens opasitet ligger imellom. */
  /* INDEKSEN ER (y·bredde + x)·4, IKKE y·bredde + x·4.
   *
   * Første utgave hadde `* 4` bare på x-leddet i `bak()`, og leste dermed et
   * helt annet sted i bildet. Den rapporterte ΔE 0,0 — altså at teksten var
   * identisk med bakgrunnen — for en tekst som står tydelig i skjermbildet.
   * Måleinstrumentet, ikke tegningen. */
  const at = (x, y) => {
    const i = (y * piksler.w + x) * 4;
    return [piksler.d[i], piksler.d[i + 1], piksler.d[i + 2]];
  };
  const prøv = (pt) => {
    let best = null;
    for (let dy = -8; dy <= 8; dy++) {
      for (let x = pt.x0 * 2; x < pt.x1 * 2; x++) {
        const p3 = at(x, pt.y * 2 + dy);
        if (p3[0] == null) continue;
        // Mest kulør mot de andre kanalene = mest bokstav, ikke mest lys:
        // i lys modus er bakgrunnen lysere enn teksten.
        const r = Math.abs(p3[0] - (p3[1] + p3[2]) / 2);
        if (!best || r > best.r) best = { r, px: p3 };
      }
    }
    return best && best.px;
  };
  // Bakgrunnen: helt til høyre i den samme boksen, der ingen bokstav står.
  const bak = (pt) => at(pt.x1 * 2 - 6, pt.y * 2);
  const pt = m.ordPunkt[0];
  if (process.env.DEBUG) {
    console.log('  [dbg] bilde ' + piksler.w + '×' + piksler.h
      + '  punkt ' + JSON.stringify(pt)
      + '  tekst ' + JSON.stringify(prøv(pt))
      + '  bak ' + JSON.stringify(bak(pt)));
  }
  return { ...m, tekst: m.ordPunkt.length ? prøv(pt) : null,
    bakPx: m.ordPunkt.length ? bak(pt) : null };
}

const mørk = await kjør('dark');
const lys = await kjør('light');
await b.close();

const feil = [];
[['mørk', mørk], ['lys', lys]].forEach(([navn, m]) => {
  const d = m.tekst && m.bakPx ? dE(m.tekst, m.bakPx) : 0;
  console.log(navn.padEnd(6) + ' «rekker ikke» ×' + m.antall
    + '   radopasitet ' + m.radOpasitet
    + '   ΔE mot bakgrunn ' + d.toFixed(1));
  if (m.antall < 4) feil.push(navn + ': fant bare ' + m.antall + ' «rekker ikke» — fiksturen måler ikke begge tilfellene');
  if (d < 25) feil.push(navn + ': teksten skiller seg bare ΔE ' + d.toFixed(1) + ' fra bakgrunnen');
  // Og raden skal FORTSATT være nedtonet: ordene er ikke en forfremmelse.
  if (Number(m.radOpasitet) >= 1) feil.push(navn + ': missed-raden er ikke lenger nedtonet');
  if (Number(m.radOpasitet) < 0.45) feil.push(navn + ': raden er så nedtonet at ordene ikke kan leses');
});

if (feil.length) { console.error('\nPRØVEN FALT:'); feil.forEach(f => console.error('  · ' + f)); process.exitCode = 1; }
else console.log('\n✓ ordene står på hver missed-rad, lesbare, og raden er fortsatt nedtonet.');
console.log('\nbilder: scratchpad/rad-dark.png · scratchpad/rad-light.png');
