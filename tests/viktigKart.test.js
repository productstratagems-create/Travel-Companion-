// Viktigheten styrer kartene og gangruten.
// Bestilt: «Bruk dette rangeringssystemet i å bestemme hvordan kartene skal se ut og hvilket
// innhold som skal være prioritert … Bruk også dette systemet for å velge til hvilken holdeplass
// du skal tegne opp gangrute.» Valgt: viktigste innen gangavstand («du er ved» følger med);
// auto-reise og Tavla.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: { divIcon: (o) => o } })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
const { nærViktigFørst, VIKTIG_GANG_M } = await import('../src/api/stops.js');
const { rankStops } = await import('../src/views/auto.js');
const { makeStopIcon } = await import('../src/ui/mapIcons.js');

const info = (moduser, linjer, plattformer) => ({ moduser, linjer, plattformer });
const V = new Map([['T', info(['metro', 'bus'], 9, 6)], ['L', info(['bus'], 2, 1)], ['F', info(['metro', 'bus', 'rail'], 20, 10)]]);
const v = s => V.get(s.id);

describe('nærViktigFørst', () => {
  it('innen gangavstand: viktigst først, også når den er lenger unna', () => {
    const l = [{ id: 'L', distM: 180 }, { id: 'T', distM: 320 }];
    expect(l.sort(nærViktigFørst(v)).map(s => s.id)).toEqual(['T', 'L']);
  });
  it('utenfor gangavstand: avstand, og etter alt innenfor', () => {
    const l = [{ id: 'F', distM: VIKTIG_GANG_M + 300 }, { id: 'L', distM: 180 }];
    expect(l.sort(nærViktigFørst(v)).map(s => s.id)).toEqual(['L', 'F']);
  });
  it('gangavstand er 400 m (fem minutter)', () => { expect(VIKTIG_GANG_M).toBe(400); });
  it('uten viktighet: avstand, som før', () => {
    const l = [{ id: 'T', distM: 320 }, { id: 'L', distM: 180 }];
    expect(l.sort(nærViktigFørst(null)).map(s => s.id)).toEqual(['L', 'T']);
  });
});

describe('«du er ved» og dermed gangruten', () => {
  it('Mortensrud T foran busslomma nærmere', () => {
    const l = [{ id: 'L', distM: 180 }, { id: 'T', distM: 320 }];
    expect(rankStops(l, null, null, v)[0].id).toBe('T');
  });
  it('men stoppet du står ved, vinner fortsatt', () => {
    const l = [{ id: 'L', distM: 40 }, { id: 'T', distM: 320 }];
    expect(rankStops(l, null, null, v)[0].id).toBe('L');
  });
  it('gangruten går til «du er ved» — ett valg, ikke to', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/ensureApproach\(.*, _stop\);/);
  });
});

describe('utseende', () => {
  it('viktig nål er større enn vanlig, mindre enn ditt eget stopp', () => {
    const w = o => o.iconSize[0];
    expect(w(makeStopIcon('bus', 1, { viktig: true }))).toBeGreaterThan(w(makeStopIcon('bus', 1)));
    expect(w(makeStopIcon('bus', 1, { viktig: true }))).toBeLessThan(w(makeStopIcon('bus', 1, { primary: true })));
  });
  it('auto-reise: det viktigste av de andre får stor nål og fast lapp', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain('const viktigst = others.slice().sort(nærViktigFørst(s => stoppInfo(s.id)))[0];');
    expect(s).toMatch(/viktig: s === viktigst/);
  });
  it('Tavla: per transportmiddel velges de viktigste innen gangavstand, ikke bare de nærmeste', () => {
    const s = readFileSync('src/views/board.js', 'utf8');
    expect(s).toContain("nærViktigFørst(c => stoppInfo(c[0].id.split('|')[0]), c => c[0].dist)");
  });
});

describe('Tavla spør om nye stopp når du flytter deg', () => {
  it('husker id-ene, ikke ett ja/nei for hele økta', () => {
    const s = readFileSync('src/views/board.js', 'utf8');
    expect(s).toContain('const nye = ider.filter(id => !stoppInfo(id) && !_bInfoBedt.has(id));');
  });
});
