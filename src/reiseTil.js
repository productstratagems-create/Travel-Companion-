/**
 * REISER TIL ET VALGT STED, SOM RADER (v1.218.211, steg 2a).
 * Planen: «feltet + sted + kollektiv og gange som rader». Brukeren velger et
 * sted; svaret er likeverdige måter å komme dit på, sortert etter når du er
 * framme. Fakta på radene («ingen bytte», «minst gange»), ingen rangering —
 * «ingen dom» (docs/onboarding-forslag.md). Ren.
 */
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
      bytter: kol.length - 1, gangMin: Math.round(gang / 60000), fakta: [] });
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
