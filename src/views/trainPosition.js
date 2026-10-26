import { snapToCorridor } from '../ui/corridor.js';
import { pointAtDistance, projectOnPath } from '../ui/path.js';
import { livePosition } from '../api/vehicles.js';
import { POS_STALE_MS } from '../geo.js';
import { _interpolateOnPath } from './board.js';

/**
 * Where the train is, and — just as importantly — how we know.
 *
 * The underveis map used to draw two markers for one physical object: a
 * vehicle icon placed from the timetable, and a "Din posisjon" dot placed from
 * GPS. While you are riding those are the same train, drawn twice, from two
 * sources, disagreeing — the timetable one gliding along on schedule whether
 * or not the train is.
 *
 * Your phone is the best sensor available while you are on board. It is on
 * the vehicle, its fix is about this vehicle now, and it exists for lines with
 * no operator feed — which appears to be all of T-banen.
 */

// Ordene bor i en bladmodul nå, så stopplista kan lese dem uten å dra inn
// board.js. Re-eksportert under navnet kallestedene alt kjenner — samme grep
// som geo.js gjør med stopKey.
export { SRC_LABEL } from '../api/posSource.js';

/**
 * @returns {{lat:number, lon:number, heading:number|null, src:'gps'|'live'|'rutetid'}|null}
 */
export function _trainPosition(o) {
  const { calls, routePts, snapDist, now, phase, livePos, journeyId, userLL, posAt } = o || {};

  // 1. You, while you are actually on the train.
  //
  // Three conditions, and the third is the load-bearing one. Riding says the
  // phone is on the vehicle rather than on a platform; freshness is the same
  // rule the rest of the app uses, and matters most in a tunnel where fixes
  // stop arriving; and the corridor snap is what separates "on the train"
  // from "standing near the line" or "GPS wandering indoors". Without it a
  // stationary user drags the train onto themselves.
  if (phase === 'riding' && userLL && posAt != null
      && (now - posAt) < POS_STALE_MS && (now - posAt) > -POS_STALE_MS) {
    const snapped = routePts && routePts.length >= 2
      ? snapToCorridor(userLL, routePts, snapDist == null ? 50 : snapDist)
      : null;
    if (snapped) {
      return { lat: snapped.lat, lon: snapped.lon, heading: _headingAt(routePts, snapped), src: 'gps' };
    }
  }

  // 2. The operator's own measurement. livePosition applies the staleness
  //    rule, so a feed that stopped falls through rather than drifting.
  const live = livePosition(livePos, journeyId, now);
  if (live) {
    // Onto the drawn line, like the board's markers: the train is on the
    // rail, and this polyline is our drawing of that rail. Its tangent also
    // gives a better heading than a feed bearing that points off the track.
    const on = projectOnPath(live, routePts);
    const tangent = on ? (pointAtDistance(routePts, on.along) || {}).heading : null;
    return {
      lat: on ? on.lat : live.lat,
      lon: on ? on.lon : live.lon,
      heading: tangent != null ? tangent : live.bearing,
      src: 'live',
    };
  }

  // 3. The timetable, as before — an estimate, and labelled as one. It now
  //    runs along the drawn alignment instead of cutting between platforms;
  //    with no alignment it degrades to exactly the old answer.
  const est = _interpolateOnPath(calls, now, routePts);
  if (est) return { lat: est.lat, lon: est.lon, heading: est.heading, src: 'rutetid' };

  return null;
}

