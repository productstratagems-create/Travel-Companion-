/**
 * NABOSTOPPENES AVGANGER SOM RADER (v1.218.183). Godkjent mønster (AGENTS.md,
 * «Alternativer hører hjemme på raden de gjelder»): et alternativ er en rad i
 * lista, i radens eget språk — ikke en boks over den. Avganger fra et stopp
 * innen gangavstand, til samme mål, står mellom dine egne og sier
 * «fra Kantarellen · 13 min å gå». Lista selv er sammenligningen. Ren.
 */
import { stopKey } from './stopId.js';
import { REKK_EKSTRA_MIN, REKK_MAKS_MIN } from './rekkLengerNed.js';

export const NABO_MAKS = 3;

/** Stoppene som er verdt å spørre: nær nok, ikke rutas eget, nærmeste først. */
export function naboKandidater(stops, ruteStopp, gangTil, egenGang, maks = NABO_MAKS) {
  const grense = Math.min(REKK_MAKS_MIN, (Number.isFinite(egenGang) ? egenGang : 0) + REKK_EKSTRA_MIN);
  const egen = ruteStopp || {};
  return (stops || [])
    .filter(s => s && s.id && Number.isFinite(s.lat))
    .filter(s => !(egen.id && s.id === egen.id) && !(egen.name && stopKey(s.name) === stopKey(egen.name)))
    .map(s => { const g = gangTil(s); const o = g && typeof g === 'object';
      return { id: s.id, name: s.name, lat: s.lat, lon: s.lon, gangMin: o ? g.mins : g, målt: o ? !!g.målt : true }; })
    .filter(s => Number.isFinite(s.gangMin) && s.gangMin <= grense)
    .sort((a, b) => a.gangMin - b.gangMin)
    .slice(0, maks);
}

const kolFra = c => {
  const kol = (c && c._legs || []).find(l => l && l.mode && l.mode !== 'foot');
  const p = kol && kol.fromPlace;
  return p ? { id: p.quay && p.quay.stopPlace && p.quay.stopPlace.id, name: p.name } : null;
};
const jid = c => c && c.serviceJourney && c.serviceJourney.id;

/**
 * Radene fra et nabostopp: bare reiser som faktisk går FRA det stoppet (ikke
 * en reise som går deg et annet sted først), og ikke en tur du alt ser fra
 * ditt eget stopp — den sier «rekk den lenger ned» selv.
 */
export function naboRaderFra(adapterte, nabo, egneJourneyIds) {
  const egne = egneJourneyIds instanceof Set ? egneJourneyIds : new Set(egneJourneyIds || []);
  return (adapterte || []).filter(c => {
    const f = kolFra(c);
    if (!f) return false;
    if (!((f.id && f.id === nabo.id) || stopKey(f.name || '') === stopKey(nabo.name))) return false;
    if (c._gåTil) return false;
    const j = jid(c);
    return !(j && egne.has(j));
  }).map(c => Object.assign(c, { _fra: { id: nabo.id, name: nabo.name, lat: nabo.lat, lon: nabo.lon, gangMin: nabo.gangMin, målt: nabo.målt !== false } }));
}

/** Linja på raden. Én tekst. */
export function naboTekst(c) {
  const f = c && c._fra;
  return f ? 'fra ' + f.name + (Number.isFinite(f.gangMin) ? ' · ' + (f.målt === false ? 'ca. ' : '') + f.gangMin + ' min å gå' : '') : null;
}
