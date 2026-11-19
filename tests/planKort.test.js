// v1.218.159: planlagt reise — ett trykk til reisen, og bytte i stedet for «etappe 1».
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { planKjede, etappeKjede, planBytter } from '../src/api/plan.js';

const leg = (mode, kode, fra, til) => ({ mode, serviceJourney: { line: { id: 'L:' + kode, publicCode: kode, presentation: { colour: 'E60000' } } }, fromPlace: { name: fra }, toPlace: { name: til } });
const C = { _legs: [leg('bus', '72', 'Stenbråten', 'Kantarellen'), leg('rail', 'L2', 'Kantarellen', 'Oslo S')] };

describe('kjeden', () => {
  // FØR-BILDET: bare 72 ble lagret, og kortet sa «etappe 1».
  it('72 › L2 lagres, med byttet på Kantarellen', () => {
    const k = planKjede(C);
    expect(k.map(x => x.line)).toEqual(['72', 'L2']);
    expect(planBytter([{ kjede: k }])).toEqual({ antall: 1, steder: ['Kantarellen'] });
  });
  it('eldre etapper uten kjede er én linje', () => {
    expect(etappeKjede({ line: '74', mode: 'bus' }).map(x => x.line)).toEqual(['74']);
    expect(planBytter([{ line: '74' }]).antall).toBe(0);
  });
});

describe('kortet', () => {
  const s = readFileSync('src/views/plan.js', 'utf8');
  it('sier bytter, ikke «etappe»', () => {
    const i = s.indexOf('export function updatePlanCtx');
    const kort = s.slice(i, s.indexOf('export function åpnePlan'));
    expect(kort).not.toMatch(/'etappe '/);
    expect(kort).toMatch(/' bytte' : ' bytter'/);
    expect(kort).toMatch(/kjede\.map\(k => linjemerke/);
  });
  it('ett trykk åpner reisen: Underveis når den følges, ellers planen i Lagret', () => {
    expect(s).toMatch(/addEventListener\('click', \(\) => åpnePlan\(\)\)/);
    expect(s).toMatch(/if \(state\.jny\) \{ window\.jnyGoTracking && window\.jnyGoTracking\(\); return 'underveis'; \}\s*navTo\('v-saved'\);\s*window\._renderSaved && window\._renderSaved\('plan'\);/);
  });
});
