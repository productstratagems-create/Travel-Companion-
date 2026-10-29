#!/usr/bin/env node
/**
 * Fire ikoner, én tegning.
 *
 *   npm run icons
 *
 * Før dette var de fire PNG-ene håndlagde og bandt ingenting:
 *
 *   apple-touch-icon.png   499 B   icon-192.png            515 B
 *   icon-512.png          1549 B   icon-maskable-512.png  1624 B
 *
 * De kunne drive fra hverandre i stillhet, og `icon-maskable-512` er den som
 * ville gjort det usett — ingen ser den uten en Android med rund maske.
 *
 * NÅ ER DET ÉN TEGNING. `_ikon-tegning.mjs` er den; `assets/ikon.svg` er
 * dens avtrykk, sjekket inn så en leser kan se tegningen uten å kjøre noe;
 * og de fire PNG-ene er rendret av den. Maskable er ikke en egen tegning —
 * det er den samme med padding regnet av sikkerhetssonen.
 *
 * Playwright, som `make-shots.mjs` alt bruker: ingen ny avhengighet, og
 * nettleseren er det eneste i dette prosjektet som kan rastre en SVG.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { ikonSvg, BAKGRUNN, SPENN_ANY, SPENN_MASKABLE, STOPP }
  from './_ikon-tegning.mjs';

const ROT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_FIL = path.join(ROT, 'assets/ikon.svg');
const UT = path.join(ROT, 'public/icons');

/** De fire, og hvorfor hver av dem finnes. */
const FILER = [
  { navn: 'icon-192.png',           px: 192, spenn: SPENN_ANY },      // manifest «any» + favicon
  { navn: 'icon-512.png',           px: 512, spenn: SPENN_ANY },      // manifest «any», installasjonsdialogen
  { navn: 'icon-maskable-512.png',  px: 512, spenn: SPENN_MASKABLE }, // Androids runde maske
  { navn: 'apple-touch-icon.png',   px: 180, spenn: SPENN_ANY },      // iOS' hjemskjerm
];

async function main() {
  fs.mkdirSync(path.dirname(SVG_FIL), { recursive: true });
  fs.mkdirSync(UT, { recursive: true });

  // Avtrykket først, så fila og PNG-ene aldri kan være av ulik alder.
  fs.writeFileSync(SVG_FIL, ikonSvg(STOPP, SPENN_ANY) + '\n');

  const nettleser = await pw.chromium.launch({
    executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'],
  });
  try {
    for (const f of FILER) {
      const side = await nettleser.newPage({
        viewport: { width: f.px, height: f.px }, deviceScaleFactor: 1,
      });
      await side.setContent(
        `<style>html,body{margin:0;background:${BAKGRUNN}}svg{display:block}</style>`
        + ikonSvg(STOPP, f.spenn).replace(/width="512" height="512"/,
                                          `width="${f.px}" height="${f.px}"`));
      await side.screenshot({ path: path.join(UT, f.navn), omitBackground: false });
      await side.close();
      console.log(`${f.navn.padEnd(24)} ${f.px}×${f.px}`);
    }
  } finally { await nettleser.close(); }
  console.log('assets/ikon.svg skrevet av samme tegning.');
}

main().catch(e => { console.error(e); process.exit(1); });
