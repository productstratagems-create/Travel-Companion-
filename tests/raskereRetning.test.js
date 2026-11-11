// Rapportert (skjermbilde 07:38): på linje 3 fra Bogerud mot sentrum sa appen «raskere å gå av på
// Bøler: 3 07:43 → Mortensrud 07:49 · 9 min tidligere». Mortensrud er der turen KOM FRA.
// Stopp og koordinater fra turopptaket (linje 3 Mortensrud → Kolsås, 2026-11-10).
import { describe, it, expect } from 'vitest';
import { målForan } from '../src/views/auto.js';

const T = hm => new Date('2026-11-12T' + hm + ':00+01:00').getTime();
const S = {
  Mortensrud: ['5687', 59.849323, 10.829668, '07:36'], Skullerud: ['5885', 59.866545, 10.840085, '07:38'],
  Bogerud: ['5874', 59.87606, 10.842064, '07:40'], 'Bøler': ['5862', 59.884238, 10.84539, '07:42'],
  Ulsrud: ['5847', 59.889424, 10.849649, '07:43'], Helsfyr: ['6068', 59.912678, 10.801443, '07:54'],
  Jernbanetorget: ['3990', 59.912244, 10.751147, '07:59'],
};
const sted = n => ({ id: 'NSR:StopPlace:' + S[n][0], name: n, navn: n, lat: S[n][1], lon: S[n][2] });
const k = { call: { serviceJourney: { estimatedCalls: Object.keys(S).map(n => ({
  quay: { stopPlace: { id: 'NSR:StopPlace:' + S[n][0], name: n } }, expectedArrivalTime: '2026-11-12T' + S[n][3] + ':00+01:00' })) } } };
const NÅ = T('07:41');                     // mellom Bogerud og Bøler
const neste = sted('Bøler'), etter = sted('Ulsrud');

describe('«raskere å gå av» gjelder bare et mål foran deg', () => {
  it('før-bildet: Mortensrud, der turen kom fra, gir ikke råd', () => {
    expect(målForan(k, sted('Mortensrud'), NÅ, neste, etter)).toBe(false);
  });
  it('passert, selv om det ligger foran i luftlinje (ringlinje): nei', () => {
    // Bogerud er passert; koordinaten flyttet nord for Ulsrud, slik en ringlinje kan se ut.
    expect(målForan(k, { id: 'NSR:StopPlace:5874', lat: 59.922196, lon: 10.854619 }, NÅ, neste, etter)).toBe(false);
  });
  it('et mål turen selv skal innom: ja', () => {
    expect(målForan(k, sted('Jernbanetorget'), NÅ, neste, etter)).toBe(true);
  });
  it('utenfor turen, i retningen den kjører (Haugerud, nord): ja', () => {
    expect(målForan(k, { id: 'NSR:StopPlace:6180', lat: 59.922196, lon: 10.854619 }, NÅ, neste, etter)).toBe(true);
  });
  it('utenfor turen, bak (Lambertseter, sørvest): nei', () => {
    expect(målForan(k, { id: 'NSR:StopPlace:5798', lat: 59.873572, lon: 10.810222 }, NÅ, neste, etter)).toBe(false);
  });
  it('uten koordinat og ikke på turen: ingen påstand', () => {
    expect(målForan(k, { id: 'NSR:StopPlace:1' }, NÅ, neste, etter)).toBe(false);
  });
});

describe('koblingen', () => {
  it('rådet beregnes ikke uten at målet ligger foran', async () => {
    const { readFileSync } = await import('node:fs');
    const s = readFileSync('src/views/auto.js', 'utf8');
    const f = s.slice(s.indexOf('function _raskereData('), s.indexOf('function _raskereData(') + 500);
    expect(f).toMatch(/!målForan\(_lås\.k, _kortRute, nå, neste, stoppFram\(_lås\.k, nå, 1\)\)/);
  });
});
