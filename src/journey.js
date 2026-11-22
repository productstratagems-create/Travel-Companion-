import { ruteFraTavle, medEndestasjon } from './dinRute.js';
import config from './config.js';
import { clk, clkDay } from './ui/fmt.js';
import { state, intervals } from './state.js';
import { findArr } from './geo.js';
import { storage } from './storage.js';
import { callPlace } from './api/place.js';
import { legEnds } from './api/adapt.js';
import { registrerReise } from './api/smart.js';
import { antaAvstigning } from './api/avstigningVent.js';
import { avstigningFraStopp } from './api/avstigning.js';
import { logMsg } from './ui/log.js';
import { updateOnboardChip } from './ui/chip.js';
import { show, oppdaterNav } from './ui/nav.js';
import { startBoard, stopBoard } from './views/board.js';
import { renderSelected, startSelRefresh, stopSelRefresh } from './views/selected.js';
import { buildTrackBar, startTracking, stopTracking } from './views/track.js';


export function tap(i) {
  state.sel = typeof i === 'number' ? state.deps[i] : i;
  if (!state.sel) return;
  state.lockedJourneyId   = (state.sel.serviceJourney && state.sel.serviceJourney.id) || null;
  state.lockedJourneyMeta = null;
  stopBoard();
  show('v-selected');
  const old = document.getElementById('s-ctas');
  if (old) old.remove();
  startSelRefresh();
  renderSelected();
}

/**
 * Start tracking a journey found via "finn reise" (journey-ID lookup),
 * riding it to the chosen stop without going through the normal board/tap flow.
 */
/**
 * ÉN ETAPPE AV EN TUR (v1.218.120), fra `fraIdx` til `tilIdx` i turens
 * stoppliste (`fetchJourneyMeta`). Felles for «finn reise» (joinJourney) og
 * en overgang lagt til i Underveis (leggTilOvergang). Ren.
 */
export function legFraMeta(meta, fraIdx, tilIdx) {
  if (!meta || !meta.calls || !meta.calls[fraIdx] || !meta.calls[tilIdx] || tilIdx <= fraIdx) return null;
  const first = meta.calls[fraIdx];
  const dest  = meta.calls[tilIdx];
  const toTime = (c) => {
    const t = c.expected || c.aimed;
    return t ? { time: t, clk: clk(t) } : null;
  };
  return {
    lineCode:    meta.lineCode || '?',
    lineBg:      meta.lineBg || '#7c2d12',
    mode:        meta.mode || 'metro',
    frontText:   meta.dest || dest.name,
    journeyId:   meta.journeyId,
    fromStation: first.name,
    toStation:   dest.name,
    depTime:     toTime(first),
    arrTime:     toTime(dest),
    quay:        first.quay,
    stops: meta.calls.slice(fraIdx).map(c => ({
      quay: { stopPlace: { name: c.name, latitude: c.lat, longitude: c.lon } },
      expectedArrivalTime:   c.expected,
      aimedArrivalTime:      c.aimed,
      expectedDepartureTime: c.expected,
      aimedDepartureTime:    c.aimed,
    })),
  };
}

/**
 * EN OVERGANG LAGT TIL UNDERVEIS (v1.218.120). Bestilt: «Her ønsker jeg
 * mulighet til å legge til en overgang ved å klikke på en gitt avgang.»
 * Etappen legges sist i reisen, og målet flyttes dit; det forrige målet
 * huskes på etappen, så «fjern overgang» kan sette det tilbake. Telles ikke
 * som reise (v1.218.105: bare GPS og et ja teller).
 */
export function leggTilOvergang(jny, meta, fraIdx, tilIdx) {
  const leg = legFraMeta(meta, fraIdx, tilIdx);
  if (!jny || !Array.isArray(jny.legs) || !leg) return false;
  const dest = meta.calls[tilIdx];
  leg._forrige = { dest: jny.dest, arrival: jny.arrival, _toLat: jny._toLat, _toLon: jny._toLon, arrQuay: jny.arrQuay || null };
  jny.legs.push(leg);
  jny.dest = dest.name;
  jny.arrival = leg.arrTime;
  jny._toLat = dest.lat; jny._toLon = dest.lon;
  jny.arrQuay = dest.quay || null;
  return true;
}
/** Angre siste overgang lagt til underveis. Bare den, aldri reisens egne etapper. */
export function fjernOvergang(jny) {
  if (!jny || !Array.isArray(jny.legs) || jny.legs.length < 2) return false;
  const leg = jny.legs[jny.legs.length - 1];
  if (!leg._forrige) return false;
  jny.legs.pop();
  Object.assign(jny, leg._forrige);
  return true;
}

