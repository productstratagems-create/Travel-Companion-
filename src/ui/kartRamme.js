/**
 * KARTRAMMEN — én modul for alle kartene (v1.218.188, docs/kartregler.md).
 * Bestilt: «Trenger et sett av regler for zoom og panorering av kartene, slik
 * at de rette elementene i kartene er i fokus med rett zoom.» — «Alt.»
 *
 * Før hadde seks kart egne zoomtak (14–18) og marginer (24–44 px) skrevet inn
 * for hånd. Nå: fem navngitte trinn, én margin, én innrammingsfunksjon.
 */
import { fitPadding } from './map.js';

/** Zoomtrappen (§2). Et tak, ikke et mål: rammen bestemmer zoomen. */
export const ZOOM = Object.freeze({ PLATTFORM: 18, GANG: 17, NÆRHET: 16, REISE: 15, RUTER: 14 });

/** Margen (§3): fra kartets egen høyde, ikke et tall valgt for et annet kart. */
export function marg(map) {
  const el = map && map.getContainer ? map.getContainer() : null;
  return fitPadding(el ? el.clientHeight : 0);
}

/**
 * Ramm inn `pts` med taket `trinn`. Ett punkt alene får NÆRHET (eller
 * `ettPunkt`), aldri «maks» (§2). `animer` bare når brukeren ba om det (§7).
 * `pad` når kartet har merkelapper som trenger mer (§3).
 */
export function ramme(map, pts, trinn, { animer = false, pad = null, ettPunkt = null } = {}) {
  if (!map || !pts) return false;
  const liste = Array.isArray(pts) ? pts.filter(Boolean) : null;
  if (liste && !liste.length) return false;
  if (liste && liste.length === 1) {
    map.setView(liste[0], ettPunkt != null ? ettPunkt : Math.min(trinn, ZOOM.NÆRHET), { animate: !!animer });
    return true;
  }
  const p = pad != null ? pad : marg(map);
  map.fitBounds(pts, { padding: [p, p], maxZoom: trinn, animate: !!animer });
  return true;
}
