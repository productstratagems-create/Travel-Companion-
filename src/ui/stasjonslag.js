/**
 * STASJONSLAGET PÅ ALLE KART (v1.218.59). Bestilt: «det samme detaljnivået
 * på alle stasjoner på alle kart i appen». Tidligere tegnet bare tavla
 * plattformer og innganger, og bare for ditt eget stopp. Nå får hvert kart
 * fra `createMap` dette laget: fra SPOR_ZOOM henter det plattformene (Entur)
 * og inngangene (OSM) for hele utsnittet, rute for rute, og tegner dem.
 *
 * Det et kart vet om DIN reise (plattformen avgangen går fra, inngangen
 * ruten går gjennom) gis med `settStasjonAktiv` og utheves; resten tegnes
 * nøytralt. Ett lag, ett sett regler — ikke en kopi per skjerm.
 */
import L from 'leaflet';
import { esc } from './fmt.js';
import { ruterFor, hentRute, plattformerIRute, RUTE_GRAD, plattformer, hentPlattformer } from '../api/quays.js';
import { hentInngangerRute, inngangerIRute, innganger } from '../api/innganger.js';

/** Maks ruter hentet per utsnitt; zoom ≥ 16 på en telefon dekker 1–4. */
export const MAKS_RUTER = 9;

/**
 * Det som skal tegnes, fra rutene og det kartet selv vet. Ren.
 * @returns {{plattformer: Array, innganger: Array}} uten duplikater (id)
 */
export function stasjonsInnhold(rPlatt, rInng, aktiv) {
  const a = aktiv || {};
  const pl = new Map(), inn = new Map();
  [...(rPlatt || []), ...((a.stopId && plattformer(a.stopId)) || []).map(q => ({ ...q, stopId: a.stopId }))]
    .forEach(q => { if (q && q.id && !pl.has(q.id)) pl.set(q.id, q); });
  [...(rInng || []), ...((a.stopId && innganger(a.stopId)) || [])]
    .forEach(e => { if (e && e.id != null && !inn.has(e.id)) inn.set(e.id, e); });
  return {
    plattformer: [...pl.values()].map(q => ({ ...q,
      aktiv: !!a.kode && q.stopId === a.stopId && q.kode === String(a.kode) })),
    innganger: [...inn.values()].map(e => ({ ...e, aktiv: a.inngangId != null && e.id === a.inngangId })),
  };
}

function _tegn(map, st) {
  const nøkler = st.nøkler || [];
  const rP = nøkler.flatMap(k => plattformerIRute(k) || []);
  const rI = nøkler.flatMap(k => inngangerIRute(k) || []);
  const inn = stasjonsInnhold(rP, rI, st.aktiv);
  const sig = inn.plattformer.map(q => q.id + (q.aktiv ? '*' : '')).join() + '|' + inn.innganger.map(e => e.id + (e.aktiv ? '*' : '')).join();
  if (sig === st.sig) return;
  st.sig = sig;
  st.lag.clearLayers();
  inn.plattformer.forEach(m => {
    L.marker([m.lat, m.lon], { icon: L.divIcon({ className: 'quay-pin' + (m.aktiv ? ' aktiv' : ''),
      html: '<span>' + esc(m.kode) + '</span>', iconSize: null }), zIndexOffset: m.aktiv ? 500 : 0 })
      .bindTooltip((m.tekst || m.kode) + (m.aktiv ? ' · din avgang' : ''), { className: 'map-label', direction: 'top', offset: [0, -10] })
      .addTo(st.lag);
  });
  inn.innganger.forEach(e => {
    const navn = 'Inngang' + (e.ref ? ' ' + e.ref : '') + (e.navn ? ' · ' + e.navn : '') + (e.trinnfri ? ' · trinnfri' : '');
    L.marker([e.lat, e.lon], { icon: L.divIcon({ className: 'inngang-pin' + (e.aktiv ? ' aktiv' : ''),
      html: '<span>' + (e.ref ? esc(e.ref) : '⇥') + '</span>', iconSize: null }), zIndexOffset: e.aktiv ? 400 : 0 })
      .bindTooltip(navn + (e.aktiv ? ' · din vei inn' : ''), { className: 'map-label', direction: 'top', offset: [0, -10] })
      .addTo(st.lag);
  });
}

function _oppdater(map, st, terskel) {
  const el = map.getContainer();
  const skjult = map.getZoom() < terskel;
  el.classList.toggle('quay-skjult', skjult);
  if (skjult) return;
  const b = map.getBounds();
  const nøkler = ruterFor({ sør: b.getSouth(), nord: b.getNorth(), vest: b.getWest(), øst: b.getEast() });
  if (nøkler.length > MAKS_RUTER) return;   // utsnittet er for stort til å være et stasjonsblikk
  st.nøkler = nøkler;
  nøkler.forEach(k => {
    hentRute(k).then(() => _tegn(map, st));
    hentInngangerRute(k, RUTE_GRAD).then(() => _tegn(map, st));
  });
  _tegn(map, st);
}

/** Fest laget på et kart. Kalles av createMap. */
export function festStasjonslag(map, terskel) {
  const st = { lag: L.layerGroup().addTo(map), nøkler: [], aktiv: null, sig: null };
  map._stasjonslag = st;
  const opp = () => _oppdater(map, st, terskel);
  map.on('moveend zoomend', opp);
  map.whenReady(() => setTimeout(opp, 0));
  return st;
}

/** Det kartet vet om din reise: {stopId, kode, inngangId}. Utheves. */
export function settStasjonAktiv(map, aktiv) {
  const st = map && map._stasjonslag;
  if (!st) return;
  st.aktiv = aktiv || null;
  _tegn(map, st);
}

/**
 * DIN PLATTFORM, fra avgangen (v1.218.60). Én regel for tavla, avgangsdetaljer
 * og auto-reise: koden er avgangens `quay.publicCode`, stoppet er avgangens
 * eget stoppested — eller det skjermen alt kjenner. Ingen kode, ingen påstand.
 * Ren.
 */
export function aktivFraAvgang(call, stopId, inngangId) {
  const q = call && call.quay;
  const kode = q && q.publicCode;
  const sid = (q && q.stopPlace && q.stopPlace.id) || stopId || null;
  if (!kode || kode === '?' || !sid) return null;
  return { stopId: sid, kode: String(kode), inngangId: inngangId != null ? inngangId : null };
}

/** Uthev avgangens plattform på kartet; henter stoppets plattformer om de mangler. */
export function uthevAvgang(map, call, stopId, inngangId) {
  const aktiv = aktivFraAvgang(call, stopId, inngangId);
  if (aktiv && plattformer(aktiv.stopId) === undefined) hentPlattformer(aktiv.stopId).then(() => settStasjonAktiv(map, aktiv));
  settStasjonAktiv(map, aktiv);
  return aktiv;
}
