import { describe, it, expect } from 'vitest';
import { inngangerFraSvar, valgtInngang } from '../src/api/innganger.js';

describe('innganger fra OSM (v1.218.57)', () => {
  it('parser noder, og hopper over dem uten koordinat', () => {
    const l = inngangerFraSvar({ elements: [
      { type: 'node', id: 1, lat: 59.91, lon: 10.75, tags: { railway: 'subway_entrance', ref: 'A', wheelchair: 'yes' } },
      { type: 'node', id: 2, tags: { railway: 'subway_entrance' } },
      { type: 'way', id: 3, lat: 59.9, lon: 10.7 },
    ] });
    expect(l).toEqual([{ id: 1, lat: 59.91, lon: 10.75, navn: null, ref: 'A', trinnfri: true }]);
    expect(inngangerFraSvar(null)).toEqual([]);
  });

  it('velger inngangen på din side, ikke den nærmeste plattformen', () => {
    // Plattformen ligger midt i, en inngang i vest (nærmest plattformen) og en i øst.
    const plattform = { lat: 59.9100, lon: 10.7500 };
    const vest = { id: 'V', lat: 59.9100, lon: 10.7490 };
    const øst  = { id: 'Ø', lat: 59.9100, lon: 10.7515 };
    const duØst = { lat: 59.9100, lon: 10.7560 };
    expect(valgtInngang([vest, øst], duØst, plattform).id).toBe('Ø');
    const duVest = { lat: 59.9100, lon: 10.7440 };
    expect(valgtInngang([vest, øst], duVest, plattform).id).toBe('V');
  });

  it('ingen innganger eller ingen posisjon: ingen påstand', () => {
    expect(valgtInngang([], { lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBeNull();
    expect(valgtInngang(null, { lat: 1, lon: 1 }, { lat: 1, lon: 1 })).toBeNull();
    expect(valgtInngang([{ id: 1, lat: 1, lon: 1 }], null, { lat: 1, lon: 1 })).toBeNull();
  });
});
