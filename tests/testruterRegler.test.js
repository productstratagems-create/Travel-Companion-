// Hver regel i src/testruter.js kan feile.
//
// Testrutene består i dag, så en regel som alltid sa «ok» ville sett lik ut
// som en som virker. Her får hver regel et tilfelle den skal slå ned på.
import { describe, it, expect } from 'vitest';
import { vurder, radGangM, råAnkomst } from '../src/testruter.js';

const T = m => new Date(Date.UTC(2026, 10, 4, 7, m)).toISOString();
const etappe = (mode, fra, til) => ({ mode, expectedStartTime: T(fra), expectedEndTime: T(til) });
const mønster = (...legs) => ({ legs });
const rad = (dep, arr, ...modi) => ({ c: {
  expectedDepartureTime: T(dep), _finalArrival: T(arr),
  _legs: modi.map(m => ({ mode: m })), _allLegs: modi.map(m => ({ mode: m })),
} });
const RUTE = { forventer: ['metro'], maxBytter: 0, maxGangM: 300 };
const regel = (u, navn) => u.find(r => r.regel === navn);

describe('reglene feiler når de skal', () => {
  const rå = [mønster(etappe('metro', 0, 20))];

  it('svar: ingen rader', () => {
    expect(regel(vurder(RUTE, rå, 1, [], []), 'svar').ok).toBe(false);
  });
  it('ingen stille tap: et mønster forsvant uten grunn', () => {
    const u = vurder(RUTE, [...rå, mønster(etappe('bus', 1, 30))], 1, [rad(0, 20, 'metro')], []);
    expect(regel(u, 'ingen stille tap').ok).toBe(false);
  });
  it('riktig transportmiddel: beste reise er buss når T-bane er forventet', () => {
    expect(regel(vurder(RUTE, [mønster(etappe('bus', 0, 20))], 1, [rad(0, 20, 'bus')], []), 'riktig transportmiddel').ok).toBe(false);
  });
  it('ikke dårligere enn Entur: appen mistet reisen som kommer 10 min tidligere fram', () => {
    const toRå = [mønster(etappe('metro', 0, 20)), mønster(etappe('metro', 5, 30))];
    expect(regel(vurder(RUTE, toRå, 2, [rad(5, 30, 'metro')], []), 'ikke dårligere enn Entur').ok).toBe(false);
  });
  it('bytter: ett bytte der ingen er tillatt', () => {
    expect(regel(vurder(RUTE, rå, 1, [rad(0, 20, 'metro', 'bus')], []), 'bytter').ok).toBe(false);
  });
  it('stigende avganger: rader i feil rekkefølge', () => {
    expect(regel(vurder(RUTE, rå, 1, [rad(10, 25, 'metro'), rad(0, 20, 'metro')], []), 'stigende avganger').ok).toBe(false);
  });
  it('og alt holder for en god reise', () => {
    expect(vurder(RUTE, rå, 1, [rad(0, 20, 'metro')], []).every(r => r.ok)).toBe(true);
  });
});

describe('målene reglene bruker', () => {
  it('gange måles langs gangeetappens form', () => {
    // ca 111 m mellom to punkter 0,001° fra hverandre i bredde.
    const c = { _allLegs: [{ mode: 'foot', _shape: [[59.9, 10.7], [59.901, 10.7]] }, { mode: 'metro' }] };
    expect(radGangM(c)).toBeGreaterThan(100);
    expect(radGangM(c)).toBeLessThan(120);
  });
  it('gange: for langt slår ut', () => {
    const r = { c: { ...rad(0, 20, 'metro').c, _allLegs: [{ mode: 'foot', _shape: [[59.9, 10.7], [59.91, 10.7]] }, { mode: 'metro' }] } };
    expect(regel(vurder(RUTE, [mønster(etappe('metro', 0, 20))], 1, [r], []), 'gange').ok).toBe(false);
  });
  it('ankomst er slutten av siste etappe', () => {
    expect(råAnkomst(mønster(etappe('foot', 0, 3), etappe('metro', 3, 20)))).toBe(Date.parse(T(20)));
  });
});
