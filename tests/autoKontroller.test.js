// Skjermbilde 19:31: «▸ VIS KART · REISEALTERNATIVER · SORTER [T-bane først][Andre busser først]»
// sto mellom stopphodet og linjekortene. Bestilt: «putte knapper og forklarende bort fra det røde
// feltet så linjekortene blir det viktigste». Kontrollene står nå på linja med «du er ved».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sorterKnappTekst } from '../src/views/auto.js';

const html = readFileSync('index.html', 'utf8');
const src = readFileSync('src/views/auto.js', 'utf8').replace(/\/\/[^\n]*/g, '');

describe('kart og sortering ved «du er ved»', () => {
  it('sorteringsknappen sier valget som gjelder', () => {
    expect(sorterKnappTekst({ asc: 'T-bane', desc: 'Buss' }, false)).toBe('T-bane først ⇅');
    expect(sorterKnappTekst({ asc: 'T-bane', desc: 'Buss' }, true)).toBe('Buss først ⇅');
  });
  it('kontrollene står før #auto-where, ikke over lista', () => {
    const ctl = html.indexOf('id="auto-ctl"');
    expect(ctl).toBeGreaterThan(-1);
    expect(ctl).toBeLessThan(html.indexOf('id="auto-where"'));
  });
  it('den røde blokka er foldet bort: «vis kart», «skjul kart» og segmentbryteren', () => {
    expect(src).toMatch(/if \(vis\) vis\.hidden = true;/);
    expect(src).toMatch(/if \(skjul\) skjul\.hidden = true;/);
    const sort = src.slice(src.indexOf('function _showSort('));
    expect(sort.slice(0, 1500)).toMatch(/el\.style\.display = 'none';/);
  });
});

describe('«du er ved» rett over navnet (v1.218.30)', () => {
  const css = readFileSync('src/style/settings.css', 'utf8');
  it('navneknappen fyller bredden ved siden av knappene, ikke hele (som dyttet den under)', () => {
    const regel = css.slice(css.indexOf('#v-auto button.auto-stop {'));
    expect(regel.slice(0, regel.indexOf('}'))).toMatch(/width:\s*auto;/);
  });
  it('faktaene står under navnet, utenfor knappen, og starter under kart/sortering', async () => {
    const { stopHeadHtml } = await import('../src/views/auto.js');
    const html = stopHeadHtml({ name: 'Lofsrud' }, 1, false, { walkDist: 229, walkMins: 5, pos: 'ok' });
    expect(html).toMatch(/<\/button><div class="auto-stop-under">/);
    expect(css).toMatch(/#v-auto \.auto-stop-under \{ clear: right;/);
  });
});

describe('stoppnavnet deles aldri midt i et ord (v1.218.31)', () => {
  const css = readFileSync('src/style/settings.css', 'utf8');
  const regel = sel => { const i = css.lastIndexOf(sel + ' {'); return css.slice(i, css.indexOf('}', i)); };
  it('«Mortensru / d»: brytes bare mellom ord, krymper ikke under det lengste', () => {
    const r = regel('#v-auto .auto-stop-label');
    expect(r).not.toMatch(/overflow-wrap:\s*anywhere/);
    expect(r).not.toMatch(/word-break:\s*break-all/);
    // v1.218.32: én linje, og skriften krymper i stedet (tilpassNavn).
    expect(r).toMatch(/white-space:\s*nowrap/);
  });
});

describe('holdeplassnavnet som på tavla, krympet i stedet for brutt (v1.218.32)', () => {
  const css = readFileSync('src/style/settings.css', 'utf8');
  const tavla = readFileSync('src/style/board.css', 'utf8');
  const regel = (c, sel) => { const i = c.lastIndexOf(sel + ' {') >= 0 ? c.lastIndexOf(sel + ' {') : c.indexOf(sel + '{'); return c.slice(i, c.indexOf('}', i)); };
  it('samme font, størrelse og farge som .station-name', () => {
    const a = regel(css, '#v-auto .auto-stop-label'), b = regel(tavla, '.station-name');
    for (const f of ['font-family', 'font-size', 'color']) {
      const v = x => (x.match(new RegExp(f + ':\\s*([^;]+)')) || [])[1].replace(/\s+/g, '');
      expect(v(a)).toBe(v(b));
    }
  });
  it('«7 ▾» krymper aldri og går ikke ned på neste linje', () => {
    expect(css).toMatch(/#v-auto \.auto-stop-name \{ flex-wrap: nowrap; \}/);
    expect(css).toMatch(/#v-auto \.auto-stop-more \{ flex-shrink: 0; \}/);
  });
});
