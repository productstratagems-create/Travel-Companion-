/**
 * Hver etappe bærer sine egne endepunkter.
 *
 * OTP oppgir for hver etappe hvor kjøretøyet tas og forlates —
 * `leg.fromPlace.name` og `leg.toPlace.name`. `doBoard` brukte dem ikke. Den
 * satte etappenes endepunkter fra RUTA:
 *
 *     etappe 1     fromStation = dir.from              (det du skrev)
 *     etappe i>0   fromStation = _transfers[i-1].at     (der du gikk AV forrige)
 *     siste        toStation   = dir.to                 (reisemålet ditt)
 *
 * De er like bare når ingen gangeetappe står imellom. Når det står en, er
 * navnet ett kjøretøyet aldri kaller ved — og `fromStation`/`toStation` er
 * NØKLENE `track.js` slår opp med: `findArr(calls, leg.toStation)`,
 * `legCancelled`, utsnittet av stopp, avstigningskortet, «gå av nå». Et navn
 * som ikke finnes blant kallene gir `null` alle de stedene.
 *
 * Kodebasens signaturfeil, i sin dyreste form: to steder skriver ned hvor en
 * etappe slutter, og de er uenige nøyaktig i reisene som trenger det mest.
 *
 * FIKSTURENE ER BYGGET HERFRA, ikke fanget fra api.entur.io — sandkassen når
 * det ikke. Formen (`legs[]` med `mode:'foot'` mellom kjøretøyetapper) er
 * Journey Planner v3s egen, og den samme adapteren alt leser.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { adaptTripPattern } from '../src/api/adapt.js';
import { legsFromTrip } from '../src/journey.js';
import { findArr } from '../src/geo.js';

const T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
const iso = m => new Date(T0 + m * 60000).toISOString();

const sted = (name, lat, lon) => ({ name, latitude: lat, longitude: lon });
const kall = (name, m) => ({
  quay: { latitude: 59.9, longitude: 10.7,
    stopPlace: { id: 'NSR:StopPlace:' + name.replace(/\W/g, ''), name, latitude: 59.9, longitude: 10.7 } },
  aimedArrivalTime: iso(m), expectedArrivalTime: iso(m),
  aimedDepartureTime: iso(m), expectedDepartureTime: iso(m),
});

/** En kjøretøyetappe slik tripGQL ber om den. */
const kjør = (mode, linje, fra, til, m0, m1, spor, front, kalleliste) => ({
  mode, fromPlace: sted(fra, 59.9, 10.7), toPlace: sted(til, 59.91, 10.75),
  aimedStartTime: iso(m0), expectedStartTime: iso(m0),
  aimedEndTime: iso(m1), expectedEndTime: iso(m1),
  serviceJourney: { id: 'SJ:' + linje + ':' + m0,
    line: { id: 'RUT:Line:' + linje, publicCode: linje, presentation: { colour: 'f5a000' } },
    estimatedCalls: kalleliste },
  fromEstimatedCall: { expectedDepartureTime: iso(m0), aimedDepartureTime: iso(m0),
    realtime: true, cancellation: false, quay: { publicCode: spor },
    destinationDisplay: { frontText: front } },
  toEstimatedCall: { expectedArrivalTime: iso(m1), aimedArrivalTime: iso(m1),
    quay: { publicCode: '2' } },
});
const gå = (fra, til, m0, m1) => ({
  mode: 'foot', fromPlace: sted(fra, 59.9, 10.7), toPlace: sted(til, 59.91, 10.75),
  aimedStartTime: iso(m0), expectedStartTime: iso(m0),
  aimedEndTime: iso(m1), expectedEndTime: iso(m1),
});

/* (a) BYTTE MED GANGE. T-bane til Jernbanetorget, gå til Oslo S, tog til
 * Ski. To stoppesteder, to navn — OTP legger gangen imellom. */
