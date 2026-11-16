import { describe, it, expect } from 'vitest';
import { makeStopIcon, erKnutepunkt } from '../src/ui/mapIcons.js';

describe('knutepunkt som ring, ikke tall (v1.218.84)', () => {
  // Rapportert: «Hvorfor 2-tallet ved oransje sirkel?»
  it('ingen tall på holdeplassmerket', () => {
    const html = makeStopIcon('metro', 2, { primary: true }).options.html;
    expect(html).not.toMatch(/>2</);
  });
  it('informasjonen beholdes: et knutepunkt får en ring', () => {
    expect(erKnutepunkt(2)).toBe(true);
    expect(erKnutepunkt(1)).toBe(false);
    expect(makeStopIcon('metro', 2).options.html).toContain('data-knutepunkt="1"');
    expect(makeStopIcon('bus', 1).options.html).toContain('data-knutepunkt="0"');
  });
  it('rangeringen er fortsatt størrelsen', () => {
    expect(makeStopIcon('bus', 1, { primary: true }).options.iconSize).toEqual([15, 15]);
    expect(makeStopIcon('bus', 1, { viktig: true }).options.iconSize).toEqual([13, 13]);
    expect(makeStopIcon('bus', 1).options.iconSize).toEqual([11, 11]);
  });
});
