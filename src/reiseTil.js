/**
 * REISER TIL ET VALGT STED, SOM RADER (v1.218.211, steg 2a).
 * Planen: «feltet + sted + kollektiv og gange som rader». Brukeren velger et
 * sted; svaret er likeverdige måter å komme dit på, sortert etter når du er
 * framme. Fakta på radene («ingen bytte», «minst gange»), ingen rangering —
 * «ingen dom» (docs/onboarding-forslag.md). Ren.
 */
import { adaptTripPattern } from './api/adapt.js';
const t = s => (s ? Date.parse(s) : NaN);
const start = l => t(l.expectedStartTime || l.aimedStartTime);
const slutt = l => t(l.expectedEndTime || l.aimedEndTime);
/** Gange hele veien vises bare opp til så mange minutter. */
export const GÅ_MAKS_MIN = 45;

/**
 * @param tps   Enturs tripPatterns fra der du står til stedet
 * @param nå    ms
 * @param gangMin  minutter å gå hele veien (målt eller anslått), eller null
 * @returns [{ type:'kollektiv'|'gå', gåOm, ank, linjer:[{kode,farge,tekst}], fra, bytter, gangMin, fakta:[] }]
 */
export function reiseRader(tps, nå, gangMin) {
  const sett = new Set(), rader = [];
  for (const tp of tps || []) {
    const legs = (tp && tp.legs) || [];
    const kol = legs.filter(l => l.mode && l.mode !== 'foot');
    if (!kol.length) continue;
    const s0 = start(legs[0]), k0 = start(kol[0]), ank = slutt(legs[legs.length - 1]);
    if (!Number.isFinite(s0) || !Number.isFinite(ank)) continue;
    const linjer = kol.map(l => {
      const ln = l.serviceJourney && l.serviceJourney.line;
      return { kode: (ln && ln.publicCode) || l.mode, farge: ln && ln.presentation && ln.presentation.colour, tekst: ln && ln.presentation && ln.presentation.textColour, modus: l.mode };
    });
    const nøkkel = linjer.map(l => l.kode).join('>') + '@' + k0;
    if (sett.has(nøkkel)) continue;
    sett.add(nøkkel);
    const gang = legs.filter(l => l.mode === 'foot').reduce((m, l) => m + Math.max(0, (slutt(l) - start(l)) || 0), 0);
    rader.push({ type: 'kollektiv', gåOm: Math.round((s0 - nå) / 60000), ank, linjer,
      fra: (kol[0].fromPlace && kol[0].fromPlace.name) || '', fraLL: kol[0].fromPlace && Number.isFinite(kol[0].fromPlace.latitude) ? { lat: kol[0].fromPlace.latitude, lon: kol[0].fromPlace.longitude, name: kol[0].fromPlace.name } : null,
      bytter: kol.length - 1, gangMin: Math.round(gang / 60000), fakta: [],
      via: kol.length > 1 && kol[0].toPlace ? kol[0].toPlace.name || null : null,
      // Reisen selv (v1.218.272): raden skal kunne åpnes, ikke bare vises.
      tp });
  }
  // Det som er gått, er gått: en reise du måtte ha gått for et minutt siden, står ikke.
  const ute = rader.filter(r => r.gåOm >= -1);
  if (Number.isFinite(gangMin) && gangMin <= GÅ_MAKS_MIN) ute.push({ type: 'gå', gåOm: 0, ank: nå + gangMin * 60000, linjer: [], fra: '', bytter: 0, gangMin, fakta: [] });
  ute.sort((a, b) => a.ank - b.ank);
  const kolRader = ute.filter(r => r.type === 'kollektiv');
  kolRader.forEach(r => { if (r.bytter === 0) r.fakta.push('ingen bytte'); });
  if (kolRader.length > 1) {
    const minst = Math.min(...kolRader.map(r => r.gangMin));
    if (kolRader.some(r => r.gangMin > minst)) kolRader.filter(r => r.gangMin === minst).forEach(r => r.fakta.push('minst gange'));
  }
  return ute;
}

