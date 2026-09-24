/**
 * HVOR ER JEG NÅ — og hvem svarte på det.
 *
 * Underveis-skjermen var blind. `computeState` er rent klokkedrevet, så
 * «neste stopp» var den første avgangen i ruteplanen som ikke hadde gått —
 * ikke det stoppet du faktisk nærmer deg. GPS-en din ble brukt til å plassere
 * TOGET (`_resolveTrainPos`), aldri deg selv. Og all maskineriet som kan
 * svare — `approach`, `closingRate`, `state.posTrail` — fantes, men ble
 * importert av auto.js og ingen andre.
 *
 * VALGT REGEL: posisjonen vinner når den er fersk og nøyaktig. Det er et
 * bevisst valg, og det farlige med det er at det lager TO svar på ett
 * spørsmål. Derfor finnes denne modulen: ett sted dømmer, og svaret bærer med
 * seg HVEM som dømte, så skjermen kan si det.
 *
 * Rettesnorens punkt 4: «ikke spurt», «leter», «avslått», «unøyaktig» og
 * «gammel» er ikke samme setning. Stillhet leses som «alt er i orden».
 *
 * En bladmodul: den importerer bare andre bladmoduler, og tar posisjonens
 * kvalitet inn som et ferdig svar fra `posState` framfor å spørre selv. Da
 * kan den prøves uten DOM, uten nettverk og uten `state`.
 */
import { approach, metres } from '../trail.js';
import { placeLL } from './place.js';
import { SRC_LABEL } from './posSource.js';

/**
 * Så nær at du ER der. Samme tall som `atPlace` i geo.js bruker.
 *
 * Det står som et eget navn her framfor å importeres, fordi geo.js drar med
 * seg state, config og http — og hele poenget med en bladmodul er at den kan
 * prøves uten dem. Bundet til geo.js sitt tall av en test, så de to ikke kan
 * drive fra hverandre.
 */
export const AT_STOP_M = 120;

/**
 * @param {object} o
 * @param {Array} o.stops    gjenstående stopp, i rekkefølge (med lat/lon)
 * @param {number} o.clockIdx  hva ruteplanen mener er neste
 * @param {Array} o.trail    state.posTrail
 * @param {object} o.pos     {lat, lon} — der du er
 * @param {object} o.quality resultatet av posState()
 * @returns {{idx: number, source: 'posisjon'|'rutetid', why: string,
 *            approaching: string|null, distM: number|null}}
 */
export function whereAmI(o) {
  const c = o || {};
  const stops = Array.isArray(c.stops) ? c.stops : [];
  const clockIdx = Number.isFinite(c.clockIdx) ? c.clockIdx : 0;
  const q = c.quality || {};
  // 'gps' og 'rutetid' er NØYAKTIG navnene stripen alt bruker (SRC_LABEL), så
  // de to leserne av «hvem svarte» ikke kan ende med hvert sitt ordvalg.
  const rute = (why) => ({ idx: clockIdx, source: 'rutetid', why,
    approaching: null, distM: null });

  // PORTEN ER posState SIN `usable` — ikke en ny terskel her. En andre
  // terskel ville vært et andre sted som avgjør om posisjonen er god nok.
  if (!q.usable) return rute(q.label || 'ingen posisjon');

  const pos = placeLL(c.pos);
  if (!pos) return rute(q.label || 'ingen posisjon');

  // Bare stopp vi faktisk vet hvor er.
  const kjente = stops
    .map((s, i) => ({ i, ll: placeLL(s) }))
    .filter((x) => x.ll);
  if (!kjente.length) return rute('stoppene mangler koordinater');

  let nær = null;
  for (const k of kjente) {
    const d = metres(pos, k.ll);
    if (!Number.isFinite(d)) continue;
    if (!nær || d < nær.d) nær = { ...k, d };
  }
  if (!nær) return rute('fant ingen avstand');

  // Du står ved det. Da er det dette stoppet, og ingen tolkning trengs.
  if (nær.d <= AT_STOP_M) {
    return { idx: nær.i, source: 'gps', why: 'du er ved stoppet',
      approaching: 'staar', distM: Math.round(nær.d) };
  }

  // Ellers avgjør RETNINGEN om det nærmeste stoppet ligger foran eller bak.
  // Uten den kan avstand alene ikke skille «straks framme» fra «nettopp
  // passert» — og det er forskjellen på å reise seg og å bli sittende.
  const way = approach(c.trail, nær.ll);
  if (way.kind === 'mot') {
    return { idx: nær.i, source: 'gps', why: 'du nærmer deg',
      approaching: 'mot', distM: Math.round(nær.d) };
  }
  if (way.kind === 'fra' && nær.i + 1 < stops.length) {
    return { idx: nær.i + 1, source: 'gps', why: 'du har passert',
      approaching: 'fra', distM: Math.round(nær.d) };
  }

  // Posisjonen er god, men den sier ikke hvilken vei. Da er ruteplanen det
  // beste svaret — og det SIES, framfor å late som posisjonen bestemte.
  return rute('vet ikke hvilken vei du kjører');
}

/**
 * Setningen skjermen viser om hvem som svarte.
 *
 * Ordene kommer fra SRC_LABEL — de samme stripen bruker — og `why` legges til
 * når den har noe å si. «etter rutetid» alene er en påstand uten grunn, og
 * grunnen er hele forskjellen på «avslått», «gammel» og «unøyaktig».
 */
export function whereAmILabel(r) {
  if (!r) return '';
  const navn = SRC_LABEL[r.source] || r.source;
  return r.why ? navn + ' · ' + r.why : navn;
}
