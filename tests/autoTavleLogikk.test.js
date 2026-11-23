import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// docs/auto-tavle-logikk.md skal si det koden gjør. Hvert tall står to steder —
// derfor binder denne testen dem: endres koden, faller testen til dokumentet følger.
const doc = readFileSync('docs/auto-tavle-logikk.md', 'utf8');
const kode = ['src/geo.js', 'src/position.js', 'src/api/stops.js', 'src/views/auto.js', 'src/ui/tavleRad.js', 'src/fasteStopp.js']
  .map(f => readFileSync(f, 'utf8')).join('\n');

// [navn, slik det står i dokumentet, slik det står i koden]
const TALL = [
  ['NEAR_STOP_MAX_M', '850', /NEAR_STOP_MAX_M = 850;/],
  ['ACC_GATE', '40', /ACC_GATE = 40;/],
  ['STATION_REFRESH_M', '200', /STATION_REFRESH_M = 200;/],
  ['CLOSE_M', '100', /CLOSE_M = 100;/],
  ['VIKTIG_GANG_M', '400', /VIKTIG_GANG_M = 400;/],
  ['FAST_MAKS_M', '640', /FAST_MAKS_M = 640;/],
  ['AVKLAR_ACC_M', '50', /AVKLAR_ACC_M = 50,/],
  ['AVKLAR_MAKS_MS', '8 s', /AVKLAR_MAKS_MS = 8000;/],
  ['PICK_MARGIN_M', '40', /PICK_MARGIN_M = 40;/],
  ['LISTE_TOPP', '5', /LISTE_TOPP = 5;/],
  ['LISTE_RO_MS', '90 s', /LISTE_RO_MS = 90_000;/],
  ['LISTE_MIN_MELLOM_MS', '5 min', /LISTE_MIN_MELLOM_MS = 5 \* 60_000;/],
  ['LISTE_HOLD_M', '800', /LISTE_HOLD_M = 800;/],
  ['AT_STOP_M', '120', /AT_STOP_M = 120;/],
  ['MERKE_UT_M', '30', /MERKE_UT_M = 30;/],
  ['AUTO_BOARD_DEPARTURES', '30', /AUTO_BOARD_DEPARTURES = 30;/],
  ['TAVLE_NABO_MAKS', '5', /TAVLE_NABO_MAKS = 5;/],
  ['TAVLE_GANG_MAKS_MIN', '8', /TAVLE_GANG_MAKS_MIN = 8;/],
  ['KNUTEPUNKT_VENT_MS', '2,5 s', /KNUTEPUNKT_VENT_MS = 2500;/],
  ['KOMBI_GYLDIG_MS', '3 min', /KOMBI_GYLDIG_MS = 3 \* 60_000;/],
  ['TAVLE_SIDE', '12', /TAVLE_SIDE = 12;/],
  ['AT_TOM_MAKS', '3', /AT_TOM_MAKS = 3;/],
  ['EDDERKOPP_STOPP', '6', /EDDERKOPP_STOPP = 6;/],
];

describe('docs/auto-tavle-logikk.md sier det koden gjør', () => {
  for (const [navn, iDok, iKode] of TALL) {
    it(navn, () => {
      expect(doc).toContain('`' + navn + ' = ' + iDok);
      expect(kode).toMatch(iKode);
    });
  }
  it('søketrinnene og transportmiddelvektene', () => {
    expect(doc).toContain('`SØK_TRINN_KM = [0.85, 2, 5]`');
    expect(kode).toMatch(/SØK_TRINN_KM = \[NEAR_STOP_MAX_M \/ 1000, 2, 5\];/);
    expect(kode).toMatch(/MODUS_VEKT = \{ rail: 4, metro: 4, monorail: 4, tram: 3, bus: 2, coach: 2, trolleybus: 2, taxi: 2, water: 2,/);
  });
  it('transportmiddeltabellen dekker hele Enturs TransportMode (lest fra skjemaet 2026-11-23)', () => {
    const ENTUR = ['air', 'bus', 'cableway', 'water', 'funicular', 'lift', 'rail', 'snowAndIce', 'metro', 'taxi', 'tram', 'trolleybus', 'monorail', 'coach', 'carpool'];
    const tabell = doc.slice(doc.indexOf('## Transportmidlene'), doc.indexOf('## Hva du styrer selv'));
    for (const m of ENTUR) expect(tabell).toContain('`' + m + '`');
    const stops = readFileSync('src/api/stops.js', 'utf8');
    for (const m of ENTUR) expect(stops).toMatch(new RegExp('MODUS_VEKT = \\{[^}]*\\b' + m + ':'));
    const q = readFileSync('src/api/queries.js', 'utf8');
    expect(q).toMatch(/BOARD_MODES_COACH = \[\.\.\.BOARD_MODES, 'coach', 'taxi'\];/);
    expect(doc).toContain("`BUSS_FØLGER = ['coach', 'taxi']`");
    expect(q).toMatch(/export const BUSS_FØLGER = \['coach', 'taxi'\];/);
  });
  it('AGENTS.md peker hit', () => {
    expect(readFileSync('AGENTS.md', 'utf8')).toContain('docs/auto-tavle-logikk.md');
  });
});
