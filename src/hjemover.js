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
import { lesSagt } from './profil.js';

export const HJEM_KEY = 't.hjemoverStopp';
export const HJEM_MAKS = 12;

/** Dine hjemover-stopp: [{ id, name }]. */
export function hjemStopp() {
  let v = null;
  try { v = JSON.parse(storage.get(HJEM_KEY) || 'null'); } catch { v = null; }
  const egen = Array.isArray(v) ? v.filter(s => s && s.id && s.name) : [];
  // MORGENSTOPPET ER HJEMOVER (v1.218.266). Bestilt: «svaret på fra hvor
  // bruker reiser om morgenen skal også brukes for Hjemover». Egen liste går
  // alltid foran; uten den er morgenstoppet og stoppene rundt det hjemover.
  if (egen.length) return egen;
  let sagt = null;
  try { sagt = lesSagt(); } catch { sagt = null; }
  return hjemFraProfil(sagt);
}

/** Morgenstoppet (profilens hjem) + stoppene rundt det, som hjemover-liste. Ren. */
export function hjemFraProfil(sagt) {
  const h = sagt && sagt.hjem;
  if (!h || !h.stopId || !h.navn) return [];
  const ut = [], sett = new Set();
  [{ stopId: h.stopId, navn: h.navn }, ...(h.nær || [])].forEach(n => {
    const id = n && n.stopId ? String(n.stopId).split('|')[0] : null;
    if (id && n.navn && !sett.has(id) && ut.length < HJEM_MAKS) { sett.add(id); ut.push({ id, name: n.navn }); }
  });
  return ut;
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
/**
 * BARE GODE FORSLAG (v1.218.153). Rapportert fra Majorstuen med hjem på
 * Holmenkollen: trikk 12 og 19 ble «hjemover» fordi ett av fem forslag var en
 * omvei via Nationaltheatret. Et forslag teller bare når det er framme innen
 * HJEM_SLAKK_MIN etter det raskeste.
 */
export const HJEM_SLAKK_MIN = 10;
const _t = (o, f) => Date.parse((o && (o['expected' + f] || o['aimed' + f])) || '');
const _ende = p => { const l = (p && p.legs) || []; return l.length ? _t(l[l.length - 1], 'EndTime') : NaN; };
function _etappe(p) {
  const legs = (p && p.legs) || [];
  const kol = legs.filter(l => l && l.mode && l.mode !== 'foot');
  if (!kol.length) return null;
  const l = kol[0];
  const linje = l.serviceJourney && l.serviceJourney.line;
  if (!linje || !linje.id) return null;
  const i = legs.indexOf(l);
  const gangMs = legs.slice(0, i).reduce((s, x) => s + Math.max(0, (_t(x, 'EndTime') - _t(x, 'StartTime')) || 0), 0);
  const fra = l.fromPlace || {};
  return {
    linjeId: linje.id, kode: linje.publicCode || '',
    mot: (l.fromEstimatedCall && l.fromEstimatedCall.destinationDisplay && l.fromEstimatedCall.destinationDisplay.frontText) || '',
    bytte: kol.length > 1 ? ((l.toPlace && l.toPlace.name) || null) : null,
    fraId: (fra.quay && fra.quay.stopPlace && fra.quay.stopPlace.id) || null, fraNavn: fra.name || '',
    går: _t(l, 'StartTime'), gangMin: Math.round(gangMs / 60_000), framme: _ende(p),
  };
}
/** De gode forslagene, raskest først. */
function _gode(mønstre) {
  const m = (mønstre || []).filter(p => _etappe(p));
  const ender = m.map(_ende).filter(Number.isFinite);
  const best = ender.length ? Math.min(...ender) : NaN;
  return m.filter(p => !Number.isFinite(best) || !Number.isFinite(_ende(p)) || _ende(p) <= best + HJEM_SLAKK_MIN * 60_000)
    .sort((a, b) => (_ende(a) || 0) - (_ende(b) || 0));
}
export function hjemFørsteEtapper(mønstre) {
  const sett = new Map();
  _gode(mønstre).forEach(p => {
    const e = _etappe(p);
    const k = e.linjeId + '>' + (e.bytte || '');
    if (!sett.has(k)) sett.set(k, e);
  });
  return [...sett.values()];
}
/**
 * ER DET ET ANNET STOPP? (v1.218.155). Skjermbilde fra Mortensrud: «raskest
 * hjem: fra Mortensrud T · linje 71» — men 71 sto alt på tavla du så.
 * Navnet kan ikke avgjøre det: Majorstuen T og trikkestoppet heter trolig
 * begge «Majorstuen». Linja kan: et annet stopp er bare verdt å nevne når
 * linja ikke går fra noe du ser. Rent.
 */
export function annetHjemStopp(rk, nær, linjerHer) {
  if (!rk || !rk.fraId) return false;
  if ((nær || []).some(s => s && s.id === rk.fraId)) return false;
  return !(linjerHer && linjerHer.has(rk.linjeId));
}
/**
 * GÅ HJEM (v1.218.158). Spurt med skjermbilde fra Mortensrud: «Hvordan skal
 * Hjemover håndteres når bruker er innen gåavstand til hjem?» Valgt: «gå hjem»
 * og buss bare om den er framme minst GÅ_HJEM_FORSPRANG_MIN før. Rent:
 * forslaget som bare er gange → { gangMin, ende }, ellers null.
 */
export const GÅ_HJEM_FORSPRANG_MIN = 3;
export function hjemGange(mønstre) {
  const g = (mønstre || []).filter(p => p && (p.legs || []).length && p.legs.every(l => l && l.mode === 'foot'));
  if (!g.length) return null;
  const best = g.map(p => ({ ende: _ende(p), start: _t(p.legs[0], 'StartTime') })).filter(x => Number.isFinite(x.ende))
    .sort((a, b) => a.ende - b.ende)[0];
  return best ? { ende: best.ende, gangMin: Math.max(1, Math.round((best.ende - best.start) / 60_000)) } : null;
}
/** Første etappe av det raskeste forslaget, eller null. */
export function hjemRaskest(mønstre) {
  const g = _gode(mønstre);
  const e = g.length ? _etappe(g[0]) : null;
  // Går du like fort, er ingen holdeplass «raskest» (v1.218.158).
  const gå = hjemGange(mønstre);
  return e && gå && !(e.framme <= gå.ende - GÅ_HJEM_FORSPRANG_MIN * 60_000) ? null : e;
}

/**
 * Dommen for én retning: direkte (et stopp videre er ditt), eller første
 * etappe hjem — samme linje, og den kjører til stedet du bytter på. Rent.
 */
export function hjemDom(linjeId, fram, liste, etapper, gange = null) {
  // NÆR HJEM (v1.218.158): går du like fort, er ingen avgang «hjemover».
  if (gange) {
    const frist = gange.ende - GÅ_HJEM_FORSPRANG_MIN * 60_000;
    const ider = new Set((liste || []).map(s => s.id)), navn = new Set((liste || []).map(s => stopKey(s.name)).filter(Boolean));
    const hjem = (fram || []).find(st => (st.id && ider.has(st.id)) || navn.has(stopKey(st.name)));
    if (hjem && Number.isFinite(hjem.at) && hjem.at <= frist) return { hjem: true, bytte: null };
    const e = (etapper || []).find(x => x.linjeId === linjeId && x.bytte && Number.isFinite(x.framme) && x.framme <= frist
      && (fram || []).some(st => stopKey(st.name) === stopKey(x.bytte)));
    return e ? { hjem: true, bytte: e.bytte } : { hjem: false, bytte: null };
  }
  if (gårHjemover(fram, liste)) return { hjem: true, bytte: null };
  const navn = new Set((fram || []).map(st => stopKey(st.name)).filter(Boolean));
  const e = (etapper || []).find(x => x.linjeId === linjeId && (x.bytte ? navn.has(stopKey(x.bytte)) : false));
  return e ? { hjem: true, bytte: e.bytte } : { hjem: false, bytte: null };
}

/**
 * LÆRT HJEMOVER (v1.218.258, onboarding steg 3). Planen: «foreslå "hjemover =
 * X?" når appen har sett samme mål om kvelden flere ganger; ett trykk "ja"
 * lagrer.» Profilens hjem-holdeplass (oppgitt som morgen-stopp, eller avledet
 * av kvelds-reiser — avledProfil) er kandidaten. Bare når hjemover er tomt,
 * og ikke et stopp du har sagt nei til. Ren.
 * @returns { navn, stopId, nær } | null
 */
export function hjemoverForslag(prof, hjemListe, avvistId) {
  const h = prof && prof.hjem;
  if (!h || !h.stopId || (hjemListe && hjemListe.length)) return null;
  if (avvistId && String(avvistId) === String(h.stopId)) return null;
  return h;
}
/** Ja: hjem-holdeplassen og stoppene rundt den (profilens `nær`) blir hjemover. */
export function lagreHjemoverFra(h) {
  if (!h || !h.stopId) return hjemStopp();
  leggTilHjem({ id: String(h.stopId).split('|')[0], name: h.navn });
  (h.nær || []).forEach(n => { if (n && n.stopId && n.navn) leggTilHjem({ id: String(n.stopId).split('|')[0], name: n.navn }); });
  return hjemStopp();
}
