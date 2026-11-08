// Rangering av stoppesteder etter hva de betjener, uavhengig av transportmiddel.
// Bestilt: «setter stoppesteder som betjener flere transportmidler og ruter/linjer på topp,
// og med kriterier som kan skille nr. 2 fra nr. 3 osv.» Valgt: som tiebreak.
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { viktighet, sammenlignViktighet, infoFraSvar } = await import('../src/api/stops.js');
const { rankStops, LIK_AVSTAND_M } = await import('../src/views/auto.js');

const info = (moduser, linjer, plattformer) => ({ moduser, linjer, plattformer });

describe('viktighet', () => {
  it('flere transportmidler slår flere linjer', () => {
    const knutepunkt = info(['metro', 'bus'], 3, 4), storBuss = info(['bus'], 12, 6);
    expect(sammenlignViktighet(knutepunkt, storBuss)).toBeLessThan(0);
  });
  it('like mange transportmidler: flere linjer først', () => {
    expect(sammenlignViktighet(info(['bus'], 5, 2), info(['bus'], 3, 2))).toBeLessThan(0);
  });
  it('like mange linjer: flere plattformer først', () => {
    expect(sammenlignViktighet(info(['bus'], 3, 4), info(['bus'], 3, 2))).toBeLessThan(0);
  });
  it('ukjent bakerst, men geokoderens transportmidler teller når linjene mangler', () => {
    const s = { modes: ['metro', 'bus'] };
    expect(viktighet(s, undefined)).toEqual(info(['metro', 'bus'], 0, 0));
    expect(sammenlignViktighet(viktighet({ modes: ['bus'] }, undefined), info(['bus'], 2, 1))).toBeGreaterThan(0);
    expect(sammenlignViktighet(info(['bus'], 0, 0), info(['bus'], 0, 0))).toBe(0);
  });
  it('leser transportmidler, linjer og plattformer med linjer fra svaret', () => {
    const m = infoFraSvar({ data: { stopPlaces: [{ id: 'X', quays: [
      { lines: [] },
      { lines: [{ id: 'L1', transportMode: 'metro' }, { id: 'L2', transportMode: 'bus' }] },
      { lines: [{ id: 'L2', transportMode: 'bus' }] }] }] } });
    expect(m.get('X')).toEqual(info(['metro', 'bus'], 2, 2));
  });
});

describe('som tiebreak i rankStops', () => {
  const viktig = new Map([['A', info(['bus'], 2, 1)], ['B', info(['metro', 'bus'], 6, 4)], ['C', info(['bus'], 8, 3)]]);
  const v = (s) => viktig.get(s.id);
  it('omtrent like langt unna: det viktigste først — og nr. 2 skilles fra nr. 3', () => {
    const l = [{ id: 'A', distM: 310 }, { id: 'C', distM: 320 }, { id: 'B', distM: 330 }];
    expect(rankStops(l, null, null, v).map(s => s.id)).toEqual(['B', 'C', 'A']);
  });
  it('avstand avgjør fortsatt når forskjellen er reell', () => {
    const l = [{ id: 'B', distM: 600 }, { id: 'A', distM: 300 }];
    expect(rankStops(l, null, null, v).map(s => s.id)).toEqual(['A', 'B']);
  });
  it('stoppet du står ved, og bruk, slår viktighet', () => {
    expect(rankStops([{ id: "B", distM: 40 }, { id: "A", distM: 30 }], null, null, v).map(s => s.id)).toEqual(['A', 'B']);
  });
  it('uten viktighet: som før', () => {
    const l = [{ id: 'C', distM: 320 }, { id: 'A', distM: 310 }];
    expect(rankStops(l, null, null).map(s => s.id)).toEqual(['A', 'C']);
  });
  it('lik avstand er en navngitt grense', () => { expect(LIK_AVSTAND_M).toBe(60); });
});

describe('navnelappene på kartet', async () => {
  const { relevanteStopp } = await import('../src/views/auto.js');
  it('samme avstandsskritt: det viktigste får lappen', () => {
    const v = new Map([['A', info(['bus'], 2, 1)], ['B', info(['bus'], 9, 4)]]);
    const l = [{ id: 'A', distM: 310, lat: 1, lon: 1, modes: ['bus'] }, { id: 'B', distM: 330, lat: 1, lon: 1, modes: ['bus'] }];
    expect(relevanteStopp(null, l, 1, [], s => v.get(s.id)).map(s => s.id)).toEqual(['B']);
    expect(relevanteStopp(null, l, 1, []).map(s => s.id)).toEqual(['A']);
  });
  it('linjene hentes for hele lista, også når kartet er skjult', async () => {
    const src = (await import('node:fs')).readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/const list = _stops\(\);\n  _hentStoppInfo\(list\);/);
    expect(src.match(/fetchStoppLinjer\(/g).length).toBe(1);
  });
});
