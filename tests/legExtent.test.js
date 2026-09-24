/**
 * Hvilken del av reisen er DENNE etappen?
 *
 * Fra intervjuet: overgangene er svakest, og «romlig» er kravet som brytes
 * oftest. Dette er ett målbart utslag av begge.
 *
 * `_renderPlanMap` henter reisen på nytt over nettet og finner etappens to
 * endepunkter ved å GJETTE PÅ NAVN — en delstrengtest. Etappen lagrer nemlig
 * bare navn: `addLegToPlan` kaster `dir.stopId`, `dir.toStopId` og hele
 * `estimatedCalls`-lista med koordinater, i samme tegnerunde som
 * `_renderSelMap` tegner kartet av nettopp den lista.
 *
 * Delstrengtesten har to hull, og begge tegner feil strekning UTEN å si fra.
 */
import { describe, it, expect } from 'vitest';
import { legExtent } from '../src/api/plan.js';

/** Ekte stopp i Oslo. «Bryn» ER en delstreng av «Brynseng». */
const REISEN = ['Brynseng', 'Bryn', 'Helsfyr', 'Tøyen', 'Oslo S']
  .map((name, i) => ({ name, lat: 59.9 + i / 1000, lon: 10.8 + i / 1000 }));

const leg = (from, to) => ({ id: 'leg_1', from, to, line: '1' });

describe('den rapporterte formen', () => {
  // FØR-BILDET. Etappen går fra Bryn, men «brynseng».includes('bryn') er sant
  // og Brynseng kommer først — så kartet tegner en strekning du ikke er på.
  it('lar ikke et lengre navn stjele etappens startpunkt', () => {
    const { fromIdx } = legExtent(REISEN, leg('Bryn', 'Oslo S'));
    expect(REISEN[fromIdx].name).toBe('Bryn');
  });

  // Og toIdx har ingen «bare første treff»-vakt, så den tar det SISTE
  // treffet. Dukker navnet opp to ganger, strekkes etappen for langt.
  it('strekker ikke etappen til et senere treff på samme navn', () => {
    const rundtur = [...REISEN, { name: 'Bryn', lat: 59.91, lon: 10.81 }];
    const { toIdx } = legExtent(rundtur, leg('Brynseng', 'Bryn'));
    expect(toIdx).toBe(1);
  });
});

describe('det den allerede gjør riktig', () => {
  it('finner en etappe midt i reisen', () => {
    const { fromIdx, toIdx } = legExtent(REISEN, leg('Helsfyr', 'Tøyen'));
    expect([fromIdx, toIdx]).toEqual([2, 3]);
  });

  // Geokoderen henger på kommunen; stopKey kutter ved komma.
  it('tåler at navnet bærer kommunen', () => {
    const { toIdx } = legExtent(REISEN, leg('Helsfyr', 'Oslo S, Oslo'));
    expect(REISEN[toIdx].name).toBe('Oslo S');
  });

  // «Ryen T» og «Ryen» er ett stopp — stopKey stripper T-en.
  it('tåler T-en på et T-banestopp', () => {
    const medT = [{ name: 'Ryen T' }, { name: 'Manglerud' }];
    expect(legExtent(medT, leg('Ryen', 'Manglerud')).fromIdx).toBe(0);
  });
});

/**
 * Og at den sier fra når den ikke vet.
 *
 * Bommer begge navnene, faller den tilbake til HELE reisen — calls[0] til
 * calls[n-1]. Det er ikke galt i seg selv, men det er en annen påstand enn
 * «dette er etappen din», og skjermen må kunne skille dem.
 */
describe('når den ikke finner etappen', () => {
  it('sier at den falt tilbake til hele reisen', () => {
    const r = legExtent(REISEN, leg('Lillestrøm', 'Lørenskog'));
    expect(r.source).toBe('hele reisen');
    expect([r.fromIdx, r.toIdx]).toEqual([0, REISEN.length - 1]);
  });

  it('og sier at den fant den når den gjorde det', () => {
    expect(legExtent(REISEN, leg('Helsfyr', 'Tøyen')).source).toBe('sted');
  });

  // Én vei inn, ikke to. `samePlace` gjør både id og navn, så en egen
  // navne-reserve ville vært et andre sted som avgjør det samme.
  it('har bare to svar: fant den, eller hele reisen', () => {
    const kilder = new Set([
      legExtent(REISEN, leg('Helsfyr', 'Tøyen')).source,
      legExtent(REISEN, leg('Lillestrøm', 'Lørenskog')).source,
      legExtent([], leg('a', 'b')).source,
    ]);
    expect([...kilder].sort()).toEqual(['hele reisen', 'sted']);
  });

  it('tåler tomt', () => {
    expect(legExtent([], leg('a', 'b'))).toEqual({ fromIdx: 0, toIdx: 0, source: 'hele reisen' });
    expect(legExtent(null, leg('a', 'b')).source).toBe('hele reisen');
  });
});
