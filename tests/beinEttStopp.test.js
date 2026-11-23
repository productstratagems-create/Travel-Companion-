import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stopsAhead } from '../src/ui/stoppVelger.js';
import { edderkoppBein, BEIN_MIN_STOPP } from '../src/views/auto.js';

// Fra Enturs svar 2026-11-23 (forenklet): B10 Nesoddtangen → Aker brygge, og
// ferja 1068 fra samlestoppet «Hareid kai» (60039) — turen kaller ved
// understoppet «Hareid ferjekai» (38669) på samme plattform.
const nå = Date.parse('2026-11-23T09:01:00+01:00');
const iso = m => new Date(nå + m * 60000).toISOString();
const kall = (quayId, sp, lat, min) => ({ quay: { id: quayId, latitude: lat, longitude: 10.6, stopPlace: { id: sp[0], name: sp[1], latitude: lat, longitude: 10.6 } }, aimedArrivalTime: iso(min), expectedArrivalTime: iso(min), aimedDepartureTime: iso(min), expectedDepartureTime: iso(min) });
const B10 = { expectedDepartureTime: iso(29), aimedDepartureTime: iso(29), quay: { id: 'NSR:Quay:A', publicCode: 'AB' }, destinationDisplay: { frontText: 'Aker brygge' },
  serviceJourney: { id: 'sj:b10', line: { id: 'RUT:Line:B10', publicCode: 'B10', transportMode: 'water' },
    estimatedCalls: [kall('NSR:Quay:A', ['NSR:StopPlace:58368', 'Nesoddtangen'], 59.87, 29), kall('NSR:Quay:B', ['NSR:StopPlace:58382', 'Aker brygge'], 59.91, 52)] } };
const FERJE = { expectedDepartureTime: iso(10), quay: { id: 'NSR:Quay:66880' }, destinationDisplay: { frontText: 'Sulesund' },
  serviceJourney: { id: 'sj:1068', line: { id: 'MOR:Line:1068', publicCode: '1068', transportMode: 'water' },
    estimatedCalls: [kall('NSR:Quay:66880', ['NSR:StopPlace:38669', 'Hareid ferjekai'], 62.37, 10), kall('NSR:Quay:9', ['NSR:StopPlace:58754', 'Sulesund ferjekai'], 62.39, 35)] } };

describe('linjer som før ikke kunne tegnes (v1.218.281)', () => {
  it('før-bildet: ett stopp etter påstigningen ga ingen strek; nå er ett nok', () => {
    expect(BEIN_MIN_STOPP).toBe(1);
    const dirs = [{ frontText: 'Aker brygge', lines: [{ id: 'RUT:Line:B10', code: 'B10' }], call: B10, nextMs: Date.parse(B10.expectedDepartureTime), calls: [{ ms: Date.parse(B10.expectedDepartureTime), call: B10 }] }];
    const teller = {};
    const bein = edderkoppBein(dirs, 'Nesoddtangen', nå, null, null, Infinity, { stopId: 'NSR:StopPlace:58368', teller });
    expect(bein.length).toBe(1);
    expect(bein[0].stopp.map(s => s.name)).toEqual(['Aker brygge']);
  });
  it('før-bildet: samlestopp ≠ turens understopp ga «ikke funnet»; nå finnes den på plattformen', () => {
    expect(stopsAhead({ ...FERJE, quay: { id: 'ukjent' } }, 'Hareid kai', nå, 'NSR:StopPlace:60039')).toEqual([]);
    expect(stopsAhead(FERJE, 'Hareid kai', nå, 'NSR:StopPlace:60039').map(s => s.name)).toEqual(['Sulesund ferjekai']);
  });
  it('avgangsspørringen henter plattformens id i turens stopp', () => {
    expect(readFileSync('src/api/queries.js', 'utf8')).toMatch(/estimatedCalls\{quay\{id latitude longitude stopPlace/);
  });
});
