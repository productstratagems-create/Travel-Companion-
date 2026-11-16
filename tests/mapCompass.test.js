/**
 * Kompasset hører til kartet sitt.
 *
 * Først (rapportert): kompasset klatret ut av et upositionert omslag og havnet
 * i overskriften. Nå (v1.218.72) er det ingen absolutt posisjonering å klatre
 * med: kompasset er en knapp i verktøysøylen inne i kartet, nede til høyre,
 * vist bare når kartet er rotert. Testene er skrevet om med vilje.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/leafletGlobal.js', () => ({}));
vi.mock('leaflet-rotate', () => ({}));
const lagt = [], satt = [];
vi.mock('../src/ui/kartVerktoy.js', () => ({
  leggTil: (m, id, o) => { lagt.push(id); const b = document.createElement('button'); b.innerHTML = o.ikon || ''; b.onclick = o.påTrykk; return b; },
  sett: (m, id, o) => { satt.push([id, o]); },
}));

const fakeMap = (bearing = 0) => ({ getBearing: () => bearing, setBearing: vi.fn(), on: vi.fn() });

let addCompass;
beforeEach(async () => {
  lagt.length = 0; satt.length = 0;
  ({ addCompass } = await import('../src/ui/mapCompass.js'));
});

describe('addCompass', () => {
  it('legger kompasset i verktøysøylen', () => {
    addCompass(fakeMap(), document.createElement('div'));
    expect(lagt).toEqual(['kompass']);
  });
  it('skjult når nord er opp, vist når kartet er rotert', () => {
    addCompass(fakeMap(0), document.createElement('div'));
    expect(satt.at(-1)).toEqual(['kompass', { skjult: true }]);
    addCompass(fakeMap(30), document.createElement('div'));
    expect(satt.at(-1)).toEqual(['kompass', { skjult: false }]);
  });
  it('gjør ingenting uten kartelement', () => {
    expect(() => addCompass(fakeMap(), null)).not.toThrow();
    expect(lagt).toEqual([]);
  });
});
