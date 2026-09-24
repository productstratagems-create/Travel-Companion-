import { storage } from '../storage.js';
import { stopKey } from '../stopId.js';
import { placeOf, placeLL, samePlace, stopsOf } from './place.js';

const PLAN_KEY = 't.plan';

export function loadPlan() {
  try {
    const v = JSON.parse(storage.get(PLAN_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

export function savePlan(legs) {
  storage.set(PLAN_KEY, JSON.stringify(legs));
}

export function clearPlan() {
  storage.remove(PLAN_KEY);
}

export function addLegToPlan(c, dir) {
  const legs = loadPlan();
  const depIso = c.expectedDepartureTime;
  const serviceJourneyId = (c.serviceJourney && c.serviceJourney.id) || null;
  if (legs.some(l => serviceJourneyId ? l.serviceJourneyId === serviceJourneyId : l.depIso === depIso)) return false;
  const ln = c.serviceJourney && c.serviceJourney.line;
  const line = (ln && ln.publicCode) || '?';
  const lineColour = (ln && ln.presentation && ln.presentation.colour) || '7c2d12';
  const dest = (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to;
  const arrIso = c._finalArrival || null;
  // RETURNS THE LEG, not just true: the departure screen offers the calendar
  // sheet for the leg it just added, and it must be the same object — looking
  // it up again by a second rule is how the wrong leg gets exported.
  // GEOGRAFIEN TAS VARE PÅ, framfor å hentes igjen over nettet senere.
  //
  // Alt dette ligger på `c` og `dir` i dette øyeblikket, og ble kastet fram
  // til nå: stoppets id, koordinatene, og hele stopplista som
  // `_renderSelMap` tegner kartet av i samme tegnerunde. Uten den måtte
  // plankartet hente reisen på nytt og finne etappen ved å gjette på navn —
  // og «Bryn» er en delstreng av «Brynseng».
  const leg = {
    id: 'leg_' + Date.now(),
    line, lineColour,
    from: placeOf(dir, 'from') || placeOf(dir.from),
    // `to` ER DER DU GÅR AV. Ett navn, én betydning.
    //
    // Den bar før `destinationDisplay.frontText` — altså SKILTET PÅ FRONTEN,
    // som er endestasjonen til vogna og ikke ditt stopp. «Linje 1 mot Bergkrystallen»
    // sier ingenting om at du går av på Helsfyr. Samtidig sammenliknet tavlas
    // plan-filter (`board.js`) dette feltet med `dir.from` for å se om neste
    // etappe starter der forrige sluttet — en sammenlikning som bare gir
    // mening for avstigningsstoppet. To lesere, to betydninger, ett felt.
    to: placeOf(dir, 'to') || placeOf(dest),
    // Skiltet beholdes for seg, for det er det som står på vogna.
    frontText: dest || null,
    stops: stopsOf(c),
    depIso,
    arrIso,
    serviceJourneyId,
    addedAt: Date.now(),
  };
  legs.push(leg);
  savePlan(legs);
  return leg;
}

export function removeLegFromPlan(id) {
  savePlan(loadPlan().filter(l => l.id !== id));
}

/**
 * How long a leg is assumed to last when the board gave no arrival.
 *
 * It was written out as `30 * 60000` here and nowhere else — until the
 * calendar export needed the same number for DTEND. Two hand-written copies
 * of one assumption is the fault this codebase keeps finding, so it has a
 * name before the second reader exists.
 */
export const LEG_FALLBACK_MINS = 30;

export function legStatus(leg, now) {
  const dep = new Date(leg.depIso).getTime();
  const arr = leg.arrIso ? new Date(leg.arrIso).getTime() : dep + LEG_FALLBACK_MINS * 60000;
  if (arr <= now) return 'done';
  if (dep <= now) return 'active';
  return 'future';
}

export function planStatus(legs, now) {
  if (!legs.length) return 'empty';
  if (legs.every(l => legStatus(l, now) === 'done')) return 'done';
  if (new Date(legs[0].depIso).getTime() > now) return 'future';
  return 'active';
}

export function isLegInPlan(depIso, serviceJourneyId) {
  return loadPlan().some(l => serviceJourneyId ? l.serviceJourneyId === serviceJourneyId : l.depIso === depIso);
}

/**
 * Hvilken del av reisen er DENNE etappen?
 *
 * Løftet ut av `_renderPlanMap` uendret, for å kunne måles. Regelen er en
 * DELSTRENGTEST på normaliserte navn, og den har to hull:
 *
 *   «Bryn» er en delstreng av «Brynseng». Passerer reisen Brynseng før Bryn,
 *   peker `fromIdx` på feil stopp — og kartet tegner en strekning du ikke er
 *   på. Begge er ekte stopp i Oslo.
 *
 *   Og `toIdx` har ingen «bare første treff»-vakt, så den tar det SISTE
 *   treffet. Dukker navnet opp to ganger, strekkes etappen for langt.
 *
 * Bommer begge, faller den stille tilbake til hele reisen — `calls[0]` til
 * `calls[n-1]` — uten at noe sies på skjermen.
 *
 * @returns {{fromIdx: number, toIdx: number, source: 'navn'|'hele reisen'}}
 */
export function legExtent(calls, leg) {
  const list = Array.isArray(calls) ? calls : [];
  if (!list.length) return { fromIdx: 0, toIdx: 0, source: 'hele reisen' };

  // ID FØRST, når etappen har den. Da er det ingenting å tolke.
  const byPlace = (want, first) => {
    if (!want) return -1;
    let hit = -1;
    for (let i = 0; i < list.length; i++) {
      if (samePlace(list[i], want)) { hit = i; if (first) break; }
    }
    return hit;
  };
  let fromIdx = byPlace(leg && leg.from, true);
  let toIdx = fromIdx >= 0 ? -1 : byPlace(leg && leg.to, true);
  if (fromIdx >= 0) {
    // Destinasjonen søkes ETTER avstigningspunktet, så en rundtur som
    // berører navnet igjen ikke strekker etappen forbi seg selv.
    for (let i = fromIdx + 1; i < list.length; i++) {
      if (samePlace(list[i], leg && leg.to)) { toIdx = i; break; }
    }
  }
  if (fromIdx >= 0 && toIdx >= 0) return { fromIdx, toIdx, source: 'sted' };

  // INGEN ANDRE VEI. `samePlace` gjør alt id-en ikke kan: mangler den, er
  // navneregelen `stopKey` som LIKHET. En egen navne-reserve her ville vært
  // et andre sted som avgjør det samme spørsmålet — feilformen AGENTS.md
  // navngir — og den ville uansett svart det samme.
  //
  // Finner vi ikke etappen, sies det: dette er hele reisen, ikke din del av
  // den. Skjermen kan da la være å påstå noe den ikke vet.
  return { fromIdx: 0, toIdx: list.length - 1, source: 'hele reisen' };
}
