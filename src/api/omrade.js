/**
 * DELOMRÅDENE — STEDSNAVN FOLK KJENNER (v1.218.283). Bestilt: gjøre
 * hurtigvalgene under kartet «mer gjenkjennbare og nyttige». Et stoppnavn
 * («mot Nyjordet», «mot Hauketo · Holmlia») er kjent bare for den som bor der;
 * SSBs delområde er bydelen i byen og bygdelaget på landet.
 *
 * Kilden er to ting som alt finnes:
 *   - Enturs geokoder (reverse) gir `borough_gid` = SSBs grunnkrets, f.eks.
 *     «whosonfirst:borough:03013319». De seks første sifrene er delområdet.
 *   - Navnene: SSB KLASS, klassifikasjon 1 («Standard for delområde- og
 *     grunnkretsinndeling»), hentet 2026-11-23 → src/data/delomrader.json
 *     (1906 delområder; «Sentrum 1» → «Sentrum»).
 * Ingen polygoner: geokoderen gjør punktoppslaget.
 */
import config from '../config.js';
import { enturFetch } from './http.js';
import DELOMRÅDER from '../data/delomrader.json';

/** «whosonfirst:borough:03013319» → «030133». Ren. */
export function delområdeKode(gid) {
  const m = /(\d{8})\s*$/.exec(String(gid || ''));
  return m ? m[1].slice(0, 6) : null;
}
/** Navnet på delområdet, eller null. Ren (tabellen er data). */
export function delområdeNavn(gid, tabell = DELOMRÅDER) {
  const k = delområdeKode(gid);
  return (k && tabell[k]) || null;
}

const _cache = new Map();   // avrundet punkt → Promise<navn|null>
export function _tømOmrådeCache() { _cache.clear(); }
/** Delområdet et punkt ligger i, via geokoderen. Husket per ~100 m. */
export function hentDelområde(ll) {
  if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lon)) return Promise.resolve(null);
  const k = ll.lat.toFixed(3) + ',' + ll.lon.toFixed(3);
  if (_cache.has(k)) return _cache.get(k);
  const p = enturFetch(config.api.geocoderReverse + '?point.lat=' + ll.lat + '&point.lon=' + ll.lon + '&size=1&layers=address')
    .then(r => (r.ok ? r.json() : null))
    .then(j => { const f = j && j.features && j.features[0]; return f ? delområdeNavn(f.properties && f.properties.borough_gid) : null; })
    .catch(() => null);
  _cache.set(k, p);
  return p;
}

/**
 * Navnene på knappene: delområdet når alle områdene får hvert sitt, og det
 * ikke er det samme som der du står; ellers dagens navn for det området. Ren.
 * @param områder [{ id, navn }]  @param delNavn Map(id → navn|null)  @param her navnet der du står
 */
export function områdeTekster(områder, delNavn, her) {
  const brukt = new Map();
  (områder || []).forEach(o => { const n = delNavn.get(o.id); if (n) brukt.set(n, (brukt.get(n) || 0) + 1); });
  return new Map((områder || []).map(o => {
    const n = delNavn.get(o.id);
    const ok = n && brukt.get(n) === 1 && n !== her;
    return [o.id, 'mot ' + (ok ? n : o.navn)];
  }));
}
