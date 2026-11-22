// RUTE UTEN EGEN RUTE (v1.218.261).
//
// Før: en fremmed som åpnet Rute fikk et Oslo-eksempel — «Jernbanetorget →
// Nationaltheatret» — uansett hvor i landet hun sto. Det bryter med «hele
// dekningsområdet», og det svarte ikke på noe hun hadde spurt om.
//
// Nå: «Din rute». «Fra» er stoppet der du står, valgt av rangeringen
// (state.nearestStation, samme konsept som ellers). «Til» er tomt, med søk og
// dine vanlige mål som forslag. Ingen eksempel — og ingenting lagres før du
// selv har valgt.
import { stopKey } from './stopId.js';
import { esc } from './ui/fmt.js';

/** Plassholderen for «ingen rute ennå». Lagres aldri. */
export const NÆRMESTE_KEY = 'nærmeste';
/** Eldre lagret eksempel-rute: tolkes som ingen rute. */
export const GAMMEL_EKSEMPEL_KEY = 'example';
export const FORSLAG_MAKS = 4;

/** Plassholder-ruta: fra nærmeste stopp (eller ingenting), til ingenting. */
export function nærmesteDir(ns) {
  const har = !!(ns && ns.name);
  return {
    key: NÆRMESTE_KEY,
    from: har ? ns.name : '',
    stopId: har ? (ns.id || null) : null,
    geo: har && !ns.id ? ns.name : null,
    _fromLat: har && ns.lat != null ? ns.lat : null,
    _fromLon: har && ns.lon != null ? ns.lon : null,
    to: '', toStopId: null, toGeo: null, filter: null, line: null,
    _fromGps: har,
  };
}

export function erNærmeste(dir) { return !!dir && dir.key === NÆRMESTE_KEY; }

/** Er dette en rute brukeren faktisk har? Ikke plassholderen, ikke det gamle eksempelet. */
export function erEgenRute(dir) {
  return !!dir && dir.key !== NÆRMESTE_KEY && dir.key !== GAMMEL_EKSEMPEL_KEY;
}

/** Opptil FORSLAG_MAKS vanlige mål, uten stoppet du står ved. */
export function dinRuteForslag(freq, fra) {
  const fraK = stopKey(fra || '');
  const sett = new Set();
  const ut = [];
  for (const p of freq || []) {
    const navn = p && p.name;
    const k = stopKey(navn || '');
    if (!k || k === fraK || sett.has(k)) continue;
    sett.add(k);
    ut.push(p);
    if (ut.length >= FORSLAG_MAKS) break;
  }
  return ut;
}

/** Fra plassholder + valgt mål til en ekte rute, samme form som applyRoute lager. */
export function dinRuteValg(dir, mål) {
  if (!erNærmeste(dir) || !dir.from || !mål) return null;
  const navn = mål.label || mål.name || '';
  if (!navn || stopKey(navn) === stopKey(dir.from)) return null;
  const harLL = mål.lat != null && mål.lon != null;
  return {
    key: 'custom-out',
    from: dir.from, stopId: dir.stopId || null, geo: dir.stopId ? null : (dir.geo || dir.from),
    _fromLat: dir._fromLat != null ? dir._fromLat : null,
    _fromLon: dir._fromLon != null ? dir._fromLon : null,
    to: navn, toStopId: mål.id || null,
    toGeo: (mål.id || harLL) ? null : navn,
    _toLat: harLL ? mål.lat : null, _toLon: harLL ? mål.lon : null,
    filter: null, line: null, via: null, viaStopId: null, viaGeo: null, viaOgså: false,
  };
}

/** Nytt «fra» valgt i søket. */
export function dinRuteFra(dir, sted) {
  if (!sted) return dir;
  const navn = sted.label || sted.name || '';
  const harLL = sted.lat != null && sted.lon != null;
  return { ...dir, key: NÆRMESTE_KEY, from: navn, stopId: sted.id || null,
    geo: sted.id ? null : navn, _fromLat: harLL ? sted.lat : null, _fromLon: harLL ? sted.lon : null,
    _fromGps: false, _fraValgt: true };
}

export function dinRuteHtml(dir, forslag) {
  const fra = dir && dir.from;
  return '<div class="din-rute" data-din-rute>'
    + '<strong class="din-rute-tittel">Din rute</strong>'
    + '<label class="din-rute-felt"><span>fra</span>'
    + '<input id="din-rute-fra" type="search" autocomplete="off" value="' + esc(fra || '') + '"'
    + ' placeholder="' + (fra ? '' : 'velg sted') + '" aria-label="Fra"></label>'
    + '<div id="din-rute-fra-sugg" class="sugg-list" hidden></div>'
    + (fra && dir._fromGps ? '<div class="din-rute-hint">nærmeste stopp der du står — skriv for å bytte</div>' : '')
    + '<label class="din-rute-felt"><span>til</span>'
    + '<input id="din-rute-til" type="search" autocomplete="off" placeholder="hvor skal du?" aria-label="Til"' + (fra ? '' : ' disabled') + '></label>'
    + '<div id="din-rute-til-sugg" class="sugg-list" hidden></div>'
    + (fra && forslag && forslag.length
      ? '<div class="din-rute-forslag">' + forslag.map((p, i) =>
          '<button type="button" class="chip" data-din-mal="' + i + '">' + esc(p.name) + '</button>').join('') + '</div>'
      : '')
    + '</div>';
}
