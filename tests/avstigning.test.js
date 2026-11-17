// v1.218.101: «Lær av hvor jeg faktisk går av, målt med GPS.»
import { describe, it, expect, beforeEach } from 'vitest';
import { avstigningsStopp, påstigningsStopp, AVSTIGNING_MAKS_M } from '../src/api/avstigning.js';
import { storage } from '../src/storage.js';

// Linje 3 nordover: Mortensrud → Skullerud → Bogerud → Bøler → Ulsrud.
const STOPP = [['Mortensrud', 59.8493, 10.8297], ['Skullerud', 59.8665, 10.8401], ['Bogerud', 59.8761, 10.8421],
  ['Bøler', 59.8842, 10.8454], ['Ulsrud', 59.8894, 10.8496]];
const K = { nøkkel: 'SJ1', linje: '3', form: null, forventet: [],
  call: { quay: { name: 'Mortensrud', stopPlace: { id: 'NSR:StopPlace:1', name: 'Mortensrud' } },
    serviceJourney: { estimatedCalls: STOPP.map(([n, la, lo], i) => ({ quay: { stopPlace: { id: 'NSR:StopPlace:' + (i + 1), name: n, latitude: la, longitude: lo } } })) } } };
const T0 = 1_800_000_000_000;
// Om bord fra Mortensrud til Bogerud, så tre minutter gange østover bort fra linja.
const SPOR = [...[0, 1, 2].map(i => ({ lat: STOPP[i][1], lon: STOPP[i][2], acc: 10, at: T0 + i * 120_000 })),
  ...[1, 2, 3, 4].map(j => ({ lat: 59.8761, lon: 10.8421 + 0.004 * j, acc: 10, at: T0 + 240_000 + j * 30_000 }))];

describe('hvor du gikk av', () => {
  it('brudd: stoppet der du sist var på ruta', () => {
    expect(avstigningsStopp(K, SPOR, 'sluppet:brudd').name).toBe('Bogerud');
  });
  it('stille: stoppet der du sto', () => {
    const sto = [...SPOR.slice(0, 3), { lat: 59.8842, lon: 10.8455, acc: 10, at: T0 + 600_000 }];
    expect(avstigningsStopp(K, sto, 'sluppet:stille').name).toBe('Bøler');
  });
  it('ende: endestoppet', () => {
    expect(avstigningsStopp(K, [], 'sluppet:ende').name).toBe('Ulsrud');
  });
  it('for langt fra noe stopp: vet ikke, lærer ingenting', () => {
    expect(AVSTIGNING_MAKS_M).toBe(200);
    expect(avstigningsStopp(K, [{ lat: 59.87, lon: 10.87, at: T0 }], 'sluppet:stille')).toBe(null);
  });
  it('påstigningen er kallet låsen ble funnet fra', () => {
    expect(påstigningsStopp(K).name).toBe('Mortensrud');
  });
});

describe('turen registreres', () => {
  beforeEach(() => { storage.set('t.smartHist', ''); storage.set('t.vaneTelling', '2'); });
  it('en tur appen så deg ta, teller én gang, til stoppet du gikk av', async () => {
    const { lærAvstigning } = await import('../src/views/auto.js');
    const { tripCount } = await import('../src/api/smart.js');
    expect(lærAvstigning(K, SPOR, 'sluppet:brudd').name).toBe('Bogerud');
    expect(tripCount('Mortensrud', 'Bogerud')).toBe(1);
    lærAvstigning(K, SPOR, 'sluppet:brudd');
    expect(tripCount('Mortensrud', 'Bogerud')).toBe(1);
  });
  it('en startet reise teller ikke en gang til', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/_lås\.kilde !== 'reise' && String\(r\.hendelse \|\| ''\)\.startsWith\('sluppet'\)/);
  });
});
