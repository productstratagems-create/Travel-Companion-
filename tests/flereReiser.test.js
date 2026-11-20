// v1.218.169: flere reiser i reiseplanen — etappe bare når den fortsetter der en reise endte.
import { describe, it, expect } from 'vitest';
import { reiser, fortsetter, kandidatReise, slettReise, savePlan, loadPlan, clearPlan, addLegToPlan } from '../src/api/plan.js';

const T = h => new Date(Date.UTC(2026, 10, 21, 0, Math.round(h * 60))).toISOString();
const reise0 = { id: 'r1', legs: [{ id: 'a', reise: 'r1', from: { name: 'Stenbråten' }, to: { name: 'Oslo S' }, depIso: T(7.78), arrIso: T(8.23) }] };
const avg = h => ({ expectedDepartureTime: T(h), serviceJourney: { id: 'sj' + h, line: { publicCode: '1' } } });

describe('fortsetter', () => {
  // FØR-BILDET: Stenbråten → Oslo S 07:17 er ikke en etappe i reisen til Oslo S.
  it('samme strekning igjen er en egen reise', () => {
    expect(fortsetter(reise0, avg(6.28), { from: 'Stenbråten', to: 'Oslo S' })).toBe(false);
  });
  it('like etter ankomst, men fra et annet sted, er en egen reise', () => {
    expect(fortsetter(reise0, avg(8.5), { from: 'Stenbråten', to: 'Oslo S' })).toBe(false);
  });
  it('fra Oslo S like etter ankomst er neste etappe', () => {
    expect(fortsetter(reise0, avg(8.5), { from: 'Oslo S', to: 'Lillestrøm' })).toBe(true);
  });
  it('over tre timer etter, eller før ankomst, er ikke', () => {
    expect(fortsetter(reise0, avg(13), { from: 'Oslo S', to: 'Lillestrøm' })).toBe(false);
    expect(fortsetter(reise0, avg(8), { from: 'Oslo S', to: 'Lillestrøm' })).toBe(false);
  });
});

describe('reiser', () => {
  it('gamle etapper uten reise-id er én reise; sortert etter første avgang', () => {
    const r = reiser([{ id: 'x', depIso: T(9) }, { id: 'y', depIso: T(8) }, { id: 'z', reise: 'r2', depIso: T(6) }]);
    expect(r.map(x => x.id)).toEqual(['r2', 'r0']);
    expect(r[1].legs.map(l => l.id)).toEqual(['y', 'x']);
  });
  it('ny avgang uten reise-id blir egen reise; sletting av én lar de andre stå', () => {
    clearPlan();
    addLegToPlan(avg(7.78), { from: 'Stenbråten', to: 'Oslo S' });
    addLegToPlan(avg(6.28), { from: 'Stenbråten', to: 'Oslo S' });
    const r = reiser(loadPlan());
    expect(r.length).toBe(2);
    slettReise(r[0].id);
    expect(reiser(loadPlan()).length).toBe(1);
    clearPlan();
  });
  it('kandidat finnes bare når avgangen fortsetter', () => {
    expect(kandidatReise(reise0.legs, avg(8.5), { from: 'Oslo S' })).not.toBe(null);
    expect(kandidatReise(reise0.legs, avg(6.28), { from: 'Stenbråten' })).toBe(null);
  });
});

import { readFileSync } from 'node:fs';
describe('skjermene (v1.218.169)', () => {
  it('avgangsdetaljer spør bare når avgangen fortsetter en reise', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toMatch(/const kandidat = !alreadyInPlan && !bedt \? kandidatReise\(loadPlan\(\), c, dir\) : null;/);
    expect(s).toMatch(/'➕ neste etappe i reisen til ' \+ til/);
  });
  it('planen tegner hver reise for seg, og kortet på Rute den neste', () => {
    const s = readFileSync('src/views/plan.js', 'utf8');
    expect(s).toMatch(/grupper\.map\(g => _reiseHtml\(g\.legs, g\.id, now\)\)/);
    expect(s).toMatch(/const legs = \(gr\.find\(g => planStatus\(g\.legs, Date\.now\(\)\) !== 'done'\) \|\| gr\[gr\.length - 1\]\)\.legs;/);
  });
});
