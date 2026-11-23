import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { knappLinjer, motSentrumTekst } from '../src/views/auto.js';
import { sentrumFor } from '../src/api/centre.js';

describe('hurtigvalg som sier seg selv (v1.218.282)', () => {
  it('før-bildet: «mot sentrum» sa ikke hvilket; nå byen', () => {
    expect(motSentrumTekst(sentrumFor({ lat: 60.318, lon: 5.354 }))).toBe('mot Bergen sentrum');      // Nesttun
    expect(motSentrumTekst(sentrumFor({ lat: 63.437, lon: 10.49 }))).toBe('mot Trondheim sentrum');    // Ranheim
    expect(motSentrumTekst(null)).toBe('mot sentrum');
  });
  it('linjene på knappen: høyst fire, resten som +N', () => {
    expect(knappLinjer(['74', '76', '71'])).toBe('74 76 71');
    expect(knappLinjer(['1', '2', '3', '4', '5', '6'])).toBe('1 2 3 4 +2');
  });
  it('før-bildet: linjene sto bare på valgt knapp, og tomme valg sto; nå på alle, og tomme står ikke', () => {
    const a = readFileSync('src/views/auto.js', 'utf8'), css = readFileSync('src/style/settings.css', 'utf8');
    expect(css).not.toMatch(/\.auto-fra-knapp:not\(\.valgt\) \.omr-linjer\{display:none\}/);
    expect(a).toMatch(/\.filter\(k => k === 'alle' \|\| k === 'hjem' \|\| linjerI\(k\)\.length > 0\);/);
    expect(a).toMatch(/k !== 'alle' && l\.length \? '<small class="omr-linjer">' \+ esc\(knappLinjer\(l\)\)/);
  });
});
