/**
 * TRANSPARENT SCORE FOR «BESTE OPPLEVELSE» (v1.218.324).
 *
 * Ren modul: ingen nettverkskall, ingen DOM, ingen HTML. Tar inn data som alt er regnet ut og gir
 * en score med forklaring — kvalitet, popularitet, tilgang, nærhet og risiko, hver 0–100 før vekting.
 * Scoren er en prioritet, ikke en objektiv måling, og vises aldri som tall til brukeren (bare
 * `forklaring`). Rangeringen uten score (`dagensRekkefølge` i src/opplevelser.js) er uendret standard.
 * `trinnFor` er den ene definisjonen av «hvor sterk er denne typen reisemål»: dagens rekkefølge og
 * kvaliteten her leser den samme.
 */

export const SCORE_VEKTER = Object.freeze({ kvalitet: 0.45, popularitet: 0.20, tilgang: 0.20, nærhet: 0.10, risiko: 0.05 });

/** Kirker og kulturminner: finnes i hver bydel, og vises sist. */
export const erKirke = o => (o.under || []).length > 0 && o.under.every(u => u === 'kirke' || u === 'kulturminne');
/** Turrute som reisemål. Sykkelruter følger ofte bygater (sett: «Pilegrimsruta» ved tre bystopp), så de teller ikke øverst. */
export const erTur = o => !!(o.rute && o.rute.type !== 'Sykkelrute');
/** 0 nasjonal turrute · 1 regional turrute eller sterkt reisemål · 2 ruter og friluftsområder · 3 annet · 4 kirke/kulturminne. */
export function trinnFor(o) {
  const sterk = (o.kat || []).some(t => t.sterk);
  if (erTur(o) && o.rute.betydning === '1') return 0;
  if ((erTur(o) && o.rute.betydning === '2') || (!erKirke(o) && sterk && !o.rute)) return 1;
  if (o.rute || (o.hoved || []).includes('friluftsliv')) return 2;
  return erKirke(o) ? 4 : 3;
}

/** Kvalitet per trinn (startverdier fra spesifikasjonen). */
const KVALITET = { nasjonal: 100, regional: 85, sterk: 80, rute: 60, annet: 50, kirke: 25 };
export function kvalitet(o) {
  if (erKirke(o)) return KVALITET.kirke;
  if (erTur(o) && o.rute.betydning === '1') return KVALITET.nasjonal;
  if (erTur(o) && o.rute.betydning === '2') return KVALITET.regional;
  if ((o.kat || []).some(t => t.sterk) && !o.rute) return KVALITET.sterk;
  if (o.rute || (o.hoved || []).includes('friluftsliv')) return KVALITET.rute;
  return KVALITET.annet;
}

const klem = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
export const wikiScore = sitelinks => Math.min(100, Math.round(Math.log2(1 + Math.max(0, sitelinks || 0)) * 20));
/** Rating 3,0 = 0 · 4,0 = 50 · 5,0 = 100; under 3 gir negativt bidrag. Manglende rating: null (nøytral, ikke lav). */
export const ratingScore = rating => (Number.isFinite(rating) ? klem((rating - 3) / 2 * 100, -100, 100) : null);
const NØYTRAL = 50;
/** Lokal betydning: bare Miljødirektoratets reelle utfartsområder (sterke) teller opp; ellers nøytral. */
const lokalScore = o => ((o.kilder || []).some(c => c.kilde === 'miljodir' && (c.kat || []).some(t => t.sterk)) ? 100 : NØYTRAL);
export function popularitet(o, kontekst = {}) {
  const rating = ratingScore(kontekst.rating);
  return klem(0.5 * wikiScore(o.sitelinks) + 0.3 * (rating == null ? NØYTRAL : rating) + 0.2 * lokalScore(o), 0, 100);
}

const TILGANG = { enkel: 100, mulig: 65, krevende: 25, ukjent: 50 };
export const tilgangScore = ord => (ord in TILGANG ? TILGANG[ord] : TILGANG.ukjent);

