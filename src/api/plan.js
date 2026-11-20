import { storage } from '../storage.js';
import { stopKey } from '../stopId.js';
import { placeOf, placeLL, samePlace, stopsOf } from './place.js';
import { gjeldende } from './gjentak.js';

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

export function addLegToPlan(c, dir, reiseId) {
  const legs = loadPlan();
  const depIso = c.expectedDepartureTime;
  const serviceJourneyId = (c.serviceJourney && c.serviceJourney.id) || null;
  if (legs.some(l => serviceJourneyId ? l.serviceJourneyId === serviceJourneyId : l.depIso === depIso)) return false;
  const ln = c.serviceJourney && c.serviceJourney.line;
  const line = (ln && ln.publicCode) || '?';
  // INGEN FARGE ER INGEN FARGE (review 2026-11-10): her sto den brune
  // plassholderen 7c2d12, og en linje uten farge fra Entur ble brun i planen.
  // Linjemerket gir da Linjes farge for transportmiddelet.
  const lineColour = (ln && ln.presentation && ln.presentation.colour) || null;
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
    // DET LINJEMERKET OG RADEN TRENGER (review 2026-11-10): uten disse hadde
    // planen verken tilbyderlogo, ikon for transportmiddelet eller plattform.
    lineId: (ln && ln.id) || null,
    mode: (c._legs && c._legs[0] && c._legs[0].mode) || (ln && ln.transportMode) || null,
    lineFg: (ln && ln.presentation && ln.presentation.textColour) || null,
    quay: (c.quay && c.quay.publicCode && c.quay.publicCode !== '?') ? c.quay.publicCode : null,
    // Gange til et annet stopp først (v1.218.16), så planen ikke later som.
    gåTil: c._gåTil || null,
    // HELE KJEDEN (v1.218.159): «72 › L2». Uten den sa planen «etappe 1» om en
    // reise med bytte, fordi bare første linje ble tatt vare på.
    kjede: planKjede(c),
    // HVILKEN REISE (v1.218.169): uten id er det en egen reise.
    reise: reiseId || ('r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)),
    // HELE AVGANGEN (v1.218.160). Bestilt: «Jeg vil ha hele reise» — som
    // favorittene. Avgangsdetaljene åpner den med overgangen, ikke bare 72.
    avgang: avgangKopi(c),
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

/** Linjens farge, eller null. Den brune plassholderen fra før er ingen farge. */
export const GAMMEL_PLASSHOLDER = '7c2d12';
export function legFarge(leg) {
  const f = leg && leg.lineColour;
  return f && String(f).replace('#', '').toLowerCase() !== GAMMEL_PLASSHOLDER ? f : null;
}

/** Kollektivetappene i et reiseforslag, som linjemerket trenger dem. Ren. */
export function planKjede(c) {
  return ((c && c._legs) || []).filter(l => l && l.mode && l.mode !== 'foot').map(l => {
    const ln = (l.serviceJourney && l.serviceJourney.line) || l.line || {};
    return { line: ln.publicCode || '?', lineId: ln.id || null, mode: l.mode,
      lineColour: (ln.presentation && ln.presentation.colour) || null, lineFg: (ln.presentation && ln.presentation.textColour) || null,
      fra: (l.fromPlace && l.fromPlace.name) || null, til: (l.toPlace && l.toPlace.name) || null };
  });
}
/** Kjeden for en lagret etappe — eldre etapper uten kjede er én linje. Ren. */
export function etappeKjede(leg) {
  if (leg && Array.isArray(leg.kjede) && leg.kjede.length) return leg.kjede;
  if (leg && avgangGyldig(leg.avgang)) { const k = planKjede(leg.avgang); if (k.length) return k; }
  return leg ? [{ line: leg.line, lineId: leg.lineId || null, mode: leg.mode, lineColour: leg.lineColour, lineFg: leg.lineFg, fra: null, til: null }] : [];
}
/** Byttene i hele planen: kollektivetappene minus én. Ren. */
export function planBytter(legs) {
  const k = (legs || []).flatMap(etappeKjede);
  return { antall: Math.max(0, k.length - 1), steder: k.slice(0, -1).map(x => x.til).filter(Boolean) };
}

/**
 * En lagringsbar kopi av avgangen: bare data, ingen funksjoner og ingen sykler.
 *
 * DELTE OBJEKTER KOPIERES (v1.218.162). Første utgave droppet ALLE gjentatte
 * objekter, ikke bare sykler. `_legs` og `_allLegs` deler etappene, så
 * `_allLegs` fikk null-hull, og avgangsdetaljene kastet på `l.mode` og sto
 * tomme. Nå droppes bare et objekt som alt er på veien ned (en ekte sykel).
 */
export function avgangKopi(c) {
  if (!c) return null;
  const vei = new Set();
  const kopi = v => {
    if (typeof v === 'function') return undefined;
    if (v instanceof Date) return v.toISOString();
    if (!v || typeof v !== 'object') return v;
    if (vei.has(v)) return undefined;
    vei.add(v);
    try {
      if (Array.isArray(v)) return v.map(x => { const y = kopi(x); return y === undefined ? null : y; });
      const ut = {};
      for (const k of Object.keys(v)) { const y = kopi(v[k]); if (y !== undefined) ut[k] = y; }
      return ut;
    } finally { vei.delete(v); }
  };
  try { return kopi(c); } catch { return null; }
}
/** Kan den lagrede avgangen åpnes? Etappelistene uten hull. Ren. */
export function avgangGyldig(a) {
  if (!a || typeof a !== 'object') return false;
  return ['_legs', '_allLegs'].every(k => a[k] == null || (Array.isArray(a[k]) && a[k].every(x => x && typeof x === 'object')));
}

/**
 * OPPGRADER EN ETAPPE SOM BLE LAGRET FØR HELE REISEN FULGTE MED (v1.218.161).
 * Rapportert: kortet sa «72 · direkte» om 72 → L2. Etappen var lagret før
 * v1.218.159, og knappen sa «i reiseplan», så den kunne ikke legges inn igjen.
 * Når den samme avgangen vises, fylles kjeden og avgangen inn. Ren mot lageret:
 * true når noe ble endret.
 */
export function oppgraderPlanEtappe(c) {
  if (!c) return false;
  const sj = c.serviceJourney && c.serviceJourney.id;
  const legs = loadPlan();
  const leg = legs.find(l => (sj && l.serviceJourneyId === sj) || l.depIso === c.expectedDepartureTime);
  if (!leg) return false;
  const k = planKjede(c);
  if (avgangGyldig(leg.avgang) && Array.isArray(leg.kjede) && leg.kjede.length >= k.length) return false;
  leg.kjede = k;
  leg.avgang = avgangKopi(c);
  if (c._finalArrival) leg.arrIso = c._finalArrival;
  savePlan(legs);
  return true;
}

/** Planen slik den gjelder nå: gjentakende etapper på neste forekomst (v1.218.167). */
export function loadPlanNå(nå = Date.now()) {
  return loadPlan().map(l => gjeldende(l, nå));
}
/** Sett eller fjern gjentakelse på en etappe. dager: [] eller null fjerner. */
export function settGjentak(id, dager) {
  const legs = loadPlan();
  const leg = legs.find(l => l.id === id);
  if (!leg) return false;
  if (dager && dager.length) leg.gjentak = { dager: [...new Set(dager)].sort() }; else delete leg.gjentak;
  savePlan(legs);
  return true;
}

/* ── FLERE REISER (v1.218.169) ─────────────────────────────────────────
 * Rapportert: Stenbråten → Oslo S 07:17 ble en etappe under reisen kl. 08:47.
 * Valgt: «Automatisk, spør ved tvil» — en etappe bare når avgangen fortsetter
 * der en reise endte, ellers en egen reise. Som Google Maps og Citymapper. */
export const ETAPPE_MAKS_PAUSE_MIN = 180;
/** Etappene gruppert i reiser, sortert etter første avgang. Uten id: én reise. Ren. */
export function reiser(legs) {
  const m = new Map();
  (legs || []).forEach(l => { const k = l.reise || 'r0'; if (!m.has(k)) m.set(k, []); m.get(k).push(l); });
  return [...m.entries()].map(([id, ls]) => ({ id, legs: ls.slice().sort((a, b) => Date.parse(a.depIso) - Date.parse(b.depIso)) }))
    .sort((a, b) => Date.parse(a.legs[0].depIso) - Date.parse(b.legs[0].depIso));
}
/** Fortsetter avgangen der reisen endte, og innen pausen? Ren. */
export function fortsetter(reise, c, dir) {
  const last = reise && reise.legs[reise.legs.length - 1];
  if (!last || !c) return false;
  const fra = placeOf(dir, 'from') || placeOf(dir && dir.from);
  if (!samePlace(last.to, fra)) return false;
  const dep = Date.parse(c.expectedDepartureTime);
  const ank = last.arrIso ? Date.parse(last.arrIso) : Date.parse(last.depIso) + LEG_FALLBACK_MINS * 60000;
  return Number.isFinite(dep) && dep >= ank && dep - ank <= ETAPPE_MAKS_PAUSE_MIN * 60000;
}
/** Den første reisen avgangen kan være neste etappe i, eller null. */
export function kandidatReise(legs, c, dir) {
  return reiser(legs).find(r => fortsetter(r, c, dir)) || null;
}
/** Slett én reise; de andre står. */
export function slettReise(id) {
  savePlan(loadPlan().filter(l => (l.reise || 'r0') !== id));
}
