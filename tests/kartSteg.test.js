import { describe, it, expect } from 'vitest';
import { stegNøkkel, stegRamme, zoomEtterFart, fartMedRo, STEG_TAK, FART_RO_MS } from '../src/kartSteg.js';
const du = { lat: 59.85, lon: 10.83 }, neste = { lat: 59.86, lon: 10.84 }, av = { lat: 59.91, lon: 10.75 };
describe('steget (v1.218.228)', () => {
  it('om bord: ombord; ≤ 2 stopp eller ≤ 90 s igjen: nær-av', () => {
    expect(stegNøkkel('riding', { stopp: 6, sek: 600 })).toBe('ombord');
    expect(stegNøkkel('riding', { stopp: 2, sek: 600 })).toBe('nær-av');
    expect(stegNøkkel('riding', { stopp: 5, sek: 80 })).toBe('nær-av');
    expect(stegNøkkel('platform')).toBe('bytte');
    expect(stegNøkkel('før', {}, false)).toBe('gå');
    expect(stegNøkkel('før', {}, true)).toBe('vent');
    expect(stegNøkkel('arrived')).toBe(null);
  });
  it('før-bildet: ved avstigning rammes deg + avstigningsstoppet med tak 16 (før: hele reisen)', () => {
    expect(stegRamme('nær-av', { du, av, neste })).toEqual({ pts: [[59.85, 10.83], [59.91, 10.75]], maks: 16 });
    expect(stegRamme('ombord', { du, neste, av })).toEqual({ pts: [[59.85, 10.83], [59.86, 10.84]], maks: 15 });
    expect(STEG_TAK['gå']).toBe(17);
  });
});
describe('zoom etter fart', () => {
  it('trinnene', () => {
    expect([1, 3, 10, 25].map(zoomEtterFart)).toEqual([17, 16, 15, 14]);
  });
  it('en topp på 3 s bytter ikke; 8 s bytter', () => {
    let s = fartMedRo(null, 10, 0);
    expect(s.zoom).toBe(15);
    s = fartMedRo(s, 1, 1000); s = fartMedRo(s, 1, 3000);
    s = fartMedRo(s, 10, 4000);
    expect(s.zoom).toBe(15);
    s = fartMedRo(s, 25, 5000); s = fartMedRo(s, 25, 5000 + FART_RO_MS - 1);
    expect(s.zoom).toBe(15);
    s = fartMedRo(s, 25, 5000 + FART_RO_MS);
    expect(s.zoom).toBe(14);
  });
});
import { readFileSync } from 'node:fs';
describe('koblingen (v1.218.228)', () => {
  const t = readFileSync('src/views/track.js', 'utf8');
  it('Underveis: steg er standard, rammes når steget skifter (eller kartet endrer størrelse, v1.218.271), og ikke etter din justering', () => {
    expect(t).toMatch(/_tKartFokus = 'steg';/);
    expect(t).toMatch(/if \(!_tMap \|\| _tKartFokus !== 'steg' \|\| _tUserMoved \|\| !leg\) return;/);
    expect(t).toMatch(/if \(steg !== _tSteg \|\| \(størrelse !== _tStegStr/);
    expect(t).toMatch(/_tFart = fartMedRo\(_tFart, fartNå\(now\), now\);/);
  });
  it('avgangsdetaljene bruker samme tak for gå-steget', () => {
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/ramme\(_selMap, fokus, STEG_TAK\['gå'\], \{ pad \}\);/);
  });
});

import { underveisFase, VED_STOPPET_M } from '../src/kartSteg.js';
import { readFileSync as _rf } from 'node:fs';
describe('Underveis før avgang viser veien til stoppet (v1.218.271)', () => {
  const dep = Date.parse('2026-11-23T22:01:00+01:00'), nå = dep - 24 * 60000;
  it('før-bildet: 24 min før avgang hjemme ble regnet som «om bord»; nå «gå»', () => {
    const f = underveisFase(nå, dep, 450);
    expect(f).toEqual({ fase: 'før', vedStoppet: false });
    expect(stegNøkkel(f.fase, { stopp: 9 }, f.vedStoppet)).toBe('gå');
    expect(stegRamme('gå', { du: { lat: 59.85, lon: 10.83 }, stopp: { lat: 59.853, lon: 10.835 } }).pts.length).toBe(2);
  });
  it('ved stoppet: «vent»; etter avgang: om bord', () => {
    expect(stegNøkkel('før', {}, underveisFase(nå, dep, VED_STOPPET_M - 1).vedStoppet)).toBe('vent');
    expect(underveisFase(dep + 1000, dep, 5).fase).toBe('riding');
    expect(underveisFase(nå, NaN, 5).fase).toBe('riding');
  });
  it('Underveis spør fasen, ikke alltid «riding»', () => {
    const t = _rf('src/views/track.js', 'utf8');
    expect(t).not.toMatch(/stegNøkkel\('riding'/);
    expect(t).toMatch(/const f = underveisFase\(now, dep,/);
  });
});
describe('rammen settes på nytt når kartet endrer størrelse (v1.218.271)', () => {
  it('ikke bare når steget skifter', () => {
    const t = _rf('src/views/track.js', 'utf8');
    expect(t).toMatch(/if \(steg !== _tSteg \|\| \(størrelse !== _tStegStr && steg !== 'ombord'\)\) \{/);
  });
});
