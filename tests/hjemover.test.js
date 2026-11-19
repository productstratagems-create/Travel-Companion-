// v1.218.146: «Hjemover» — motsatsen til «mot sentrum» i Auto-tavle.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { gårHjemover, hjemForslag, hjemStopp, leggTilHjem, fjernHjem } from '../src/hjemover.js';
import { filtrerRetning, AT_RETNINGER, AT_RETNING_TEKST } from '../src/views/auto.js';

const HJEM = [{ id: 'NSR:StopPlace:5687', name: 'Mortensrud' }];

describe('regelen', () => {
  it('en retning går hjemover når et stopp videre er ditt — på id', () => {
    expect(gårHjemover([{ id: 'X', name: 'Bøler' }, { id: 'NSR:StopPlace:5687', name: 'Mortensrud T' }], HJEM)).toBe(true);
  });
  it('… eller på navn', () => {
    expect(gårHjemover([{ id: 'Y', name: 'Mortensrud' }], HJEM)).toBe(true);
  });
  it('ellers ikke, og ingen stopp valgt er aldri hjemover', () => {
    expect(gårHjemover([{ id: 'Y', name: 'Stortinget' }], HJEM)).toBe(false);
    expect(gårHjemover([{ id: 'NSR:StopPlace:5687', name: 'Mortensrud' }], [])).toBe(false);
  });
});

describe('filteret', () => {
  const A = { n: 'a' }, B = { n: 'b' }, C = { n: 'c' };
  const g = d => (d === A ? 'mot' : null), h = d => d === B;
  it('hjemover slipper bare hjemover-retninger, andre er verken mot sentrum eller hjemover', () => {
    expect(filtrerRetning([A, B, C], 'hjem', g, h)).toEqual([B]);
    expect(filtrerRetning([A, B, C], 'andre', g, h)).toEqual([C]);
    expect(filtrerRetning([A, B, C], 'mot', g, h)).toEqual([A]);
  });
  it('knappen heter «hjemover», ved siden av «mot sentrum»', () => {
    expect(AT_RETNINGER.map(k => AT_RETNING_TEKST[k])).toEqual(['alle', 'mot sentrum', 'hjemover', 'andre retninger']);
  });
  it('knappen vises bare når du har valgt stopp', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const knappValg = AT_RETNINGER\.filter\(k => k !== 'hjem' \|\| hjemListe\.length\);/);
  });
});

describe('innstillingen', () => {
  it('Entur-forslag: bare stoppesteder', () => {
    const f = (id, cat, name) => ({ properties: { id, name, category: cat, locality: 'Oslo' } });
    expect(hjemForslag([f('NSR:StopPlace:1', ['metroStation'], 'Mortensrud'), f('OSM:1', ['street'], 'Mortensrudveien')]))
      .toEqual([{ id: 'NSR:StopPlace:1', name: 'Mortensrud', sted: 'Oslo' }]);
  });
  it('legg til, ingen dobbel, fjern', () => {
    leggTilHjem(HJEM[0]); leggTilHjem(HJEM[0]);
    expect(hjemStopp()).toEqual(HJEM);
    expect(fjernHjem(HJEM[0].id)).toEqual([]);
  });
  it('innstillinger tegner søket', () => {
    expect(readFileSync('src/ui/nav.js', 'utf8')).toMatch(/tegnHjemover\(el\);/);
  });
});
