/**
 * FLEKSIBLE LINJER — BESTILLING (v1.218.256). Bestilt: «Ja» til fleksible
 * linjer etter «hele dekningsområdet»: på bygda går mange turer bare når de
 * er bestilt, og appen viste dem som vanlige avganger.
 *
 * PROBE: `bookingArrangements` på EstimatedCall kan ikke prøves herfra. Den
 * spørres i et EGET kall per stopp (ikke i tavlas spørring — et ukjent felt
 * ville veltet hele tavla), husket i 10 min. Avviser Entur feltet, spørres
 * det ikke mer denne økta, og det står i loggen.
 */
import config from '../config.js';
import { enturFetch } from './http.js';
import { logMsg } from '../ui/log.js';

export const BESTILL_MS = 10 * 60_000;
const _per = new Map();   // stopId → { t, kart: Map(sjId → bestilling) }
let _avvist = false;

export function bestillingGql(stopId) {
  return '{ stopPlace(id:"' + stopId + '") { estimatedCalls(timeRange: 86400, numberOfDepartures: 50) {'
    + ' serviceJourney { id }'
    + ' bookingArrangements { bookingMethods latestBookingTime bookingNote bookingContact { phone url } } } } }';
}

/** Svar → Map(sjId → { metoder, frist, notat, telefon, url }) for turer som må bestilles. Ren. */
export function lesBestilling(j) {
  const m = new Map();
  const kall = (j && j.data && j.data.stopPlace && j.data.stopPlace.estimatedCalls) || [];
  kall.forEach(c => {
    const b = c && c.bookingArrangements, id = c && c.serviceJourney && c.serviceJourney.id;
    if (!b || !id) return;
    const metoder = (b.bookingMethods || []).filter(Boolean);
    const k = b.bookingContact || {};
    if (!metoder.length && !b.latestBookingTime && !k.phone && !k.url) return;
    m.set(id, { metoder, frist: b.latestBookingTime || null, notat: b.bookingNote || null, telefon: k.phone || null, url: k.url || null });
  });
  return m;
}

/** «bestilles · ring 73 85 00 00 · innen 14:00». Ren. */
export function bestillTekst(b) {
  if (!b) return '';
  const hvordan = b.telefon ? 'ring ' + b.telefon : (b.metoder.includes('online') || b.url) ? 'i app/nett' : '';
  const frist = b.frist ? 'innen ' + String(b.frist).slice(0, 5) : '';
  return ['bestilles', hvordan, frist].filter(Boolean).join(' · ');
}

/** Bestillingene for stoppet, når de er hentet; ellers undefined (og hentes). */
export function bestillingFor(stopId, påSvar, nå = Date.now()) {
  if (!stopId || _avvist) return undefined;
  const v = _per.get(stopId);
  if (v && (v.henter || nå - v.t < BESTILL_MS)) return v.kart;
  const post = { t: nå, henter: true, kart: v ? v.kart : undefined };
  _per.set(stopId, post);
  enturFetch(config.api.journeyPlanner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: bestillingGql(stopId) }) })
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      if (j && j.errors && j.errors.length && !(j.data && j.data.stopPlace)) {
        _avvist = true;
        logMsg('bestilling: feltet avvist (' + String(j.errors[0].message).slice(0, 80) + ') — fleksible linjer vises som vanlige', 'warn');
        return;
      }
      post.kart = lesBestilling(j);
      if (post.kart.size && påSvar) påSvar();
    })
    .catch(() => {})
    .finally(() => { post.henter = false; post.t = Date.now(); });
  return post.kart;
}
export function _resetBestilling() { _per.clear(); _avvist = false; }
