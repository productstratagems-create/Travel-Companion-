/**
 * GANGEN TIL ET ALTERNATIVT STOPP, MÅLT (v1.218.194). Rapportert: raden lovet
 * «rekk den på Kantarellen · 10 min å gå», avgangsdetaljene sa «1,0 km · 15
 * min · passert». Tilbudet regnet luftlinje × 1,3; detaljene den ekte ruta.
 * To gangtider for én gang. Nå: tilbudets stopp rutes (samme stige som gangen
 * til hovedstoppet: Valhalla → Entur), lengden lagres i walkDist, og
 * walkMinsTo leser den — for raden, stripa og detaljene likt.
 */
import config from '../config.js';
import { approachRoute } from './walkApproach.js';
import { fetchFootRouteEntur } from './route.js';
import { enturFetch } from './http.js';
import { metresBetween } from '../haversine.js';

/** Høyst så mange rutinger på en gang — Valhalla er en åpen demotjener. */
export const GANG_SAMTIDIG = 3;
/** Samme stopp spørres ikke på nytt før du har flyttet deg så langt. */
export const GANG_FLYTT_M = 100;
/** Mislykket ruting prøves igjen etter så lenge. */
export const GANG_IGJEN_MS = 60_000;

const _ruter = new Map();   // stoppnøkkel → { pos, henter, pts, målt }
let _henter = 0;
const nøkkel = s => s.id || (s.lat.toFixed(5) + ',' + s.lon.toFixed(5));

/** Sørg for at gangen fra `fra` til `stopp` blir målt. Gjør ingenting om den er det. */
export function sikreGang(fra, stopp, deps = {}) {
  if (!fra || !stopp || !Number.isFinite(stopp.lat) || !Number.isFinite(fra.lat)) return;
  const k = nøkkel(stopp);
  const f = _ruter.get(k);
  // Feilet forrige gang (ingen rute)? Prøv igjen etter GANG_IGJEN_MS, ikke først når du har gått 100 m.
  if (f && (f.henter || (metresBetween(f.pos, fra) < GANG_FLYTT_M && (f.pts || Date.now() - (f.t || 0) < GANG_IGJEN_MS)))) return;
  if (_henter >= GANG_SAMTIDIG) return;
  const post = { pos: { lat: fra.lat, lon: fra.lon }, henter: true, pts: null, målt: false, t: Date.now() };
  _ruter.set(k, post);
  _henter++;
  const crow = metresBetween(fra, stopp);
  (deps.rute || approachRoute)(fra, stopp, crow, deps.trappetrinn || {
    entur: (a, b) => fetchFootRouteEntur(enturFetch, config.api.journeyPlanner, a, b),
  }).then(r => {
    // LUFTLINJE ER IKKE EN RUTE (v1.218.209). Rapportert med skjermbilde:
    // gangen til Stenbråten tegnet rett over jordet. Feiler rutingen, svarer
    // stigen med en korde (metres: null) — den ble lagret som ruta og tegnet
    // som sti. Nå lagres bare en målt rute.
    const målt = !!(r && r.metres != null);
    post.pts = målt ? r.latlngs : null; post.målt = målt;
  })
    .catch(() => {})
    .finally(() => { post.henter = false; _henter--; if (deps.ferdig) deps.ferdig(); });
}

/** Gangruta til stoppet, når den er hentet; ellers null. */
export function gangRuteTil(stopp) {
  const f = stopp && _ruter.get(nøkkel(stopp));
  return f && f.pts && f.pts.length >= 2 ? f.pts : null;
}
export function _resetGang() { _ruter.clear(); _henter = 0; }
