/**
 * Destinasjonen som overskrift.
 *
 * Rapportert med skjermbilde fra Mortensrud, 19:30, 14 min gange. Fire rader,
 * og under hver av dem det samme stoppet:
 *
 *   3  ! mot Kolsås          3̶ · 18 · 33   ↳ Jernbanetorget framme 20:13
 *   3  ! mot Stortinget           9̶        ↳ Jernbanetorget
 *   3  ! mot Avløs           24 · 39 · 54  ↳ Jernbanetorget framme 20:19
 *   74 ! mot Jernbanetorget  4̶ · 19 · 49   ↳ Jernbanetorget framme 20:07
 *
 * FIRE RADER, FIRE KLOKKESLETT, ETT SPØRSMÅL: når er jeg på Jernbanetorget?
 * Leseren måtte sortere dem i hodet. Lista er nøklet på AVGANG mens svaret er
 * en DESTINASJON.
 *
 * Koblingen finnes alt på begge sider: `stopsAhead` per rad, `loadFreq('arr')`
 * for stedene leseren faktisk bruker. Den er bare aldri utført.
 */
import { describe, it, expect } from 'vitest';
import { groupDirections, destinations, dirRows, DEST_BLOCK, _timesHtml }
  from '../src/views/auto.js';

const MIN = 60000;
const NÅ = new Date(2026, 8, 22, 19, 30, 0).getTime();
const GANGE = 14;
const iso = (ms) => new Date(ms).toISOString();
const bruk = (name, count, stopId) => ({ name, count, stopId: stopId || null, lastUsed: NÅ });

/**
 * Én avgang. `via` er stoppene den passerer etter Mortensrud, som
 * [navn, minutter etter avgang].
 */
const call = (line, front, mins, via) => ({
  realtime: true, cancellation: false, situations: [],
  aimedDepartureTime: iso(NÅ + mins * MIN), expectedDepartureTime: iso(NÅ + mins * MIN),
  destinationDisplay: { frontText: front },
  quay: { id: 'NSR:Quay:' + line, publicCode: '1', name: 'spor 1' },
  serviceJourney: {
    id: 'sj:' + line + ':' + front + ':' + mins, situations: [],
    line: { id: 'RUT:Line:' + line, publicCode: line, transportMode: 'metro' },
    estimatedCalls: [
      { quay: { stopPlace: { id: 'NSR:StopPlace:Mortensrud', name: 'Mortensrud' } },
        aimedDepartureTime: iso(NÅ + mins * MIN), expectedDepartureTime: iso(NÅ + mins * MIN) },
      ...via.map(([name, etter]) => ({
        quay: { stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name } },
        aimedArrivalTime: iso(NÅ + (mins + etter) * MIN),
        expectedArrivalTime: iso(NÅ + (mins + etter) * MIN),
      })),
    ],
  },
});

const JBT = [['Jernbanetorget', 25]];
/** Den rapporterte skjermen, rad for rad. */
const SKJERMEN = [
  ...[3, 18, 33].map(m => call('3', 'Kolsås', m, JBT)),
  call('3', 'Stortinget', 9, JBT),
  ...[24, 39, 54].map(m => call('3', 'Avløs', m, JBT)),
  ...[4, 19, 49].map(m => call('74', 'Jernbanetorget', m, JBT)),
];
const HIST = [bruk('Jernbanetorget', 6)];

const live = (calls, now = NÅ) => {
  const dirs = groupDirections(calls, now);
  return dirRows(dirs, false, () => true, null);
};
const dest = (calls, freq = HIST, gange = GANGE, now = NÅ) =>
  destinations(live(calls, now), freq, gange, now, 'Mortensrud');
const klokke = (ms) => new Date(ms).getHours() + ':'
  + String(new Date(ms).getMinutes()).padStart(2, '0');

