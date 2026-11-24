/**
 * HVOR LANGT (v1.218.308): lokalt · regionalt · nasjonalt, som et lag utenpå
 * kategoriene på Auto-tavla — ikke tre nye retninger (docs/plangrunnlag.md
 * §3.2: «én grunnmodell med ulik horisont»). Bestilt: «Hvordan kan vi legge
 * kategoriene lokalt, regionalt og nasjonalt utenpå de eksisterende
 * kategoriene?» Valgt: egen rad «hvor langt», grense etter kommune og fylke.
 *
 * Regelen (én definisjon, `rekkeviddeFor`):
 *  - lokalt:    samme kommune, eller under 15 km (også over fylkesgrensen:
 *               Mortensrud → Ski er 14 km, Oslo → Akershus). Avstanden
 *               står i for «nabokommune»: appen vet ikke hvilke kommuner som
 *               grenser til hverandre.
 *  - regionalt: samme fylke, ELLER under 120 km. Avstanden kom til da testen
 *               viste at fylket alene gjør Drammen (Buskerud) og Moss
 *               (Østfold) nasjonale fra Oslo — plangrunnlaget §3.2 kaller dem
 *               regionale. Den gjør også et eget unntak for Oslo + Akershus
 *               overflødig: ingen del av Akershus er 120 km fra Oslo. Hypotese.
 *  - nasjonalt: utenfor regionen OG minst 120 km unna, også utlandet.
 * Mangler kommune eller fylke (geocoderen svarte ikke), avgjøres det etter
 * luftlinje (`scopeFor`, src/opsjonsmodell.js) og merkes `anslått` — så
 * skjermen kan si det. Uten posisjon: 'ukjent'. Ren.
 */
import { metresBetween } from './haversine.js';
import { scopeFor, SCOPE_GRENSER_M } from './opsjonsmodell.js';

export const REKKEVIDDER = Object.freeze(['lokalt', 'regionalt', 'nasjonalt']);
export const REKKEVIDDE_TEKST = Object.freeze({ lokalt: 'nært', regionalt: 'regionalt', nasjonalt: 'nasjonalt' });
const SCOPE_TIL = { local: 'lokalt', regional: 'regionalt', national: 'nasjonalt' };

const norm = s => (s || '').trim().toLowerCase();
/** Regionen et fylke hører til: fylket selv. Ren. */
export const regionAv = fylke => norm(fylke) || null;

/**
 * @param her   { lat, lon, kommune?, fylke? } — der du står
 * @param sted  { lat, lon, kommune?, fylke? }
 * @returns {{ r: 'lokalt'|'regionalt'|'nasjonalt'|'ukjent', anslått: boolean }}
 */
export function rekkeviddeFor(her, sted) {
  if (!her || !sted) return { r: 'ukjent', anslått: false };
  if (her.kommune && sted.kommune && her.fylke && sted.fylke) {
    if (norm(her.kommune) === norm(sted.kommune)) return { r: 'lokalt', anslått: false };
    const m = Number.isFinite(her.lat) && Number.isFinite(sted.lat) ? metresBetween(her, sted) : Infinity;
    if (m < SCOPE_GRENSER_M.local) return { r: 'lokalt', anslått: false };
    if (regionAv(her.fylke) === regionAv(sted.fylke) || m < SCOPE_GRENSER_M.regional) return { r: 'regionalt', anslått: false };
    return { r: 'nasjonalt', anslått: false };
  }
  const s = SCOPE_TIL[scopeFor(her, sted)];
  return s ? { r: s, anslått: true } : { r: 'ukjent', anslått: false };
}

/** Tallene på knappene: { lokalt, regionalt, nasjonalt, ukjent, anslått }. Ren. */
export function tellRekkevidde(dommer) {
  const t = { lokalt: 0, regionalt: 0, nasjonalt: 0, ukjent: 0, anslått: 0 };
  for (const d of dommer || []) { t[d.r] = (t[d.r] || 0) + 1; if (d.anslått) t.anslått++; }
  return t;
}
