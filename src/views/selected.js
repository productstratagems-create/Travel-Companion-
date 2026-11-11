import { linjemerke } from '../ui/linjemerke.js';
import config from '../config.js';
import { erInnstilt } from '../innstilt.js';
import { normJid } from '../api/queries.js';
import { stopKey } from '../stopId.js';
import { clk, clkDay, dayPrefix, countdownText } from '../ui/fmt.js';
import { state, intervals } from '../state.js';
import { walkInfo, mToLeave, reachCls, findArr, isWalkActive, walkFocus, userLL, fartNå, loadWalkBuffer } from '../geo.js';
import { gangGjelder } from '../api/ombord.js';
import { plattformTekst } from '../bytte.js';
import { belegg, beleggTekst } from '../api/belegg.js';
import { ensureApproach, approachPoints } from '../api/approach.js';
import { _headingDeg } from '../ui/path.js';
import { fetchJourneyMeta, fetchArrBoard } from '../api/entur.js';
import { quayLatLon, legShape, journeyPoints, _rowDest, påstigningTs, gåTilTekst } from '../api/adapt.js';
import { fetchWeather, forecastAt, weatherAdvice } from '../api/weather.js';
import { loadFavs, addTimedFav, removeFav } from '../ui/favs.js';
import { addLegToPlan, isLegInPlan } from '../api/plan.js';
import { shareLegCalendar, canOfferCalendar } from '../api/calShare.js';
import { updatePlanCtx } from './plan.js';
import { logMsg } from '../ui/log.js';
import { esc } from '../ui/fmt.js';
import { reiselop, kartPunkter, kartUtsnitt } from '../ui/reiselop.js';
import { visStopp } from '../stopId.js';
import { stoppestedKjent, hentStoppested } from '../api/stoppested.js';
import { show } from '../ui/nav.js';
import { startBoard, boardRows } from './board.js';
import { renderAlertsInto } from '../ui/alerts.js';
import { fmtMins } from '../ui/fmt.js';
import L from 'leaflet';
import { createMap, bindMapExpand, fitExpandedMap, drawRoute, drawWalk, userDot, drawLeg, fitPadding } from '../ui/map.js';
import { tokens } from '../ui/themeTokens.js';
import { makeVehicleIcon, VEHICLE_MARKER_OPTS } from '../ui/mapIcons.js';
import { departureVehicle, depLineRef, depMode, SRC_LABEL } from './trainPosition.js';
import { VEHICLE_NOUN } from '../api/posSource.js';
import { livePosFeed } from '../api/vehicles.js';

function cleanName(s) { return (s || '').replace(/,\s*\S.*$/, '').replace(/\s+T$/i, '').trim(); }

// Walk-deadline sub-line. States the remaining margin as a fact and leaves the
// decision to the reader — colour carries the urgency, the words don't command.
function leaveByMsg(rcls, mtl, depTs, now) {
  if (rcls === 'missed') {
    return '<span style="color:#dc2626">passert for ' + fmtMins(Math.abs(mtl)) + ' siden</span>';
  }
  // «igjen» belongs to a duration. Past the horizon this is a clock face, and
  // the word is dropped with it — countdownText says which it handed back
  // rather than leaving the caller to test the threshold again.
  const cls = rcls === 'r-far' ? 'soft' : rcls === 'r-now' ? 'go' : 'amber';
  const ct = countdownText(rcls, mtl, depTs, now);
  return '<span class="' + cls + '">' + esc(ct.text) + '</span>' + (ct.counting ? ' igjen' : '');
}

/**
 * The whole sub-line, built ONCE.
 *
 * It was assembled twice — «gå senest HH:MM · » + leaveByMsg at the initial
 * render, and leaveByMsg alone in the refresher, so the «gå senest» half
 * vanished the moment journey metadata arrived. And past the horizon the two
 * halves said the same thing: the probe printed «gå senest 11:18 · i morgen
 * 11:25», a clock face twice on one line. Past the horizon the deadline alone
 * is the fact; the departure is already the hero above it.
 */
/**
 * Hvilken vei, og hvor langt, til stoppet du skal gå på.
 *
 * Kartet her er 130 px, og det tallet er en MÅLING: v1.103.1 krympet det så
 * «reis» klarerer bunnmenyen. Men 130 px ligger under grensen der
 * `stopsReadable` (`ui/map.js`) beholder noen stopp-punkter i det hele tatt,
 * så kartet er én strek og to etiketter. Det kan ikke løses ved å gjøre det
 * høyere uten å kaste målingen.
 *
 * Så svaret kartet ikke klarer å gi, gis med ord og en pil i stedet: retning
 * og avstand til påstigningsstoppet. Visjonen spør «hvor er stoppet, hvordan
 * kommer jeg meg dit» — og en pil på én linje svarer bedre enn 130 px grå
 * flate.
 *
 * SI HVA DU IKKE VET. Uten posisjon vises ingen pil. En pil som peker
 * nordover fordi den ikke vet bedre er verre enn ingen pil.
 */
/**
 * AVGJØRELSEN, skilt fra tegningen — og eksportert, så den kan måles.
 *
 * Første utgave lå inne i `_retningHtml` og ble forsøkt prøvd i nettleseren.
 * Prøven meldte «vet ikke hvor du er» i ALLE tilfeller, også der posisjonen
 * var sådd — fordi `state.statLL` fylles av tavla, og prøven aldri laster en
 * tavle. Instrumentet målte ingenting, og et grønt «ingen pil» så ut som et
 * svar.
 *
 * Regelen har derfor et navn og en ren form nå. Samme grep som `_timesHtml`
 * og `catchable` i auto.js.
 *
 * @returns {{kind:'ukjent'|'ved'|'retning', deg?:number, dist?:number, mins?:number}}
 */

/**
 * REISESAMMENDRAGET (v1.218.35): det appene som har satt standarden for
 * avgangsdetaljer viser uten å skrolle — hvor og fra hvilket spor, når, om
 * tiden er sanntid eller rutetid, og når og hvor du er framme. Alt dette sto
 * her før, men sammenfoldet under «reiseplan ▾» når det var tid for å gå.
 * Ren, så innholdet prøves uten DOM.
 */
export function sammendragHtml(o) {
  const { fra, spor, avg, rute, sanntid, til, ank, min, ankSpor, belegg: bl } = o || {};
  if (!Number.isFinite(avg)) return '';
  const forsinkMin = Number.isFinite(rute) ? Math.round((avg - rute) / 60000) : 0;
  const tidsmerke = sanntid
    ? '<span class="ss-rt is-sanntid">sanntid</span>'
    : '<span class="ss-rt is-rutetid">rutetid</span>';
  const linje1 = '<div class="ss-rad">'
    + '<span class="ss-sted">' + esc(fra || '') + '</span>'
    + (spor ? '<span class="ss-spor">' + esc(spor) + '</span>' : '')
    + '<span class="ss-tid">' + clk(avg) + '</span>'
    + (forsinkMin >= 2 ? '<span class="ss-forsink">+' + forsinkMin + '</span>' : '')
    + tidsmerke
    + '</div>';
  const linje2 = Number.isFinite(ank)
    ? '<div class="ss-rad ss-ank">'
      + '<span class="ss-pil" aria-hidden="true">→</span>'
      + '<span class="ss-sted">' + esc(til || '') + '</span>'
      + (ankSpor ? '<span class="ss-spor">' + esc(ankSpor) + '</span>' : '')
      + '<span class="ss-tid">' + clk(ank) + '</span>'
      + (Number.isFinite(min) ? '<span class="ss-min">' + min + ' min</span>' : '')
      + '</div>'
    : '';
  const b = bl ? beleggTekst(bl) : null;
  const linje3 = b && b.kort ? '<div class="ss-rad ss-belegg" title="' + esc(b.fullt) + '">' + esc(b.kort) + '</div>' : '';
  return '<div class="sel-summary">' + linje1 + linje2 + linje3 + '</div>';
}

export function retningInfo(her, stopp, walk) {
  if (!her || !stopp || !Number.isFinite(stopp.lat) || !Number.isFinite(stopp.lon)) {
    return { kind: 'ukjent' };
  }
  const deg = _headingDeg(her.lat, her.lon, stopp.lat, stopp.lon);
  // `deg` er null når punktene faller sammen — da STÅR du der, og en pil
  // ville pekt i en tilfeldig retning.
  if (deg == null || !walk || !Number.isFinite(walk.dist)) return { kind: 'ved' };
  return { kind: 'retning', deg, dist: walk.dist, mins: walk.mins };
}