const A = {
  duration: 45 * 60,
  legs: [
    kjør('metro', '3', 'Ryen', 'Jernbanetorget', 0, 8, '1', 'Kolsås',
      [kall('Ryen', 0), kall('Brynseng', 3), kall('Jernbanetorget', 8), kall('Stortinget', 10)]),
    gå('Jernbanetorget', 'Oslo S', 8, 13),
    kjør('rail', 'L2', 'Oslo S', 'Ski', 18, 45, '13', 'Ski',
      [kall('Lillestrøm', 0), kall('Oslo S', 18), kall('Nordstrand', 26), kall('Ski', 45)]),
  ],
};

/* (b) REISEN ENDER TIL FOTS. Målet er et sted, ikke et stopp — T-banen går
 * ikke til Aker brygge. */
const B = {
  duration: 30 * 60,
  legs: [
    kjør('metro', '3', 'Mortensrud', 'Nationaltheatret', 0, 22, '1', 'Kolsås',
      [kall('Mortensrud', 0), kall('Jernbanetorget', 18), kall('Stortinget', 20),
       kall('Nationaltheatret', 22), kall('Majorstuen', 25)]),
    gå('Nationaltheatret', 'Aker brygge', 22, 30),
  ],
};

/* (c) OTP GÅR DEG TIL NABOSTOPPET FØRST. Du skrev Ryen; bussen går fra
 * Ryen T (et annet stoppested i NSR, samme gatehjørne). */
const C = {
  duration: 20 * 60,
  legs: [
    gå('Ryen', 'Ryenkrysset', 0, 3),
    kjør('bus', '23', 'Ryenkrysset', 'Helsfyr', 5, 20, 'A', 'Lysaker',
      [kall('Ryenkrysset', 5), kall('Etterstad', 12), kall('Helsfyr', 20)]),
  ],
};

const DIR = {
  A: { from: 'Ryen', to: 'Ski' },
  B: { from: 'Mortensrud', to: 'Aker brygge' },
  C: { from: 'Ryen', to: 'Helsfyr' },
};

const bygg = (tp, dir) => legsFromTrip(adaptTripPattern(tp), dir);
const kallene = (tp, i) => tp.legs.filter(l => l.mode !== 'foot')[i].serviceJourney.estimatedCalls;

/* ── MÅLEINSTRUMENTET FØRST ─────────────────────────────────────────── */
describe('fiksturene selv', () => {
  it('kommer gjennom adapteren', () => {
    [A, B, C].forEach((tp, i) => expect(adaptTripPattern(tp), 'fikstur ' + i).toBeTruthy());
  });

  it('og har en gangeetappe der påstanden krever det', () => {
    expect(A.legs[1].mode).toBe('foot');
    expect(B.legs[B.legs.length - 1].mode).toBe('foot');
    expect(C.legs[0].mode).toBe('foot');
  });

  /* Er navnene i kallene like de OTP gir etappen, er hver påstand under om
   * oppslag meningsfull — ellers ville også det riktige navnet bomme. */
  it('og etappens endepunkter finnes blant dens egne kall', () => {
    expect(findArr(kallene(A, 1), 'Oslo S')).toBeTruthy();
    expect(findArr(kallene(B, 0), 'Nationaltheatret')).toBeTruthy();
    expect(findArr(kallene(C, 0), 'Ryenkrysset')).toBeTruthy();
  });
});

/* ── (a) BYTTE MED GANGE ────────────────────────────────────────────── */
describe('bytte med gange imellom', () => {
  it('andre etappe starter der toget faktisk går fra', () => {
    expect(bygg(A, DIR.A)[1].fromStation).toBe('Oslo S');
  });

  it('og første etappe slutter der T-banen faktisk stopper', () => {
    expect(bygg(A, DIR.A)[0].toStation).toBe('Jernbanetorget');
  });

  it('og begge navnene finnes blant etappens egne kall', () => {
    const l = bygg(A, DIR.A);
    expect(findArr(kallene(A, 1), l[1].fromStation)).toBeTruthy();
    expect(findArr(kallene(A, 1), l[1].toStation)).toBeTruthy();
  });
});