/**
 * KOMBINASJONENE SOM KAN BRUKES (v1.218.215). Bestilt: alternativer innenfor
 * hurtigvalgene «som kombinerer ulike transportmidler og linjer». Av et
 * reisesøk til området beholdes reisene MED BYTTE som enten er framme før
 * den beste direkte i samme svar («N min raskere»), eller er eneste vei.
 * Ingen kåring — et faktum på raden (AGENTS.md: alternativer på raden). Ren.
 */
export function kombiRader(rader) {
  const kol = (rader || []).filter(r => r.type === 'kollektiv');
  const direkte = kol.filter(r => r.bytter === 0);
  const best = direkte.length ? Math.min(...direkte.map(r => r.ank)) : null;
  return kol.filter(r => r.bytter >= 1 && (best == null || r.ank < best)).map(r => {
    const raskere = best == null ? null : Math.round((best - r.ank) / 60000);
    const fakta = r.fakta.filter(f => f !== 'minst gange');
    if (raskere != null && raskere >= 1) fakta.push(raskere + ' min raskere');
    if (best == null) fakta.push('eneste vei dit');
    return { ...r, fakta };
  });
}

/**
 * EN BYTTERAD SOM KALL (v1.218.272). Rapportert: «Forslag med bytter lar seg
 * ikke velge.» Raden kastet reisen og kunne bare vise gangen på kartet. Nå:
 * samme kall som Rute lager av en reise (adaptTripPattern — alle etappene,
 * byttene), med `_dir` som en vanlig rad i Auto-tavle, så avgangsdetaljene,
 * «reis →» og Rute virker uten egen kode. Ren.
 * @returns kallet, eller null uten reise
 */
export function kombiKall(r) {
  const tp = r && r.tp;
  if (!tp || !tp.legs) return null;
  const c = adaptTripPattern(tp);
  if (!c || !c._legs || !c._legs.length) return null;
  const kol = tp.legs.filter(l => l && l.mode && l.mode !== 'foot');
  const f = kol[0].fromPlace || {}, siste = tp.legs[tp.legs.length - 1].toPlace || {};
  const id = p => (p.quay && p.quay.stopPlace && p.quay.stopPlace.id) || (p.stopPlace && p.stopPlace.id) || null;
  c._dir = { key: 'auto-tavle', from: f.name || '', stopId: id(f),
    _fromLat: Number.isFinite(f.latitude) ? f.latitude : null, _fromLon: Number.isFinite(f.longitude) ? f.longitude : null,
    to: siste.name || null, toStopId: id(siste),
    _toLat: Number.isFinite(siste.latitude) ? siste.latitude : null, _toLon: Number.isFinite(siste.longitude) ? siste.longitude : null,
    _målKjent: false };
  return c;
}

/**
 * BESTE PÅSTIGNING SLIK ENTUR REGNER DEN (v1.218.278). Rapportert fra
 * Trondheim: appen sa «beste stopp mot sentrum: Hansensvingen · 17 min å gå»,
 * Entur sa Stibakken eller Saksevik. Appen talte avganger; Entur velger
 * påstigningen på reisen som er tidligst framme, gangen medregnet. Blant
 * reisene du rekker: tidligst ankomst, så minst gange. Ren.
 * @returns {{ id, name, lat, lon, ank }|null}
 */
export function besteFraReiser(tps, nå) {
  let best = null;
  for (const tp of tps || []) {
    const legs = (tp && tp.legs) || [];
    const kol = legs.filter(l => l && l.mode && l.mode !== 'foot');
    if (!kol.length) continue;
    const s0 = start(legs[0]), ank = slutt(legs[legs.length - 1]);
    if (!Number.isFinite(s0) || !Number.isFinite(ank) || s0 < nå - 60000) continue;
    const gang = legs.filter(l => l.mode === 'foot').reduce((m, l) => m + Math.max(0, (slutt(l) - start(l)) || 0), 0);
    const f = kol[0].fromPlace || {};
    const id = (f.quay && f.quay.stopPlace && f.quay.stopPlace.id) || (f.stopPlace && f.stopPlace.id) || null;
    if (!id) continue;
    if (!best || ank < best.ank || (ank === best.ank && gang < best.gang)) best = { id, name: f.name || '', lat: f.latitude, lon: f.longitude, ank, gang };
  }
  return best ? { id: best.id, name: best.name, lat: best.lat, lon: best.lon, ank: best.ank } : null;
}