function _retningHtml(dir) {
  // GANGTIDEN KOMMER FRA `walkInfo()`, ikke fra et nytt kall til walkMinsTo.
  //
  // Første utgave her regnet den selv — og gikk dermed utenom `state.walkOvr`,
  // den manuelle overstyringen `walkInfo` håndterer. To steder som regner det
  // samme tallet, og de ville vært uenige nøyaktig for leseren som hadde satt
  // gangtiden sin selv. Skjermen bruker `walkInfo()` overalt ellers.
  const r = retningInfo(userLL(), state.statLL && dir && state.statLL[dir.key], walkInfo());
  if (r.kind === 'ukjent') {
    return '<div class="sel-heading sel-heading-ukjent">'
      + 'vet ikke hvor du er — ingen retning til stoppet</div>';
  }
  if (r.kind === 'ved') {
    return '<div class="sel-heading sel-heading-ukjent">du står ved stoppet</div>';
  }
  const dist = r.dist < 1000 ? r.dist + ' m' : (r.dist / 1000).toFixed(1) + ' km';
  return '<div class="sel-heading">'
    + '<span class="sel-heading-arrow" style="transform:rotate(' + Math.round(r.deg) + 'deg)"'
    + ' aria-hidden="true">↑</span>'
    + '<span class="sel-heading-dist">' + dist + '</span>'
    + '<span class="sel-heading-walk">' + r.mins + ' min å gå</span>'
    + '</div>';
}

export function _subLine(rcls, mtl, leaveByTs, depTs, now) {
  // clkDay, not clk: a departure tomorrow has a deadline tomorrow, and «gå
  // senest 11:19» beside a hero reading «i morgen» invited the reader to leave
  // today. The prefix is empty for today, so nothing changes in the ordinary
  // case.
  const deadline = 'gå senest ' + clkDay(leaveByTs, now);
  if (rcls === 'r-far') return deadline;
  // «45 min igjen» er det store tallet rett over, en gang til. Det står bare
  // når det sier noe tallet ikke sier («passert for 3 min siden»).
  if (rcls !== 'missed' && countdownText(rcls, mtl, depTs, now).counting) return deadline;
  return deadline + ' · ' + leaveByMsg(rcls, mtl, depTs, now);
}

/**
 * The hero's class, and the hero itself — each defined ONCE.
 *
 * Both were written twice: renderSelected built `ltCls` and the number at
 * :317/:332, and the post-fetch refresher built `ltCls` again at :755 and then
 * wrote a BARE CLOCK TIME into the same element. So the big number silently
 * changed form the moment journey metadata arrived — a countdown before the
 * fetch, a clock face after it, in the largest type on the screen. Nobody
 * decided that; the two copies simply disagreed.
 */
function _ltCls(rcls) {
  return rcls === 'r-far'  ? 'lt-far'
    : rcls === 'r-ok'   ? 'lt-ok'
    : rcls === 'r-soon' ? 'lt-soon'
    : rcls === 'r-now'  ? 'lt-now'
    : 'lt-late';
}

/** @returns {{num: string|number, unit: string, lbl: string}} */
function _hero(secsToLeave, depTs, now, rcls) {
  // Past the horizon the hero stops counting down and names the departure.
  // Derived from the bucket, like every other consequence of the horizon.
  if (rcls === 'r-far') {
    // The DAY goes in the label, the clock in the hero. «I MORGEN 11:26» as
    // one giant string is mostly letters, is 358px wide on a 390px screen, and
    // repeats the «avgår» card below it verbatim. Split, it reads as one fact
    // with its qualifier — and the hero stays a number, which is what the type
    // at 16vw was designed for.
    return { num: clk(depTs), unit: '', lbl: ('avgang ' + dayPrefix(depTs, now)).trim() };
  }
  if (secsToLeave < 0) {
    return { num: Math.max(0, Math.floor((depTs - now) / 60000)), unit: 'min', lbl: 'til avgang' };
  }
  if (secsToLeave < 60) return { num: secsToLeave, unit: 'sek', lbl: 'til du bør gå' };
  if (secsToLeave < 3600) {
    return { num: Math.floor(secsToLeave / 60), unit: 'min', lbl: 'til du bør gå' };
  }
  const h = Math.floor(secsToLeave / 3600), rm = Math.floor((secsToLeave % 3600) / 60);
  return { num: h + 't', unit: rm > 0 ? rm + 'm' : '', lbl: 'til du bør gå' };
}

let _selWeather = null;
/* REISEPLAN-FOLDEN HUSKER AT DU ÅPNET DEN. `#s-content` skrives om ved hver
 * oppfriskning, og en ny `<details>` er lukket. Rapportert: den lukket seg
 * igjen rett etter trykket. Nullstilles når du forlater skjermen, så en ny
 * avgang starter lukket. */
let _foldÅpen = false;
export function foldÅpen() { return _foldÅpen; }
if (typeof document !== 'undefined') {
  // `toggle` bobler ikke, derfor capture.
  document.addEventListener('toggle', e => {
    const d = e.target;
    if (d && d.classList && d.classList.contains('itin-fold')) _foldÅpen = d.open;
  }, true);
}

function _selWeatherHtml(arrT) {
  if (!_selWeather) return '<span class="sel-wx-loading">laster vær…</span>';
  if (_selWeather._err) return '';
  const w = _selWeather;
  const nowParts = [w.icon + ' ' + w.temp + '°'];
  if (w.wind >= 12) nowParts.push(w.wind + ' m/s');
  if (w.precip >= 0.3) nowParts.push(w.precip.toFixed(1) + ' mm');
  let html = '<span class="sel-wx-now">' + nowParts.join(' · ') + '</span>';

  if (arrT && w.forecast) {
    const arrTs = new Date(arrT).getTime();
    if (arrTs > Date.now() + config.arrivalForecastMinMs) {
      const fc = forecastAt(w.forecast, arrT);
      if (fc) {
        const fcAdv = weatherAdvice(fc.temp, fc.precip, fc.wind,
          { feels: fc.feels, precipProb: fc.precipProb });
        const fcParts = [fc.icon + ' ' + fc.temp + '°'];
        if (fc.feels != null && Math.abs(fc.feels - fc.temp) >= 2) fcParts.push('føles som ' + fc.feels + '°');
        if (fc.wind >= 12) fcParts.push(fc.wind + ' m/s');
        if (fc.precipProb != null && fc.precipProb >= 20) fcParts.push(fc.precipProb + '% regn');
        else if (fc.precip >= 0.3) fcParts.push(fc.precip.toFixed(1) + ' mm');
        html += '<span class="sel-wx-arr"> → ved ankomst ' + fcParts.join(' · ') + '</span>';
        if (fcAdv && fcAdv !== w.advice) {
          html += '<span class="sel-wx-adv">' + fcAdv + '</span>';
        }
      }
    }
  }

  if (w.advice && (!arrT || new Date(arrT).getTime() < Date.now() + config.arrivalForecastMinMs)) {
    html += '<span class="sel-wx-adv">' + w.advice + '</span>';
  }

  return html;
}

// ── Route map ────────────────────────────────────────────────
let _selMap = null, _selLayer = null;
/* Utsnittene radene i reiseløpet zoomer til (`kartUtsnitt`), satt når kartet
 * tegnes. Fra de samme rå etappene som tabellen, så «e1» er samme etappe
 * begge steder. */
let _selGeo = null;
/* Hele reisens punkter og gangen til stoppet, til «hele reisen»-knappen.
 * Reiser uten etapper har ingen `kartUtsnitt`, så knappen leser disse. */
let _selFrame = [];
let _selGå = [];
/** Omtrent høyden på en permanent etikett over eller under et punkt. */
const ETIKETT_PX = 30;

/* RAD → KART (v1.209.0). Et trykk på en etappe eller et bytte i reiseløpet
 * zoomer kartet dit — proven, det Google og Ruter gjør. ÉN delegert lytter:
 * tabellen bygges på nytt ved hver oppfriskning, og en lytter per rad ville
 * blitt borte med den. */
