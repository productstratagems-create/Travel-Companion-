/**
 * Ett sted, ett navn — og en id når den finnes.
 *
 * Appen kjente stoppene sine som STRENGER. Et navn kan ikke måles: det kan
 * ikke si hvor langt du har å gå, hvilken vei du går, eller om to skjermer
 * snakker om samme stopp. Det er derfor fire steder sammenliknet navn som
 * delstrenger, og derfor `addLegToPlan` kunne kaste stoppets id og
 * koordinater uten at det så ut som et tap.
 */
import { describe, it, expect } from 'vitest';
import { placeOf, placeLL, samePlace, stopsOf } from '../src/api/place.js';

describe('placeOf tar imot formene appen faktisk har', () => {
  it('en rute, med siden sagt', () => {
    const dir = { from: 'Mortensrud', to: 'Oslo S', stopId: 'NSR:StopPlace:1',
      toStopId: 'NSR:StopPlace:2', _fromLat: 59.85, _fromLon: 10.83,
      _toLat: 59.91, _toLon: 10.75 };
    expect(placeOf(dir, 'from')).toEqual({ id: 'NSR:StopPlace:1', name: 'Mortensrud', lat: 59.85, lon: 10.83 });
    expect(placeOf(dir, 'to')).toEqual({ id: 'NSR:StopPlace:2', name: 'Oslo S', lat: 59.91, lon: 10.75 });
  });

  it('et quay, som pakker stoppet sitt', () => {
    expect(placeOf({ latitude: 1, longitude: 2,
      stopPlace: { id: 'NSR:StopPlace:9', name: 'Ryen T', latitude: 59.88, longitude: 10.82 } }))
      .toEqual({ id: 'NSR:StopPlace:9', name: 'Ryen T', lat: 59.88, lon: 10.82 });
  });

  it('og bruker quayets egne koordinater når stoppet mangler dem', () => {
    expect(placeOf({ latitude: 59.88, longitude: 10.82,
      stopPlace: { id: 'x', name: 'Ryen' } }))
      .toEqual({ id: 'x', name: 'Ryen', lat: 59.88, lon: 10.82 });
  });

  // DETTE BÆRER BAKOVERKOMPATIBILITETEN: en plan lagret før denne endringen
  // har `from` som ren streng. Ingenting kastes for å rydde.
  it('en gammel lagret etappe, som bare er et navn', () => {
    expect(placeOf('Mortensrud')).toEqual({ id: null, name: 'Mortensrud', lat: null, lon: null });
  });

  it('og sier at den ikke vet, framfor å late som', () => {
    expect(placeLL(placeOf('Mortensrud'))).toBe(null);
    expect(placeOf('')).toBe(null);
    expect(placeOf(null)).toBe(null);
    expect(placeOf(undefined)).toBe(null);
  });

  it('gir walkMinsTo sitt koordinatpar når det finnes', () => {
    expect(placeLL({ lat: 59.85, lon: 10.83 })).toEqual({ lat: 59.85, lon: 10.83 });
    expect(placeLL({ lat: 59.85, lon: null })).toBe(null);
  });
});

describe('samePlace', () => {
  const bryn = { id: 'NSR:StopPlace:B', name: 'Bryn' };
  const brynseng = { id: 'NSR:StopPlace:BS', name: 'Brynseng' };

  // HELE POENGET, og grunnen til at modulen finnes.
  it('skiller «Bryn» fra «Brynseng»', () => {
    expect(samePlace(bryn, brynseng)).toBe(false);
    expect(samePlace('Bryn', 'Brynseng')).toBe(false);
  });

  it('lar id-en avgjøre når begge har den', () => {
    expect(samePlace(bryn, { id: 'NSR:StopPlace:B', name: 'Noe helt annet' })).toBe(true);
    expect(samePlace(bryn, { id: 'NSR:StopPlace:BS', name: 'Bryn' })).toBe(false);
  });

  // Uten id avledes navneregelen av stopKey — ikke skrevet på nytt.
  it('faller til appens ene navneregel når id mangler', () => {
    expect(samePlace('Ryen T', 'Ryen')).toBe(true);
    expect(samePlace('Oslo S, Oslo', 'Oslo S')).toBe(true);
  });

  it('sier nei til ingenting', () => {
    expect(samePlace(null, 'Bryn')).toBe(false);
    expect(samePlace('', '')).toBe(false);
  });
});

describe('stopsOf', () => {
  const call = (id, name, lat, lon) => ({
    quay: { stopPlace: { id, name, latitude: lat, longitude: lon } },
    expectedArrivalTime: '2026-09-24T08:00:00Z',
  });
  const c = { serviceJourney: { estimatedCalls: [
    call('a', 'Bryn', 59.91, 10.81), call('b', 'Oslo S', 59.91, 10.75)] } };

  it('tar vare på lista avgangen allerede bærer', () => {
    const s = stopsOf(c);
    expect(s.map(x => x.name)).toEqual(['Bryn', 'Oslo S']);
    expect(s[0]).toMatchObject({ id: 'a', lat: 59.91, lon: 10.81 });
    expect(s[0].at).toBe('2026-09-24T08:00:00Z');
  });

  it('tåler en avgang uten liste', () => {
    expect(stopsOf(null)).toEqual([]);
    expect(stopsOf({})).toEqual([]);
    expect(stopsOf({ serviceJourney: { estimatedCalls: [{}] } })).toEqual([]);
  });
});
