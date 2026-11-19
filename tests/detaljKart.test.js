// v1.218.163: «Kartet i avgangsdetaljer forsvinner bak knapperaden. Og kartet bør være likt som for Rute-siden.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const s = readFileSync('src/views/selected.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
describe('avgangsdetalj-kartet', () => {
  it('står over svaret, ikke under knapperaden', () => {
    const v = html.slice(html.indexOf('id="v-selected"'), html.indexOf('id="v-track"'));
    expect(v.indexOf('id="sel-map-wrap"')).toBeLessThan(v.indexOf('id="s-content"'));
  });
  it('har Rutes knapper: kvadrat · bred · full, uten + og −, med fokus', () => {
    expect(s).toMatch(/syklus: RUTE_KART_FORMER, start: kartForm\(DETALJ_FORM_KEY\)/);
    expect(s).toMatch(/settVerktøy\(_selMap, 'inn', \{ skjult: true \}\);\s*settVerktøy\(_selMap, 'ut', \{ skjult: true \}\);/);
    expect(s).toMatch(/leggTilVerktøy\(_selMap, 'fokus'/);
  });
  it('samme størrelser som Rute', () => {
    expect(readFileSync('src/style/selected.css', 'utf8')).toMatch(/#sel-map\.form-bred\{aspect-ratio:16 \/ 9\}/);
  });
});
