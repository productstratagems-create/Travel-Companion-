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
  // v1.218.160: «skal lede bruker til avgangsdetaljer».
  it('ett trykk åpner reisen: Underveis når den følges, ellers avgangsdetaljene', () => {
    expect(s).toMatch(/addEventListener\('click', \(\) => åpnePlan\(\)\)/);
    expect(s).toMatch(/if \(første && window\._tapPlanLeg\) \{ window\._tapPlanLeg\(første\.id\); return 'detaljer'; \}/);
  });
  it('avgangsdetaljene får hele avgangen, med overgangen', () => {
    expect(s).toMatch(/if \(avgangGyldig\(leg\.avgang\)\) \{ window\.tap\(\{ \.\.\.leg\.avgang, _dir: legDir\(leg\) \}\); return; \}/);
  });
});

import { avgangKopi } from '../src/api/plan.js';
describe('hele avgangen lagres (v1.218.160)', () => {
  it('en kopi med overgangen, uten funksjoner og sykler', () => {
    const c = { ...C, _isTransfer: true, f: () => 1 }; c.selv = c;
    const k = avgangKopi(c);
    expect(k._legs.length).toBe(2);
    expect(k._isTransfer).toBe(true);
    expect(k.f).toBe(undefined);
    expect(k.selv).toBe(undefined);
  });
});

import { oppgraderPlanEtappe, savePlan, loadPlan, clearPlan } from '../src/api/plan.js';
describe('etapper lagret før hele reisen fulgte med (v1.218.161)', () => {
  it('«direkte» om 72 → L2 blir «72 › L2 · 1 bytte» når avgangen vises', () => {
    // FØR-BILDET: lagret med bare 72, uten kjede og avgang.
    savePlan([{ id: 'l1', line: '72', serviceJourneyId: 'sj72', depIso: '2026-11-20T07:47:00Z' }]);
    expect(planBytter(loadPlan()).antall).toBe(0);
    const c = { ...C, serviceJourney: { id: 'sj72' }, expectedDepartureTime: '2026-11-20T07:47:00Z', _finalArrival: '2026-11-20T08:14:00Z' };
    expect(oppgraderPlanEtappe(c)).toBe(true);
    expect(planBytter(loadPlan())).toEqual({ antall: 1, steder: ['Kantarellen'] });
    expect(loadPlan()[0].avgang._legs.length).toBe(2);
    expect(oppgraderPlanEtappe(c)).toBe(false);   // én gang
    clearPlan();
  });
  it('avgangsdetaljene kaller oppgraderingen', () => {
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/if \(alreadyInPlan && oppgraderPlanEtappe\(c\)\) updatePlanCtx\(\);/);
  });
});

import { avgangGyldig } from '../src/api/plan.js';
describe('delte etapper, ikke hull (v1.218.162)', () => {
  // FØR-BILDET: _legs og _allLegs deler etappeobjektene, som fra adapteren.
  const gå = { mode: 'foot' };
  const a = leg('bus', '72', 'Stenbråten', 'Hauketo'), b = leg('rail', 'L2', 'Hauketo', 'Oslo S');
  const c = { _legs: [a, b], _allLegs: [gå, a, b], _isTransfer: true };
  it('kopien har alle etappene i begge listene', () => {
    const k = avgangKopi(c);
    expect(k._allLegs.map(x => x && x.mode)).toEqual(['foot', 'bus', 'rail']);
    expect(k._legs.map(x => x.mode)).toEqual(['bus', 'rail']);
    expect(avgangGyldig(k)).toBe(true);
  });
  it('en ekte sykel droppes fortsatt', () => {
    const s = { a: 1 }; s.selv = s;
    expect(avgangKopi(s)).toEqual({ a: 1 });
  });
  it('en lagret avgang med hull åpnes ikke, og repareres', () => {
    expect(avgangGyldig({ _legs: [a], _allLegs: [gå, null] })).toBe(false);
    savePlan([{ id: 'l1', line: '72', serviceJourneyId: 'sjX', depIso: 'T', kjede: planKjede(C), avgang: { _legs: [a], _allLegs: [null] } }]);
    expect(oppgraderPlanEtappe({ ...c, serviceJourney: { id: 'sjX' }, expectedDepartureTime: 'T' })).toBe(true);
    expect(avgangGyldig(loadPlan()[0].avgang)).toBe(true);
    clearPlan();
  });
});
