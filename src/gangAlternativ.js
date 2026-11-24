/**
 * GÅ LENGER, FÆRRE BYTTER (eksperiment, v1.218.302). Tracer 2
 * (docs/tracer-bedre-reise.md) fant én avveining: noen ganger kan du gå til et
 * annet stopp og få færre bytter, med omtrent samme ankomst. Brukertesten ga
 * en grense for gangtid på 15–17 min. Brukeren setter selv grensen i
 * innstillinger. Standard er 15 min, og «av» viser ingenting.
 *
 * Kilden er reisesøket Auto-tavla alt gjør for et valgt område. Det gir ingen
 * nye kall. En rad tas med når:
 *  - den har FÆRRE bytter enn en annen reise i samme svar,
 *  - den starter fra et ANNET stopp enn den reisen,
 *  - den er fremme innenfor ± SAMME_ANKOMST_MIN av den,
 *  - og gangen til første stopp er innenfor brukerens grense.
 * Raden sier hva den sammenlignes med («samme ankomst som 71 → 515»), og
 * aldri «bedre» eller «anbefalt»: valget er brukerens.
 *
 * TILBAKERULLING: sett GANG_ALTERNATIV = false, eller fjern denne filen,
 * linjen merket «GÅ LENGER (eksperiment)» i src/views/auto.js og
 * innstillingen (index.html #pref-gangalt, src/views/settings.js).
 */
import { storage } from './storage.js';

export const GANG_ALTERNATIV = true;
export const GANG_ALT_KEY = 't.gangAlternativ';
/** Valgene i innstillinger, i minutter. 0 = av. Standard fra brukertesten (15–17 min). */
export const GANG_ALT_VALG = Object.freeze([0, 10, 15, 20, 25]);
export const GANG_ALT_STANDARD = 15;
/** «Omtrent samme ankomst», samme terskel som tracer 2. */
export const SAMME_ANKOMST_MIN = 5;

export function lastGangTak() {
  try {
    const v = Number(storage.get(GANG_ALT_KEY));
    return GANG_ALT_VALG.includes(v) && storage.get(GANG_ALT_KEY) != null ? v : GANG_ALT_STANDARD;
  } catch { return GANG_ALT_STANDARD; }
}
export function lagreGangTak(min) {
  const v = GANG_ALT_VALG.includes(Number(min)) ? Number(min) : GANG_ALT_STANDARD;
  try { storage.set(GANG_ALT_KEY, String(v)); } catch (_) {}
  return v;
}

/** Gange før første kollektivetappe (min), fra reisen selv. Ren. */
export function gangTilFørste(r) {
  const legs = (r && r.tp && r.tp.legs) || [];
  const i = legs.findIndex(l => l && l.mode && l.mode !== 'foot');
  if (i <= 0) return 0;
  const ms = legs.slice(0, i).reduce((m, l) => m + Math.max(0, (Date.parse(l.expectedEndTime || l.aimedEndTime) - Date.parse(l.expectedStartTime || l.aimedStartTime)) || 0), 0);
  return Math.round(ms / 60000);
}
const linjeTekst = r => (r.linjer || []).map(l => l.kode).join(' → ');

/**
 * Radene som er en avveining: færre bytter fra et annet stopp, omtrent samme
 * ankomst, innenfor gangtaket. Hver får `fakta` som sier hva den sammenlignes
 * med, og `gangAlternativ: true`. Ren.
 * @param rader   reiseRader(...) for samme reisesøk
 * @param o.gangTak  minutter. 0 eller mindre gir ingen rader
 * @param o.mot      radene den kan sammenlignes med — de som VISES (kombinasjonsradene).
 *   Uten: alle radene i svaret. Sett i ekte data: «3 min senere enn 73 → 81 → 580»
 *   der 73 → 81 → 580 ikke stod på skjermen — raden viste til noe brukeren ikke så.
 */
export function gangAlternativRader(rader, { gangTak = GANG_ALT_STANDARD, mot: synlige = null } = {}) {
  if (!(gangTak > 0)) return [];
  const kol = (rader || []).filter(r => r && r.type === 'kollektiv');
  const ut = [];
  for (const r of kol) {
    const gang = gangTilFørste(r);
    if (gang > gangTak) continue;
    // Det den sammenlignes med: reisen med flere bytter fra et annet stopp, nærmest i ankomst.
    const mot = (synlige || kol).filter(x => x !== r && x.tp !== r.tp && x.bytter > r.bytter && x.fra && r.fra && x.fra !== r.fra
      && Math.abs(x.ank - r.ank) < SAMME_ANKOMST_MIN * 60000)
      .sort((a, b) => Math.abs(a.ank - r.ank) - Math.abs(b.ank - r.ank) || b.bytter - a.bytter)[0];
    if (!mot) continue;
    const min = Math.round((r.ank - mot.ank) / 60000);
    const bytter = mot.bytter - r.bytter;
    // Ett minutt er avrunding, ikke en forskjell: «samme ankomst som …»; ellers «N min senere/tidligere enn …».
    const tid = Math.abs(min) <= 1 ? 'samme ankomst som ' : min > 0 ? min + ' min senere enn ' : -min + ' min tidligere enn ';
    const færre = r.bytter === 0 ? '' : (bytter === 1 ? 'ett bytte færre' : bytter + ' bytter færre') + ' · ';
    ut.push({ ...r, gangMin: gang, gangAlternativ: true, fakta: [færre + tid + linjeTekst(mot)] });
  }
  return ut;
}

/**
 * Kombinasjonsradene pluss avveiningsradene, uten at samme reise står to ganger
 * (en rad som alt er en kombinasjonsrad, står som den er). Ren.
 */
export function medGangAlternativ(kombi, rader, gangTak) {
  const har = new Set((kombi || []).map(r => r.tp));
  return (kombi || []).concat(gangAlternativRader(rader, { gangTak, mot: kombi || [] }).filter(r => !har.has(r.tp)));
}
