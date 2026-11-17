// v1.218.106: «Knappene legger seg over kompasset.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { somRad, medLøft, tett, KOMPASS_PLASS } from '../src/ui/kartVerktoy.js';

describe('søylen regner med kompasset', () => {
  it('tavlekartet fra skjermbildet (235 px, 4 knapper): rad med kompass, søyle uten', () => {
    expect(KOMPASS_PLASS).toBe(56);
    // v1.218.110: med kompasset på samme side får søylen 179 px — tett, ikke rad.
    expect(somRad(4, 235, true)).toBe(false);
    expect(tett(4, 235, true)).toBe(true);
    expect(somRad(4, 200, true)).toBe(true);
    expect(somRad(4, 235, false)).toBe(false);
  });
  it('høyt kart: søyle også med kompass', () => {
    expect(somRad(4, 382, true)).toBe(false);
    expect(medLøft(4, 382, true)).toBe(true);
  });
  it('tilpassForm leser om kartet har kompass, og kompasset kaller tilpassForm', () => {
    const src = readFileSync('src/ui/kartVerktoy.js', 'utf8');
    expect(src).toMatch(/somRad\(n, h, øverst\)/);
    // Bare et SYNLIG kompass tar plass: det står skjult til kartet er rotert.
    expect(src).toMatch(/const øverst = sammeSide && !!\(v\.øverst && \[\.\.\.v\.øverst\.values\(\)\]\.some\(b => !b\.hidden\)\)/);
    expect(src).toMatch(/øverstKontroll\.getContainer\(\)\.appendChild\(b\);\s*tilpassForm\(map\);/);
  });
});

import { kompassHjørne, verktøyHjørne } from '../src/haand.js';
describe('kompasset i motsatt hjørne (v1.218.110)', () => {
  it('høyrehendt: knappene til høyre, kompasset øverst til venstre — og omvendt', () => {
    expect(verktøyHjørne('høyre')).toBe('bottomright');
    expect(kompassHjørne('høyre')).toBe('topleft');
    expect(verktøyHjørne('venstre')).toBe('bottomleft');
    expect(kompassHjørne('venstre')).toBe('topright');
  });
});

describe('filter per linje (v1.218.110)', () => {
  it('én nøkkel for beina og for lista', async () => {
    const a = await import('../src/views/auto.js');
    const bein = [{ linjeId: 'RUT:Line:3', kode: '3', modus: 'metro' }, { linjeId: 'RUT:Line:74', kode: '74', modus: 'bus' }];
    expect(a.kartLinjer(bein).map(l => l.kode)).toEqual(['3', '74']);
    expect(a.kartLinjer([bein[0]])).toEqual([]);   // én linje: ingenting å velge
    const skjult = new Set([a.linjeNøkkel('RUT:Line:74', '74')]);
    expect(a.utenSkjulteLinjerBein(bein, skjult).map(b => b.kode)).toEqual(['3']);
    const dirs = [{ lines: [{ id: 'RUT:Line:3', code: '3' }] }, { lines: [{ id: 'RUT:Line:74', code: '74' }] }];
    expect(a.utenSkjulteLinjerRetninger(dirs, skjult).length).toBe(1);
  });
});

describe('tett søyle (v1.218.110)', () => {
  it('auto-reise: fem knapper på et kart på 215 px står tett i søyle', () => {
    expect(somRad(5, 215)).toBe(false);
    expect(tett(5, 215)).toBe(true);
    expect(tett(5, 382)).toBe(false);
  });
});
describe('kildelinja tar plass (v1.218.110)', () => {
  it('tilpassForm trekker fra kildelinjas målte høyde', () => {
    const src = readFileSync('src/ui/kartVerktoy.js', 'utf8');
    expect(src).toMatch(/const h = map\.getSize\(\)\.y - \(attr \? attr\.offsetHeight : 0\);/);
  });
});

describe('linjene følger transportmiddelet (v1.218.113)', () => {
  it('buss av: bussens linjer vises som av; et trykk på én slår buss på med bare den', async () => {
    const a = await import('../src/views/auto.js');
    const linjer = [{ nøkkel: 'L3', modus: 'metro' }, { nøkkel: 'L71', modus: 'bus' }, { nøkkel: 'L74', modus: 'bus' }];
    const modi = new Set(['bus']), sl = new Set();
    expect(linjer.map(l => a.linjeSynlig(l, modi, sl))).toEqual([true, false, false]);
    const r = a.trykkLinje('L74', linjer, modi, sl);
    expect(r.modi.has('bus')).toBe(false);
    expect(linjer.map(l => a.linjeSynlig(l, r.modi, r.linjer))).toEqual([true, false, true]);
  });
  it('transportmiddel på: et trykk slår linja av og på', async () => {
    const a = await import('../src/views/auto.js');
    const linjer = [{ nøkkel: 'L3', modus: 'metro' }];
    const r = a.trykkLinje('L3', linjer, new Set(), new Set());
    expect(r.linjer.has('L3')).toBe(true);
    expect(a.trykkLinje('L3', linjer, new Set(), r.linjer).linjer.has('L3')).toBe(false);
  });
});

describe('filteret fra alle retningene (v1.218.117)', () => {
  it('T-bane står i filteret selv om ingen T-banestrek er tegnet', async () => {
    const a = await import('../src/views/auto.js');
    const dirs = [{ lines: [{ code: '1', mode: 'metro', id: 'L1' }] }, { lines: [{ code: '12', mode: 'tram', id: 'L12' }] }, { lines: [{ code: '30', mode: 'bus', id: 'L30' }] }];
    expect(a.kartModi(a.filterValg(dirs)).map(m => m.modus).sort()).toEqual(['bus', 'metro', 'tram']);
    expect(a.kartLinjer(a.filterValg(dirs)).map(l => l.kode)).toEqual(['1', '12', '30']);
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const _modi = kartModi\(filterKilde\);/);
  });
});
