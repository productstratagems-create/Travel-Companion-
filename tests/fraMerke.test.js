// v1.218.225: «Fra-stasjon er ikke tydelig nok visualisert på kortene.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { tavleRadHtml, fraMerke } from '../src/ui/tavleRad.js';
const rad = x => tavleRadHtml({ d: { frontText: 'Helsfyr', lines: [{ code: '76', mode: 'bus' }] }, ms: Date.now() + 12 * 60_000, rekker: true, ...x }, Date.now(), 0);
describe('fra-stoppet på hver rad', () => {
  it('også fra stoppet ditt (før: bare nabostopp)', () => {
    // v1.218.244: navnet står; gangtiden står i overskriften, ikke på raden.
    const h = rad({ call: {}, herNavn: 'Mortensrud', gang: 12 });
    expect(h).toMatch(/at-fra-stopp[\s\S]*fra <b>Mortensrud<\/b>/); expect(h).not.toMatch(/12 min å gå/);
    expect(rad({ call: { _fra: { name: 'Stenbråten' } }, herNavn: 'Mortensrud', gang: 10 })).toMatch(/fra <b>Stenbråten<\/b> · 10 min å gå/);
  });
  it('nabostoppet vinner over stoppet ditt', () => {
    expect(rad({ call: { _fra: { name: 'Mortensrud T' } }, herNavn: 'Mortensrud' })).toMatch(/fra <b>Mortensrud T<\/b>/);
  });
  it('kombinasjonsraden bruker samme merke', () => {
    expect(fraMerke('Mortensrud T', 14)).toMatch(/fra-ikon[\s\S]*fra <b>Mortensrud T<\/b> · 14 min å gå/);
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/\+ fraMerke\(r\.fra, r\.gangMin\)/);
  });
});
