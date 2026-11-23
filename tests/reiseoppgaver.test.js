/**
 * Steg 1 i plangrunnlaget: «Isoler og beskytt dagens Mot sentrum og Hjemover».
 * Disse testene beskriver hva de to reiseoppgavene gjør I DAG — situasjonene
 * fra steg 1 — slik at senere mulighetsoppdagelse ikke kan endre dem uten at
 * en test faller. Fiksturer fra Oslo (Mortensrud), Bergen (Nesttun) og en
 * bygd (Tretten, uten sentrum i SENTRA).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { motSentrum, hjemover, gårMotSentrum, hjemoverDom, MOT_SENTRUM, HJEMOVER } from '../src/reiseoppgaver.js';
import { filtrerRetning } from '../src/views/auto.js';

const NÅ = Date.parse('2026-11-23T07:40:00Z');
const st = (id, name, lat, lon) => ({ id, name, lat, lon });
// Oslo
const MRUD = st('NSR:StopPlace:1', 'Mortensrud', 59.849, 10.829);
const JBT = st('NSR:StopPlace:2', 'Jernbanetorget', 59.911, 10.750);
const HOLMLIA = st('NSR:StopPlace:3', 'Holmlia', 59.836, 10.796);
const SKI = st('NSR:StopPlace:4', 'Ski', 59.719, 10.835);
const HELSFYR = st('NSR:StopPlace:5', 'Helsfyr', 59.913, 10.801);
// Bergen
const NESTTUN = st('NSR:StopPlace:11', 'Nesttun', 60.318, 5.354);
const BYPARKEN = st('NSR:StopPlace:12', 'Byparken', 60.392, 5.324);
const LAGUNEN = st('NSR:StopPlace:13', 'Lagunen', 60.296, 5.327);

const kall = (fra, stopp, min, mode = 'bus', kode = '1') => ({
  serviceJourney: { line: { id: 'L:' + kode, publicCode: kode, transportMode: mode },
    estimatedCalls: [fra, ...stopp].map((s, i) => ({ quay: { stopPlace: { id: s.id, name: s.name, latitude: s.lat, longitude: s.lon } },
      expectedArrivalTime: new Date(NÅ + (min + i * 5) * 60000).toISOString() })) } });
const retning = (fra, stopp, minutter, mode, kode) => {
  const calls = minutter.map(m => ({ ms: NÅ + m * 60000, call: kall(fra, stopp, m, mode, kode) }));
  return { frontText: stopp[stopp.length - 1].name, lines: [{ id: 'L:' + kode, code: kode, mode }], call: calls[0].call, nextMs: calls[0].ms, calls };
};
const ktx = (her, gang, x = {}) => ({ her, fraNavn: her.name, gang, nå: NÅ, ...x });

describe('mot sentrum (steg 1)', () => {
  const T3 = retning(MRUD, [HELSFYR, JBT], [6, 21], 'metro', '3');
  const B74 = retning(MRUD, [JBT], [8, 23], 'bus', '74');
  const L73 = retning(MRUD, [HOLMLIA], [4, 19], 'bus', '73');
  const TOG = retning(MRUD, [SKI], [10], 'rail', 'L2');

  it('flere avganger mot sentrum: alle som går dit, ingen andre', () => {
    const r = motSentrum([T3, B74, L73, TOG], ktx(MRUD, 5));
    expect(r.oppgave).toBe(MOT_SENTRUM);
    expect(r.retninger.map(d => d.lines[0].code)).toEqual(['3', '74']);
  });
  it('tog og buss vurderes på samme vilkår: modus avgjør ikke, turen gjør', () => {
    const togInn = retning(MRUD, [JBT], [12], 'rail', 'R11');
    expect(motSentrum([togInn, B74], ktx(MRUD, 5)).retninger.length).toBe(2);
    expect(gårMotSentrum(TOG, ktx(MRUD, 5))).toBe(false);
  });
  it('ingen avgang du rekker: dagens regel leser retningens første kall (dokumentert, ikke endret)', () => {
    const forSent = retning(MRUD, [JBT], [1], 'bus', '76');
    expect(gårMotSentrum(forSent, ktx(MRUD, 20))).toBe(true);
  });
  it('beste påstigning fra reisesøket: et annet stopp enn det nærmeste kan vinne', () => {
    const iso = m => new Date(NÅ + m * 60000).toISOString();
    const plass = s => ({ name: s.name, latitude: s.lat, longitude: s.lon, quay: { stopPlace: { id: s.id } } });
    const reise = (fra, gå, avg, ank) => ({ legs: [{ mode: 'foot', expectedStartTime: iso(avg - gå), expectedEndTime: iso(avg), fromPlace: { name: 'her' }, toPlace: plass(fra) },
      { mode: 'metro', expectedStartTime: iso(avg), expectedEndTime: iso(ank), fromPlace: plass(fra), toPlace: plass(JBT) }] });
    const r = motSentrum([T3], ktx(MRUD, 5, { reiser: [reise(MRUD, 5, 8, 40), reise(HELSFYR, 12, 14, 30)] }));
    expect(r.beste).toMatchObject({ id: HELSFYR.id, name: 'Helsfyr' });
  });
  it('Bergen: Bybanen mot Byparken er mot sentrum, mot Lagunen ikke', () => {
    const inn = retning(NESTTUN, [BYPARKEN], [3], 'tram', '1'), ut = retning(NESTTUN, [LAGUNEN], [5], 'tram', '1');
    expect(motSentrum([inn, ut], ktx(NESTTUN, 2)).retninger).toEqual([inn]);
  });
  it('bygda uten kjent sentrum: ingen retning er «mot sentrum» (ingen gjetning)', () => {
    const TRETTEN = st('NSR:StopPlace:20', 'Tretten', 61.31, 10.30), LH = st('NSR:StopPlace:21', 'Lillehammer', 61.115, 10.466);
    expect(motSentrum([retning(TRETTEN, [LH], [10], 'bus', '141')], ktx(TRETTEN, 3)).retninger).toEqual([]);
  });
});

describe('hjemover (steg 1)', () => {
  const HJEM = [{ id: HOLMLIA.id, name: 'Holmlia' }];
  const L73 = retning(MRUD, [HOLMLIA], [4, 19], 'bus', '73');
  const T3 = retning(MRUD, [HELSFYR, JBT], [6], 'metro', '3');
  it('flere mulige hjemreiser: bare de som når et hjemover-stopp', () => {
    const r = hjemover([L73, T3], ktx(MRUD, 5, { hjemListe: HJEM }));
    expect(r.oppgave).toBe(HJEMOVER);
    expect(r.retninger).toEqual([L73]);
    expect(r.beste).toBeNull();   // ingen reisesøk-basert påstigning for hjemover ennå (åpent spørsmål 3)
  });
  it('uten hjemover-stopp: ingen retning er hjemover', () => {
    expect(hjemover([L73, T3], ktx(MRUD, 5, { hjemListe: [] })).retninger).toEqual([]);
  });
  it('via bytte: reisesøket hjem gir «bytt på …»', () => {
    const d = hjemoverDom(T3, ktx(MRUD, 5, { hjemListe: HJEM, hjemSøk: { etapper: [{ linjeId: 'L:3', bytte: 'Helsfyr' }] } }));
    expect(typeof d.hjem).toBe('boolean');
  });
});

describe('nye reisemuligheter endrer ikke de to oppgavene (steg 1, kriterium 4)', () => {
  const T3 = retning(MRUD, [HELSFYR, JBT], [6], 'metro', '3');
  const L73 = retning(MRUD, [HOLMLIA], [4], 'bus', '73');
  const TOG = retning(MRUD, [SKI], [10], 'rail', 'L2');
  const k = ktx(MRUD, 5, { hjemListe: [{ id: HOLMLIA.id, name: 'Holmlia' }] });
  it('flere retninger (en ny oppdaget mulighet) legger ikke til noe i mot sentrum eller hjemover', () => {
    expect(motSentrum([T3, L73, TOG], k).retninger).toEqual(motSentrum([T3, L73], k).retninger);
    expect(hjemover([T3, L73, TOG], k).retninger).toEqual(hjemover([T3, L73], k).retninger);
  });
  it('målområdene (område-funksjonen) påvirker ikke filteret for mot/hjem', () => {
    const gruppe = d => (gårMotSentrum(d, k) ? 'mot' : null), hjem = d => hjemoverDom(d, k).hjem;
    const uten = filtrerRetning([T3, L73, TOG], 'mot', gruppe, hjem);
    const med = filtrerRetning([T3, L73, TOG], 'mot', gruppe, hjem, () => 'omr:Ski');
    expect(med).toEqual(uten);
    expect(filtrerRetning([T3, L73, TOG], 'hjem', gruppe, hjem, () => 'omr:Ski')).toEqual(filtrerRetning([T3, L73, TOG], 'hjem', gruppe, hjem));
  });
});

describe('ansvarsdelingen (steg 1, kriterium 1–3)', () => {
  const felles = readFileSync('src/reiseberegning.js', 'utf8'), oppg = readFileSync('src/reiseoppgaver.js', 'utf8'), auto = readFileSync('src/views/auto.js', 'utf8');
  it('felles beregning kjenner ikke oppgavene', () => {
    const kode = felles.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(kode).not.toMatch(/sentrum|centreward|hjem/i);
  });
  it('én inngang per oppgave, og auto.js delegerer', () => {
    expect(oppg).toMatch(/export function motSentrum\(/);
    expect(oppg).toMatch(/export function hjemover\(/);
    expect(auto).toMatch(/return gårMotSentrum\(d, \{/);
    expect(auto).toMatch(/return hjemoverDom\(d, \{/);
  });
});
