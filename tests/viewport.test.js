/**
 * Toppen forsvinner ikke under nettleserlinja.
 *
 * Rapportert med skjermbilde: stasjonsnavnet på tavla klippet på midten,
 * delvis under Safaris adressefelt.
 *
 * Feilen var kjent HER og halvt rettet. board.css skrev den ned da tavla ble
 * fikset: «On iOS that value reports the height with the browser chrome
 * collapsed — larger than what is visible — so the list came out too tall,
 * the document grew past the visual viewport, and the page scrolled the
 * header away. 100dvh exists for exactly that problem.»
 *
 * Fiksen nådde aldri lenger enn den ene blokka. `base.css` holdt `100vh` for
 * alle de andre skjermene, og `map-open` holdt den for tavla med kartet ute.
 *
 * FEILFORMEN ER IKKE EN GAL VERDI — det er en HALV UTRULLING, der rettelsen
 * ble gjort ett sted og de andre ble glemt. Den testen som fanger det er en
 * som binder dem, ikke en som sjekker ett tall.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const DIR = 'src/style';
const files = fs.readdirSync(DIR).filter(f => f.endsWith('.css'));

/** Every `…:100vh`, with whatever follows it inside the same rule. */
function viewportHeights(src) {
  const out = [];
  for (const m of src.matchAll(/[\w-]+\s*:\s*100vh/g)) {
    const end = src.indexOf('}', m.index);
    out.push({ decl: m[0], rest: src.slice(m.index + m[0].length, end === -1 ? undefined : end) });
  }
  return out;
}

describe('100vh har alltid 100dvh etter seg', () => {
  it('i hver eneste stilfil', () => {
    const missing = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const v of viewportHeights(src)) {
        if (!v.rest.includes('100dvh')) missing.push(f + ': ' + v.decl);
      }
    }
    expect(missing, 'uten dvh-følgesvenn: ' + missing.join(', ')).toEqual([]);
  });

  // The helper must be able to SEE a missing one, or the case above passes
  // for the wrong reason.
  it('og testen ser en som mangler', () => {
    const broken = 'html,body{ min-height:100vh; overflow:hidden; }';
    expect(viewportHeights(broken)[0].rest).not.toContain('100dvh');
    const fixed = 'html,body{ min-height:100vh; min-height:100dvh; }';
    expect(viewportHeights(fixed)[0].rest).toContain('100dvh');
  });

  // Order matters: the fallback has to come FIRST, or a browser without dvh
  // support never sees it.
  it('med vh som fallback først, ikke etter', () => {
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      for (const m of src.matchAll(/([\w-]+)\s*:\s*100dvh/g)) {
        const before = src.slice(Math.max(0, m.index - 200), m.index);
        expect(before, f + ': ' + m[0] + ' uten fallback foran')
          .toMatch(new RegExp(m[1] + '\\s*:\\s*100vh'));
      }
    }
  });

  // The two places the fix had not reached, named so a future removal is
  // visible as a removal rather than as a tidy-up.
  it('dekker de to stedene fiksen ikke hadde nådd', () => {
    const base = fs.readFileSync(path.join(DIR, 'base.css'), 'utf8');
    expect(base).toMatch(/min-height:100vh;\s*\n\s*min-height:100dvh;/);
    const board = fs.readFileSync(path.join(DIR, 'board.css'), 'utf8');
    const mapOpen = board.slice(board.indexOf('html.view-board.map-open,'));
    expect(mapOpen.slice(0, 400)).toMatch(/min-height:100dvh/);
  });
});