export function joinJourney(meta, toIdx) {
  if (!meta || !meta.calls || !meta.calls[toIdx]) return;
  const first = meta.calls[0];
  const dest  = meta.calls[toIdx];
  const leg = legFraMeta(meta, 0, toIdx);
  if (!leg) return;
  state.jny = {
    dest:              dest.name,
    from:              first.name,
    boardedAt:         Date.now(),
    lineCode:          leg.lineCode,
    lineBg:            leg.lineBg,
    frontText:         leg.frontText,
    firstLegFrontText: leg.frontText,
    arrival:           leg.arrTime,
    _toLat:            dest.lat,
    _toLon:            dest.lon,
    legs:              [leg],
  };
  state.lockedJourneyId   = meta.journeyId;
  state.lockedJourneyMeta = meta;
  state.sel = null;
  stopBoard();
  saveJny();
  // Du følger en reise: den teller. Her, og ikke i activateTracking, som
  // også kjører når en lagret reise gjenopprettes.
  // STARTET, IKKE REIST (v1.218.105): telles som bekreftet først når GPS og
  // intervjuet sier ja (clearJny → lærAvStartetReise).
  registrerReise({ nivå: 'startet', fra: first.name, til: dest.name, tilLat: dest.lat, tilLon: dest.lon,
    linje: meta.lineCode }, _posForLogg());
  activateTracking();
}

/** Hvor du var da reisen startet, for reiseloggen. */
function _posForLogg() {
  return state.homeLL ? { lat: state.homeLL.lat, lon: state.homeLL.lon, acc: state.posAcc } : null;
}

/**
 * The journey's legs, from a selected row.
 *
 * Lifted out of `doBoard` so it can be tested: `doBoard` also starts
 * tracking and draws a screen, and a rule buried in it could not be
 * called from a test without all of that.
 */