if (typeof document !== 'undefined') {
  document.addEventListener('click', e => {
    const rad = e.target && e.target.closest && e.target.closest('[data-rl]');
    if (!rad || !_selMap || !_selGeo) return;
    const k = rad.getAttribute('data-rl');
    const geo = (k[0] === 'e' ? _selGeo.e : _selGeo.b)[Number(k.slice(1))];
    if (!geo || !geo.length) return;
    // Polstringen etter regelen, ikke et tall — mapVoice.test.js fanget
    // `[40, 40]` her i første utgave.
    const el = document.getElementById('sel-map');
    // + ETIKETTENE. Et zoomet bytte har en etikett over og en under; uten
    // plass til dem ble begge klippet av kartets kant — sett i prøven.
    const pad = fitPadding(el ? el.clientHeight : 200) + ETIKETT_PX;
    _selMap.fitBounds(geo, { padding: [pad, pad], maxZoom: 18, animate: true });
    const alt = document.getElementById('sel-map-alt');
    if (alt) alt.hidden = false;
    const wrap = document.getElementById('sel-map-wrap');
    if (wrap && wrap.scrollIntoView) wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
/* To variabler, og ikke flere: selve feeden bor i `api/vehicles.js`, så
 * denne fila slipper å holde en tredje kopi av luka board og track hadde. */
let _selVehMarker = null, _selVehIconKey = null;

/** A foot leg's two ends, for when the response carried no geometry for it. */
function _legEnds(leg) {
  const a = leg && leg.fromPlace, b = leg && leg.toPlace;
  if (!a || !b || a.latitude == null || b.latitude == null) return [];
  return [[a.latitude, a.longitude], [b.latitude, b.longitude]];
}

// Was a fourth hand-rolled copy of the stop normaliser. The substring
// matching below it is a looser rule with its own purpose and stays; only the
// normalisation is now the shared one.
const _ns = stopKey;

function _depToRouteLegs(dep, fromName, toName) {
  if (!dep) return null;
  if (dep._legs && dep._legs.length) {
    const legs = [];
    for (const leg of dep._legs) {
      const calls = (leg.serviceJourney && leg.serviceJourney.estimatedCalls) || [];
      if (!calls.length) continue;
      const fLow = _ns((leg.fromPlace && leg.fromPlace.name) || fromName);
      const tLow = _ns((leg.toPlace   && leg.toPlace.name)   || toName);
      let fi = 0, ti = calls.length - 1;
      calls.forEach((ca, i) => {
        const nm = _ns(ca.quay && ca.quay.stopPlace && ca.quay.stopPlace.name);
        if (nm && (nm.includes(fLow) || fLow.includes(nm))) fi = i;
        if (nm && (nm.includes(tLow) || tLow.includes(nm)) && i >= fi) ti = i;
      });
      const stops = calls.slice(fi, ti + 1).map(ca => {
        const sp = ca.quay && ca.quay.stopPlace;
        const ll = quayLatLon(ca.quay);
        return sp && ll ? { name: cleanName(sp.name), lat: ll.lat, lon: ll.lon } : null;
      }).filter(Boolean);
      if (stops.length < 2) continue;
      const ll = leg.serviceJourney && leg.serviceJourney.line;
      // The MODE travels with the leg now. It was the one thing this
      // descriptor did not carry, which is why the map drew a bus and a metro
      // with the same stroke — corridorStyle could not be asked a question
      // with no answer in hand.
      const lshape = legShape(leg);
      legs.push({ stops, shape: lshape, pts: lshape || stops.map(st => [st.lat, st.lon]),
                  mode: leg.mode || null,
                  color: ll && ll.presentation && ll.presentation.colour ? '#' + ll.presentation.colour : null });
    }
    return legs.length ? legs : null;
  }
  const calls = dep.serviceJourney && dep.serviceJourney.estimatedCalls;
  if (!calls || !calls.length) return null;
  const fLow = _ns(fromName), tLow = _ns(toName);
  let fi = 0, ti = calls.length - 1;
  calls.forEach((ca, i) => {
    const nm = _ns(ca.quay && ca.quay.stopPlace && ca.quay.stopPlace.name);
    if (nm && (nm.includes(fLow) || fLow.includes(nm))) fi = i;
    if (nm && (nm.includes(tLow) || tLow.includes(nm)) && i >= fi) ti = i;
  });
  const stops = calls.slice(fi, ti + 1).map(ca => {
    const sp = ca.quay && ca.quay.stopPlace;
    const ll = quayLatLon(ca.quay);
    return sp && ll ? { name: cleanName(sp.name), lat: ll.lat, lon: ll.lon } : null;
  }).filter(Boolean);
  if (stops.length < 2) return null;
  const sj = dep.serviceJourney;
  const color = sj && sj.line && sj.line.presentation && sj.line.presentation.colour ? '#' + sj.line.presentation.colour : null;
  const only = dep._legs && dep._legs[0];
  const shape = legShape(only);
  return [{
    stops, shape, color,
    // LINJA SOM TEGNES ER LINJA TOGET GÅR PÅ, og den regnes her én gang.
    // Regnet vi den på nytt ved markøren, ville det vært to uttrykk som måtte
    // være enige — og v1.156.0 finnes fordi `_tRoutePts` ble satt som en
    // BIVIRKNING av å tegne. Arrayet leses bare, aldri skrives i.
    pts: shape || stops.map(st => [st.lat, st.lon]),
    // `only.mode` er null for en helt vanlig tavle-avgang uten etapper, og
    // `makeVehicleIcon` faller da tilbake på t-bane-silhuetten — en BUSS ble
    // tegnet som et tog. Linja vet det selv.
    mode: depMode(dep),
  }];
}

let _selMapKey = '';

export function destroySelMap() {
  if (_selMap) { _selMap.remove(); _selMap = null; _selLayer = null; }
  _selMapKey = '';
  /* MARKØREN NULLES HER, OG BARE HER.
   *
   * Den ligger på `_selLayer`, som følger kartet ned — men referansen ville
   * blitt stående, og neste byggs første tikk ville kalt `setLatLng` på en
   * markør uten kart. `destroySelMap` kalles ved HVER ombygging, så dette er
   * ingen sjelden sti. Samme vakt `_destroyTrackMap` alt har. */
  _selVehMarker = null;
  _selVehIconKey = null;
}

/**
 * Streken fra deg til påstigningen: gangruta når den finnes, ellers den rette
 * streken mellom de to punktene.
 */
export function gangLinje(gangrute, fra, til) {
  if (Array.isArray(gangrute) && gangrute.length >= 2) return gangrute;
  return [[fra.lat, fra.lon], [til.lat, til.lon]];
}

/**
 * Første utsnitt når du skal gå til påstigningen: deg, stoppet og gangruta
 * mellom dere. Null når du ikke skal gå dit (i fart, avgått, fast «gå fra»
 * eller ukjent posisjon). Da er første utsnitt hele reisen, som før.
 */
export function startUtsnitt(herfra, påstigning, gangrute) {
  if (!herfra || !påstigning || påstigning.lat == null || påstigning.lon == null) return null;
  return [[herfra.lat, herfra.lon], [påstigning.lat, påstigning.lon]]
    .concat(Array.isArray(gangrute) ? gangrute : []);
}

/**
 * Dagen til de to store tidene, som går i ETIKETTEN, ikke i tallet.
 *
 * Rapportert (samme feil som tavla i v1.213.2): «I MORGEN 00:03» og «I
 * MORGEN 00:28» i 2,4 rem i hver sin halve celle. Begge brøt over to linjer,
 * og dagen tok like mye plass som klokkeslettet. Nå står klokkeslettet alene,
 * og dagen står i etiketten over: «avgår i morgen · Mortensrud».
 * Ankomstens dag regnes fra avgangen. Samme dag som du reiser: ingenting.
 */
export function jdDag(depTs, arrT, now) {
  return { dep: dayPrefix(depTs, now).trim(), ank: arrT ? dayPrefix(arrT, depTs).trim() : '' };
}
export function jdEtikett(dag, sted) { return dag ? dag + ' · ' + sted : sted; }

function _selMapStructKey(dep, legs, dir) {
  const jid = (dep.serviceJourney && dep.serviceJourney.id) || '';
  const destSuffix = (dir._toLat && dir._toLon && !dir.toStopId)
    ? '|dest:' + dir._toLat + ',' + dir._toLon : '';
  return jid + '|' + legs.map(l => {
    const f = l.stops[0], t = l.stops[l.stops.length - 1];
    return l.stops.length + ':' + f.lat + ',' + f.lon + ':' + t.lat + ',' + t.lon;
  }).join('|') + destSuffix;
}

/* ── KJØRETØYET, PÅ DEN ENESTE FASEN SOM MANGLET DET ──────────────────────
 *
 * Tavla tegner det, underveis tegner det. Skjermen imellom — der du står på
 * perrongen og lurer på om toget kommer — gjorde det ikke.
 *
 * Den tegner ikke noe den ikke vet: `departureVehicle` leverer `src`, og et
 * regnet ut kjøretøy tegnes nedtonet og uten frontlys, med «etter rutetid»
 * i etiketten. Et målt tegnes i full farge med «sanntid».
 *
 * RAMMEN FLYTTES IKKE. Er toget fire stopp bak ditt stopp, ligger markøren
 * utenfor kartutsnittet og du ser den ikke ennå. Det er et valg: å strekke
 * rammen bakover ville krympet din egen strekning til en stump i et 130 px
 * bånd. Den blir synlig når toget kommer inn i rammen.
 */
function _selVehicle(dep, legs, now) {
  if (!_selMap || !_selLayer) return;
  const leg = legs && legs[0];
  const pos = leg && departureVehicle(dep, {
    routePts: leg.pts,
    now,
    livePos: livePosFeed(depLineRef(dep)),
  });

  if (!pos) {
    // Løpet er over, eller ingen vet hvor den er. Da skal ikke siste kjente
    // glyf bli stående på båndet som om den fortsatt gjaldt.
    if (_selVehMarker) { _selVehMarker.remove(); _selVehMarker = null; _selVehIconKey = null; }
    return;
  }

  const estimated = pos.src === 'rutetid';
  const key = pos.src + ':' + (pos.heading == null ? '-' : Math.round(pos.heading));
  const icon = () => makeVehicleIcon(leg.mode, (leg.color || tokens().accent), {
    bearing: pos.heading, estimated,
  });

  if (_selVehMarker) {
    _selVehMarker.setLatLng([pos.lat, pos.lon]);
    // Ikonet settes bare når noe ved det faktisk er endret — retningen til
    // nærmeste grad, eller skillet målt/regnet. Renderen går hvert sekund, og
    // en glyf som bygges om 1 Hz er nettopp det «Ro» forbyr.
    if (_selVehIconKey !== key) { _selVehIconKey = key; _selVehMarker.setIcon(icon()); }
  } else {
    _selVehIconKey = key;
    _selVehMarker = L.marker([pos.lat, pos.lon], { icon: icon(), ...VEHICLE_MARKER_OPTS }).addTo(_selLayer);
  }

  // Ikke permanent: båndet bærer alt to faste stoppnavn, og `selected.js`
  // bruker tjue linjer på å forklare hvor tett det ble.
  const noun = VEHICLE_NOUN[leg.mode] || 'vognen';
  _selVehMarker.bindTooltip(
    noun.charAt(0).toUpperCase() + noun.slice(1) + ' \u00b7 ' + SRC_LABEL[pos.src],
    { className: 'map-label' });
}

function _renderSelMap(dep, fromName, toName, now) {
  const wrap = document.getElementById('sel-map-wrap');
  const mapEl = document.getElementById('sel-map');
  if (!wrap || !mapEl) return;

  const dir = _selDir();
  const legs = _depToRouteLegs(dep, fromName, toName);
  if (!legs) { wrap.style.display = 'none'; destroySelMap(); return; }

  // Rebuild only when the route itself changes — renderSelected runs every
  // second and recreating the Leaflet map each tick flickers and resets pan/zoom
  // GANGRUTA TIL STOPPET, fra den felles bufferen tavla og auto-reise leser.
  // Bedt om her, før nøkkelen: når ruta kommer, er den en del av hva kartet
  // viser, og kartet bygges om én gang. Ikke i fart: en strek fra deg til
  // påstigningen er et råd om å gå. Samme regel som tavla og auto-reise
  // (`gangGjelder`).
  const påstigning = legs[0] && legs[0].stops && legs[0].stops[0];
  const harPåstigning = !!(påstigning && påstigning.lat != null && påstigning.lon != null);
  const gå = gangGjelder(fartNå(), state.walkFromLL !== null);
  const herfra = userLL();
  ensureApproach(gå && herfra && harPåstigning ? herfra : null,
    harPåstigning ? { lat: påstigning.lat, lon: påstigning.lon } : null);
  const gangrute = approachPoints();
  // Når avgangen har gått, er gangen ikke lenger det du skal gjøre. Kartet
  // bygges om én gang og viser da hele reisen.
  const avgått = new Date(dep.expectedDepartureTime).getTime() < now;
  const key = _selMapStructKey(dep, legs, dir) + '|gang:' + (gangrute ? gangrute.length : 0)
    + (avgått ? '|avgått' : '');
  // Kartet bygges bare om når ruta endrer seg, men kjøretøyet flytter seg
  // hvert sekund. To kallesteder, én funksjon.
  if (key === _selMapKey && _selMap) { _selVehicle(dep, legs, now); return; }
  _selMapKey = key;

  wrap.style.display = 'block';
  destroySelMap();
  _selMapKey = key;
  _selMap = createMap(mapEl, { expandable: true });
  // PADDING IN PROPORTION TO THE BAND, not a number chosen for a bigger map.
  //
  // Both fits below asked for 40px. On a 130px map that is 62% of the height
  // spent on margin, and the measurement is blunt: the journey filled THREE
  // PER CENT of the band. A line you cannot see is not less crowded than a
  // line with beads on it — it is a different failure.
  //
  // Named in ui/map.js so the rule is one rule — see fitPadding.
  const pad = fitPadding(mapEl.clientHeight);

  _selLayer = L.layerGroup().addTo(_selMap);
  _selGeo = kartUtsnitt(dep._allLegs || dep._legs);
  // «Hele reisen»: tilbake fra et zoomet bytte. Skjult til en rad er trykket.
  let alt = document.getElementById('sel-map-alt');
  if (!alt) {
    alt = document.createElement('button');
    alt.id = 'sel-map-alt'; alt.type = 'button'; alt.className = 'sel-map-alt';
    alt.textContent = 'hele reisen';
    alt.addEventListener('click', () => {
      // Hele reisen, og gangen dit når den er tegnet.
      const hele = (_selGeo && _selGeo.alt.length ? _selGeo.alt : _selFrame).concat(_selGå);
      if (_selMap && hele.length) {
        const pad = fitPadding(mapEl.clientHeight);
        _selMap.fitBounds(hele, { padding: [pad, pad], maxZoom: 15, animate: true });
      }
      alt.hidden = true;
    });
    wrap.appendChild(alt);
  }
  alt.hidden = true;

  const destIsVenue = dir._toLat && dir._toLon && !dir.toStopId;
  const pts = [];

  // FRAME FIRST, THEN DRAW — and this is the third time that order has been
  // the answer.
  //
  // The beads are hidden when there is no room, and «room» is measured in
  // pixels against the projection. fitBounds ran at the BOTTOM of this
  // function, after the markers were placed, so drawing had no frame at all:
  // the first attempt threw «Set map center and zoom first» and the render
  // died with ten markers gone. A provisional setView fixed the throw and made
  // it worse — the gate then measured a frame the map was about to leave, and
  // the overlaps went from three to eight.
  //
  // v1.102.0 learned this on the board map: gather the points, fit with the
  // animation off, then draw. `animate:false` matters — an animated fit is a
  // frame in motion, which is no frame to measure against.
  const frame = [];
  legs.forEach(lg => (lg.stops || []).forEach(st => frame.push([st.lat, st.lon])));
  if (destIsVenue) frame.push([dir._toLat, dir._toLon]);
  if (frame.length) _selMap.fitBounds(frame, { padding: [pad, pad], maxZoom: 15, animate: false });
  _selFrame = frame;
  _selGå = [];

  legs.forEach(({ stops, pts: legPts, color, mode }, li) => {
    const lc = color || tokens().accent;
    // Real alignment where the leg carried one; the stop chain otherwise. The
    // markers below still come from stops either way.
    //
    // THE STOPS YOU PASS THROUGH, on the app's terms rather than this screen's.
    //
    // This map drew a THIRD and FOURTH marker style for them: a 4px circle for
    // the ones between, a 5px one for an alighting stop. Measured at 130px, ten
    // markers produced THREE overlapping pairs — the beads ran into each other
    // and into the endpoints, which is what made the band look busy.
    //
    // makeRouteStopIcon is the bead the board and underveis draw, and
    // stopsReadable is the gate that has decided «is there room» since v1.99.
    // Handing both to drawLeg does two things at once: the beads look like
    // beads everywhere, and on a band this short the gate simply removes them —
    // which is the right answer and the reason that gate exists.
    drawLeg(_selLayer, {
      mode, colour: lc,
      pts: legPts,
      stops,
    }, { project: ll => _selMap.latLngToContainerPoint(ll) });

    // The two ENDS keep their permanent names, and that is measured rather
    // than assumed: the two labels do not overlap each other and do not leave
    // the frame. This screen is about ONE departure from X to Y, so the names
    // are the fact — «PÅ» and «AV» would say what the heading above already
    // says and lose the only thing the map adds.
    stops.forEach(s => { pts.push([s.lat, s.lon]); });
  });

  /* PÅ, BYTT, AV — MED LINJE OG PLATTFORM (v1.209.0).
   *
   * Her sto navn bare på første og siste stopp, og byttet var en prikk
   * uten ord. Nå sier hvert punkt hva du gjør der og hvor: «[18] bytt ·
   * plattform E», på kvaiens egne koordinater. Fra de samme rå etappene som
   * tabellen (`kartPunkter`), så kartet og tabellen sier det samme. */
  kartPunkter(dep._allLegs || dep._legs).forEach(pk => {
    const badge = pk.linje
      ? linjemerke({ kode: pk.linje, farge: pk.farge, linjeId: pk.linjeId, modus: pk.modus }) + ' '
      : '';
    const html = '<div class="sel-pkt sel-pkt-' + pk.kind + '"></div>';
    L.marker([pk.lat, pk.lon], {
      icon: L.divIcon({ className: '', html, iconSize: [14, 14], iconAnchor: [7, 7] }),
      zIndexOffset: 600,
    })
      .bindTooltip(badge + '<b>' + esc(pk.kind) + '</b> · ' + esc(pk.tekst), {
        permanent: true, direction: pk.kind === 'av' ? 'bottom' : 'top',
        offset: [0, pk.kind === 'av' ? 8 : -10], className: 'sel-stop-label sel-pkt-label',
      })
      .addTo(_selLayer);
  });

  /* ALL GANGE, IKKE BARE TIL ET STED (v1.209.0). Gangen ble tegnet bare
   * når målet var et sted og ikke et stopp (`destIsVenue`), så gangen
   * mellom to etapper — selve byttet — manglet på kartet. Fra reisens egne
   * gangeetapper, ikke en ny spørring. */
  const feet = (dep._allLegs || []).filter(l => l.mode === 'foot');
  let drewFeet = false;
  feet.forEach(leg => {
    const wp = legShape(leg) || _legEnds(leg);
    if (wp.length < 2) return;
    drawWalk(_selLayer, wp);
    pts.push(...wp);
    drewFeet = true;
  });

  // Walking extension to venue destination
  if (destIsVenue) {
    const lastLeg = legs[legs.length - 1];
    const alightStop = lastLeg && lastLeg.stops[lastLeg.stops.length - 1];
    const destLL = { lat: dir._toLat, lon: dir._toLon };
    pts.push([destLL.lat, destLL.lon]);

    // Venue pin
    const pinHtml = '<svg width="20" height="28" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg">'
      + '<path d="M11 0C5 0 0 5 0 11c0 8.3 11 19 11 19S22 19.3 22 11C22 5 17 0 11 0z" fill="' + tokens().accent + '"/>'
      + '<circle cx="11" cy="11" r="4.5" fill="#b8860b"/></svg>';
    L.marker([destLL.lat, destLL.lon], {
      icon: L.divIcon({ className: '', html: pinHtml, iconSize: [20, 28], iconAnchor: [10, 28] }),
    }).bindTooltip(dir.to || 'Destinasjon', { permanent: true, direction: 'top', offset: [0, -30], className: 'sel-stop-label' })
      .addTo(_selLayer);

    // The walk itself comes from the itinerary, not from a second query.
    //
    // What was here fetched `directMode:foot` for geometry the trip response
    // already carried on its foot leg, decoded it with a private copy of the
    // polyline decoder, and refitted the map inside the `.then` — racing the
    // synchronous `fitBounds` twenty lines below. Drawing what we already
    // have removes the query, the copy and the race together.
    // Gangeetappene er alt tegnet over, sammen med bytte-gangen.
    const drew = drewFeet;
    // No foot leg in this response — an old cached board, or the minimal
    // retry that drops pointsOnLink from every leg. Say the walk exists
    // rather than leaving the pin unconnected.
    if (!drew && alightStop) {
      drawWalk(_selLayer, [[alightStop.lat, alightStop.lon], [destLL.lat, destLL.lon]]);
    }
  }

  // User position
  const userPos = userLL();
  if (userPos) {
    userDot(_selLayer, userPos, { radius: 6 });

    // The walk TO the stop — the half of the journey only the gangtid screen
    // used to draw, on a second map of its own. Without it this map showed
    // the ride and the walk at the far end, and left the reader to imagine
    // how they reached the platform.
    //
    // Ruta er gangruta fra `api/approach.js` (Valhalla, så Entur), den samme
    // tavla og auto-reise tegner, og den samme «N m» er målt langs. Den rette
    // streken står bare mens ruta hentes, eller når ingen ruter svarte.
    //
    // Den sto her alene før, med begrunnelsen at «en tegnet sti ville vært
    // oppdiktet». Det var sant før `approach.js` fantes. Rapportert med
    // skjermbilde: en strek rett over hus og skog, under «802 m · 12 min».
    if (gå && harPåstigning) {
      const linje = gangLinje(gangrute, userPos, påstigning);
      drawWalk(_selLayer, linje);
      linje.forEach(p => pts.push(p));
      _selGå = linje;
    }
  }

  // The final frame, which can be wider than the one measured against: the
  // walk from where you stand was not known when the beads were decided. The
  // beads stay as they were rather than being re-judged mid-render — a marker
  // that appears and disappears within one paint is worse than one drawn
  // against a frame a little tighter than the last.
  //
  // DER DU STÅR OG DER DU GÅR PÅ, når du skal gå dit. Rapportert med
  // skjermbilde: kartet viste hele turen til Jernbanetorget i 5 km-skala, og
  // deg og stoppet 800 m unna som én prikk. Det du skal gjøre nå er å gå til
  // stoppet, så første utsnitt er den gangen. «Hele reisen» viser resten.
  const fokus = startUtsnitt(gå && !avgått && userPos ? userPos : null, harPåstigning ? påstigning : null, gangrute);
  if (fokus) {
    _selMap.fitBounds(fokus, { padding: [pad, pad], maxZoom: 17, animate: false });
    alt.hidden = false;
  } else if (pts.length) {
    _selMap.fitBounds(pts, { padding: [pad, pad], maxZoom: 15, animate: false });
  }
  setTimeout(() => _selMap && _selMap.invalidateSize(), 100);

  bindMapExpand(_selMap, mapEl, document.getElementById('sel-map-expand'), { onToggle: (open) => fitExpandedMap(mapEl, open) });
  _selVehicle(dep, legs, now);
}

/** RUTA FOR AVGANGEN SOM VISES (review 2026-11-10): dens egen når den har en
 *  (en etappe i reiseplanen), ellers den aktive. Én definisjon for skjermen. */
function _selDir() { return (state.sel && state.sel._dir) || config.dirs[state.dIdx]; }

/* NESTE AVGANG ETTER ET BYTTE (v1.218.43, ui/reiselop.js `nesteRadHtml`).
 * Ett oppslag per byttestopp, linje, retning og avgang; svaret mellomlagres
 * så tegningen hvert sekund ikke spør på nytt. undefined = spurt, venter;
 * null = ikke svar (ingenting vises). */
const _nesteSvar = new Map();
export const NESTE_VINDU_MIN = 120;
export function velgNeste(departures, e) {
  const passer = (departures || []).filter(d => d && !d.cancelled && Number.isFinite(d.depTs) && d.depTs > e.dep + 30000
    && ((e.lineId && d.ln && d.ln.id === e.lineId) || (!e.lineId && d.ln && d.ln.publicCode === e.kode))
    && (!e.front || String(d.dest || '').trim().toLowerCase() === String(e.front).trim().toLowerCase()))
    .sort((a, b) => a.depTs - b.depTs);
  if (!passer.length) return { ingen: true };
  const kjøretid = Number.isFinite(e.arr) && Number.isFinite(e.dep) ? e.arr - e.dep : null;
  return { dep: passer[0].depTs, ankCa: kjøretid != null ? passer[0].depTs + kjøretid : null };
}
function _neste(e) {
  if (!e || !e.stopId || !Number.isFinite(e.dep)) return null;
  const k = [e.stopId, e.lineId || e.kode, e.front, e.dep].join('|');
  if (_nesteSvar.has(k)) return _nesteSvar.get(k) || null;
  _nesteSvar.set(k, undefined);
  fetchArrBoard(e.stopId, 30, { fraMs: e.dep + 60000, perLinje: 1, vinduMin: NESTE_VINDU_MIN })
    .then(r => { _nesteSvar.set(k, velgNeste(r && r.departures, e)); renderSelected(); })
    .catch(() => _nesteSvar.set(k, null));
  return null;
}

export function renderSelected() {
  const c = state.sel;
  if (!c) return;
  // This screen is about ONE departure, so the banner is too: its journey,
  // its line, and the stops it actually calls at. AFTER `c` is bound — put
  // above it, this read the departure from its temporal dead zone and threw
  // «Cannot access 'c' before initialization», which the render loop caught
  // and logged while the screen simply stayed blank.
  const dir = _selDir();
  const _meta = state.lockedJourneyMeta;
  renderAlertsInto(document.getElementById('s-alerts'), state.serviceAlerts, renderSelected, {
    journeyIds: [state.lockedJourneyId].filter(Boolean),
    lineIds: [c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.id].filter(Boolean),
    // The journey meta arrives 15 seconds later; the departure's own calls are
    // already in hand, so a stop-scoped message is placed correctly from the
    // first frame rather than folding away and then reappearing.
    stopIds: [
      ...((_meta && _meta.calls) || []).map(x => x && x.id),
      ...(((c.serviceJourney && c.serviceJourney.estimatedCalls) || [])
        .map(x => x && x.quay && x.quay.stopPlace && x.quay.stopPlace.id)),
      dir.stopId, dir.toStopId,
    ].filter(Boolean),
  });
  const now = Date.now();
  const ln = c.serviceJourney && c.serviceJourney.line;
  const lc = (ln && ln.publicCode) || config.line;
  const lbg = ln && ln.presentation && ln.presentation.colour ? '#' + ln.presentation.colour : '#7c2d12';
  // The same name the board row shows. This chip sits directly under the
  // line badge, so `frontText` put "3  Aker brygge" at the top of the detail
  // view too — the reported claim, one tap deeper.
  const dest = _rowDest(c).text;
  const quay = (c.quay && c.quay.publicCode) || '?';
  const depTs = new Date(c.expectedDepartureTime).getTime();
  const departed = depTs < now;
  const sjc = c.serviceJourney && c.serviceJourney.estimatedCalls;
  const arr = findArr(sjc, dir.to, { etter: dir.from });
  const arrT = (arr && (arr.expectedArrivalTime || arr.aimedArrivalTime)) || c._finalArrival || null;
  const tmin = arrT ? Math.round((new Date(arrT).getTime() - depTs) / 60000) : null;
  const delayed = c.realtime && depTs - new Date(c.aimedDepartureTime).getTime() > 60000;
  const wk = walkInfo();
  const leaveByTs = påstigningTs(c) - wk.mins * 60000;
  const mtl = mToLeave(påstigningTs(c));
  const rcls = reachCls(mtl);
  const ltCls = _ltCls(rcls);

  const walkActive = isWalkActive(dir);
  // Is it time to go? One question, three consequences — see walkFocus.
  const focus = walkActive && !departed && walkFocus(mtl);

  // The countdown the gangtid screen used to be.
  //
  // Seconds under a minute, because that is the stretch where a minute-
  // resolution number is a lie you act on. renderSelected already runs every
  // second (scheduler.js), so this needs no timer of its own — it needed a
  // screen, and that was the only reason gangtid was one.
  const secsToLeave = Math.floor((leaveByTs - now) / 1000);
  const hero = _hero(secsToLeave, depTs, now, rcls);
  const heroNum = hero.num, heroUnit = hero.unit, heroLbl = hero.lbl;
  // `_isTransfer` is already "there is more here than one train" — it is
  // `legs.length > 1 || lastAny.mode === 'foot'`. Requiring two TRANSIT legs
  // on top of that meant a single train plus a walk to your destination fell
  // through to the plain avgår/ankommer grid, which showed the post-walk
  // arrival time beside the alighting platform and never mentioned the walk.
  // So the one journey whose shape most needs explaining was the one journey
  // with no itinerary at all.
  const isTransfer = c._isTransfer && c._legs && c._legs.length >= 1;

  // Build line badge(s) for train chip
  const chipBadges = isTransfer
    ? c._legs.map(l => {
        const ll = l.serviceJourney && l.serviceJourney.line;
        return linjemerke({ kode: ll && ll.publicCode, farge: ll && ll.presentation && ll.presentation.colour, tekst: ll && ll.presentation && ll.presentation.textColour, linjeId: ll && ll.id, modus: l.mode || (ll && ll.transportMode) });
      }).join('<span class="transfer-arrow" aria-hidden="true" style="color:#8a837d;font-size:9px;margin:0 .1rem">→</span>')
    : linjemerke({ kode: lc, farge: ln && ln.presentation && ln.presentation.colour, tekst: ln && ln.presentation && ln.presentation.textColour, linjeId: ln && ln.id, modus: ln && ln.transportMode });

  // Build journey detail — full itinerary for transfers, 2-cell grid for single-line
  let journeyDetail;
  if (isTransfer) {
    /* REISELØPET (v1.208.0). Her sto en tabell med stoppnavn i små
     * bokstaver, Journey Planners «destination» som siste stopp, gangen
     * mellom etappene to ganger med to ulike minutter, plattform bare fra
     * etappe to, og ingen dom om byttet. Se `ui/reiselop.js`. */
    journeyDetail = reiselop(c._allLegs || c._legs, {
      fra: dir.from, til: dir.to, ekstraMin: loadWalkBuffer(),
      neste: _neste,
      // Trinnfri fra stoppestedsregisteret, når den er kjent. Spørsmålet
      // sendes første gang; svaret står ved neste oppfriskning.
      tilgang: id => {
        if (!id) return null;
        const k = stoppestedKjent(id);
        if (k === undefined) { hentStoppested(id); return null; }
        return k && k.tilgang && k.tilgang.kind !== 'vet-ikke' ? k.tilgang.kind : null;
      },
    }) + (tmin ? '<div class="itin-total">' + tmin + ' min reise' + (c._via ? ' · via ' + esc(c._via) : '') + '</div>' : '');
  } else {
    // Gangen til stoppet du faktisk går på (v1.218.17), samme tekst som Tavla.
    journeyDetail = (gåTilTekst(c) ? '<div class="jd-gaa">' + esc(gåTilTekst(c)) + '</div>' : '')
      + '<div class="journey-detail">'
      + '<div class="jd-cell"' + (arrT ? '' : ' style="grid-column:1/-1"') + '>'
      + '<div class="jd-label">avgår ' + esc(jdEtikett(jdDag(depTs, arrT, now).dep, visStopp(cleanName(c._gåTil ? c._gåTil.navn : dir.from)))) + '</div>'
      + '<div class="jd-val departure">' + clk(c.expectedDepartureTime) + '</div>'
      + (() => {
        const sub = [delayed ? 'rute ' + clk(c.aimedDepartureTime) : null, plattformTekst(quay, depMode(c))]
          .filter(Boolean).join(' · ');
        return sub ? '<div class="jd-sub">' + esc(sub) + '</div>' : '';
      })()
      + '</div>'
      + (arrT
        ? '<div class="jd-cell">'
          + '<div class="jd-label">ankommer ' + esc(jdEtikett(jdDag(depTs, arrT, now).ank, visStopp(cleanName(dir.to)))) + '</div>'
          + '<div class="jd-val arrival">' + clk(arrT) + '</div>'
          + '<div class="jd-sub">'
          + (tmin ? tmin + ' min reise' : '')
          + (plattformTekst(c._arrQuay, depMode(c)) ? (tmin ? ' · ' : '') + esc(plattformTekst(c._arrQuay, depMode(c))) : '')
          + '</div>'
          + '</div>'
        : '')
      + '</div>';
  }

  // Fetch weather at user's position if not already available
  const _wxPos = state.walkFromLL || state.homeLL;
  if (!_selWeather && _wxPos) {
    fetchWeather(_wxPos.lat, _wxPos.lon)
      .then(w => {
        _selWeather = w;
        const el = document.getElementById('sel-weather-content');
        if (el) el.innerHTML = _selWeatherHtml(arrT);
      })
      .catch(() => { _selWeather = { _err: true }; });
  }

  // Remember the original departure platform so we can detect changes later
  if (!c._origQuay && quay !== '?') c._origQuay = quay;

  // GANGEN ER SAMLET I NEDTELLINGEN. Rapportert: «834 m · 13 min å gå»
  // øverst, «45 min» midt på og «gå senest 19:50 · 45 min igjen» under,
  // spredt over en halv skjerm og med minuttene to ganger. Når nedtellingen
  // vises, står retning og avstand i den, rett under «gå senest». Uten
  // nedtelling (avgått, eller du går ikke) står de øverst som før.
  const heroVises = !departed && walkActive;
  // «812 m · 12 min å gå» er gangen til stoppet på ruta. Går kjøretøyet fra et
  // annet stopp, står gangen VIDERE rett under (v1.218.17) — ikke bare inne i
  // den foldede reiseplanen, der proben fant den.
  const gåVidere = gåTilTekst(c) ? '<div class="jd-gaa sel-gaa">+ ' + esc(gåTilTekst(c)) + '</div>' : '';
  document.getElementById('s-content').innerHTML = ''
    + (heroVises ? '' : _retningHtml(dir) + gåVidere)
    + '<div class="train-chip">'
    + chipBadges
    // RETNINGEN, som på skiltet (v1.218.35). Målet ditt står i sammendraget.
    + '<span class="tc-dest">' + esc(c._retning || dest) + '</span>'
    // Sporet står under avgangstiden, ikke her: hvert spor ett sted, ved
    // stoppet det gjelder (avgår- og ankommer-cellen nedenfor).
    + (delayed ? '<span class="tc-meta"><span style="color:#fcd34d">forsinket</span></span>' : '')
    + '</div>'
    + '<div id="s-live-status"></div>'
    // «Mortensrud → Jernbanetorget» er foldet inn i sammendraget (v1.218.35).
    + sammendragHtml({
      fra: visStopp(cleanName(c._gåTil ? c._gåTil.navn : dir.from)), spor: plattformTekst(quay, depMode(c)),
      avg: depTs, rute: c.aimedDepartureTime ? new Date(c.aimedDepartureTime).getTime() : NaN, sanntid: !!c.realtime,
      til: visStopp(cleanName(dir.to)), ank: arrT ? new Date(arrT).getTime() : NaN, min: tmin,
      ankSpor: plattformTekst(c._arrQuay, depMode(c)),
      belegg: c._belegg ? belegg({ status: c._belegg }) : null,
    })
    + '<div class="sel-weather" id="sel-weather-content">' + _selWeatherHtml(arrT) + '</div>'
    + (departed
      ? '<div class="departed-banner">avgikk ' + clk(depTs) + ' · reisen er i gang</div>'
      : walkActive
        ? '<div class="leaveby-hero' + (focus ? ' is-focus' : '') + '" aria-live="polite">'
          + '<div class="leaveby-label">' + heroLbl + '</div>'
          + '<div class="leaveby-time ' + ltCls + '">' + heroNum
          + '<span class="lt-unit">' + heroUnit + '</span></div>'
          + '<div class="leaveby-sub soft">' + _subLine(rcls, mtl, leaveByTs, depTs, now) + '</div>'
          + _retningHtml(dir) + gåVidere
          + '</div>'
        : '')
    // Folded once it is time to go. The itinerary is what you read while
    // DECIDING; the countdown is what you read while walking, and on a phone
    // held at arm's length the two cannot both be first. <details> rather
    // than a toggle of our own: it opens on tap, it is reachable by keyboard,
    // and a screen reader announces it — none of which we would get for free.
    // ÉN LINJE: avgår/ankommer står nå i sammendraget, så rutenettet er
    // alltid foldet (v1.218.35) — ikke sagt to ganger, og ikke slettet.
    + (focus || !isTransfer
      ? '<details class="itin-fold"' + (_foldÅpen ? ' open' : '') + '><summary>reiseplan · ' + esc(dest) + '</summary>'
        + journeyDetail + '</details>'
      : journeyDetail);

  // Rebuild CTAs
  const existingCtas = document.getElementById('s-ctas');
  if (existingCtas) existingCtas.remove();
  const ctaDiv = document.createElement('div');
  ctaDiv.id = 's-ctas';

  // ── Forrige · reis · neste ────────────────────────────────────────────
  //
  // Asked for: «bruker burde kunne hoppe tilbake til forrige avgang eller
  // fremover til neste avgang», with «reis» at a third of its width and the
  // two steps on either side. Until now the only way was: back, find the row
  // again, tap it.
  //
  // The rows come from the board itself (boardRows), so a step lands on
  // exactly the row above or below the one you tapped — same mode filter, same
  // line filter, same order. The «neste» row this replaces read the raw
  // state.deps and could point at a departure the reader had filtered away.
  const rows = boardRows();
  const stepRow = document.createElement('div');
  stepRow.className = 'cta-row';

  const stepBtn = (dir, label) => {
    const b = document.createElement('button');
    const target = stepDep(rows, c, dir);
    b.className = 'cta-btn secondary cta-step';
    // The time, not just an arrow: you can see what you are stepping to and
    // whether it is worth it. At the end of the list the arrow stands alone —
    // an empty button would be impossible to read.
    b.textContent = target
      ? (dir < 0 ? '← ' + clk(new Date(target.expectedDepartureTime).getTime())
                 : clk(new Date(target.expectedDepartureTime).getTime()) + ' →')
      : (dir < 0 ? '←' : '→');
    b.disabled = !target;
    b.setAttribute('aria-label', target
      ? (dir < 0 ? 'Forrige avgang, ' : 'Neste avgang, ')
        + clk(new Date(target.expectedDepartureTime).getTime())
      : (dir < 0 ? 'Ingen tidligere avgang' : 'Ingen senere avgang'));
    if (target) b.onclick = () => window.tap(target);
    return b;
  };

  stepRow.appendChild(stepBtn(-1));

  const primaryBtn = document.createElement('button');
  primaryBtn.className = 'cta-btn cta-step';
  if (departed) {
    primaryBtn.textContent = 'andre avganger';
    primaryBtn.onclick = () => {
      stopSelRefresh();
      state.sel = null;
      show('v-board');
      startBoard();
    };
  } else {
    primaryBtn.textContent = 'reis →';
    primaryBtn.disabled = depTs < now - 120000;
    primaryBtn.onclick = () => window.doBoard && window.doBoard();
  }
  stepRow.appendChild(primaryBtn);
  // Both ways stay reachable even after the departure has gone: having just
  // missed one is exactly when the next one matters.
  stepRow.appendChild(stepBtn(1));
  ctaDiv.appendChild(stepRow);

  if (!departed) {
    const starBtn = document.createElement('button');
    const hhmm = clk(depTs);
    const isSaved = loadFavs().some(f =>
      f.type === 'timed' && f.from === dir.from && f.to === dir.to
      && f.line === lc && f.departureHHMM === hhmm);
    starBtn.className = 'cta-btn secondary';
    starBtn.textContent = isSaved ? '★ lagret' : '☆ lagre avgang';
    starBtn.onclick = () => {
      const favs = loadFavs();
      const existing = favs.find(f =>
        f.type === 'timed' && f.from === dir.from && f.to === dir.to
        && f.line === lc && f.departureHHMM === hhmm);
      if (existing) removeFav(existing.id);
      else addTimedFav(c, dir);
      renderSelected();
    };
    ctaDiv.appendChild(starBtn);

    const planBtn = document.createElement('button');
    const alreadyInPlan = isLegInPlan(c.expectedDepartureTime, c.serviceJourney && c.serviceJourney.id);
    planBtn.className = 'cta-btn secondary';
    planBtn.textContent = alreadyInPlan ? '📋 i reiseplan' : '📋 legg til i reiseplan';
    if (!alreadyInPlan) {
      planBtn.onclick = () => {
        const leg = addLegToPlan(c, dir);
        updatePlanCtx();
        renderSelected();
        // THE SHEET OPENS HERE, while the tap is still fresh. `addLegToPlan`
        // and `renderSelected` are both synchronous — they write localStorage
        // and rebuild the DOM — so transient user activation survives them and
        // the browser still lets `navigator.share` open. An await in front of
        // this line would spend the activation and the sheet would be refused.
        //
        // Bare der telefonen selv kan ta imot fila: på et skrivebord ville
        // dette lagt en fil i Nedlastinger hver gang en etappe legges til.
        // Bjella på plankortet tilbyr den uansett, for der har leseren spurt.
        if (leg && canOfferCalendar()) shareLegCalendar(leg);
      };
    } else {
      planBtn.style.opacity = '.6';
      planBtn.disabled = true;
    }
    ctaDiv.appendChild(planBtn);
  }

  // Før meldingene (v1.218.35): forrige · REIS · neste rett under kartet.
  const _vs = document.getElementById('v-selected');
  const _al = document.getElementById('s-alerts');
  if (_al && _al.parentNode === _vs) _vs.insertBefore(ctaDiv, _al); else _vs.appendChild(ctaDiv);
  _renderSelMap(state.sel, dir.from, dir.to, now);
}

/**
 * Is this a departure a tap could have opened?
 *
 * A cancelled row loses its onclick on the board (board.js), so it is not
 * something you can navigate to there — and the step buttons must not be able
 * to land on anything a tap on the list could not.
 */
function _navigable(c) {
  // `erInnstilt`, der denne unionen ble skrevet ned første gang. Nå er det
  // den alle skjermer leser, ikke bare denne.
  return !!c && !erInnstilt(c);
}

/**
 * How a departure is recognised between two renders.
 *
 * `serviceJourney.id` first: it is stable across fetches and is already what
 * the detail screen locks onto (state.lockedJourneyId). NOT `_depKey`, which
 * embeds expectedDepartureTime and therefore moves the moment realtime does.
 *
 * The departure time is only a fallback, for the case the dedupe already
 * guards against — an answer with no service journey id.
 */
function _sameDep(a, b) {
  if (!a || !b) return false;
  // THROUGH normJid. The realtime stop board hands back a lowercase codespace
  // («rut:ServiceJourney:…») where the trip planner uses the NeTEx one
  // («RUT:…»), and stopBoardExtras (board.js:178) stores the RAW id on the
  // row — normJid is applied only to the dedupe set beside it. So the two
  // spellings of one departure really do reach this comparison, and it
  // answered no: both step buttons went dead on a row that came from the
  // other source.
  const ai = normJid((a.serviceJourney && a.serviceJourney.id) || '');
  const bi = normJid((b.serviceJourney && b.serviceJourney.id) || '');
  if (ai && bi) return ai === bi;
  return !!a.expectedDepartureTime && a.expectedDepartureTime === b.expectedDepartureTime;
}

/**
 * One step back or forward through the list the reader actually saw.
 *
 * Pure and exported, because «what is the next departure» had TWO answers on
 * this screen already and these buttons would have been the third. The board's
 * rows are now handed in; nothing here re-sorts, re-dedupes or re-filters.
 * Stepping forward lands on exactly the row under the one you tapped.
 *
 * Departures that have already gone are reachable going back — chosen: the
 * board keeps them, dimmed, and one that left two minutes ago may be delayed
 * and still at the platform, which is precisely when you want to look.
 *
 * Not finding `current` at all — you arrived from the saved plan, which builds
 * a synthetic departure — returns null both ways and the buttons are disabled.
 * The failure mode is today's screen, not a button that opens something you
 * never came from.
 *
 * @param {object[]} rows  the board's rows, in display order
 * @param {object} current the departure on screen
 * @param {number} dir     -1 back, +1 forward
 */
export function stepDep(rows, current, dir) {
  const list = rows || [];
  const at = list.findIndex(r => _sameDep(r, current));
  if (at < 0) return null;
  const step = dir < 0 ? -1 : 1;
  for (let i = at + step; i >= 0 && i < list.length; i += step) {
    if (_navigable(list[i])) return list[i];
  }
  return null;
}

/* renderSelDeps is gone.
   It was a one-way «neste» row at the foot of this screen, and it answered
   the same question the step buttons now answer — from a DIFFERENT list. It
   read `state.deps`, the raw answer, and re-sorted and re-deduped it by its
   own rule (one per departure minute, and a ninety-second gap). Measured:
   with buses switched off it pointed at a bus, and when the next departure
   was under ninety seconds away it showed nothing at all while the board had
   a row. Two «next»es that can disagree are worse than either alone.

   What is lost, and it is worth saying: the row carried a line badge, so you
   could see which line was next. A time on a third of a button cannot. The
   next row may well be another line. */

export function startSelRefresh() {
  if (intervals.sel) clearInterval(intervals.sel);
  _fetchSel();
  intervals.sel = setInterval(_fetchSel, config.selRefreshMs);
}

export function stopSelRefresh() {
  if (intervals.sel) { clearInterval(intervals.sel); intervals.sel = null; }
  _selWeather = null;
  _foldÅpen = false;
}

function _fetchSel() {
  const jid = state.lockedJourneyId
    || (state.sel && state.sel.serviceJourney && state.sel.serviceJourney.id);
  if (!jid) return;
  fetchJourneyMeta(jid)
    .then(meta => {
      if (!meta || !state.sel) return;
      // Drop stale responses: the user may have selected a different departure
      // while this fetch was in flight
      const curJid = state.lockedJourneyId
        || (state.sel.serviceJourney && state.sel.serviceJourney.id);
      if (normJid(curJid) !== normJid(jid)) return;

      // The journey query returns the line's FULL run — calls[0] is the line's
      // origin terminal, not the user's boarding stop. All live values (departure
      // time, delay, platform) must come from the boarding stop's call.
      const dir = _selDir();
      const norm = s => (s || '').toLowerCase().replace(/\s+t$/i, '').trim();
      const fromN = norm(dir.from);
      const boarding = meta.calls.find(c => norm(c.name) === fromN) || null;
      if (boarding) {
        const dMs = boarding.aimed && boarding.expected
          ? new Date(boarding.expected).getTime() - new Date(boarding.aimed).getTime()
          : 0;
        meta.delayMins = Math.round(dMs / 60000);
        meta.quay = boarding.quay;
        meta.realtime = boarding.realtime;
      }
      state.lockedJourneyMeta = meta;
      // Advance the departure time so leaveby stays accurate
      if (boarding && boarding.realtime && boarding.expected) {
        state.sel.expectedDepartureTime = boarding.expected;
      }
      // Keep estimated calls in sync for the route map
      state.sel.serviceJourney.estimatedCalls = meta.calls.map(c => ({
        quay: { publicCode: c.quay, stopPlace: { name: c.name, latitude: c.lat, longitude: c.lon } },
        aimedArrivalTime:      c.aimed,
        expectedArrivalTime:   c.expected,
        aimedDepartureTime:    c.aimed,
        expectedDepartureTime: c.expected,
        realtime:              c.realtime,
      }));
      _refreshSelDisplay();
      logMsg('sel live: ' + meta.calls.length + ' stopp'
        + (meta.cancelled ? ' · INNSTILT' : meta.delayMins >= 2 ? ' · +' + meta.delayMins + 'min' : ''), 'ok');
    })
    .catch(err => logMsg('sel ✗ ' + err.message, 'err'));
}

function _refreshSelDisplay() {
  const meta = state.lockedJourneyMeta;
  const c    = state.sel;
  if (!c || !meta) return;

  // ── Live status banner (cancellation / delay / platform change) ──
  const statusEl = document.getElementById('s-live-status');
  if (statusEl) {
    const origQuay = c._origQuay || null;
    let html = '';
    if (meta.cancelled) {
      html = '<div class="jny-status-bar jny-status-cancelled">Avgangen er innstilt</div>';
    } else {
      if (meta.delayMins >= 2) {
        html += '<div class="jny-status-bar jny-status-delay">+' + meta.delayMins + ' min forsinkelse</div>';
      }
      if (meta.quay && origQuay && meta.quay !== origQuay) {
        html += '<div class="jny-status-bar jny-status-quay">Spor endret til ' + meta.quay + '</div>';
      }
    }
    statusEl.innerHTML = html;
  }

  // ── Disable boarding CTA when cancelled ──
  if (meta.cancelled) {
    const primaryBtn = document.querySelector('#s-ctas .cta-btn:first-child');
    if (primaryBtn && !primaryBtn.disabled) primaryBtn.disabled = true;
  }

  // ── Update leaveby countdown with corrected departure time ──
  if (!meta.cancelled) {
    const depTs    = new Date(c.expectedDepartureTime).getTime();
    const wk       = walkInfo();
    const leaveByTs = påstigningTs(c) - wk.mins * 60000;
    const mtl      = mToLeave(påstigningTs(c));
    const rcls     = reachCls(mtl);
    const ltCls    = _ltCls(rcls);
    const now      = Date.now();
    const hero     = _hero(Math.floor((leaveByTs - now) / 1000), depTs, now, rcls);

    const lbEl = document.querySelector('.leaveby-time');
    if (lbEl) {
      lbEl.className = 'leaveby-time ' + ltCls;
      // Through _hero, not `clk(leaveByTs)`. This line used to replace the
      // countdown with a bare clock face the moment metadata arrived.
      lbEl.innerHTML = esc(String(hero.num))
        + '<span class="lt-unit">' + esc(hero.unit) + '</span>';
    }
    const lbSubEl = document.querySelector('.leaveby-sub');
    if (lbSubEl) {
      lbSubEl.innerHTML = _subLine(rcls, mtl, leaveByTs, depTs, now);
    }
  }
}

// Expose for nav bridges
window._renderSelected = renderSelected;
window._destroySelMap  = destroySelMap;
