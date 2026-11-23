import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { besteFraReiser } from '../src/reiseTil.js';
import { listeStoppKandidat } from '../src/views/auto.js';

// Trondheim (Ranheim), som skjermbildet: Saksevik 4 min å gå, én avgang, framme 08:52;
// Hansensvingen 17 min å gå, tre avganger, første framme 09:02.
const nå = Date.parse('2026-11-23T08:09:00+01:00');
const iso = m => new Date(nå + m * 60000).toISOString();
const plass = (name, id) => ({ name, latitude: 63.43, longitude: 10.5, quay: { stopPlace: { id } } });
const HER = { name: 'Saxe Viks veg 40', latitude: 63.43, longitude: 10.5 };
const SAK = plass('Saksevik', 'NSR:StopPlace:41'), HAN = plass('Hansensvingen', 'NSR:StopPlace:42'), SEN = plass('Studentersamfundet', 'NSR:StopPlace:43');
const reise = (fra, gå, avg, ank) => ({ legs: [
  { mode: 'foot', expectedStartTime: iso(avg - gå), expectedEndTime: iso(avg), fromPlace: HER, toPlace: fra },
  { mode: 'bus', expectedStartTime: iso(avg), expectedEndTime: iso(ank), fromPlace: fra, toPlace: SEN }] });
const TPS = [reise(HAN, 17, 21, 53), reise(SAK, 4, 13, 43), reise(HAN, 17, 31, 63)];

describe('beste stopp mot … slik Entur regner det (v1.218.278)', () => {
  it('før-bildet: telleregelen valgte Hansensvingen; reisene sier Saksevik', () => {
    const kall = (fra, min) => ({ ms: nå + min * 60000, call: { _fra: { id: fra } } });
    const dirs = [{ calls: [kall('HAN', 21)] }, { calls: [kall('HAN', 31)] }, { calls: [kall('HAN', 41)] }, { calls: [kall('SAK', 13)] }];
    expect(listeStoppKandidat(dirs, 'SAK', id => (id === 'HAN' ? 17 : 4), nå).id).toBe('HAN');
    expect(besteFraReiser(TPS, nå)).toMatchObject({ id: 'NSR:StopPlace:41', name: 'Saksevik' });
  });
  it('lik ankomst: minst gange', () => {
    expect(besteFraReiser([reise(HAN, 17, 21, 43), reise(SAK, 4, 13, 43)], nå).name).toBe('Saksevik');
    expect(besteFraReiser([reise(SAK, 4, 13, 43), reise(HAN, 17, 21, 43)], nå).name).toBe('Saksevik');
  });
  it('en reise du ikke rekker teller ikke', () => {
    expect(besteFraReiser([reise(SAK, 4, 2, 30), reise(HAN, 17, 21, 53)], nå + 5 * 60000).name).toBe('Hansensvingen');
  });
  it('uten svar: null (telleregelen er reserven)', () => {
    expect(besteFraReiser([], nå)).toBeNull();
    expect(besteFraReiser(null, nå)).toBeNull();
  });
  it('koblingen: reisesøket først, telleregelen som reserve, og et trykk venter på svaret', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const viaReise = kv && Array\.isArray\(kv\.tps\) \? besteFraReiser\(kv\.tps, nåW\) : null;/);
    expect(a).toMatch(/: \(viaReise \? null : listeStoppKandidat\(_iRetning\(_dirs, nåW\), _stop\.id, gangId, nåW\)\);/);
    expect(a).toMatch(/if \(straks && kv && kv\.tps === 'henter'\) \{ _hurtigStraks = true; \}/);
  });
});