export function legsFromTrip(c, dir) {
  const sj = c.serviceJourney;
  const lbg = sj && sj.line && sj.line.presentation && sj.line.presentation.colour;
  const legs = [];
  if (c._legs && c._legs.length) {
    c._legs.forEach((leg, i) => {
      const legSj = leg.serviceJourney;
      const legLine = legSj && legSj.line;
      const legLbg = legLine && legLine.presentation && legLine.presentation.colour;
      const depT = leg.fromEstimatedCall && (leg.fromEstimatedCall.expectedDepartureTime || leg.fromEstimatedCall.aimedDepartureTime);
      const arrT = leg.toEstimatedCall && (leg.toEstimatedCall.expectedArrivalTime || leg.toEstimatedCall.aimedArrivalTime);
      legs.push({
        lineCode:    (legLine && legLine.publicCode) || '?',
        lineRef:     (legLine && legLine.id) || null,
        lineBg:      legLbg ? '#' + legLbg : '#7c2d12',
        // Tilbyderens egen tekstfarge (v1.218.12) — samme merke underveis som på tavla.
        lineFg:      (legLine && legLine.presentation && legLine.presentation.textColour) || null,
        mode:        leg.mode || 'metro',
        frontText:   (leg.fromEstimatedCall && leg.fromEstimatedCall.destinationDisplay && leg.fromEstimatedCall.destinationDisplay.frontText) || leg.toPlace.name,
        journeyId:   legSj && legSj.id,
        /* FRA ETAPPEN, IKKE FRA RUTA.
         *
         * Dette var `i === 0 ? dir.from : _transfers[i-1].at` og
         * `tr ? tr.at : dir.to` — der du skrev, der du gikk av forrige, og
         * reisemålet ditt. Like bare når ingen gange står imellom. Ellers et
         * navn kjøretøyet aldri kaller ved, og `track.js` slår opp nettopp
         * dette for ankomst, innstilling og «gå av nå».
         *
         * `dir` er reisens endepunkter og bor i `state.jny.from/dest`. Det er
         * et annet faktum, og skal ikke låne seg ut hit. */
        fromStation: legEnds(leg).fra || dir.from,
        toStation:   legEnds(leg).til || dir.to,
        // Id-ene, når spørringen fikk dem. `findArr` slår opp på id først.
        fromStopId:  legEnds(leg).fraId,
        toStopId:    legEnds(leg).tilId,
        // Byttet ETTER denne etappen. Underveis sier «bli sittende» og aldri
        // «gå av nå» der linja bare skifter nummer.
        blisittende: !!(c._transfers && c._transfers[i] && c._transfers[i].blisittende),
        garantert:   !!(c._transfers && c._transfers[i] && c._transfers[i].garantert),
        // Gangen ETTER denne etappen: til neste etappes stopp, eller til
        // målet. Regnet ut av adapteren fra OTPs egne gangeetapper — null
        // når ingen gange står der. Uten den kunne skjermen si «bytt på
        // Jernbanetorget» og tie om at toget går fra Oslo S.
        gåEtter: (i < c._legs.length - 1)
          ? ((c._transfers && c._transfers[i] && c._transfers[i].gåMin) ?? null)
          : (c._alightWalkMins ?? null),
        depTime:     depT ? { time: depT, clk: clk(depT) } : null,
        arrTime:     arrT ? { time: arrT, clk: clk(arrT) } : null,
        quay:        (leg.fromEstimatedCall && leg.fromEstimatedCall.quay && leg.fromEstimatedCall.quay.publicCode) || null,
        stops:       [],
        // The leg's real alignment, kept encoded. loadJny strips stops[] and
        // the track view refills them from fetchTrack, which returns calls
        // and no geometry — so without carrying this the underveis map would
        // drop back to straight lines after every reload, which is exactly
        // the underground case this app exists for. A few kB, and journeys
        // expire after four hours.
        shape:       (leg.pointsOnLink && leg.pointsOnLink.points) || null,
      });
    });
  } else {
    // Board route (single-leg, no trip planner)
    const sjc = sj && sj.estimatedCalls;
    const arr = findArr(sjc, dir.to, { etter: dir.from });
    const arrT = arr && (arr.expectedArrivalTime || arr.aimedArrivalTime);
    const depT = c.expectedDepartureTime || c.aimedDepartureTime;
    legs.push({
      lineCode:    (sj && sj.line && sj.line.publicCode) || config.line,
      lineRef:     (sj && sj.line && sj.line.id) || null,
      lineBg:      lbg ? '#' + lbg : '#7c2d12',
      lineFg:      (sj && sj.line && sj.line.presentation && sj.line.presentation.textColour) || null,
      // FRA AVGANGEN (v1.218.93). Rapportert: «Buss til Helsfyr ser ut til å
      // bli til t-bane til Helsfyr.» Her sto 'metro' fast — en valgt buss
      // ble T-bane underveis (ikon, «spor», farger). Ukjent sies ikke som T-bane.
      mode:        (sj && sj.line && sj.line.transportMode) || c._mode || null,
      frontText:   (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to,
      journeyId:   sj && sj.id,
      fromStation: dir.from,
      toStation:   dir.to,
      depTime:     depT ? { time: depT, clk: clk(depT) } : null,
      arrTime:     arrT ? { time: arrT, clk: clk(arrT) } : null,
      quay:        (c.quay && c.quay.publicCode !== '?' && c.quay.publicCode) || null,
      stops:       sjc || [],
      shape:       (c._legs && c._legs[0] && c._legs[0].pointsOnLink
                    && c._legs[0].pointsOnLink.points) || null,
    });
  }

  return legs;
}

export function doBoard() {
  const c = state.sel;
  if (!c) return;
  // Avgangens egen rute når den har et mål (Auto-tavle, v1.218.268), og den
  // blir Rutes rute: samme dør som et valg i innstillingene.
  // Uten valgt avstigning: endestasjonen (v1.218.270).
  const egen = ruteFraTavle(c._dir && c._dir.key === 'auto-tavle' ? medEndestasjon(c._dir, c, Date.now()) : c._dir);
  if (egen && window._settRute) window._settRute(egen);
  const dir = egen || config.dirs[state.dIdx];
  const legs = legsFromTrip(c, dir);

  const firstLeg = legs[0];
  const lastLeg = legs[legs.length - 1];
  const finalArrival = lastLeg.arrTime || (c._finalArrival ? { time: c._finalArrival, clk: clk(c._finalArrival) } : null);

  // Resolve destination coordinates — try OTP3 trip coords first, then board estimated-call coords
  let _toLat = c._toLat || null;
  let _toLon = c._toLon || null;
  if (!_toLat || !_toLon) {
    const sjc2 = c.serviceJourney && c.serviceJourney.estimatedCalls;
    const arrCall = findArr(sjc2, dir.to, { etter: dir.from });
    _toLat = (arrCall && arrCall.quay && arrCall.quay.stopPlace && arrCall.quay.stopPlace.latitude) || null;
    _toLon = (arrCall && arrCall.quay && arrCall.quay.stopPlace && arrCall.quay.stopPlace.longitude) || null;
  }

  state.jny = {
    dest:              dir.to,
    from:              dir.from,
    arrQuay:           c._arrQuay || null,
    boardedAt:         Date.now(),
    lineCode:          firstLeg.lineCode,
    lineBg:            firstLeg.lineBg,
    frontText:         (c.destinationDisplay && c.destinationDisplay.frontText) || dir.to,
    firstLegFrontText: firstLeg.frontText,
    arrival:           finalArrival,
    _toLat,
    _toLon,
    legs,
  };
  // Confirm the lock is on the first (boarding) leg
  state.lockedJourneyId = (firstLeg && firstLeg.journeyId) || state.lockedJourneyId;
  saveJny();
  // Du trykket «på»: reisen teller. Målet er reisens, ikke første etappes.
  registrerReise({ nivå: 'startet', fra: dir.from, til: dir.to, tilStopId: dir.toStopId || null,
    fraStopId: dir.stopId || null, tilLat: _toLat, tilLon: _toLon,
    linje: firstLeg && firstLeg.lineCode }, _posForLogg());
  activateTracking();
}

export function activateTracking() {
  oppdaterNav();   // «underveis» i menyen kommer (v1.218.118)
  stopSelRefresh();
  // When restoring from localStorage the lock must be re-established
  if (!state.lockedJourneyId && state.jny && state.jny.legs[0]) {
    state.lockedJourneyId = state.jny.legs[0].journeyId || null;
  }
  buildTrackBar();
  logMsg('ombord L' + state.jny.lineCode + ' → ' + state.jny.dest + (state.jny.arrival ? ' (' + state.jny.arrival.clk + ')' : ''));
  state.sel = null;
  show('v-track');
  startTracking();
  updateOnboardChip();
}

export function saveJny() {
  try {
    storage.set(config.storage.journey, JSON.stringify({
      dest:              state.jny.dest,
      from:              state.jny.from,
      boardedAt:         state.jny.boardedAt,
      lineCode:          state.jny.lineCode,
      lineBg:            state.jny.lineBg,
      frontText:         state.jny.frontText,
      firstLegFrontText: state.jny.firstLegFrontText || null,
      arrival:           state.jny.arrival,
      // The arrival platform. It was set and never saved, so after a reload
      // the onward list could no longer tell «same platform» from «across the
      // station» — and quietly offered a change it could not promise.
      arrQuay:           state.jny.arrQuay || null,
      _toLat:            state.jny._toLat || null,
      _toLon:            state.jny._toLon || null,
      legs: state.jny.legs.map(leg => ({
        lineCode:    leg.lineCode,
        // The line's own id, not just the number on its side. Without it the
        // underveis screen loses its line identity across a reload and can no
        // longer tell a message about ITS line from one about a bus calling at
        // the same stop.
        lineRef:     leg.lineRef || null,
        lineBg:      leg.lineBg,
        lineFg:      leg.lineFg || null,
        mode:        leg.mode,
        frontText:   leg.frontText,
        journeyId:   leg.journeyId,
        fromStation: leg.fromStation,
        toStation:   leg.toStation,
        gåEtter:     leg.gåEtter ?? null,
        fromStopId:  leg.fromStopId || null,
        toStopId:    leg.toStopId || null,
        blisittende: !!leg.blisittende,
        garantert:   !!leg.garantert,
        /* TRASEEN. Kommentaren der den settes (`legsFromTrip`) lover at den
         * bæres gjennom en oppfriskning — «without carrying this the
         * underveis map would drop back to straight lines after every
         * reload». Den sto ikke her. `track.js:174` leser `leg.shape`, og
         * fikk null etter hver reload: nøyaktig det kommentaren sa den
         * forhindret. Funnet i v1.194.0 mens denne lista likevel ble endret. */
        shape:       leg.shape || null,
        // Overgang lagt til underveis (v1.218.120): det forrige målet, for «fjern».
        _forrige:    leg._forrige || null,
        depTime:     leg.depTime,
        arrTime:     leg.arrTime,
        quay:        leg.quay,
        // STOPPLISTA OVERLEVER NÅ. Den ble utelatt med vilje da den bare var
        // pynt; med v1.154.0 er den grunnlaget for at posisjonen kan svare i
        // det hele tatt. Uten den falt underveis tilbake til klokka etter
        // hver oppfriskning — og i en tunnel for godt.
        //
        // Lagret som `callPlace` gir den, ikke som rå estimatedCalls: den
        // formen er en tiendedel så stor, og den er den SAMME formen alle
        // lesere alt går gjennom, så en lagret liste ikke blir en fjerde form.
        stops: (leg.stops || []).map(callPlace).filter(Boolean),
      })),
    }));
  } catch {}
}

export function loadJny() {
  try {
    const raw = storage.get(config.storage.journey);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (!j.boardedAt || Date.now() - j.boardedAt > config.journeyMaxAgeMs) {
      storage.remove(config.storage.journey);
      return null;
    }
    // Old journeys without legs[] are incompatible — drop them
    if (!j.legs || !j.legs.length) {
      storage.remove(config.storage.journey);
      return null;
    }
    // Stoppene beholdes. En reise lagret før v1.155.0 har ingen, og får en
    // tom liste som før — den fylles av første _fetchTrack.
    j.legs = j.legs.map(leg => ({
      ...leg, stops: Array.isArray(leg.stops) ? leg.stops : [] }));
    return j;
  } catch { return null; }
}

/**
 * Hvor du faktisk gikk av en startet reise (v1.218.102), og tellingen flyttet
 * dit når det ikke var målet. Bare fikser etter påstigningen teller; uten
 * dem (GPS av, eller appen lastet på nytt — sporet er bare i minnet) læres
 * ingenting, og det planlagte står.
 */
export function lærAvStartetReise(jny, spor) {
  if (!jny || !Array.isArray(jny.legs) || !Number.isFinite(jny.boardedAt)) return null;
  const fikser = (spor || []).filter(f => f && Number.isFinite(f.at) && f.at >= jny.boardedAt);
  if (!fikser.length) return null;
  const stopp = jny.legs.flatMap(l => (l.stops || []).map(callPlace).filter(Boolean))
    .map(p => ({ name: p.name, id: p.id || null, lat: p.lat, lon: p.lon }));
  if (stopp.length < 2) return null;
  const av = avstigningFraStopp(stopp.slice(1), fikser, 'auto');
  const planlagt = jny.dest;
  // OGSÅ VED MÅLET (v1.218.105): en startet reise er ikke en reise før GPS
  // og du har sagt det. Samme spørsmål, uansett hvor du gikk av.
  if (!av || !planlagt || normNavn(av.name) === normNavn(jny.from)) return null;
  // En antagelse til du har svart (v1.218.103): intervjuet spør, «ja» flytter.
  antaAvstigning({ art: 'flytt', fra: jny.from, fraStopId: (jny.legs[0] && jny.legs[0].fromStopId) || null,
    planlagt, til: av.name, tilStopId: av.id, tilLat: av.lat, tilLon: av.lon,
    påMs: jny.boardedAt, linje: jny.lineCode, at: fikser[fikser.length - 1].at });
  return av;
}
const normNavn = s => String(s || '').trim().toLowerCase();

export function clearJny() {
  try { lærAvStartetReise(state.jny, state.posTrailLang); } catch { /* læringen skal aldri stoppe avslutningen */ }
  state.jny = null;
  state.lockedJourneyId   = null;
  state.lockedJourneyMeta = null;
  storage.remove(config.storage.journey);
  // Full teardown: stop all tracking polls and hide the sticky chip so the
  // journey never outlives itself regardless of which path ended it
  stopTracking();
  updateOnboardChip();
  oppdaterNav();   // «underveis» i menyen forsvinner (v1.218.118)
}

// Window bridges used by HTML inline handlers and nav.js
window.tap = tap;
window.doBoard = doBoard;
window._clearJny = clearJny;
window._updateOnboardChip = updateOnboardChip;
window.jnyGoTracking = activateTracking;
