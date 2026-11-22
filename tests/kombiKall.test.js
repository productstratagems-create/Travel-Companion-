import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reiseRader, kombiRader, kombiKall } from '../src/reiseTil.js';
import { legsFromTrip } from '../src/journey.js';

// Bergen: Bybanen fra Nonneseter, bytte på Danmarksplass til buss 12 mot Lønborg.
const nå = Date.parse('2026-11-23T07:40:00+01:00');
const iso = m => new Date(nå + m * 60000).toISOString();
const plass = (name, id, lat) => ({ name, latitude: lat, longitude: 5.33, quay: { id: id.replace('StopPlace', 'Quay'), stopPlace: { id } } });
const leg = (mode, kode, fra, til, a, b) => ({ mode, expectedStartTime: iso(a), expectedEndTime: iso(b), fromPlace: fra, toPlace: til,
  serviceJourney: mode === 'foot' ? null : { id: 'sj:' + kode, line: { id: 'SKY:Line:' + kode, publicCode: kode, transportMode: mode, presentation: { colour: 'f5a000' } } },
  fromEstimatedCall: mode === 'foot' ? null : { expectedDepartureTime: iso(a), quay: { publicCode: '1' }, destinationDisplay: { frontText: til.name } },
  toEstimatedCall: mode === 'foot' ? null : { expectedArrivalTime: iso(b) } });
const HER = { name: 'Ditt sted', latitude: 60.39, longitude: 5.33 };
const NON = plass('Nonneseter', 'NSR:StopPlace:101', 60.389), DAN = plass('Danmarksplass', 'NSR:StopPlace:102', 60.37), LØN = plass('Lønborg', 'NSR:StopPlace:103', 60.40);
const TP = { duration: 1800, legs: [leg('foot', '', HER, NON, 2, 5), leg('tram', '1', NON, DAN, 5, 12), leg('bus', '12', DAN, LØN, 15, 30)] };

describe('forslag med bytte kan velges (v1.218.272)', () => {
  it('før-bildet: trykk på bytteraden åpnet ingenting; nå avgangsdetaljene', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    const i = a.indexOf("body.querySelectorAll('.at-kombi')");
    expect(a.slice(i, i + 900)).toMatch(/const c = kombiKall\(r\);\s*if \(c && typeof window !== 'undefined' && window\.tap\) window\.tap\(c\);/);
  });
  it('raden bærer reisen, og kallet har begge etappene', () => {
    const r = kombiRader(reiseRader([TP], nå, null))[0];
    expect(r.bytter).toBe(1);
    const c = kombiKall(r);
    expect(c._legs.length).toBe(2);
    expect(c._isTransfer).toBe(true);
    expect([c._dir.key, c._dir.from, c._dir.stopId, c._dir.to, c._dir.toStopId])
      .toEqual(['auto-tavle', 'Nonneseter', 'NSR:StopPlace:101', 'Lønborg', 'NSR:StopPlace:103']);
  });
  it('underveis følger begge etappene', () => {
    const c = kombiKall(kombiRader(reiseRader([TP], nå, null))[0]);
    const legs = legsFromTrip(c, c._dir);
    expect(legs.map(l => [l.lineCode, l.fromStation, l.toStation])).toEqual([['1', 'Nonneseter', 'Danmarksplass'], ['12', 'Danmarksplass', 'Lønborg']]);
  });
  it('uten reise: null', () => {
    expect(kombiKall({})).toBeNull();
    expect(kombiKall(null)).toBeNull();
  });
});

import { merEtterRulling, AT_TOM_MAKS } from '../src/views/auto.js';
describe('rulling som ikke gir flere rader stopper (v1.218.272)', () => {
  it('før-bildet: med filter ble lista utvidet og tegnet om i det uendelige; nå stopper det', () => {
    let r = { vist: -1, tomme: 0 }, runder = 0;
    for (let i = 0; i < 1000; i++) { const n = merEtterRulling(r, 4); r = n; if (!n.fortsett) break; runder++; }
    expect(runder).toBeLessThanOrEqual(AT_TOM_MAKS);
  });
  it('flere synlige rader nullstiller tellingen', () => {
    expect(merEtterRulling({ vist: 4, tomme: 2 }, 9)).toEqual({ vist: 9, tomme: 0, fortsett: true });
  });
  it('vakten spør regelen før den utvider', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const r = merEtterRulling\(_atRull, body\.querySelectorAll\('\.at-rad, \.at-kombi'\)\.length\);[\s\S]{0,80}if \(!r\.fortsett\) return;/);
  });
});
