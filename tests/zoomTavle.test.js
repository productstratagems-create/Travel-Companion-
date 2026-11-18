// v1.218.124: Auto-tavle uten + og −, søylen alltid loddrett.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { zoomKnapperSynlige } from '../src/views/auto.js';
import { somRad, tett } from '../src/ui/kartVerktoy.js';

describe('+ og − i Auto-tavle', () => {
  // ENDRET MED VILJE (v1.218.128): skjult i auto-reise også.
  it('skjult i både Auto-tavle og auto-reise', () => {
    expect(zoomKnapperSynlige(true)).toBe(false);
    expect(zoomKnapperSynlige(false)).toBe(false);
  });
  it('tre knapper står rett og loddrett også på et lavt kart', () => {
    expect(somRad(3, 160)).toBe(false);
    expect(tett(3, 160)).toBe(false);
  });
  it('modusen og kartbyggingen sier fra', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/_aMap = createMap\(el\);\s*_zoomKnapper\(\);/);
    expect(s).toMatch(/_autoTavle = !!på;\s*_zoomKnapper\(\);/);
  });
});