/* ── (b) REISEN ENDER TIL FOTS ──────────────────────────────────────── */
describe('reisen ender til fots', () => {
  /* Avstigningskortet og «gå av nå» slår opp `toStation` i kallene. «Aker
   * brygge» står ikke blant dem — og da kommer aldri varselet. */
  it('siste etappe slutter ved stoppet, ikke ved målet', () => {
    expect(bygg(B, DIR.B)[0].toStation).toBe('Nationaltheatret');
  });

  it('og det navnet finnes blant kallene', () => {
    expect(findArr(kallene(B, 0), bygg(B, DIR.B)[0].toStation)).toBeTruthy();
  });
});

/* ── (c) GANGE TIL NABOSTOPPET FØRST ────────────────────────────────── */
describe('gange til nabostoppet først', () => {
  it('første etappe starter der bussen faktisk går fra', () => {
    expect(bygg(C, DIR.C)[0].fromStation).toBe('Ryenkrysset');
  });
});

/* ── PUNKT TIL PUNKT ER UENDRET ─────────────────────────────────────────
 *
 * Uten gange imellom var de to kildene alltid like, og det er der appen
 * har virket. Faller denne, har rettelsen ødelagt det som fungerte. */
describe('punkt til punkt', () => {
  const D = { duration: 9 * 60, legs: [
    kjør('metro', '3', 'Mortensrud', 'Manglerud', 0, 9, '1', 'Kolsås',
      [kall('Mortensrud', 0), kall('Ryen', 6), kall('Manglerud', 9)]) ] };
  it('gir de samme navnene som før', () => {
    const l = bygg(D, { from: 'Mortensrud', to: 'Manglerud' });
    expect(l).toHaveLength(1);
    expect(l[0].fromStation).toBe('Mortensrud');
    expect(l[0].toStation).toBe('Manglerud');
  });
});

/* ── BYTTET HAR TO STEDER, IKKE ETT ─────────────────────────────────────
 *
 * `_transfers[i].at` var der du går AV, mens `platform` og `frontText` på
 * samme post kom fra etappen du går PÅ. Ingen skjerm skrev de to ut
 * sammen — men dataene sa «Jernbanetorget, spor 13», og spor 13 er på
 * Oslo S. Nå bærer posten begge.
 */
describe('byttet', () => {
  const t = () => adaptTripPattern(A)._transfers[0];

  it('vet hvor du går av og hvor du går på', () => {
    expect(t().av).toBe('Jernbanetorget');
    expect(t().på).toBe('Oslo S');
  });

  it('og sporet hører til stedet du går på', () => {
    expect(t().platform).toBe('13');
  });

  it('og hvor lenge du går imellom', () => {
    expect(t().gåMin).toBe(5);
  });

  it('og `at` betyr fortsatt der du går av', () => {
    expect(t().at).toBe(t().av);
  });

  /* Gange FØR første kjøretøy er ikke et bytte. Teltes den, ville (c)
   * fått et bytte på 3 min som ikke finnes. */
  it('og gangen til første stopp telles ikke som et bytte', () => {
    expect(adaptTripPattern(C)._transfers).toEqual([]);
  });

  it('og et bytte uten gange har null, ikke 0', () => {
    const E = { duration: 30 * 60, legs: [
      kjør('metro', '3', 'Ryen', 'Tøyen', 0, 6, '1', 'Kolsås', [kall('Ryen', 0), kall('Tøyen', 6)]),
      kjør('metro', '5', 'Tøyen', 'Storo', 9, 15, '2', 'Vestli', [kall('Tøyen', 9), kall('Storo', 15)]),
    ] };
    expect(adaptTripPattern(E)._transfers[0].gåMin).toBeNull();
  });
});

describe('etappen bærer gangen etter seg', () => {
  it('til neste stopp ved et bytte', () => {
    expect(bygg(A, DIR.A)[0].gåEtter).toBe(5);
  });

  it('og til målet på siste etappe', () => {
    expect(bygg(B, DIR.B)[0].gåEtter).toBe(8);
  });

  it('og null når reisen ender ved stoppet', () => {
    expect(bygg(A, DIR.A)[1].gåEtter).toBeNull();
  });
});

/* ── HVA SKJERMEN SIER ──────────────────────────────────────────────── */
import { ankomstTekst, bytteTekst } from '../src/bytte.js';

