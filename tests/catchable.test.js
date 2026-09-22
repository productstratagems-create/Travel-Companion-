/**
 * Ankomsten regnes fra avgangen du faktisk rekker.
 *
 * Rapportert med skjermbilde fra Mortensrud, 19:30, 974 m å gå · 14 min gange:
 *
 *   3  !  mot Kolsås        spor 1     3̶ · 18 · 33 min
 *         Jernbanetorget          framme 19:58
 *   3  !  mot Stortinget    spor 2          9̶ min
 *         Jernbanetorget          framme 20:04
 *
 * Streken virker: du rekker verken 3-minutteren eller 9-minutteren. Men
 * ANKOMSTEN UNDER RADEN ER REGNET FRA NETTOPP DEN AVGANGEN RADEN HAR STRØKET
 * OVER. Regnestykket går opp begge steder: 19:33 + 25 min = 19:58, og
 * 19:39 + 25 = 20:04.
 *
 * `groupDirections` lar den tidligste avgangen eie raden, og `stopsAhead`
 * leser den. Rekkevidden regnes et helt annet sted, i `_timesHtml`. To steder
 * som må være enige om hvilken avgang raden handler om — og de er det ikke.
 */
import { describe, it, expect } from 'vitest';
import { groupDirections, catchable, canCatch, stopsAhead, _timesHtml }
  from '../src/views/auto.js';

const MIN = 60000;
// 19:30 lokal tid, som på skjermbildet. Lokal og ikke UTC: clk() tegner i
// leserens sone, og en UTC-fikstur har målt feil klokkeslett her før.
const NÅ = new Date(2026, 8, 22, 19, 30, 0).getTime();
const GANGE = 14;
const iso = (ms) => new Date(ms).toISOString();

/** Én avgang fra Mortensrud mot Jernbanetorget, 25 minutter unna. */
const call = (front, mins, reise = 25) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NÅ + mins * MIN),
  expectedDepartureTime: iso(NÅ + mins * MIN),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:1', publicCode: '1', name: 'spor 1' },
  serviceJourney: {
    id: 'sj:' + front + ':' + mins, situations: [],
    line: { id: 'RUT:Line:3', publicCode: '3', transportMode: 'metro' },
    estimatedCalls: [
      { quay: { stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud' } },
        aimedDepartureTime: iso(NÅ + mins * MIN), expectedDepartureTime: iso(NÅ + mins * MIN) },
      { quay: { stopPlace: { id: 'NSR:StopPlace:JBT', name: 'Jernbanetorget' } },
        aimedArrivalTime: iso(NÅ + (mins + reise) * MIN),
        expectedArrivalTime: iso(NÅ + (mins + reise) * MIN) },
    ],
  },
});

// Den rapporterte raden: 3 · 18 · 33 min, og bare de to siste er innenfor.
const KOLSÅS = [call('Kolsås', 3), call('Kolsås', 18), call('Kolsås', 33)];
// Naboraden: én avgang om 9 min, altså ingenting å rekke.
const STORTINGET = [call('Stortinget', 9)];

const dir = (calls) => groupDirections(calls, NÅ)[0];
const klokke = (ms) => new Date(ms).getHours() + ':'
  + String(new Date(ms).getMinutes()).padStart(2, '0');

describe('catchable', () => {
  it('utelater avgangen du ikke rekker', () => {
    const c = catchable(dir(KOLSÅS), GANGE, NÅ);
    expect(c.map(x => Math.round((x.ms - NÅ) / MIN))).toEqual([18, 33]);
  });

  it('gir ingenting når ingen av dem er innenfor', () => {
    expect(catchable(dir(STORTINGET), GANGE, NÅ)).toEqual([]);
  });

  // Uten posisjon finnes ingen gangtid, og da er alt innenfor — nøyaktig
  // dagens skjerm, og den samme regelen `_timesHtml` alt skriver.
  it('regner alt som innenfor uten gangtid', () => {
    const c = catchable(dir(KOLSÅS), null, NÅ);
    expect(c.map(x => Math.round((x.ms - NÅ) / MIN))).toEqual([3, 18, 33]);
  });

  // Raden viser tre tider; en fjerde avgang finnes bak dem. Ser `catchable`
  // bare på `times`, forsvinner den.
  it('ser på alle radens avganger, ikke bare de tre som vises', () => {
    const fire = [...KOLSÅS, call('Kolsås', 48)];
    const c = catchable(dir(fire), GANGE, NÅ);
    expect(c.map(x => Math.round((x.ms - NÅ) / MIN))).toEqual([18, 33, 48]);
  });

  it('bærer med seg selve avgangen, ikke bare tidspunktet', () => {
    const [first] = catchable(dir(KOLSÅS), GANGE, NÅ);
    expect(first.call.serviceJourney.id).toBe('sj:Kolsås:18');
  });

  it('tåler en rad uten avganger', () => {
    expect(catchable(null, GANGE, NÅ)).toEqual([]);
    expect(catchable({}, GANGE, NÅ)).toEqual([]);
  });
});

