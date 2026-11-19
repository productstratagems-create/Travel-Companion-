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

import { nesteFokus } from '../src/ui/kartFokus.js';
describe('én knapp for hele reisen (v1.218.164)', () => {
  it('«hele» vises aldri; fokusknappen tar over etter et utsnitt', () => {
    expect(s).not.toMatch(/settVerktøy\(_selMap, 'hele', \{ skjult: false \}\)/);
    expect(s).toMatch(/_selFokus = 'utsnitt'; _tegnSelFokus\(\);/);
    expect(s).toMatch(/tekst: utsnitt \? 'hele reisen'/);
  });
  it('neste trykk etter et utsnitt er oversikt', () => {
    expect(nesteFokus('utsnitt')).toBe('oversikt');
  });
});

import { vi } from 'vitest';
describe('fokus fra avgangen selv (v1.218.165)', () => {
  it('stopp og spor kommer fra avgangens første etappe, ikke fra Rute-ruta', async () => {
    const { detaljFokusData } = await import('../src/ui/kartFokus.js');
    const dep = { _legs: [{ fromPlace: { latitude: 59.85, longitude: 10.83, quay: { stopPlace: { latitude: 59.851, longitude: 10.831 } } } }] };
    const d = detaljFokusData(dep, { lat: 59.84, lon: 10.82 }, [[59.845, 10.825]]);
    expect(d.stopp).toEqual({ lat: 59.851, lon: 10.831 });
    expect(d.plattform).toEqual({ lat: 59.85, lon: 10.83 });
    const { fokusRamme } = await import('../src/ui/kartFokus.js');
    // FØR-BILDET: uten stopp ga «vei» null — knappen gjorde ingenting.
    expect(fokusRamme('vei', { du: { lat: 1, lon: 1 }, stopp: null })).toBe(null);
    expect(fokusRamme('vei', d)).not.toBe(null);
  });
});
