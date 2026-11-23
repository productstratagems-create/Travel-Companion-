/**
 * Reisebekreftelsen, trinn 4d delsteg 1: bekreftelsesgrensen. Mot opptak fra
 * Entur via nettverksutforskeren (tests/fixtures/entur/) og syntetiske veier.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { grunnlag, tillatt, UTENFOR } from '../src/reisebekreftelse.js';
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const O = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n)]));
const resultat = async n => { _tømCache(); return utforsk(O[n].scenario, { hent: avspiller(O[n]).hent }); };
beforeEach(() => _tømCache());

const T = '2026-11-24T12:05:00+01:00';
const direkte = (o = {}) => ({ id: 'v', opsjon: 'destination:X', ledd: 1, knute: null, inn: null, vindu: 'ordinært', avgang: T, ...o });
const fler = (o = {}) => ({ id: 'w', opsjon: 'destination:X', ledd: 2, knute: 'NSR:StopPlace:K', inn: 'L>R', vindu: 'ordinært', avgang: T, ...o });

describe('tillatelsesregelen per vei', () => {
  it('direkte ordinær og direkte utvidet er tillatt', () => {
    expect(tillatt(direkte(), {})).toEqual({ tillatt: true });
    expect(tillatt(direkte({ vindu: 'utvidet' }), {})).toEqual({ tillatt: true });
  });
  it('flere ledd er utenfor — også med ordinær inngang og uten tidsforskyvning-merke', () => {
    expect(tillatt(fler(), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
    expect(tillatt(fler({ vindu: 'utvidet', tidsforskyvning: 'x' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
  });
  it('flere ledd slippes inn først når overgangen er tidsmessig kontrollert (lag 2)', () => {
    expect(tillatt(fler({ tidskobling: { status: 'kontrollert' } }), {})).toEqual({ tillatt: true });
    expect(tillatt(fler({ tidskobling: { status: 'ukjent' } }), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
  });
  it('senere og not_now er utenfor', () => {
    expect(tillatt(direkte({ vindu: 'senere' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.senere });
    expect(tillatt(direkte(), { timetable: 'not_now' })).toEqual({ tillatt: false, grunn: UTENFOR.senere });
  });
  it('manglende eller ukjent metadata slipper ikke gjennom', () => {
    for (const v of [direkte({ vindu: undefined }), direkte({ vindu: 'nå' }), direkte({ ledd: undefined }), direkte({ ledd: 3 }), direkte({ knute: 'K' }), fler({ inn: null }), null])
      expect(tillatt(v, {})).toEqual({ tillatt: false, grunn: UTENFOR.ukjentTid });
    expect(tillatt(direkte({ avgang: undefined }), {})).toEqual({ tillatt: false, grunn: UTENFOR.manglerAvgang });
    expect(tillatt(direkte({ avgang: 'snart' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.manglerAvgang });
  });
});

describe('grunnlaget for et oppdagelsesresultat', () => {
  it('endrer ikke oppdagelsesresultatet', async () => {
    const r = await resultat('tretten_dag');
    const før = JSON.stringify(r);
    grunnlag(r);
    expect(JSON.stringify(r)).toBe(før);
  });
  it('Lillehammer skysstasjon (Tretten): kandidat via de 4 direkte veiene; 54 utenfor per vei, med grunn', async () => {
    const r = await resultat('tretten_dag');
    const g = grunnlag(r);
    const k = g.kandidater.find(x => x.opsjon === 'destination:NSR:StopPlace:14115');
    expect(k.veier).toHaveLength(4);
    const veier = new Map(r.veier.map(v => [v.id, v]));
    expect(k.veier.every(id => veier.get(id).ledd === 1 && ['ordinært', 'utvidet'].includes(veier.get(id).vindu))).toBe(true);
    expect(new Set(k.veier.map(id => veier.get(id).vindu))).toEqual(new Set(['ordinært', 'utvidet']));
    const per = {}; for (const u of k.utenforVeier) per[u.grunn] = (per[u.grunn] || 0) + 1;
    expect(per).toEqual({ [UTENFOR.flereLedd]: 50, [UTENFOR.senere]: 4 });
  });
  it('alle veier er gjort rede for: tillatte + utenfor = alle', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const g = grunnlag(r);
      const utenforVeier = g.kandidater.reduce((s, k) => s + k.utenforVeier.length, 0) + g.utenfor.reduce((s, u) => s + u.veier.length, 0);
      expect(g.tellinger.tillatteVeier + utenforVeier).toBe(r.veier.length);
      expect(g.tellinger.veier).toBe(r.veier.length);
    }
  });
  it('ingen flerleddsvei og ingen senere vei er tillatt i noen scenario', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const veier = new Map(r.veier.map(v => [v.id, v]));
      for (const k of grunnlag(r).kandidater) for (const id of k.veier) {
        expect(veier.get(id).ledd).toBe(1);
        expect(veier.get(id).vindu).not.toBe('senere');
      }
    }
  });
  it('en opsjon uten tillatte veier står utenfor — fortsatt i resultatet', async () => {
    const r = await resultat('tretten_dag');
    const g = grunnlag(r);
    expect(g.utenfor.length).toBeGreaterThan(0);
    const ider = new Set(r.opsjoner.map(o => o.id));
    for (const u of g.utenfor) { expect(ider.has(u.opsjon)).toBe(true); expect(u.grunn).toBeTruthy(); }
  });
  it('byene: bare de direkte veiene fra ledd 1 er grunnlag', async () => {
    const r = await resultat('mortensrud_dag');
    const g = grunnlag(r);
    expect(g.tellinger.tillatteVeier).toBe(r.veier.filter(v => v.ledd === 1).length);
    expect(g.tellinger.utenforPerGrunn).toEqual({ [UTENFOR.flereLedd]: r.veier.filter(v => v.ledd === 2).length });
  });
  it('deterministisk og uavhengig av rekkefølgen veiene kom i', async () => {
    const r = await resultat('ranheim_dag');
    const a = grunnlag(r);
    const b = grunnlag({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() });
    expect(b).toEqual(a);
  });
});
