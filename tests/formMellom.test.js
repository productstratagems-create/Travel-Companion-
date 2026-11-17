// v1.218.98: busser følger veien i auto-reise, ikke rette streker mellom stopp.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { formMellom, FORM_MAKS_AVVIK_M } from '../src/ui/path.js';

// En kurve: øst, så nord, så vest (~1,1 km per side på 60°N).
const BUE = [[59.90, 10.80], [59.90, 10.82], [59.91, 10.82], [59.91, 10.80]];
describe('formMellom', () => {
  it('delstrekningen går fra stopp til stopp, med svingene imellom', () => {
    const v = formMellom(BUE, { lat: 59.9001, lon: 10.81 }, { lat: 59.9099, lon: 10.81 });
    expect(v.length).toBe(4);
    expect(v[1]).toEqual([59.90, 10.82]);
    expect(v[2]).toEqual([59.91, 10.82]);
  });
  it('et stopp langt fra formen gir null', () => {
    expect(FORM_MAKS_AVVIK_M).toBe(150);
    expect(formMellom(BUE, { lat: 59.9001, lon: 10.81 }, { lat: 59.95, lon: 10.81 })).toBe(null);
  });
  it('sløyfe: målet søkes etter starten, ikke bakover', () => {
    // Endestoppet ligger nær starten av linja, men nås først etter runden.
    const sløyfe = [[59.90, 10.80], [59.90, 10.82], [59.91, 10.82], [59.91, 10.80], [59.9005, 10.8]];
    // Start midt på andre side; målet ligger nærmest linjas BEGYNNELSE,
    // men turen når det først på slutten av runden.
    const v = formMellom(sløyfe, { lat: 59.905, lon: 10.82 }, { lat: 59.8999, lon: 10.8001 });
    expect(v).not.toBe(null);
    expect(v[v.length - 2]).toEqual([59.91, 10.80]);
  });
  it('auto-reise, underveis og tavla spør samme definisjon (v1.218.99)', () => {
    const les = f => readFileSync(f, 'utf8');
    expect((les('src/views/auto.js').match(/turForm\(/g) || []).length).toBe(3);
    expect(les('src/views/track.js')).toMatch(/turForm\(leg\.journeyId/);
    expect(les('src/views/board.js')).toMatch(/legShape\(leg\) \|\| \(legStops\.length >= 2\s*\? turForm\(/);
    // Bare et treff tegner på nytt.
    expect(les('src/ui/turForm.js')).toMatch(/if \(pts && pts\.length >= 2 && påTreff\) påTreff\(\)/);
  });
});
