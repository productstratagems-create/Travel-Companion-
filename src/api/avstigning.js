/**
 * HVOR DU FAKTISK GIKK AV, målt med GPS (v1.218.101).
 *
 * Bestilt: «Lær av hvor jeg faktisk går av, målt med GPS.» Låsen i
 * auto-reise kjente igjen turen du satt på, og slapp den når sporet ditt
 * forlot ruta (`sluppet:brudd`), når du sto stille for lenge
 * (`sluppet:stille`) eller ved endestasjonen (`sluppet:ende`). Men turen ble
 * ikke registrert noe sted: bare reiser du trykket «på» for, talte. En tur
 * appen selv så deg ta, lærte den ingenting av.
 *
 * Her: stoppet turen anløp nærmest punktet der du forlot den.
 *   brudd   siste fiks FØR avviksrekka — der du ennå var på ruta
 *   stille  siste fiks — der du sto
 *   ende    endestoppet
 * Ingen svar når nærmeste stopp ligger lenger unna enn AVSTIGNING_MAKS_M:
 * da vet vi ikke hvor du gikk av, og det læres ingenting. Ren.
 */
import { metresBetween } from '../haversine.js';
import { sisteAvviksrekke } from './ombordLaas.js';

export const AVSTIGNING_MAKS_M = 200;

const _ok = f => f && Number.isFinite(f.lat) && Number.isFinite(f.lon);

/** Stoppene turen anløper, med navn og koordinater. */
export function turStopp(k) {
  return ((k && k.call && k.call.serviceJourney && k.call.serviceJourney.estimatedCalls) || []).map(c => {
    const q = c.quay || {}, sp = q.stopPlace || {};
    return { name: sp.name || q.name || null, id: sp.id || null,
      lat: Number.isFinite(sp.latitude) ? sp.latitude : q.latitude,
      lon: Number.isFinite(sp.longitude) ? sp.longitude : q.longitude };
  }).filter(s => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

/** Stoppet du gikk på: kallet låsen ble funnet fra. */
export function påstigningsStopp(k) {
  const q = (k && k.call && k.call.quay) || {};
  const sp = q.stopPlace || {};
  const name = sp.name || q.name || null;
  return name ? { name, id: sp.id || null } : null;
}

/**
 * @param {object} k låst tur (kandidatAv)
 * @param {Array<{lat,lon,at}>} spor posisjonssporet, eldst først
 * @param {string} hendelse 'sluppet:brudd' | 'sluppet:stille' | 'sluppet:ende'
 * @returns {{name,id,lat,lon,dist}|null}
 */
export function avstigningsStopp(k, spor, hendelse) {
  const stopp = turStopp(k);
  if (!stopp.length) return null;
  if (hendelse === 'sluppet:ende') return { ...stopp[stopp.length - 1], dist: null };
  const fikser = (spor || []).filter(_ok);
  let punkt = null;
  if (hendelse === 'sluppet:brudd') {
    const rekke = sisteAvviksrekke(k, fikser);
    const i = rekke.length ? fikser.indexOf(rekke[0]) : -1;
    punkt = i > 0 ? fikser[i - 1] : null;
  } else if (hendelse === 'sluppet:stille') {
    punkt = fikser[fikser.length - 1] || null;
  }
  if (!punkt) return null;
  let best = null;
  stopp.forEach(s => { const d = metresBetween(punkt, s); if (!best || d < best.dist) best = { ...s, dist: d }; });
  return best && best.dist <= AVSTIGNING_MAKS_M ? best : null;
}