describe('den rapporterte skjermen', () => {
  // DETTE ER FØR-BILDET. Mot dagens kode leses ankomsten av 3-minutteren og
  // gir 19:58; den skal komme fra 18-minutteren og gi 20:13.
  it('regner ankomsten fra avgangen du rekker, ikke fra den strøkne', () => {
    const d = dir(KOLSÅS);
    const [først] = catchable(d, GANGE, NÅ);
    const [jbt] = stopsAhead(først.call, 'Mortensrud', NÅ);
    expect(jbt.name).toBe('Jernbanetorget');
    expect(klokke(jbt.at)).toBe('20:13');
    // og ikke klokkeslettet fra avgangen raden har strøket over
    expect(klokke(stopsAhead(d.call, 'Mortensrud', NÅ)[0].at)).toBe('19:58');
  });

  // Naboraden: ingen avgang å rekke, altså ingen ankomst å oppgi. «Framme
  // 20:04» var et løfte om en reise leseren ikke kan ta.
  it('lover ingen ankomst når ingen avgang er innenfor', () => {
    expect(catchable(dir(STORTINGET), GANGE, NÅ).length).toBe(0);
  });
});

describe('canCatch', () => {
  // Predikatet over ETT tidspunkt. Det finnes ved siden av `catchable` fordi
  // de to leserne holder ulike ting — `_timesHtml` har tidene, ankomsten
  // trenger avgangen — og de dømmer etter samme regel.
  it('er regelen streken er tegnet av', () => {
    expect(canCatch(NÅ + 3 * MIN, GANGE, NÅ)).toBe(false);
    expect(canCatch(NÅ + 18 * MIN, GANGE, NÅ)).toBe(true);
    // akkurat på gangtiden rekker du den
    expect(canCatch(NÅ + GANGE * MIN, GANGE, NÅ)).toBe(true);
  });

  it('sier ja til alt uten gangtid', () => {
    expect(canCatch(NÅ + 1 * MIN, null, NÅ)).toBe(true);
  });

  it('sier nei til noe som ikke er et tidspunkt', () => {
    expect(canCatch(null, GANGE, NÅ)).toBe(false);
    expect(canCatch(undefined, null, NÅ)).toBe(false);
  });
});

describe('streken og klokka leser samme regel', () => {
  // `_timesHtml` strøk over 3-minutteren mens ankomsten ble regnet fra den.
  // Nå kommer begge fra `catchable`, og kan ikke bli uenige.
  it('stryker nøyaktig de avgangene catchable utelater', () => {
    const d = dir(KOLSÅS);
    const html = _timesHtml(d, NÅ, GANGE);
    const innenfor = new Set(catchable(d, GANGE, NÅ)
      .map(x => String(Math.round((x.ms - NÅ) / MIN))));
    // «missed» er klassen som tegner streken.
    const strøket = [...html.matchAll(/missed[^>]*>(\d+|nå)</g)].map(m => m[1]);
    expect(strøket).toEqual(['3']);
    expect(strøket.some(t => innenfor.has(t))).toBe(false);
  });

  it('stryker ingenting uten gangtid', () => {
    expect(_timesHtml(dir(KOLSÅS), NÅ, null)).not.toContain('missed');
  });
});

/**
 * Og de tre stedene skjermen bruker regelen.
 *
 * Disse er kildetester, ikke oppførselstester, og det er en svakhet verdt å
 * si: `_renderBody` og `_renderStops` tegnes ikke av noen test i dette
 * repoet. Nettleserprøven er det som faktisk ser dem. En kildetest fanger at
 * koblingen forsvinner; den fanger ikke at den blir feil på en ny måte.
 */
describe('hvor skjermen leser regelen', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/auto.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  it('tegner ingen klokke på en rad uten noe å rekke', () => {
    const s = src();
    expect(s).toMatch(/reach\.set\(i, !!ride\)/);
    // begge stedene raden sier ankomsten: spannet og den opplesbare merkelappen
    expect(s).toMatch(/reach\.get\(i\) && arriveText\(st\)\s*\n?\s*\? '<span class="ais-mins">/);
    expect(s).toMatch(/reach\.get\(i\) && arriveText\(st\) \? ', ' \+ arriveText\(st\) : ''/);
  });

  it('lar nedtrekkslista lese den samme regelen', () => {
    const s = src();
    expect(s).toMatch(/const ride = catchable\(_open, walk \? walk\.mins : null, Date\.now\(\)\)\[0\]/);
    expect(s).toMatch(/stopsAhead\(\(ride && ride\.call\) \|\| _open\.call, _stop\.name\)/);
  });

  // Streken tegnes av canCatch og ingenting annet — ellers kan raden og
  // klokka under den bli uenige igjen.
  it('lar streken tegnes av canCatch', () => {
    const s = src();
    const rcls = s.slice(s.indexOf('const rcls = (x) => {'), s.indexOf('const label = (x) =>'));
    expect(rcls).toMatch(/canCatch\(x\.ms, walkMins, now\)/);
    expect(rcls).toMatch(/: 'missed'/);
  });
});
