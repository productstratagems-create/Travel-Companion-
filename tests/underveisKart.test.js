// v1.218.154: «Underveis-siden kartet må gjøres likt som kartet for Rute-siden.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kartForm, settKartForm } from '../src/ui/kartVerktoy.js';

const t = readFileSync('src/views/track.js', 'utf8');
describe('formen, én regel for begge kartene', () => {
  it('bred som standard, kvadrat huskes, fullskjerm aldri; hver sin nøkkel', () => {
    expect(kartForm('t.underveisKartForm')).toBe('bred');
    settKartForm('t.underveisKartForm', 'kvadrat');
    expect(kartForm('t.underveisKartForm')).toBe('kvadrat');
    settKartForm('t.underveisKartForm', 'full');
    expect(kartForm('t.underveisKartForm')).toBe('kvadrat');
    expect(kartForm('t.ruteKartForm')).toBe('bred');
    settKartForm('t.underveisKartForm', 'bred');
  });
  it('Rute bruker samme regel', () => {
    expect(readFileSync('src/views/board.js', 'utf8')).toMatch(/export function ruteKartForm\(\) \{ return kartForm\(RUTE_FORM_KEY\); \}/);
  });
});

describe('Underveis har Rutes knapper', () => {
  it('kvadrat · bred · full', () => {
    expect(t).toMatch(/syklus: RUTE_KART_FORMER, start: kartForm\(UNDERVEIS_FORM_KEY\)/);
  });
  it('uten + og −', () => {
    expect(t).toMatch(/settVerktøy\(_tMap, 'inn', \{ skjult: true \}\);\s*settVerktøy\(_tMap, 'ut', \{ skjult: true \}\);/);
  });
  it('fokusknappen', () => {
    expect(t).toMatch(/leggTilVerktøy\(_tMap, 'fokus'/);
  });
  it('utsnittet du har flyttet står når kartet bygges på nytt', () => {
    expect(t).toMatch(/if \(holdt\) \{ _tMap\.setView\(holdt\.c, holdt\.z, \{ animate: false \}\); _tUserMoved = true; \}/);
  });
});
