/**
 * Banneret får vite hva tavla viser — ikke hva den viste sist.
 *
 * Rapportert med skjermbilde fra tavla, Mortensrud → Jernbanetorget, 22:20:
 * «Det oppfører seg rart.»
 *
 *   Det kjøres sjeldnere avganger i høstferien (uke 40)…        ✕
 *   1 MELDING TIL   SKJUL
 *   Linje 3 (Buss for T-bane 3B): Mellom Skullerud og
 *   Mortensrud fra kl. 21.00 til 02.00…                          ✕
 *
 * Meldingen om buss for T-bane mellom Skullerud og MORTENSRUD — avreisestoppet
 * — er foldet bort som «en annen melding». Det er den mest relevante meldingen
 * på skjermen.
 *
 * ÅRSAKEN: `renderBoard()` kaller banneret på linje 2575 med
 * `lineIds: boardRows()…`, og `boardRows()` er `_depMap`, som fylles på linje
 * 2757 — 182 linjer lenger nede i den SAMME funksjonen. Banneret får altså
 * vite hvilke linjer tavla viser før de er regnet ut: tomt på første tegning,
 * forrige sekunds rader deretter.
 *
 * Uten en linje å matche faller `relevance` til regel 3 — «navngir linjer,
 * ingen av dine» — og meldingen om DIN linje blir andres. Og fordi kartet er
 * ett tikk på etterskudd, kan den være foldet i én tegning og åpen i neste.
 * Det er nøyaktig «oppfører seg rart».
 *
 * Formen er fra v1.127.0, ordrett: samme funksjon, samme felle, et annet kall.
 */
import { describe, it, expect } from 'vitest';
import { boardRowDeps } from '../src/views/board.js';
import { relevance } from '../src/api/situations.js';

const MORTENSRUD = 'NSR:StopPlace:Mortensrud';
const JBT = 'NSR:StopPlace:JBT';
const L3B = 'RUT:Line:3B';

// RÅ avganger, ikke ferdig pakkede {c, origIdx}: det er `dedupeDepartures`
// som pakker dem, og `state.deps` er rålista. Første utgave av fiksturen ga
// den pakkede objekter og fikk «Cannot read properties of undefined».
let _n = 0;
const dep = (code, id, mode = 'bus') => ({
  serviceJourney: { id: 'sj:' + code, line: { id, publicCode: code, transportMode: mode } },
  expectedDepartureTime: new Date(2026, 8, 22, 22, 20 + (_n++)).toISOString(),
});

/** Meldingen fra skjermbildet: den navngir linja, gjennom `affects`. */
const BUSS_FOR_BANE = {
  id: 's-3b', severity: 'normal', validityPeriod: {},
  summary: [{ language: 'no', value: 'Linje 3 (Buss for T-bane 3B): Mellom Skullerud og Mortensrud' }],
  affects: [{ __typename: 'AffectedLine', line: { id: L3B } }],
  _from: { lines: new Set([L3B]), stops: new Set(), journeys: new Set() },
};

/** Konteksten tavla bygger, av radene den faktisk kommer til å tegne. */
const ctx = (rows) => ({
  stopIds: [MORTENSRUD, JBT],
  lineIds: [...new Set(rows.map(r => (r.c || r).serviceJourney.line.id))],
  journeyIds: [],
});

describe('den rapporterte skjermen', () => {
  const RADER = [dep('3B', L3B), dep('74', 'RUT:Line:74')];

  // FØR-BILDET, sagt som oppførsel: med radene tavla viser er meldingen om
  // din egen linje DIN.
  it('lar meldingen om linja tavla viser være din', () => {
    expect(relevance(BUSS_FOR_BANE, ctx(RADER))).toBe('mine');
  });

  // OG SLIK SÅ DET UT. På første tegning er _depMap tom, så lineIds blir
  // tomt — og regel 3 gjør din egen linje til andres.
  it('men med tomme linjer blir den andres — som var feilen', () => {
    expect(relevance(BUSS_FOR_BANE, ctx([]))).toBe('other');
  });
});

/**
 * Og derfor må avledningen være den samme som lista tegner av.
 *
 * `boardRowDeps` er nå det ene navnet: banneret leser den øverst, og lista
 * leser den nede. `_depMap` er fortsatt sannheten om hva som STÅR i DOM-en —
 * den er bare ikke et svar på hva som er i ferd med å bli tegnet.
 */
describe('boardRowDeps', () => {
  const DEPS = [dep('3B', L3B), dep('74', 'RUT:Line:74'), dep('L2', 'RUT:Line:L2', 'rail')];
  const alle = { metro: true, tram: true, bus: true, rail: true, water: true };
  const koder = (rows) => rows.map(r => r.c.serviceJourney.line.publicCode).sort();

  it('gir radene tavla kommer til å tegne', () => {
    expect(koder(boardRowDeps(DEPS, [], alle, () => true))).toEqual(['3B', '74', 'L2']);
  });

  // En buss du har slått av er ikke på skjermen, og en melding om den er da
  // ikke din.
  it('slipper ikke gjennom et transportmiddel du har slått av', () => {
    const utenBuss = { ...alle, bus: false };
    expect(koder(boardRowDeps(DEPS, [], utenBuss, () => true))).toEqual(['L2']);
  });

  // Det samme for en linje du har slått av på pillene.
  it('slipper ikke gjennom en linje du har slått av', () => {
    expect(koder(boardRowDeps(DEPS, [], alle, (code) => code !== '3B')))
      .toEqual(['74', 'L2']);
  });

  // «Last flere» legger sider til radene, og bare til radene.
  it('tar med de innlastede sidene når det finnes noen', () => {
    const sider = [dep('31', 'RUT:Line:31')];
    expect(koder(boardRowDeps(DEPS, sider, alle, () => true)))
      .toEqual(['31', '3B', '74', 'L2']);
  });

  it('tåler tomt', () => {
    expect(boardRowDeps([], [], alle, () => true)).toEqual([]);
    expect(boardRowDeps(null, null, alle, () => true)).toEqual([]);
  });
});

/**
 * v1.149.0 tok tavlas banner bort, så «banneret leser avledningen» finnes
 * ikke lenger som påstand. `boardRowDeps` blir — lista tegner av den — og
 * testene over binder den. At banneret er borte bindes av
 * tests/boardNoAlerts.test.js.
 */
describe('avledningen har fortsatt én leser', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/board.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  it('lista leser den', () => {
    expect(src()).toMatch(/const _rows = boardRowDeps\(/);
    expect(src()).toMatch(/const rowDeps = _rows;/);
  });
});
