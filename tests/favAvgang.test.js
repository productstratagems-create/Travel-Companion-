// Et trykk på en lagret avgang åpner avgangen, ikke bare tavla.
//
// Rapportert: «3 08:39 Mortensrud → Jernbanetorget» i Lagret viste tavla.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { nesteForekomst, finnFavAvgang, FAV_ÅPNE_TOL_MINS } from '../src/api/usual.js';

const L = (d, hh, mm) => new Date(2026, 10, d, hh, mm).getTime();
const rad = (linje, hh, mm) => ({ expectedDepartureTime: new Date(L(6, hh, mm)).toISOString(), serviceJourney: { line: { publicCode: linje } } });
const FAV = { type: 'timed', line: '3', departureHHMM: '08:39', from: 'Mortensrud', to: 'Jernbanetorget' };

describe('nesteForekomst', () => {
  it('i dag når klokkeslettet ikke har gått', () => {
    expect(nesteForekomst('08:39', L(6, 6, 45))).toBe(L(6, 8, 39));
  });
  it('i morgen når det har gått', () => {
    expect(nesteForekomst('08:39', L(6, 9, 0))).toBe(L(7, 8, 39));
  });
});

describe('finnFavAvgang', () => {
  it('samme linje, nærmest klokkeslettet', () => {
    const r = [rad('3', 8, 24), rad('76', 8, 39), rad('3', 8, 40)];
    expect(finnFavAvgang(FAV, r, L(6, 8, 39))).toBe(r[2]);
  });
  it('ikke en annen linje, selv på minuttet', () => {
    expect(finnFavAvgang(FAV, [rad('76', 8, 39)], L(6, 8, 39))).toBeNull();
  });
  it('ikke neste tog: høyst tre minutter unna', () => {
    expect(FAV_ÅPNE_TOL_MINS).toBe(3);
    expect(finnFavAvgang(FAV, [rad('3', 8, 54)], L(6, 8, 39))).toBeNull();
    expect(finnFavAvgang(FAV, [rad('3', 8, 42)], L(6, 8, 39))).not.toBeNull();
  });
});

describe('tavla åpner bestillingen', async () => {
  const { _åpneBestiltFav } = await import('../src/views/board.js');
  const { state } = await import('../src/state.js');
  it('treff: åpner raden, én gang', () => {
    const r = rad('3', 8, 39); state.deps = [rad('3', 8, 24), r];
    window.tap = vi.fn(); window._åpneFavAvgang = { fav: FAV, målMs: L(6, 8, 39) };
    expect(_åpneBestiltFav({})).toBe(r);
    expect(window.tap).toHaveBeenCalledWith(r);
    expect(_åpneBestiltFav({})).toBeNull();
  });
  it('uten treff: sier det', () => {
    document.body.innerHTML = '<div id="board-error" style="display:none"></div>';
    state.deps = [rad('3', 9, 30)]; window.tap = vi.fn();
    window._åpneFavAvgang = { fav: FAV, målMs: L(6, 8, 39) };
    expect(_åpneBestiltFav({})).toBeNull();
    expect(window.tap).not.toHaveBeenCalled();
    expect(document.getElementById('board-error').textContent).toContain('Fant ikke 3 kl. 08:39');
  });
});

describe('koblingen', () => {
  it('en lagret avgang legger en bestilling med neste forekomst', () => {
    const s = readFileSync('src/views/favs.js', 'utf8');
    expect(s).toMatch(/if \(fav\.type === 'timed'\) \{\s*const målMs = nesteForekomst\(fav\.departureHHMM, Date\.now\(\)\);/);
    expect(s).toContain('window._åpneFavAvgang = { fav, målMs };');
  });
  it('tavla leser den når reisesvaret er tegnet', () => {
    expect(readFileSync('src/views/board.js', 'utf8')).toMatch(/document\.getElementById\('board-error'\)\.style\.display = 'none';\s*_åpneBestiltFav\(dir\);/);
  });
});
