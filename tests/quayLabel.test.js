// v1.218.122: «Formatering feiler» — «Stenbråten · plattform Stenbråten».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { quayLabel, sporFraNavn } from '../src/views/auto.js';

describe('sporet i et plattformnavn', () => {
  it('«Mortensrud E» gir E, «Holmlia 12A» gir 12A, «Stenbråten» ingenting', () => {
    expect(sporFraNavn('Mortensrud E')).toBe('E');
    expect(sporFraNavn('Holmlia 12A')).toBe('12A');
    expect(sporFraNavn('Stenbråten')).toBe(null);
    expect(sporFraNavn('Holmlia stasjon')).toBe(null);
  });
});

describe('raden fra et nabostopp', () => {
  const bus = { line: { transportMode: 'bus' } };
  it('uten spor: bare stedet, ikke stedet to ganger', () => {
    expect(quayLabel({ quay: { name: 'Stenbråten' }, serviceJourney: bus, _fra: { name: 'Stenbråten' } })).toBe('Stenbråten');
  });
  it('med spor: sporet først, så stedet (det er stedet som forkortes)', () => {
    expect(quayLabel({ quay: { publicCode: 'B' }, serviceJourney: bus, _fra: { name: 'Stenbråten' } })).toMatch(/B · Stenbråten$/);
  });
  it('kortet kan ikke bli bredere enn skjermen', () => {
    const css = readFileSync('src/style/settings.css', 'utf8');
    expect(css).toMatch(/#v-auto \.auto-dir \.nearby-dist \.auto-quay\{max-width:48%;overflow:hidden;text-overflow:ellipsis/);
  });
});
