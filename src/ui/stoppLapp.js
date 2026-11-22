/**
 * STOPPLAPPEN (v1.218.239). Én definisjon for alle stopp på Auto-tavle- og
 * Rute-kartet: «navn · gangtid», og under: den førstes «gå om» og de andre
 * linjene derfra. Spurt: «Hvorfor er det ikke samme info på lappen ved
 * Stenbråten som ved Mortensrud?» → «Bruk samme stopplapp i Rute-kartet også.»
 * `.lapp-lang` er linja som faller bort i kortform (lappPlass).
 */
import { esc } from './fmt.js';

/** Linjene ved stoppet + den førstes «gå om». avganger: [{kode, ms}]. Ren. */
export function stoppLinjerLapp(bein, gangMin, nå) {
  // BARE LINJENE (v1.218.244): «gå om» står på kortet under kartet; to steder
  // med to utregninger sa 3 og 2 min om samme buss. Første avgang først.
  if (!bein || !bein.length) return '';
  const først = bein.reduce((a, b) => (!a || b.ms < a.ms ? b : a), null);
  const koder = [...new Set([først && først.kode, ...bein.map(b => b.kode)].filter(Boolean))].slice(0, 5);
  return '<br><span class="stopp-linjer lapp-lang">' + esc(koder.join(' · ')) + '</span>';
}

/** Avgangene fra et stopp blant Rutes reiser: påstigning der, eller «rekk den» der. Ren. */
export function ruteAvgangerFra(deps, stoppId, egetStoppId) {
  const id = String(stoppId);
  return (deps || []).map(c => {
    const kol = (c && c._legs || []).find(l => l && l.mode && l.mode !== 'foot');
    const kode = (kol && kol.line && kol.line.publicCode) || (c && c.serviceJourney && c.serviceJourney.line && c.serviceJourney.line.publicCode);
    const r = c && c._rekkLengerNed;
    if (r && r.stopp && String(r.stopp.id) === id) return { kode, ms: r.ms };
    // Rekkes den bare lenger ned, går den ikke herfra for deg.
    if (r && r.stopp) return null;
    const fra = kol && kol.fromPlace && kol.fromPlace.quay && kol.fromPlace.quay.stopPlace && kol.fromPlace.quay.stopPlace.id;
    if (String(fra || egetStoppId) !== id) return null;
    const t = (kol && (kol.expectedStartTime || kol.aimedStartTime)) || (c && (c.expectedDepartureTime || c.aimedDepartureTime));
    return { kode, ms: t ? Date.parse(t) : NaN };
  }).filter(a => a && a.kode && Number.isFinite(a.ms));
}
