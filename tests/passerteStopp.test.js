// Tvil om neste stopp avgjøres av stoppene du alt har passert.
//
// Bestilt: «dersom det er uklart om nærmeste neste stopp er f eks tbane eller
// buss, så er det sannsynlig det en eller det andre basert på hvilke tidligere
// stopp brukeren har passert (… en kollektiv-tur er sjelden mer enn 30-60
// min).»
import { describe, it, expect } from 'vitest';
import { stoppPåLinja, passerteStopp, PASSERT_MIN } from '../src/api/ombord.js';
import { pushLang, LANG_STEG_MS, LANG_MAKS_MS } from '../src/trail.js';

const NÅ = Date.parse('2026-11-05T07:20:00Z');
const MIN = 60_000;
const kall = (id, name, lat, lon, min) => ({ expectedDepartureTime: new Date(NÅ + min * MIN).toISOString(),
  quay: { latitude: lat, longitude: lon, stopPlace: { id, name, latitude: lat, longitude: lon } } });
const kand = (linje, stopp) => ({ nøkkel: 'sj' + linje, linje, call: { serviceJourney: { id: 'sj' + linje, estimatedCalls: stopp } } });

// T-bane 3 nordover: Mortensrud, Skullerud, Bergkrystallen … neste Bøler.
const T3 = kand('3', [kall('M', 'Mortensrud', 59.8494, 10.8294, -8), kall('S', 'Skullerud', 59.8573, 10.8363, -5),
  kall('B', 'Bergkrystallen', 59.8656, 10.8358, -2), kall('BØ', 'Bøler', 59.8838, 10.8455, 2)]);
// Buss 76 i nærheten, andre stopp til andre tider, neste Ulsrud.
const B76 = kand('76', [kall('X', 'Lofsrud', 59.8460, 10.8400, -9), kall('Y', 'Bogerud', 59.8660, 10.8500, -4),
  kall('U', 'Ulsrud', 59.8800, 10.8550, 3)]);
const TVIL = { kind: 'ombord-tvil', kandidater: [T3, B76] };

// Du var ved Mortensrud, Skullerud og Bergkrystallen da T-banen var der.
const spor = (...pkt) => pkt.map(([lat, lon, min]) => ({ lat, lon, at: NÅ + min * MIN, acc: 10 }));
const PÅ_T3 = spor([59.8494, 10.8294, -8], [59.8573, 10.8363, -5], [59.8656, 10.8358, -2]);

describe('passerte stopp avgjør tvilen', () => {
  it('T-banens stopp er passert: neste stopp er Bøler, på linje 3', () => {
    const r = stoppPåLinja(TVIL, NÅ, PÅ_T3);
    expect(r.stop.name).toBe('Bøler');
    expect(r.linjer).toEqual(['3']);
  });
  it('telling: tre for T-banen, ingen for bussen', () => {
    expect(passerteStopp(T3, PÅ_T3, NÅ)).toBe(3);
    expect(passerteStopp(B76, PÅ_T3, NÅ)).toBe(0);
  });
  it('riktig sted til feil tid teller ikke', () => {
    const forTidlig = spor([59.8494, 10.8294, -40], [59.8573, 10.8363, -38], [59.8656, 10.8358, -35]);
    expect(passerteStopp(T3, forTidlig, NÅ)).toBe(0);
  });
  it('neste stopp teller ikke som passert, selv om du står der nå', () => {
    expect(passerteStopp(T3, spor([59.8838, 10.8455, 0]), NÅ)).toBe(0);
  });
  it('ett passert stopp er for lite til å avgjøre', () => {
    expect(PASSERT_MIN).toBe(2);
    expect(stoppPåLinja(TVIL, NÅ, spor([59.8494, 10.8294, -8]))).toBeNull();
  });
  it('uten langt spor velger appen ikke, som før', () => {
    expect(stoppPåLinja(TVIL, NÅ, [])).toBeNull();
    expect(stoppPåLinja(TVIL, NÅ)).toBeNull();
  });
  it('like mange passert: appen velger ikke', () => {
    const begge = [...PÅ_T3.slice(0, 2), ...spor([59.8460, 10.8400, -9], [59.8660, 10.8500, -4])];
    expect(stoppPåLinja(TVIL, NÅ, begge)).toBeNull();
  });
});

describe('det lange sporet', () => {
  it('én fiks per 20 s', () => {
    let l = [];
    for (let s = 0; s < 120; s++) l = pushLang(l, { lat: 59.9, lon: 10.8, at: NÅ + s * 1000 });
    expect(l).toHaveLength(Math.floor(120_000 / LANG_STEG_MS));
  });
  it('og høyst en time tilbake', () => {
    let l = [];
    for (let m = 0; m <= 90; m++) l = pushLang(l, { lat: 59.9, lon: 10.8, at: NÅ + m * MIN });
    expect(l[l.length - 1].at - l[0].at).toBeLessThanOrEqual(LANG_MAKS_MS);
    expect(l[0].at).toBe(NÅ + 30 * MIN);
  });
  it('auto-reise sender det lange sporet', () => {
    const s = require('node:fs').readFileSync('src/views/auto.js', 'utf8');
    expect(s).toContain('stoppPåLinja(_ombordDom(nåW), nåW, state.posTrailLang)');
    expect(require('node:fs').readFileSync('src/geo.js', 'utf8')).toContain('state.posTrailLang = pushLang(state.posTrailLang, here);');
  });
});
