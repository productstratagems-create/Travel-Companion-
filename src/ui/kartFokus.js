/**
 * KARTETS ZOOMNIVÅER (v1.218.129). Flyttet fra views/auto.js da Rute-kartet
 * fikk samme zoomknapp: «La Rute kartet få samme zoom og
 * kartstørrelsesknapper som Auto-reise.» Én definisjon for begge kartene.
 * Rent: ingen DOM, ingen kart.
 */
export const KART_FOKUS = ['oversikt', 'vei', 'spor'];
/**
 * HELE RUTER (v1.218.112), bare i Auto-tavle. Spurt: «utforske et nytt fast
 * zoom-nivå for den syklende zoomknappen som viser hele ruter og med
 * endstasjon navngitt». Auto-reise beholder sine tre.
 */
export const KART_FOKUS_TAVLE = ['oversikt', 'vei', 'spor', 'ruter'];
/** Så bred en endestasjonslapp om lag er, til marginen i «hele ruter». */
export const HELE_RUTER_LAPP_PX = 25;
export function nesteFokus(f, liste = KART_FOKUS) {
  const i = liste.indexOf(f);
  return liste[(i + 1) % liste.length];
}
export const FOKUS_TEKST = { oversikt: '◎ vei til stoppet', vei: '▤ plattform', spor: '◱ oversikt', ruter: '◱ oversikt' };
/** Teksten for NESTE steg (knappen sier hva et trykk gjør). */
export function fokusTekst(f, tavle) {
  return tavle && f === 'spor' ? '⤧ hele ruter' : FOKUS_TEKST[f];
}

/** Ikonet for nivået du står på. */
export const FOKUS_IKON = { oversikt: '\u25CE', vei: '\u25A4', spor: '\u25F1', ruter: '\u2927' };

/** Rammen for et fokus: punktene og hvor nær. null: den vanlige rammen. Ren. */
export function fokusRamme(f, { du, stopp, gang, inngang, plattform, plattformer, bein } = {}) {
  const ll = p => [p.lat, p.lon];
  if (f === 'vei') {
    if (!du || !stopp) return stopp ? { pts: [ll(stopp)], maksZoom: 16 } : null;
    return { pts: [ll(du), ...(gang || []), ...(inngang ? [ll(inngang)] : []), ll(stopp)], maksZoom: 17 };
  }
  if (f === 'ruter') {
    const pts = (bein || []).flatMap(b => [...(b.stopp || []), ...(b.rester || []).flat()]).filter(p => p && p.lat != null).map(ll);
    if (stopp) pts.push(ll(stopp));
    if (du) pts.push(ll(du));
    return pts.length ? { pts, maksZoom: 14 } : null;
  }
  if (f === 'spor') {
    if (plattform) return { pts: [ll(plattform), ...(inngang ? [ll(inngang)] : [])], maksZoom: 18 };
    if (plattformer && plattformer.length) return { pts: plattformer.map(ll), maksZoom: 18 };
    return stopp ? { pts: [ll(stopp)], maksZoom: 17, ukjent: true } : null;
  }
  return null;
}

