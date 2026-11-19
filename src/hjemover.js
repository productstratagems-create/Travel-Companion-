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

/**
 * HJEMOVER MED BYTTER (v1.218.151). Spurt: «Hva skjer dersom avstanden krever
 * en overgang eller flere?» — da ga hjemover ingenting, for ingen avgang
 * herfra kjører helt hjem. Valgt: direkte treff som før, pluss første etappe
 * av reisesøkene hjem. Rent: forslagene → [{ linjeId, kode, mot, bytte }].
 */
export function hjemFørsteEtapper(mønstre) {
  const sett = new Map();
  (mønstre || []).forEach(p => {
    const kol = (p && p.legs || []).filter(l => l && l.mode && l.mode !== 'foot');
    if (!kol.length) return;
    const l = kol[0];
    const linje = l.serviceJourney && l.serviceJourney.line;
    if (!linje || !linje.id) return;
    const bytte = kol.length > 1 ? ((l.toPlace && l.toPlace.name) || null) : null;
    const mot = (l.fromEstimatedCall && l.fromEstimatedCall.destinationDisplay && l.fromEstimatedCall.destinationDisplay.frontText) || '';
    const k = linje.id + '>' + (bytte || '');
    if (!sett.has(k)) sett.set(k, { linjeId: linje.id, kode: linje.publicCode || '', mot, bytte });
  });
  return [...sett.values()];
}

/**
 * Dommen for én retning: direkte (et stopp videre er ditt), eller første
 * etappe hjem — samme linje, og den kjører til stedet du bytter på. Rent.
 */
export function hjemDom(linjeId, fram, liste, etapper) {
  if (gårHjemover(fram, liste)) return { hjem: true, bytte: null };
  const navn = new Set((fram || []).map(st => stopKey(st.name)).filter(Boolean));
  const e = (etapper || []).find(x => x.linjeId === linjeId && (x.bytte ? navn.has(stopKey(x.bytte)) : false));
  return e ? { hjem: true, bytte: e.bytte } : { hjem: false, bytte: null };
}
