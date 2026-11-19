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
  // v1.218.147: knappen står alltid; uten stopp tar et trykk deg til innstillingen.
  it('uten stopp valgt sender et trykk på hjemover deg til innstillingen', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/if \(b\.dataset\.retning === 'hjem' && !hjemStopp\(\)\.length\) \{ tilHjemoverInnstilling\(\); return; \}/);
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

describe('langt trykk på hjemover (v1.218.147)', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('holdet sender deg til innstillingen', () => {
    expect(a).toMatch(/export const HJEM_HOLD_MS = 550;/);
    expect(a).toMatch(/_hjemHold\.tid = setTimeout\(\(\) => \{ _hjemHold\.tid = null; _hjemHold\.brukt = true; tilHjemoverInnstilling\(\); \}, HJEM_HOLD_MS\);/);
  });
  it('og velger ikke filteret', () => {
    expect(a).toMatch(/if \(_hjemHold\.brukt\) \{ _hjemHold\.brukt = false; return; \}/);
  });
  it('innstillingen åpnes og søkefeltet får fokus', () => {
    expect(a).toMatch(/navTo\('v-prefs'\);[\s\S]{0,250}\.pref-hjem-sok/);
  });
});

import { hjemFørsteEtapper, hjemDom } from '../src/hjemover.js';
import { tavleRadHtml } from '../src/ui/tavleRad.js';
describe('hjemover med bytter (v1.218.151)', () => {
  const leg = (mode, linje, til, mot) => ({ mode, serviceJourney: linje ? { line: { id: 'RUT:Line:' + linje, publicCode: linje } } : null,
    toPlace: { name: til }, fromEstimatedCall: { destinationDisplay: { frontText: mot } } });
  const MØNSTRE = [
    { legs: [leg('foot'), leg('bus', '74', 'Jernbanetorget', 'Jernbanetorget'), leg('metro', '3', 'Mortensrud', 'Mortensrud')] },
    { legs: [leg('metro', '2', 'Mortensrud', 'Ellingsrudåsen')] },
    { legs: [leg('foot', null, 'Mortensrud')] },
  ];
  it('første etappe: linje, og hvor du bytter — direkte gir ingen bytte, gange ignoreres', () => {
    expect(hjemFørsteEtapper(MØNSTRE)).toEqual([
      { linjeId: 'RUT:Line:74', kode: '74', mot: 'Jernbanetorget', bytte: 'Jernbanetorget' },
      { linjeId: 'RUT:Line:2', kode: '2', mot: 'Ellingsrudåsen', bytte: null },
    ]);
  });
  const HJEM = [{ id: 'NSR:StopPlace:5687', name: 'Mortensrud' }];
  const et = hjemFørsteEtapper(MØNSTRE);
  // FØR-BILDET: 74 kjører ikke til Mortensrud — før var den aldri hjemover.
  it('74 mot Jernbanetorget er hjemover, med «bytt på Jernbanetorget»', () => {
    expect(hjemDom('RUT:Line:74', [{ id: 'A', name: 'Bryn' }, { id: 'J', name: 'Jernbanetorget' }], HJEM, [])).toEqual({ hjem: false, bytte: null });
    expect(hjemDom('RUT:Line:74', [{ id: 'A', name: 'Bryn' }, { id: 'J', name: 'Jernbanetorget' }], HJEM, et)).toEqual({ hjem: true, bytte: 'Jernbanetorget' });
  });
  it('74 i motsatt retning (kjører ikke til byttet) er ikke hjemover', () => {
    expect(hjemDom('RUT:Line:74', [{ id: 'M', name: 'Mortensrud stasjon' }, { id: 'S', name: 'Skullerud' }], HJEM, et).hjem).toBe(false);
  });
  it('direkte treff vinner og trenger ingen bytte', () => {
    expect(hjemDom('RUT:Line:3', [{ id: 'NSR:StopPlace:5687', name: 'Mortensrud' }], HJEM, et)).toEqual({ hjem: true, bytte: null });
  });
  it('raden sier hvor du bytter', () => {
    const h = tavleRadHtml({ d: { frontText: 'Jernbanetorget', lines: [{ code: '74', mode: 'bus' }] }, ms: Date.now() + 5 * 60_000, call: {}, rekker: true, bytte: 'Jernbanetorget' }, Date.now(), 0);
    expect(h).toContain('bytt på Jernbanetorget');
  });
});
