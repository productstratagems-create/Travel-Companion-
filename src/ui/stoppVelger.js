/**
 * STOPPVELGEREN (v1.218.181) — «hvor går du av?», delt mellom Auto-tavle og
 * avgangsdetaljene. Flyttet hit fra auto.js så begge leser samme liste, samme
 * ankomsttekst og samme valg av kjent mål. Ren.
 */
import { stopKey } from '../stopId.js';
import { esc, clk } from './fmt.js';

const MIN = 60000;

export function stopsAhead(call, fromName, now, fraId = null) {
  // FRA NABOSTOPPET (v1.218.119): et kall fra et annet stoppested i
  // knutepunktet har det stedet i stopplista, ikke stoppet ditt.
  if (call && call._fra) { fromName = call._fra.name || fromName; fraId = call._fra.id || fraId; }
  const t0 = now == null ? Date.now() : now;
  const sjc = (call && call.serviceJourney && call.serviceJourney.estimatedCalls) || [];
  const norm = stopKey;   // was recipe C: the comma clause was missing
  const me = norm(fromName);
  let seen = false;
  const out = [];
  sjc.forEach(c => {
    const sp = c.quay && c.quay.stopPlace;
    const name = (sp && sp.name) || '';
    // ID FØR NAVN (v1.218.68): «Mortensrud terminal» i kallet og «Mortensrud»
    // på skjermen er samme stoppested; ID-en sier det, navnet bommer.
    if (!seen) { if ((fraId && sp && sp.id === fraId) || (me && norm(name) === me)) seen = true; return; }
    const t = c.expectedArrivalTime || c.aimedArrivalTime;
    const ms = t ? new Date(t).getTime() : null;
    out.push({
      name,
      id: (sp && sp.id) || null,
      lat: sp && sp.latitude != null ? sp.latitude : (c.quay && c.quay.latitude),
      lon: sp && sp.longitude != null ? sp.longitude : (c.quay && c.quay.longitude),
      // BOTH DERIVED FROM ONE TIMESTAMP. `at` is what the screen shows and
      // `mins` is what the map ranks by; two independently computed copies
      // of the same arrival is exactly how they would drift apart.
      at: ms,
      mins: ms ? Math.max(0, Math.round((ms - t0) / MIN)) : null,
    });
  });
  return out;
}

export function arriveText(st) {
  return (st && st.at != null) ? 'framme ' + clk(st.at) : '';
}

/**
 * DET APPEN ALT VET OM MÅLET (v1.218.181): et av dine vanlige mål som turen
 * faktisk stopper ved etter påstigningen. Mest brukt vinner. Null ellers —
 * da spør skjermen, den gjetter ikke.
 * @param stops    stopsAhead(...) — bare stopp ETTER påstigning
 * @param vanlige  [{ name, stopId?, count? }] (loadFreq('arr'))
 */
export function kjentMål(stops, vanlige) {
  const liste = (vanlige || []).filter(v => v && v.name)
    .slice().sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0));
  for (const v of liste) {
    const s = (stops || []).find(st => (v.stopId && st.id === v.stopId) || stopKey(st.name) === stopKey(v.name));
    if (s) return s;
  }
  return null;
}

/** Lista du velger fra: vanlige mål først, så resten, med når du er framme. */
/**
 * SAMME NAVN ÉN GANG (v1.218.191). Rapportert: «Jernbanetorget» to ganger i
 * «ofte brukt» (framme 22:54 og 22:55) — turen stopper ved to stoppesteder
 * med samme navn rett etter hverandre. For deg er det ett sted å gå av; det
 * første er det tidligste. Ren.
 */
export function unikeStopp(stops) {
  const sett = new Set();
  return (stops || []).filter(s => { const k = stopKey(s.name); if (!k || sett.has(k)) return false; sett.add(k); return true; });
}
export function stoppValgHtml(stopsInn, vanlige, valgtId) {
  const stops = unikeStopp(stopsInn);
  if (!stops.length) return '<div class="sv-tom">vet ikke hvor den går videre</div>';
  const ofte = new Set((vanlige || []).map(v => stopKey(v.name)));
  const rad = s => '<button type="button" class="nearby-btn sv-stopp' + (s.id && s.id === valgtId ? ' picked' : '')
    + (ofte.has(stopKey(s.name)) ? ' sv-ofte' : '') + '" data-sv="' + esc(s.id || s.name) + '">'
    + '<span class="nearby-name">' + esc(s.name) + '</span><span class="nearby-dist">' + esc(arriveText(s)) + '</span></button>';
  const først = stops.filter(s => ofte.has(stopKey(s.name)));
  return (først.length ? '<div class="set-label">ofte brukt</div>' + først.map(rad).join('') + '<div class="set-label">alle stopp</div>' : '')
    + stops.map(rad).join('');
}
