// v1.218.106: «Knappene legger seg over kompasset.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { somRad, medLøft, KOMPASS_PLASS } from '../src/ui/kartVerktoy.js';

describe('søylen regner med kompasset', () => {
  it('tavlekartet fra skjermbildet (235 px, 4 knapper): rad med kompass, søyle uten', () => {
    expect(KOMPASS_PLASS).toBe(56);
    expect(somRad(4, 235, true)).toBe(true);
    expect(somRad(4, 235, false)).toBe(false);
  });
  it('høyt kart: søyle også med kompass', () => {
    expect(somRad(4, 382, true)).toBe(false);
    expect(medLøft(4, 382, true)).toBe(true);
  });
  it('tilpassForm leser om kartet har kompass, og kompasset kaller tilpassForm', () => {
    const src = readFileSync('src/ui/kartVerktoy.js', 'utf8');
    expect(src).toMatch(/somRad\(n, h, øverst\)/);
    // Bare et SYNLIG kompass tar plass: det står skjult til kartet er rotert.
    expect(src).toMatch(/const øverst = !!\(v\.øverst && \[\.\.\.v\.øverst\.values\(\)\]\.some\(b => !b\.hidden\)\)/);
    expect(src).toMatch(/øverstKontroll\.getContainer\(\)\.appendChild\(b\);\s*tilpassForm\(map\);/);
  });
});