describe('den rapporterte skjermen', () => {
  // FØR-BILDET. Fire rader som alle når Jernbanetorget blir én overskrift.
  it('samler radene til én destinasjon', () => {
    const d = dest(SKJERMEN);
    expect(d.length).toBe(1);
    expect(d[0].name).toBe('Jernbanetorget');
    // TRE, ikke fire: «mot Stortinget» har bare en 9-minutter, og den rekker
    // du ikke på fjorten minutters gange. Jeg skrev fire her først — og det
    // er nettopp den raden v1.142.0 sluttet å love en ankomst for.
    expect(d[0].options.length).toBe(3);
    expect(d[0].options.map(o => o.d.frontText).sort())
      .toEqual(['Avløs', 'Jernbanetorget', 'Kolsås']);
  });

  // Og den tidligste ankomsten du faktisk rekker står øverst. «mot Kolsås»
  // går 19:48 (18-minutteren) og er framme 20:13; «mot Jernbanetorget» går
  // 19:49 og er framme 20:14. Den tidligste av dem vinner.
  it('setter den tidligste ankomsten først', () => {
    const [jbt] = dest(SKJERMEN);
    const tider = jbt.options.map(o => klokke(o.at));
    expect(tider).toEqual([...tider].sort());
    expect(tider[0]).toBe('20:13');
    expect(jbt.options[0].d.frontText).toBe('Kolsås');
  });

  // Naboraden hadde bare én avgang, om 9 minutter, og den rekker du ikke.
  // Den skal ikke være et alternativ i det hele tatt — «framme 20:04» var et
  // løfte om en reise leseren ikke kan ta (v1.142.0).
  it('regner ikke med en rad du ikke rekker noe på', () => {
    const [jbt] = dest(SKJERMEN);
    expect(jbt.options.map(o => o.d.frontText)).not.toContain('Stortinget');
  });

  it('bærer linja, sporet og avgangstiden for den vinnende veien', () => {
    const [jbt] = dest(SKJERMEN);
    const o = jbt.options[0];
    expect(o.d.lines[0].code).toBe('3');
    expect(o.call.quay.publicCode).toBe('1');
    expect(klokke(o.ms)).toBe('19:48');
  });
});

describe('hvilke steder som blir overskrifter', () => {
  const MED_FLERE = [
    call('3', 'Kolsås', 18, [['Ryen', 4], ['Jernbanetorget', 25], ['Majorstuen', 33]]),
  ];

  // Uten dette blir hvert eneste stopp på hver eneste linje en overskrift.
  it('bare stedene du faktisk bruker', () => {
    const d = destinations(live(MED_FLERE), HIST, GANGE, NÅ, 'Mortensrud');
    expect(d.map(x => x.name)).toEqual(['Jernbanetorget']);
  });

  // Samme nøkkel som stopShortcuts og depUses: ett sted, ikke to.
  it('«Ryen» og «Ryen T» er ett sted', () => {
    const d = destinations(live([call('3', 'Kolsås', 18, [['Ryen T', 4]])]),
      [bruk('Ryen', 5)], GANGE, NÅ, 'Mortensrud');
    expect(d.length).toBe(1);
    expect(d[0].name).toBe('Ryen T');
  });

  // Overskriftene skal ligge i ro mens tallene teller ned. Sorteres de på
  // ankomst, bytter de plass under fingeren.
  it('sorterer overskriftene på bruk, ikke på ankomst', () => {
    const calls = [
      call('3', 'Kolsås', 18, [['Ryen', 4], ['Jernbanetorget', 25]]),
    ];
    const d = destinations(live(calls), [bruk('Jernbanetorget', 9), bruk('Ryen', 2)], GANGE, NÅ, 'Mortensrud');
    // Ryen kommer først i tid, Jernbanetorget først i bruk.
    expect(d.map(x => x.name)).toEqual(['Jernbanetorget', 'Ryen']);
  });

  it('holder seg under taket uansett hvor mange treff', () => {
    const mange = [call('3', 'Kolsås', 18,
      [['A', 2], ['B', 4], ['C', 6], ['D', 8]])];
    const freq = ['A', 'B', 'C', 'D'].map((n, i) => bruk(n, 10 - i));
    expect(destinations(live(mange), freq, GANGE, NÅ, 'Mortensrud').length).toBe(DEST_BLOCK);
  });

  // Samme skjerm som i dag for en leser uten historikk — og det er også den
  // vanlige tilstanden første dag.
  it('gir ingenting uten historikk', () => {
    expect(dest(SKJERMEN, [])).toEqual([]);
    expect(dest(SKJERMEN, null)).toEqual([]);
  });

  it('gir ingenting uten rader', () => {
    expect(destinations([], HIST, GANGE, NÅ, 'Mortensrud')).toEqual([]);
    expect(destinations(null, HIST, GANGE, NÅ, 'Mortensrud')).toEqual([]);
  });
});

