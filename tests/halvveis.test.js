// v1.218.135: gangtidslappen står halvveis på gangruta.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { halvveis } from '../src/views/auto.js';

describe('halvveis', () => {
  it('rett linje: midtpunktet', () => {
    expect(halvveis([[0, 0], [0, 2]])).toEqual([0, 1]);
  });
  it('en svingete rute: halvveis langs ruta, ikke mellom endene', () => {
    // 0,0 → 0,3 → 1,3: lengde 4, halvveis er 0,2 — ikke midt mellom endene (0.5, 1.5)
    const m = halvveis([[0, 0], [0, 3], [1, 3]]);
    expect(m[0]).toBeCloseTo(0); expect(m[1]).toBeCloseTo(2);
  });
  it('tåler objekter og tomt', () => {
    expect(halvveis([{ lat: 0, lon: 0 }, { lat: 0, lon: 4 }])).toEqual([0, 2]);
    expect(halvveis([])).toBe(null);
  });
  it('v1.218.224: halvveis bærer gangpillen; stopplappen står ved stoppet', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/const midt = sentrert && walkPts && walkPts\.length >= 2 \? halvveis\(walkPts\) : null;/);
    expect(s).toMatch(/L\.marker\(pillePunkt\(walkPts, _tre\.veivalg\), [\s\S]{0,200}gang-pille-anker[\s\S]{0,200}'🚶 '/);   // v1.218.231: på grenen
    // Før: stopplappen ble forskjøvet til midtpunktet (direction center, offset [dx, dy]).
    expect(s).not.toMatch(/direction: 'center', offset: \[dx, dy\]/);
  });
});
import { pillePunkt } from '../src/views/auto.js';
describe('gangtiden på sin egen gren (v1.218.231)', () => {
  // Ruta 0,0 → 0,6; veivalget ved 0,2, så grenen som bare er stoppets er 0,2 → 0,6.
  const rute = [[0, 0], [0, 1], [0, 2], [0, 4], [0, 6]];
  it('uten veivalg: midt på hele ruta', () => {
    expect(pillePunkt(rute, [])).toEqual(halvveis(rute));
  });
  it('før-bildet: midt på hele ruta (0,3) lå i gaffelen; nå midt på grenen etter veivalget (0,4)', () => {
    expect(halvveis(rute)).toEqual([0, 3]);
    expect(pillePunkt(rute, [[0, 2]])).toEqual([0, 4]);
  });
});
import { kartGangNøkkel } from '../src/views/auto.js';
describe('gangminuttene i kartnøkkelen (v1.218.232: «12 og 11 min»)', () => {
  it('nytt minutt gir ny nøkkel, så lappene tegnes på nytt', () => {
    expect(kartGangNøkkel({ mins: 11 }, { gangMin: 10 })).not.toBe(kartGangNøkkel({ mins: 12 }, { gangMin: 10 }));
    expect(kartGangNøkkel({ mins: 12 }, { gangMin: 9 })).not.toBe(kartGangNøkkel({ mins: 12 }, { gangMin: 10 }));
    expect(kartGangNøkkel(null, null)).toBe('|w-:-');
  });
  it('kartnøkkelen bruker den', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/\+ kartGangNøkkel\(_stop \? gangTil\(_stop\) : null, _altStopp\(\)\)/);
  });
});