/* ── OG DET SAMME SPØRSMÅLET, STILT FØR DU HAR GÅTT PÅ ────────────────────
 *
 * «Valgt avgang» var den eneste av visjonens tre faser som ikke viste
 * kjøretøyet på kartet. Tavla gjør det, underveis gjør det — skjermen
 * imellom, der du står på perrongen og lurer på om toget kommer, gjorde det
 * ikke.
 *
 * Den bor her framfor i `selected.js` fordi «hvor er kjøretøyet» er ETT
 * spørsmål. To skjermer som svarer på det hver for seg er formen denne
 * kodebasen har funnet rundt tjuefem ganger.
 *
 * TO TING DEN AVGJØR, OG BEGGE VILLE VÆRT FEIL Å GJENTA I EN SKJERM:
 *
 * 1. `phase` er aldri `'riding'`. På denne skjermen sitter du IKKE på toget,
 *    så GPS-trinnet — «telefonen din står for toget» — må ikke utløses.
 *    Gjorde det det, ville toget blitt tegnet der DU er.
 *
 * 2. `calls` er HELE linjas løp, ikke din klippede etappe. `_interpolateOnPath`
 *    plasserer kjøretøyet på første anker når løpet ikke har begynt
 *    (`now <= pts[0].dep`). Med klippede calls er første anker DIN perrong,
 *    og kartet ville sagt «toget står her» om et tog fire stopp unna.
 *
 *    Med hele løpet er første anker endestasjonen toget starter fra, og da
 *    er påstanden sann. Stoppene bak din påstigning ligger kilometer fra den
 *    tegnede linja, så `anchorDistances` gir null for dem og regnestykket
 *    faller tilbake på ekte perrongkoordinater — utenfor rammen, der toget
 *    faktisk er. Målt i tests/selVehicle.test.js, ikke antatt.
 *
 * @returns samme form som `_trainPosition`, eller null.
 */
export function departureVehicle(dep, o) {
  const { routePts, now, livePos } = o || {};
  const sj = _depServiceJourney(dep);
  if (!sj) return null;
  return _trainPosition({
    calls: sj.estimatedCalls,
    journeyId: sj.id,
    routePts, now, livePos,
    // Se punkt 1 over. Verdien er ikke «riding», og det er hele vitsen.
    phase: 'platform',
  });
}

/**
 * Kjøretøyet du går PÅ — første etappe, ikke den du bytter til.
 *
 * En avgang med bytte har `_legs`; spørsmålet «kommer den» gjelder den du
 * venter på nå. Bussen du tar om tjue minutter er et annet spørsmål, og en
 * markør for den på samme kart ville vært nettopp opplysningen visjonen
 * kaller tyveri av oppmerksomhet.
 *
 * OG DEN LESES FRA `dep.serviceJourney`, IKKE FRA `_legs[0]`.
 *
 * Første utkast av denne gjorde det motsatte, og det var feil. `adapt.js:218`
 * syntetiserer `dep.serviceJourney` NETTOPP fra første etappe — id, linje og
 * løp — og `_fetchSel` (selected.js:910) oppfrisker det objektet hvert
 * intervall med hele linjas løp. `_legs[0].serviceJourney` blir aldri
 * oppfrisket.
 *
 * To steder som bærer samme faktum, der bare det ene holdes à jour. Å lese
 * det andre er å lese gammel rutetid og tro den er fersk.
 */
export function _depServiceJourney(dep) {
  const sj = dep && dep.serviceJourney;
  return sj && Array.isArray(sj.estimatedCalls) && sj.estimatedCalls.length >= 2 ? sj : null;
}

/**
 * Hva slags kjøretøy dette er — og et svar framfor en antakelse.
 *
 * `selected.js:271` setter `mode` fra `dep._legs[0].mode`, som er null for en
 * helt vanlig tavle-avgang uten etapper. `makeVehicleIcon` faller da tilbake
 * på t-bane-silhuetten, så en BUSS ble tegnet som et tog.
 *
 * Linja vet det selv: begge spørringene henter `line{transportMode}`.
 */
export function depMode(dep) {
  const fromLeg = dep && dep._legs && dep._legs[0] && dep._legs[0].mode;
  if (fromLeg) return fromLeg;
  const sj = dep && dep.serviceJourney;
  return (sj && sj.line && sj.line.transportMode) || null;
}

/** Linjas lineRef, som sanntidsfeeden spørres per. */
export function depLineRef(dep) {
  const sj = _depServiceJourney(dep);
  return (sj && sj.line && sj.line.id) || null;
}

/**
 * Heading from the line itself.
 *
 * A phone at walking-to-metro speed reports a bearing that is mostly noise,
 * and often none at all — but the segment the train is standing on knows
 * which way it points.
 *
 * This used to pick the segment by distance to its midpoint in raw degrees:
 * no cos-lat scaling, and wrong on a long segment, where the midpoint can be
 * further from the point than a neighbouring segment's. The shared projection
 * answers the same question exactly.
 */
function _headingAt(pts, p) {
  const on = projectOnPath(p, pts);
  if (!on) return null;
  const at = pointAtDistance(pts, on.along);
  return at ? at.heading : null;
}