describe('alternativene', () => {
  // Én rad er én vei dit, uansett hvor mange avganger den har. Rådataene har
  // tre avganger mot Kolsås; raden er én.
  it('teller én rad som én vei, med sin tidligste ankomst', () => {
    const [jbt] = dest([...[3, 18, 33].map(m => call('3', 'Kolsås', m, JBT))]);
    expect(jbt.options.length).toBe(1);
    expect(klokke(jbt.options[0].at)).toBe('20:13');
  });

  // Uten gangtid er alt innenfor — nøyaktig som `catchable` og streken.
  it('regner alt som innenfor uten gangtid', () => {
    const [jbt] = dest(SKJERMEN, HIST, null);
    // Da vinner 3-minutteren mot Kolsås: 19:33 + 25 = 19:58 — og hele fire
    // rader har noe å tilby, også «mot Stortinget».
    expect(klokke(jbt.options[0].at)).toBe('19:58');
    expect(jbt.options.length).toBe(4);
  });

  // En rad hvis avganger alle er gått er ikke en vei noe sted.
  it('ser bare på radene som faktisk tegnes', () => {
    const rader = live(SKJERMEN).filter(r => r.d.frontText === 'Avløs');
    const d = destinations(rader, HIST, GANGE, NÅ, 'Mortensrud');
    expect(d[0].options.length).toBe(1);
    expect(d[0].options[0].d.frontText).toBe('Avløs');
  });
});

/**
 * Og de to reglene fiksturene over ikke skilte.
 *
 * To mutanter overlevde første runde: usortert `options` og `stopKey` byttet
 * mot rått navn. Begge fordi fiksturene tilfeldigvis ga riktig svar likevel —
 * radene kom allerede i ankomstrekkefølge, og «Ryen T» sto på én rad alene.
 */
describe('regel for regel', () => {
  // Raden som går FØRST kommer FRAM SIST: 74-en drar 19:49 og bruker 40
  // minutter, mens 3-eren drar 19:53 og bruker 20. Rekkefølgen inn er altså
  // motsatt av rekkefølgen ut.
  it('sorterer alternativene på ankomst, ikke på når de kom inn', () => {
    const treg = call('74', 'Omvei', 19, [['Jernbanetorget', 40]]);
    const rask = call('3', 'Kolsås', 23, [['Jernbanetorget', 20]]);
    const [jbt] = dest([treg, rask]);
    expect(jbt.options.map(o => o.d.frontText)).toEqual(['Kolsås', 'Omvei']);
    expect(klokke(jbt.options[0].at)).toBe('20:13');
  });

  // To rader til det samme stedet, stavet hver sin måte. Uten den delte
  // nøkkelen blir det to overskrifter om ett sted — og da er blokka bare
  // lista igjen, med andre ord.
  it('samler to staveformer av samme sted til én overskrift', () => {
    const a = call('3', 'Kolsås', 18, [['Ryen', 4]]);
    const b = call('74', 'Annen vei', 20, [['Ryen T', 6]]);
    const d = destinations(live([a, b]), [bruk('Ryen', 5)], GANGE, NÅ, 'Mortensrud');
    expect(d.length).toBe(1);
    expect(d[0].options.length).toBe(2);
  });
});
