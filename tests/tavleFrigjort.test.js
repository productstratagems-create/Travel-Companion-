import { describe, it, expect, vi } from 'vitest';
import { reiseSyn, gangRetning, roligSortering, rammeNøkkel } from '../src/views/auto.js';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));

describe('Auto-tavle frigjort fra pågående reise (v1.218.172)', () => {
  const lås = { journeyId: 'j1' }, påLinja = { stop: { id: 'S2' } };
  it('tavla ser verken linje eller lås, og er ikke i fart av låsen alene', () => {
    const s = reiseSyn(true, { påLinja, lås, gpsFart: false });
    expect(s).toEqual({ påLinja: null, lås: null, fart: false, følger: false });
  });
  it('tavla er i fart når GPS sier det', () => {
    expect(reiseSyn(true, { lås, gpsFart: true }).fart).toBe(true);
  });
  it('Auto-reise følger reisen som før', () => {
    const s = reiseSyn(false, { påLinja, lås, gpsFart: false });
    expect(s.påLinja).toBe(påLinja); expect(s.lås).toBe(lås); expect(s.fart).toBe(true); expect(s.følger).toBe(true);
  });
});

describe('gangRetning', () => {
  const t0 = Date.now();
  // Går nordover fra stoppet: avstanden øker.
  const spor = [0, 1, 2, 3].map(i => ({ lat: 59.9100 + i * 0.0003, lon: 10.75, at: t0 - (3 - i) * 15000, acc: 5 }));
  it('stopp bak deg gir «bak»', () => {
    expect(gangRetning({ lat: 59.9095, lon: 10.75 }, spor)).toBe('bak');
  });
  it('stopp foran deg gir ikke «bak»', () => {
    expect(gangRetning({ lat: 59.9140, lon: 10.75 }, spor)).not.toBe('bak');
  });
  it('uten spor: vet ikke', () => {
    expect(gangRetning({ lat: 59.91, lon: 10.75 }, [])).not.toBe('bak');
  });
});

describe('roligSortering', () => {
  const k = x => x.id, v = x => x.v;
  it('1 min forskjell bytter ikke plass', () => {
    const ut = roligSortering([{ id: 'a', v: 5 }, { id: 'b', v: 4 }], ['a', 'b'], k, v, 2);
    expect(ut.map(k)).toEqual(['a', 'b']);
  });
  it('3 min forskjell bytter plass', () => {
    const ut = roligSortering([{ id: 'a', v: 7 }, { id: 'b', v: 4 }], ['a', 'b'], k, v, 2);
    expect(ut.map(k)).toEqual(['b', 'a']);
  });
  it('uten forrige: vanlig sortering', () => {
    expect(roligSortering([{ id: 'a', v: 5 }, { id: 'b', v: 4 }], [], k, v).map(k)).toEqual(['b', 'a']);
  });
  it('rad bak deg (stor straff) rangeres etter selv om den går først', () => {
    const ut = roligSortering([{ id: 'a', v: 1 + 1e6 }, { id: 'b', v: 9 }], ['a', 'b'], k, v);
    expect(ut.map(k)).toEqual(['b', 'a']);
  });
});

describe('rammeNøkkel', () => {
  it('nytt nabostopp rammer inn på nytt; uten er nøkkelen som før', () => {
    expect(rammeNøkkel({ stoppId: 'A' })).toBe('A|-|-|-|-|-');
    expect(rammeNøkkel({ stoppId: 'A', gangTil: 'B' })).not.toBe(rammeNøkkel({ stoppId: 'A' }));
  });
});

import { readFileSync } from 'node:fs';
describe('skjermen går gjennom bryteren', () => {
  const src = readFileSync('src/views/auto.js', 'utf8');
  it('_renderWhere henter linja via reiseSyn, og tilbudet er bak _følgerReise', () => {
    expect(src).toMatch(/const syn = reiseSyn\(_autoTavle,/);
    expect(src).toMatch(/const påLinja = syn\.påLinja;/);
    expect(src).toMatch(/const html = _følgerReise\(\) && trengerSvar\(/);
    expect(src).toMatch(/const fart = syn\.fart;/);
  });
});

describe('gangtid til nabostoppet regnes mot koordinatene (v1.218.172)', () => {
  const src = readFileSync('src/views/auto.js', 'utf8');
  it('_fra slås opp blant stoppene før gangTil', () => {
    expect(src).toMatch(/const gangTilStopp = s => \{ const k = medKoord\(s\); const g = k && gangTil\(k\);/);
    expect(src).toMatch(/const medKoord = f => \(f && Number\.isFinite\(f\.lat\)\) \? f : \(f && _stops\(\)\.find\(s => s\.id === f\.id\)\)/);
  });
});
