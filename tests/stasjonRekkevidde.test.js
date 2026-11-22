import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { STASJON_MAKS_M, NEAR_STOP_MAX_M, erStasjon, rekkeviddeFor, iNærheten } from '../src/geo.js';
import { knutepunkt, nearbyAlternatives } from '../src/views/auto.js';

// Oslo (Stenbråten/Mortensrud) og Trondheim (trikk), ikke ett nabolag.
const M = 1 / 111320;
const her = { lat: 59.845, lon: 10.83 };
const s = (id, modes, distM, dLat) => ({ id, name: id, modes, distM, lat: her.lat + dLat * M, lon: her.lon });
const STB = s('Stenbråten', ['bus'], 300, 300), MRB = s('Mortensrud buss', ['bus'], 800, -800), MRT = s('Mortensrud T', ['metro'], 1050, -1050);
const LIA = s('Lian', ['tram'], 1200, 1200), FJERNBUSS = s('Fjern buss', ['bus'], 1050, 1050), FJERNT = s('Fjern T', ['metro'], 1600, -1600);

describe('T-bane og tog lenger unna er et alternativ (v1.218.275)', () => {
  it('før-bildet: alt over 850 m var ute; nå stasjoner til 1,5 km, busser fortsatt 850 m', () => {
    expect(STASJON_MAKS_M).toBeGreaterThan(NEAR_STOP_MAX_M);
    expect(iNærheten(MRT)).toBe(true);
    expect(iNærheten(LIA)).toBe(true);
    expect(iNærheten(FJERNBUSS)).toBe(false);
    expect(iNærheten(FJERNT)).toBe(false);
    expect(nearbyAlternatives([STB, MRB, MRT, FJERNBUSS], STB).map(x => x.id)).toEqual(['Mortensrud buss', 'Mortensrud T']);
  });
  it('stasjon = skinnegående eller båt', () => {
    expect(erStasjon(['metro'])).toBe(true);
    expect(erStasjon(['water'])).toBe(true);
    expect(erStasjon(['bus'])).toBe(false);
    expect(rekkeviddeFor(['rail'])).toBe(STASJON_MAKS_M);
  });
  it('avgangene flettes inn: stasjonen måles fra deg, ikke fra bussholdeplassen', () => {
    // Mortensrud T er ~1350 m fra Stenbråten — utenfor 640 m fra stoppet, men innen 1,5 km fra deg.
    const uten = knutepunkt(STB, [STB, MRB, MRT], 640, 5, () => null);
    expect(uten.map(x => x.id)).not.toContain('Mortensrud T');
    const med = knutepunkt(STB, [STB, MRB, MRT], 640, 5, () => null, true);
    expect(med.map(x => x.id)).toContain('Mortensrud T');
    expect(knutepunkt(STB, [STB, FJERNT], 640, 5, () => null, true).map(x => x.id)).not.toContain('Fjern T');
  });
  it('koblingen: Auto-tavle ber om stasjoner fra deg; stoppsøket filtrerer per slags stopp', () => {
    const a = readFileSync('src/views/auto.js', 'utf8'), g = readFileSync('src/geo.js', 'utf8');
    expect(a).toMatch(/knutepunkt\(stopp, _stops\(\), TAVLE_GANG_M, TAVLE_NABO_MAKS, undefined, true\)/);
    expect(g).toMatch(/\.filter\(s => trinn > 0 \|\| iNærheten\(s\)\)/);
  });
});
