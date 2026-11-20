// v1.218.170: «Rart at Bjørvika legger seg som t-bane stopp?»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kategorierFor, placeIcon } from '../src/ui/fmt.js';

const BJ = { name: 'Bjørvika, Oslo', stopId: 'NSR:StopPlace:B' };
describe('merket på et lagret stopp', () => {
  // FØR-BILDET: lagrede stopp fikk alltid ['metroStation'] → «T».
  it('Bjørvika med trikk og buss i søket: trikk, ikke T-bane', () => {
    const treff = [{ properties: { id: 'NSR:StopPlace:B', name: 'Bjørvika', category: ['onstreetTram', 'onstreetBus'] } }];
    expect(placeIcon(kategorierFor(BJ, treff)).txt).toBe('Tr');
  });
  it('også fra geocodeDest-rader, og på navn når id mangler', () => {
    expect(placeIcon(kategorierFor({ name: 'Bjørvika' }, [{ label: 'Bjørvika, Oslo', category: ['onstreetBus'] }])).txt).toBe('B');
  });
  it('uten treff: «brukt før», ikke et transportmiddel', () => {
    expect(placeIcon(kategorierFor(BJ, [])).cls).toBe('si-hist');
  });
  it('en T-banestasjon er fortsatt T', () => {
    expect(placeIcon(kategorierFor({ name: 'Mortensrud', stopId: 'M' }, [{ properties: { id: 'M', category: ['metroStation'] } }])).txt).toBe('T');
  });
  it('ingen gjetning igjen i forslagslista', () => {
    expect(readFileSync('src/views/settings.js', 'utf8')).not.toMatch(/p\.stopId \? \['metroStation'\]/);
  });
});
