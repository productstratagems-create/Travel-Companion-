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
