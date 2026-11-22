import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { beinFra, beinStart, edderkoppBein } from '../src/views/auto.js';

// Oslo: overskrift Mortensrud buss, L2 fra Hauketo stasjon. Bergen: Bybanen fra Nesttun.
const MRB = { id: 'NSR:StopPlace:1', name: 'Mortensrud', lat: 59.849, lon: 10.829 };
const HAU = { id: 'NSR:StopPlace:2', name: 'Hauketo stasjon', lat: 59.846, lon: 10.802 };
const NES = { id: 'NSR:StopPlace:3', name: 'Nesttun', lat: 60.318, lon: 5.354 };

describe('hver linje tegnes fra sin egen stasjon (v1.218.276)', () => {
  it('før-bildet: beinet startet i overskriftens stopp; nå i stasjonen kallet går fra', () => {
    const fra = beinFra({ id: HAU.id, name: HAU.name }, MRB, [MRB, HAU]);
    expect(fra).toBe(HAU);
    expect(beinStart({ spor: null }, [], fra)).toEqual({ lat: HAU.lat, lon: HAU.lon });
  });
  it('med koordinater på kallet: brukes direkte; uten _fra: overskriftens stopp som før', () => {
    expect(beinFra(NES, MRB, [])).toBe(NES);
    expect(beinFra(null, MRB, [MRB, HAU])).toBe(MRB);
    expect(beinFra({ id: 'ukjent' }, MRB, [MRB])).toBe(MRB);
  });
  it('edderkoppbeina bærer stasjonen, og tegningen bruker den', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/fra: \(ride\.call && ride\.call\._fra\) \|\| null,/);
    expect(a).toMatch(/const fra = beinFra\(b\.fra, _stop, _stops\(\)\);\s*const _pl = _plattformer\(fra\.id \|\| _stop\.id\);\s*const start = beinStart\(b, Array\.isArray\(_pl\) \? _pl : \[\], fra\);/);
    expect(a).toMatch(/const line = _open && _stop \? stopsAhead\(_open\.call, åpenFra\.name/);
    expect(a).toMatch(/const kf = _stop \? beinFra\(_kortRute/);
  });
});
