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
  if (!bein || !bein.length) return '';
  const koder = [...new Set(bein.map(b => b.kode).filter(Boolean))].slice(0, 5);
  const først = bein.reduce((a, b) => (!a || b.ms < a.ms ? b : a), null);
  const om = først && Number.isFinite(gangMin) ? Math.round((først.ms - nå) / 60000) - gangMin : null;
  // Første linje én gang (v1.218.230: «Hvorfor er 73 nevnt to ganger?»):
  // «73 gå om 2 min · også 72», ikke «73 · 72 — 73 gå om 2 min».
  const andre = først ? koder.filter(k => k !== først.kode) : koder;
  if (!først || om == null) return '<br><span class="stopp-linjer lapp-lang">' + esc(koder.join(' · ')) + '</span>';
  return '<br><span class="stopp-linjer lapp-lang">' + esc(først.kode) + (om <= 0 ? ' gå nå' : ' gå om ' + om + ' min')
    + (andre.length ? ' · også ' + esc(andre.join(' · ')) : '') + '</span>';
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