/** Nærhet: målt gangtid overstyrer luftlinje. */
export function nærhet(o, gang) {
  if (gang && gang.kilde === 'målt' && Number.isFinite(gang.min)) {
    const m = gang.min; return m <= 5 ? 100 : m <= 10 ? 80 : m <= 15 ? 60 : m <= 20 ? 40 : m <= 25 ? 20 : 0;
  }
  const l = o.luft; if (!Number.isFinite(l)) return NØYTRAL;
  return l <= 300 ? 100 : l <= 600 ? 80 : l <= 900 ? 60 : l <= 1200 ? 40 : l <= 1500 ? 20 : 0;
}

/** Risiko 0–100: svakt grunnlag eller misvisende presentasjon. Reduserer prioritet, fjerner aldri. */
export function risiko(o, kontekst = {}) {
  const avvik = kontekst.avvik || [], reise = kontekst.reise || {};
  let r = 0;
  if ((reise.ugyldig && reise.ugyldig.length) || avvik.some(a => /^målestopp|^transportmiddel/.test(a))) r = 100;
  else {
    if (avvik.includes('søket er gammelt')) r = Math.max(r, 30);
    if (reise.bestilling) r = Math.max(r, 40);
    if (!kontekst.gang || kontekst.gang.kilde !== 'målt') r = Math.max(r, 20);
  }
  // Svake signaler (aldri avgjørende): få kilder, ingen beskrivelse og bilde.
  if (r < 100) r += ((o.kilder || []).length < 2 ? 5 : 0) + (!o.beskrivelse && !o.bildeFil && !o.wikiTittel ? 5 : 0);
  return Math.min(100, r);
}

const KVALITETSORD = o => (erKirke(o) ? 'kirke eller kulturminne' : erTur(o) && o.rute.betydning === '1' ? 'nasjonal turrute' : erTur(o) && o.rute.betydning === '2' ? 'regional turrute'
  : (o.kat || []).some(t => t.sterk) && !o.rute ? 'sterkt reisemål' : o.rute || (o.hoved || []).includes('friluftsliv') ? 'turområde' : 'reisemål');
/** Korte, ærlige ord for det som faktisk bidro. Aldri et tall. */
function forklar(o, f, kontekst) {
  const d = [KVALITETSORD(o)];
  if (wikiScore(o.sitelinks) >= 60) d.push('mye omtalt'); else if ((o.sitelinks || 0) === 0 && !erTur(o) && f.kvalitet >= 50) d.push('lokal favoritt');
  const g = kontekst.gang;
  if (kontekst.tilgang === 'enkel') d.push('enkel tilgang'); else if (kontekst.tilgang === 'mulig') d.push('mulig tilgang');
  if (g && g.kilde === 'målt') d.push(g.min + ' min å gå'); else if (f.risiko >= 20) d.push('gange ikke målt');
  return d.join(' · ');
}

/**
 * @param o        en opplevelse (opplevelserVed): rute, kat, hoved, under, sitelinks, luft, kilder …
 * @param kontekst valgfritt: { posisjon, reise:{min,bytter,bestilling,ugyldig}, gang:{kilde,min,m}, tilgang:'enkel'|'mulig'|'krevende'|'ukjent',
 *                 avvik:[…], rating, reviews, kilde }. Rating vises aldri uten `kilde`.
 * @returns { total, trinn, faktorer:{kvalitet,popularitet,tilgang,nærhet,risiko}, forklaring }
 */
export function scoreOpplevelse(o, kontekst = {}) {
  const k = kontekst || {};
  const f = { kvalitet: kvalitet(o), popularitet: Math.round(popularitet(o, k)), tilgang: tilgangScore(k.tilgang), nærhet: nærhet(o, k.gang), risiko: risiko(o, k) };
  const V = SCORE_VEKTER;
  const total = Math.max(0, Math.round(V.kvalitet * f.kvalitet + V.popularitet * f.popularitet + V.tilgang * f.tilgang + V.nærhet * f.nærhet - V.risiko * f.risiko));
  return { total, trinn: trinnFor(o), faktorer: f, forklaring: forklar(o, f, k) };
}
