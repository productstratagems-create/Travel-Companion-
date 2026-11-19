/**
 * HJEMOVER (v1.218.146). Bestilt: «Lag en ny knapp for Auto-tavle som kan
 * fungere som motsatsen til knappen Mot sentrum, og kall den Hjemover. Bruker
 * definerer i innstillinger hva hjemover betyr ved å søke og velge
 * stoppesteder og holdeplasser. Bruk Entur api for å gi bruker autocomplete.»
 *
 * En retning går hjemover når et av stoppene den kjører videre til er et av
 * dine. Ett navn for regelen (`gårHjemover`), lagret liste ett sted.
 */
import config from './config.js';
import { enturFetch } from './api/http.js';
import { storage } from './storage.js';
import { focusParam } from './geo.js';
import { TRANSIT_CATS } from './api/stopCats.js';
import { stopKey } from './stopId.js';

export const HJEM_KEY = 't.hjemoverStopp';
export const HJEM_MAKS = 12;

/** Dine hjemover-stopp: [{ id, name }]. */
export function hjemStopp() {
  let v = null;
  try { v = JSON.parse(storage.get(HJEM_KEY) || 'null'); } catch { v = null; }
  return Array.isArray(v) ? v.filter(s => s && s.id && s.name) : [];
}
function _lagre(liste) {
  try { storage.set(HJEM_KEY, JSON.stringify(liste.slice(0, HJEM_MAKS))); } catch { /* privat modus */ }
}
export function leggTilHjem(s) {
  if (!s || !s.id || !s.name) return hjemStopp();
  const l = hjemStopp().filter(x => x.id !== s.id);
  l.push({ id: s.id, name: s.name });
  _lagre(l);
  return hjemStopp();
}
export function fjernHjem(id) {
  _lagre(hjemStopp().filter(x => x.id !== id));
  return hjemStopp();
}

/**
 * Går en retning hjemover? `fram` er stoppene den kjører videre til
 * (stopsAhead). På id først, så på navn (et stoppested kan hete litt
 * forskjellig i tavla og i geokoderen). Ren.
 */
export function gårHjemover(fram, liste) {
  if (!liste || !liste.length || !fram || !fram.length) return false;
  const ider = new Set(liste.map(s => s.id));
  const navn = new Set(liste.map(s => stopKey(s.name)).filter(Boolean));
  return fram.some(st => (st.id && ider.has(st.id)) || navn.has(stopKey(st.name)));
}

/** Entur-geokoderens forslag, bare stoppesteder: [{ id, name, sted }]. */
export function hjemForslag(features) {
  return ((features) || [])
    .filter(f => f && f.properties && (f.properties.category || []).some(c => TRANSIT_CATS.includes(c)))
    .filter(f => f.properties.id && /^NSR:StopPlace:/.test(f.properties.id))
    .map(f => ({ id: f.properties.id, name: f.properties.name || f.properties.label || '', sted: f.properties.locality || f.properties.county || '' }));
}
export function søkHjemStopp(tekst, signal) {
  return enturFetch(config.api.geocoder + '?text=' + encodeURIComponent(tekst) + '&size=10&layers=venue' + focusParam(), { signal })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(j => hjemForslag(j && j.features));
}
