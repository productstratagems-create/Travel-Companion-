/**
 * ETT STED, ETT NAVN — og en id når den finnes.
 *
 * En bladmodul, som `stopId.js` og av samme grunn: den importerer bare den,
 * og den importerer ingenting. Da kan hvem som helst importere dette uten å
 * havne i en importsyklus.
 *
 * HVORFOR DEN FINNES. Appen kjente stoppene sine som STRENGER. Et navn kan
 * ikke måles: det kan ikke si hvor langt du har å gå, hvilken vei du går,
 * eller om to skjermer snakker om samme stopp. Derfor sammenliknet fire
 * steder navn som delstrenger, og derfor kunne `addLegToPlan` kaste
 * `dir.stopId`, `dir.toStopId` og hele stopplista med koordinater uten at det
 * så ut som et tap.
 *
 * Et sted er `{ id, name, lat, lon }`. `id` og koordinatene kan mangle — en
 * gammel lagret etappe har bare navnet — og da SIER stedet det ved å ha null
 * der, framfor å late som.
 */
import { stopKey } from '../stopId.js';

const num = (v) => (Number.isFinite(v) ? v : (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : null));

/**
 * Lag et sted av hva som helst appen allerede har.
 *
 * Kildene er de formene som faktisk finnes i denne kodebasen:
 *
 *   en streng                 en gammel lagret etappe, navn alene
 *   {id,name,lat,lon}         et sted som alt er laget
 *   en `dir` + 'from'|'to'    stopId/toStopId + _fromLat/_toLat …
 *   et stopPlace              {id,name,latitude,longitude}
 *   et quay                   {latitude,longitude,stopPlace:{…}}
 *
 * @param {*} src
 * @param {'from'|'to'} [which] kreves bare for en `dir`
 * @returns {{id: string|null, name: string, lat: number|null, lon: number|null}|null}
 */
export function placeOf(src, which) {
  if (src == null) return null;

  // En gammel etappe: navnet er alt vi har, og det sies ved å la resten være null.
  if (typeof src === 'string') {
    const name = src.trim();
    return name ? { id: null, name, lat: null, lon: null } : null;
  }
  if (typeof src !== 'object') return null;

  // Allerede et sted.
  if ('name' in src && ('lat' in src || 'lon' in src) && !('stopPlace' in src)) {
    const name = String(src.name || '').trim();
    if (!name && src.id == null) return null;
    return { id: src.id != null ? String(src.id) : null, name,
      lat: num(src.lat), lon: num(src.lon) };
  }

  // En rute (`config.dirs[i]`): to endepunkter i ett objekt, så siden må sies.
  if (which === 'from' || which === 'to') {
    const name = String((which === 'from' ? src.from : src.to) || '').trim();
    const id = which === 'from' ? src.stopId : src.toStopId;
    const lat = which === 'from' ? src._fromLat : src._toLat;
    const lon = which === 'from' ? src._fromLon : src._toLon;
    if (!name && id == null) return null;
    return { id: id != null ? String(id) : null, name, lat: num(lat), lon: num(lon) };
  }

  // Et quay pakker stoppet sitt, og bærer egne koordinater som reserve.
  const sp = src.stopPlace || src;
  const name = String(sp.name || '').trim();
  const id = sp.id != null ? String(sp.id) : null;
  if (!name && !id) return null;
  return {
    id, name,
    lat: num(sp.latitude != null ? sp.latitude : src.latitude),
    lon: num(sp.longitude != null ? sp.longitude : src.longitude),
  };
}

/**
 * Navnet, uansett om stedet er et sted eller en gammel streng.
 *
 * Skjermene viste `leg.from.toLowerCase()`. Da etappen ble et sted ville hver
 * eneste av dem kastet — og ingen test ville sett det, for `renderPlan`
 * tegnes ikke av noen test i dette repoet. Én tilgang, som tar imot begge.
 */
export function placeName(x) {
  const p = placeOf(x);
  return p ? p.name : '';
}

/** Koordinatparet `walkMinsTo` og `approach` spiser, eller null. */
export function placeLL(p) {
  const lat = p && num(p.lat);
  const lon = p && num(p.lon);
  return lat == null || lon == null ? null : { lat, lon };
}

/**
 * Er dette samme sted?
 *
 * ID FØRST. Den er det eneste svaret som ikke kan tolkes. Finnes den på
 * begge, er den hele svaret — og to ulike id-er er to ulike steder, selv om
 * navnene skulle likne.
 *
 * Mangler den, faller vi til `stopKey` — appens ene navneregel, AVLEDET og
 * ikke skrevet på nytt. Og det er en LIKHET, ikke en delstrengtest: «Bryn» og
 * «Brynseng» er to stopp, og delstrengtesten som sa noe annet er grunnen til
 * at denne modulen finnes.
 */
export function samePlace(a, b) {
  const pa = placeOf(a), pb = placeOf(b);
  if (!pa || !pb) return false;
  if (pa.id && pb.id) return pa.id === pb.id;
  const ka = stopKey(pa.name), kb = stopKey(pb.name);
  return !!ka && ka === kb;
}

/**
 * Stopplista en avgang allerede bærer.
 *
 * `c.serviceJourney.estimatedCalls` har `quay.stopPlace{id,name,latitude,
 * longitude}` i både tripGQL og boardGQL. `stopsAhead` (`views/auto.js`) og
 * `_renderSelMap` (`views/selected.js`) leser den alt — dette er den samme
 * lista, tatt vare på framfor å hentes igjen over nettet senere.
 */
export function stopsOf(c) {
  const calls = (c && c.serviceJourney && c.serviceJourney.estimatedCalls) || [];
  return calls.map((k) => {
    const p = placeOf(k && k.quay);
    if (!p) return null;
    const at = k.expectedArrivalTime || k.aimedArrivalTime
      || k.expectedDepartureTime || k.aimedDepartureTime || null;
    return { ...p, at };
  }).filter(Boolean);
}
