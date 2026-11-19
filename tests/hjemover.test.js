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
    expect(hjemFørsteEtapper(MØNSTRE)).toMatchObject([
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

import { hjemRaskest, HJEM_SLAKK_MIN } from '../src/hjemover.js';
describe('bare gode forslag, og raskest hjem fra et annet stopp (v1.218.153)', () => {
  const T = Date.UTC(2026, 10, 19, 20, 0), iso = m => new Date(T + m * 60_000).toISOString();
  const kol = (linje, fra, fraId, start, slutt, til) => ({ mode: linje === '1' ? 'metro' : 'tram', expectedStartTime: iso(start), expectedEndTime: iso(slutt),
    serviceJourney: { line: { id: 'RUT:Line:' + linje, publicCode: linje } }, fromPlace: { name: fra, quay: { stopPlace: { id: fraId } } }, toPlace: { name: til },
    fromEstimatedCall: { destinationDisplay: { frontText: til } } });
  const gå = (a, b) => ({ mode: 'foot', expectedStartTime: iso(a), expectedEndTime: iso(b) });
  // FØR-BILDET: Majorstuen (trikk) → Holmenkollen.
  const M = [
    { legs: [gå(0, 3), kol('1', 'Majorstuen', 'NSR:StopPlace:T', 6, 20, 'Holmenkollen')] },                                           // framme 20 min
    { legs: [kol('19', 'Majorstuen', 'NSR:StopPlace:TR', 2, 9, 'Nationaltheatret'), kol('1', 'Nationaltheatret', 'X', 15, 41, 'Holmenkollen')] }, // 41
    { legs: [kol('12', 'Majorstuen', 'NSR:StopPlace:TR', 1, 12, 'Stortinget'), kol('1', 'Stortinget', 'Y', 18, 45, 'Holmenkollen')] },          // 45
  ];
  it('omveiene teller ikke: bare linje 1', () => {
    expect(HJEM_SLAKK_MIN).toBe(10);
    expect(hjemFørsteEtapper(M).map(e => e.kode)).toEqual(['1']);
  });
  it('raskest hjem: gå 3 min til Majorstuen T, linje 1', () => {
    expect(hjemRaskest(M)).toMatchObject({ kode: '1', fraId: 'NSR:StopPlace:T', fraNavn: 'Majorstuen', gangMin: 3, bytte: null });
  });
  it('skjermen viser linjen og bytter stopp ved trykk', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const raskestHtml = _atRetning === 'hjem' \? raskestHjemHtml\(hs, nærHjem, linjerHer\) : '';/);
    expect(a).toMatch(/if \(!annetHjemStopp\(rk, nær, linjerHer\)\) return '';/);
    expect(a).toMatch(/\.at-raskest\[data-pin\]'\)\.forEach\(b => b\.addEventListener\('click', \(\) => \{ if \(pinStop\(b\.dataset\.pin\)\)/);
  });
});

import { annetHjemStopp } from '../src/hjemover.js';
describe('raskest hjem: samme sted, og bare avganger du rekker (v1.218.155)', () => {
  // FØR-BILDET: Mortensrud T fra Mortensrud.
  it('71 fra Mortensrud T, når 71 alt står på tavla: ingen «raskest hjem»', () => {
    expect(annetHjemStopp({ fraId: 'T', fraNavn: 'Mortensrud', linjeId: 'RUT:Line:71' }, [{ id: 'B', name: 'Mortensrud' }], new Set(['RUT:Line:71']))).toBe(false);
  });
  it('linje 1 fra Majorstuen T, ikke på trikketavla: «raskest hjem» står, også med likt navn', () => {
    expect(annetHjemStopp({ fraId: 'T', fraNavn: 'Majorstuen', linjeId: 'RUT:Line:1' }, [{ id: 'TR', name: 'Majorstuen' }], new Set(['RUT:Line:12', 'RUT:Line:19']))).toBe(true);
  });
  it('søket starter når du er ved stoppet', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const fra = nå \+ gangMin \* 60_000;\s*Promise\.all\(mål\.map\(m => fetchTripFra\(_stop\.id, m\.id, fra, 5\)/);
  });
});

import { seksjonRekkefølge } from '../src/views/auto.js';
describe('hjemover som seksjon i Auto-reise (v1.218.156)', () => {
  const kl = h => new Date(2026, 10, 19, h, 0).getTime();
  it('fra kl. 14 og gjennom kvelden står hjemover først; om morgenen mot sentrum', () => {
    expect(seksjonRekkefølge(kl(21))).toEqual(['hjem', 'mot', null]);
    expect(seksjonRekkefølge(kl(15))).toEqual(['hjem', 'mot', null]);
    expect(seksjonRekkefølge(kl(7))).toEqual(['mot', 'hjem', null]);
  });
  it('samme regel som tavla, «bytt på» på raden, og langt trykk på overskriften', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/retningHjemDom\(d, walkMins, now, hjemListeAR\)/);
    expect(a).toMatch(/bytt på ' \+ esc\(hjemAR\.get\(i\)\.bytte\)/);
    expect(a).toMatch(/HJEM_HOLD_SEL = '\.at-retning \[data-retning="hjem"\], \[data-hjem-side\]'/);
  });
});