describe('skjermen sier gangen', () => {
  /* FØR-BILDET: «ankommer Aker brygge» ved siden av T-banens tid på
   * Nationaltheatret. En tid du ikke er framme, med et sted du ikke er på. */
  it('siste etappe sier hvor du går av, og hvor langt det er å gå', () => {
    const l = bygg(B, DIR.B);
    expect(ankomstTekst(l[0], DIR.B.to)).toBe('av på Nationaltheatret · 8 min å gå');
  });

  it('men sier «ankommer» når stoppet ER målet', () => {
    const l = bygg(A, DIR.A);
    expect(ankomstTekst(l[1], 'Ski')).toBe('ankommer Ski');
  });

  /* «Ryen T» og «Ryen» er ett sted. En skjerm som sa «av på Ryen T · gå
   * til Ryen» ville vært den samme feilen i motsatt retning. */
  it('og «Ryen T» er samme sted som «Ryen»', () => {
    expect(ankomstTekst({ toStation: 'Ryen T', gåEtter: 0 }, 'Ryen')).toBe('ankommer Ryen');
  });

  it('bytte med gange sier hvor neste etappe går fra', () => {
    const l = bygg(A, DIR.A);
    expect(bytteTekst(l[0], l[1])).toBe('av på Jernbanetorget · gå til Oslo S · 5 min å gå');
  });

  it('men et bytte på samme sted er bare «bytt på»', () => {
    expect(bytteTekst({ toStation: 'Tøyen' }, { fromStation: 'Tøyen' })).toBe('bytt på Tøyen');
  });

  it('og bruker skjermens egen måte å skrive navn på', () => {
    const vis = s => s.toUpperCase();
    expect(bytteTekst({ toStation: 'Tøyen' }, { fromStation: 'Tøyen' }, vis)).toBe('bytt på TØYEN');
  });

  /* NULL MINUTTER ER IKKE EN GANG Å NEVNE. OTP gir en gangeetappe på noen
   * sekunder mellom to plattformer på samme stasjon, og den runder til 0.
   * «· 0 min å gå» er en setning som bare tar plass. Funnet av en mutant
   * som overlevde første runde. */
  it('og sier ikke «0 min å gå»', () => {
    expect(ankomstTekst({ toStation: 'Nationaltheatret', gåEtter: 0 }, 'Aker brygge'))
      .toBe('av på Nationaltheatret');
    expect(bytteTekst({ toStation: 'A', gåEtter: 0 }, { fromStation: 'B' }))
      .toBe('av på A · gå til B');
  });

  it('og tåler at noe mangler', () => {
    expect(bytteTekst(null, null)).toBe('');
    expect(bytteTekst({ toStation: 'Tøyen' }, null)).toBe('bytt på Tøyen');
    expect(ankomstTekst({}, 'Ski')).toBe('ankommer Ski');
  });
});

/* ── ÉN NAVNEMATCHER ────────────────────────────────────────────────────
 *
 * `findArr` hadde oppskrift C fra `stopId.js` sin egen liste — en av de fire
 * v1.107.0 ryddet bort. Den overlevde i funksjonen `track.js` slår opp hver
 * etappes ankomst med.
 */
