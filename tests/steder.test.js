// v1.218.255: hele dekningsområdet, steg C — samme regler på ulike steder.
// AGENTS.md «Hele dekningsområdet»: fiksturer veksler mellom steder.
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { sammenlignViktighet, nærViktigFørst, båndFor, samletInfo } from '../src/api/stops.js';
import { sentrumFor, centreward } from '../src/api/centre.js';
import { fastFørst, fasteKandidater } from '../src/fasteStopp.js';
import { stoppLinjerLapp } from '../src/ui/stoppLapp.js';
import { målområder } from '../src/maalomrader.js';
const I = (moduser, nå, døgn, linjer = 1) => ({ moduser, avgangerNå: nå, avgangerDøgn: døgn, linjer, plattformer: 1 });
const tirsdag = t => new Date(2026, 10, 24, t, 0).getTime();

const STEDER = {
  'Oslo S (knutepunkt)': { her: { lat: 59.9111, lon: 10.7528 }, stopp: [
    { id: 'OS', name: 'Oslo S', distM: 120, info: I(['rail', 'metro', 'bus', 'tram'], 90, 1200, 60) },
    { id: 'JT', name: 'Jernbanetorget', distM: 200, info: I(['metro', 'tram', 'bus'], 80, 1100, 30) },
    { id: 'BS', name: 'Bussterminalen', distM: 380, info: I(['bus', 'coach'], 40, 500, 40) }] },
  'Tromsø sentrum': { her: { lat: 69.6496, lon: 18.9560 }, stopp: [
    { id: 'SR', name: 'Sjøgata', distM: 90, info: I(['bus'], 25, 300, 12) },
    { id: 'PR', name: 'Prostneset', distM: 260, info: I(['bus', 'water'], 10, 60, 6) }] },
  'Bygd i Innlandet (2 avganger i døgnet)': { her: { lat: 61.4, lon: 9.4 }, stopp: [
    { id: 'BK', name: 'Bygdekrysset', distM: 1800, info: I(['bus'], 0, 2, 1) },
    { id: 'RV', name: 'Riksveien', distM: 2300, info: I(['bus', 'coach'], 0, 9, 2) }] },
  'Fergekai på Vestlandet': { her: { lat: 61.2, lon: 5.6 }, stopp: [
    { id: 'FK', name: 'Fergekaia', distM: 300, info: I(['water'], 1, 18, 1) },
    { id: 'BU', name: 'Busstopp ved kaia', distM: 340, info: I(['bus'], 1, 6, 1) }] },
};

describe.each(Object.entries(STEDER))('%s', (navn, sted) => {
  const viktig = s => s.info;
  const min = Math.min(...sted.stopp.map(s => s.distM));
  const rangert = [...sted.stopp].sort(nærViktigFørst(viktig, undefined, båndFor(min)));
  it('rangeringen gir et svar, og tilbudet teller innen båndet', () => {
    expect(rangert).toHaveLength(sted.stopp.length);
    expect(båndFor(min)).toBeGreaterThanOrEqual(400);
    // Det beste tilbudet (transportmiddel, så neste time, så døgnet) står først innen båndet.
    const innen = sted.stopp.filter(s => s.distM <= båndFor(min));
    const best = [...innen].sort((a, b) => sammenlignViktighet(a.info, b.info))[0];
    expect(rangert[0].id).toBe(best.id);
  });
  it('faste stopp: forslag finnes, og morgen-stoppet vinner om morgenen', () => {
    const k = fasteKandidater(sted.stopp, sted.stopp[0], viktig);
    expect(k.length).toBeGreaterThan(0);
    const siste = sted.stopp[sted.stopp.length - 1];
    const først = fastFørst(sted.stopp, { hjem: { stopId: siste.id } }, tirsdag(7))[0].id;
    // Står du ved et stopp (≤ 100 m), blir det stående; ellers vinner morgen-stoppet.
    expect(først).toBe(sted.stopp[0].distM <= 100 ? sted.stopp[0].id : siste.id);
  });
  it('stopplappen sier linjene, også med få avganger', () => {
    expect(stoppLinjerLapp([{ kode: '1', ms: Date.now() + 3600_000 }], 5, Date.now())).toMatch(/stopp-linjer/);
  });
  it('sentrum: by der det finnes en, ellers ingen — og aldri feil by', () => {
    const s = sentrumFor(sted.her);
    if (navn.startsWith('Oslo')) expect(s.by).toBe('Oslo');
    if (navn.startsWith('Tromsø')) expect(s.by).toBe('Tromsø');
    if (navn.startsWith('Bygd') || navn.startsWith('Ferge')) expect(s).toBe(null);
    expect(centreward(sted.her, [])).toBe(null);
  });
});

describe('målområdene virker uten by', () => {
  it('to retninger fra en bygd uten sentrum deles etter himmelretning', () => {
    const her = { lat: 61.4, lon: 9.4 };
    const st = (n, dLat, dLon) => ({ name: n, lat: her.lat + dLat, lon: her.lon + dLon });
    const dirs = [
      { frontText: 'Fagernes', key: 'N', stopp: [st('Nord 1', 0.05, 0), st('Fagernes', 0.12, 0)] },
      { frontText: 'Gjøvik', key: 'S', stopp: [st('Sør 1', -0.05, 0), st('Gjøvik', -0.12, 0)] },
    ];
    const o = målområder(dirs, her, d => d.stopp, d => d.key);
    expect(o.map(x => x.tekst).sort()).toEqual(['mot Fagernes', 'mot Gjøvik']);
  });
});