describe('findArr matcher som resten av appen', () => {
  const k = [kall('Ryen', 0), kall('Oslo S', 5)];
  it('finner «Ryen T, Oslo» som «Ryen»', () => {
    expect(findArr(k, 'Ryen T, Oslo')).toBe(k[0]);
  });
  it('og bruker stopKey, ikke sin egen oppskrift', () => {
    const src = require('node:fs').readFileSync('src/geo.js', 'utf8');
    const fn = src.slice(src.indexOf('export function findArr'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/stopKey\(name\)/);
    expect(fn.slice(0, fn.indexOf('\n}'))).not.toMatch(/replace\(/);
  });
});

/* ── OG DET OVERLEVER EN OPPFRISKNING ───────────────────────────────── */
import { saveJny, loadJny, clearJny } from '../src/journey.js';
import { state } from '../src/state.js';

describe('etter en oppfriskning', () => {
  const lagre = (legs) => {
    clearJny();
    state.jny = { dest: 'Aker brygge', from: 'Mortensrud', boardedAt: Date.now(),
      lineCode: '3', lineBg: '#f5a000', frontText: 'Kolsås', legs };
    saveJny();
    return loadJny();
  };

  it('husker gangen etter etappen', () => {
    expect(lagre(bygg(B, DIR.B)).legs[0].gåEtter).toBe(8);
  });

  /* `legsFromTrip` lover at traseen bæres gjennom en reload. `saveJny`
   * lagret den ikke, og `track.js:174` fikk null — rette streker under
   * bakken, nøyaktig det kommentaren sa den forhindret. */
  it('og traseen', () => {
    const legs = bygg(B, DIR.B);
    legs[0].shape = '_p~iF~ps|U_ulLnnqC';
    expect(lagre(legs).legs[0].shape).toBe('_p~iF~ps|U_ulLnnqC');
  });
});

/* ── KALLESTEDENE ───────────────────────────────────────────────────── */
describe('kallestedene', () => {
  const strip = f => require('node:fs').readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('legsFromTrip henter endepunktene fra etappen', () => {
    const src = strip('src/journey.js');
    expect(src).toMatch(/fromStation: legEnds\(leg\)\.fra/);
    expect(src).toMatch(/toStation:\s+legEnds\(leg\)\.til/);
    expect(src).not.toMatch(/_transfers\[i-1\]\.at/);
  });

  it('og underveis-skjermen spør de to tekstfunksjonene', () => {
    const src = strip('src/views/track.js');
    expect(src).toMatch(/ankomstTekst\(leg, state\.jny\.dest, displayStn\)/);
    expect(src).toMatch(/bytteTekst\(leg, legs\[i \+ 1\], displayStn\)/);
    expect(src).not.toMatch(/'ankommer ' \+ displayStn\(state\.jny\.dest\)/);
  });
});

/* ── RIKTIG FOREKOMST ───────────────────────────────────────────────────
 *
 * `findArr` tok det første kallet med riktig navn. En linje som passerer
 * samme stopp to ganger — en sløyfe, eller en linje som snur — ga da
 * ankomsten FØR du gikk på: en tid i fortiden, og «gå av nå» ved et stopp
 * du allerede har passert.
 */
describe('findArr: en linje som passerer samme stopp to ganger', () => {
  const sløyfe = [kall('Majorstuen', 5), kall('Nationaltheatret', 8),
    kall('Ryen', 15), kall('Tøyen', 18), kall('Majorstuen', 24)];

  it('finner ankomsten ETTER påstigningen', () => {
    expect(findArr(sløyfe, 'Majorstuen', { etter: 'Ryen' })).toBe(sløyfe[4]);
  });

  it('og uten «etter» er det som før', () => {
    expect(findArr(sløyfe, 'Majorstuen')).toBe(sløyfe[0]);
  });

  it('og finnes ikke påstigningen, letes det i hele lista', () => {
    expect(findArr(sløyfe, 'Majorstuen', { etter: 'Ullevål' })).toBe(sløyfe[0]);
  });

  /* Og avstigningsoppslagene sender den med. Seks steder slår opp en
   * ankomst; ett som glemte det ville vært feilen tilbake der. */
  it('og alle ankomstoppslagene sender påstigningen med', () => {
    const fs = require('node:fs');
    const strip = f => fs.readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const ankomst = [
      // Underveis sender id-ene med også (v1.197.0); påstanden her er
      // bare at påstigningen er med.
      ['src/views/track.js', /findArr\(calls, leg\.toStation, \{ etter: leg\.fromStation[,}]/],
      ['src/views/track.js', /findArr\(calls, nxt\.toStation, \{ etter: nxt\.fromStation[,}]/],
      ['src/views/selected.js', /findArr\(sjc, dir\.to, \{ etter: dir\.from \}\)/],
      ['src/views/board.js', /findArr\(sjc, dir\.to, \{ etter: dir\.from \}\)/],
      ['src/journey.js', /findArr\(sjc, dir\.to, \{ etter: dir\.from \}\)/],
      ['src/journey.js', /findArr\(sjc2, dir\.to, \{ etter: dir\.from \}\)/],
    ];
    ankomst.forEach(([f, re]) => expect(strip(f), f + ' ' + re).toMatch(re));
  });
});
