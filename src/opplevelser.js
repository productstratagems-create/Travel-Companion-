/**
 * OPPLEVELSER VED STEDENE (v1.218.311, kategorimodellen — ingen skjerm ennå).
 *
 * Bestilt: utvid «ett bytte» fra «hvor kan jeg reise» til «hvilke steder og
 * opplevelser kan jeg nå». Grunnlaget er docs/tracer-opplevelser.md: ekte
 * Entur-opptak (fire utgangspunkter) og ekte svar fra OpenStreetMap, Wikidata,
 * Kartverket (stedsnavn) og Miljødirektoratet (kartlagte friluftslivsområder).
 *
 * Denne modulen er DEN ENE definisjonen av mappingen fra kildenes tagger og
 * typer til appens egen kategori (`opplevelseskategori`) — brukt av traceren
 * (scratchpad/tracerOpplevelser.mjs) og senere av skjermen. Ren: ingen kall,
 * ingen DOM. Leverandørens kategorier vises aldri direkte for brukeren.
 *
 * Et stoppested er IKKE reisemålet: Sognsvann stasjon gir tilgang til
 * Sognsvann (vann, badeplass, friluftsområde). Modellen skiller dem — se
 * `opplevelse()` og rapportens §8.
 */
import { metresBetween } from './haversine.js';
import { scoreOpplevelse, trinnFor, erKirke } from './opplevelserScore.js';
/** Hovedkategoriene (arbeidshypotesen fra oppdraget, prøvd i traceren). */
export const KATEGORIER = { friluftsliv: 'Friluftsliv og utfart', natur: 'Natur og landskap', severdighet: 'Severdigheter og landemerker', attraksjon: 'Attraksjoner og opplevelser', kultur: 'Kultur og historie', bading: 'Bading og vannaktiviteter', park: 'Parker og rekreasjon' };
// OSM: tagg=verdi → [kategori, underkategori, sterk]. Sterk = kan være et selvstendig reisemål.
export const OSM_MAP = {
  'tourism=viewpoint': ['natur', 'utsiktspunkt', true], 'tourism=attraction': ['severdighet', 'attraksjon', true],
  'tourism=museum': ['kultur', 'museum', true], 'tourism=gallery': ['kultur', 'galleri', true], 'tourism=artwork': ['kultur', 'kunstverk', false],
  'tourism=zoo': ['attraksjon', 'dyrepark', true], 'tourism=aquarium': ['attraksjon', 'akvarium', true], 'tourism=theme_park': ['attraksjon', 'fornøyelsespark', true],
  'tourism=wilderness_hut': ['friluftsliv', 'hytte', true], 'tourism=alpine_hut': ['friluftsliv', 'hytte', true], 'tourism=picnic_site': ['friluftsliv', 'rasteplass', false], 'tourism=camp_site': ['friluftsliv', 'teltplass', false],
  'leisure=nature_reserve': ['natur', 'naturreservat', true], 'leisure=park': ['park', 'park', false], 'leisure=garden': ['park', 'hage', false],
  'leisure=bathing_place': ['bading', 'badeplass', true], 'leisure=swimming_area': ['bading', 'badeplass', true], 'leisure=water_park': ['attraksjon', 'badeland', true], 'leisure=beach_resort': ['bading', 'strand', true],
  'leisure=marina': ['bading', 'brygge', false], 'leisure=slipway': ['bading', 'båtutsett', false],
  'natural=peak': ['natur', 'topp', true], 'natural=waterfall': ['natur', 'foss', true], 'waterway=waterfall': ['natur', 'foss', true], 'natural=beach': ['bading', 'strand', true],
  'natural=water': ['natur', 'vann', false], 'natural=cave_entrance': ['natur', 'grotte', true], 'natural=cliff': ['natur', 'stup', false],
  'historic=castle': ['severdighet', 'borg', true], 'historic=fort': ['severdighet', 'festning', true], 'historic=ruins': ['severdighet', 'ruin', true], 'historic=archaeological_site': ['kultur', 'fornminne', false],
  'historic=monument': ['severdighet', 'monument', false], 'historic=memorial': ['severdighet', 'minnesmerke', false], 'historic=church': ['kultur', 'historisk kirke', true], 'historic=manor': ['kultur', 'herregård', true], 'historic=building': ['kultur', 'historisk bygning', false],
  'amenity=theatre': ['kultur', 'teater', true], 'amenity=arts_centre': ['kultur', 'kulturhus', true], 'amenity=shelter': ['friluftsliv', 'gapahuk', false],
};
// Støy: kjent ikke-reisemål selv om taggen ligner. Vist som negative eksempler i rapporten.
export const OSM_STØY = new Set(['tourism=information', 'leisure=picnic_table', 'leisure=firepit', 'leisure=playground', 'leisure=pitch', 'leisure=fitness_station', 'leisure=sports_centre', 'leisure=track', 'historic=boundary_stone', 'historic=charcoal_pile', 'historic=wayside_cross', 'amenity=bench', 'leisure=dog_park', 'leisure=outdoor_seating', 'tourism=hotel', 'tourism=guest_house', 'tourism=apartment']);
// Kartverket navneobjekttype → kategori (bare de som kan være turmål).
export const KV_MAP = { 'Topp': ['natur', 'topp'], 'Fjell': ['natur', 'fjell'], 'Vann': ['natur', 'vann'], 'Innsjø': ['natur', 'vann'], 'Foss': ['natur', 'foss'], 'Utsiktspunkt': ['natur', 'utsiktspunkt'], 'Strand': ['bading', 'strand'], 'Badeplass': ['bading', 'badeplass'], 'Hytte': ['friluftsliv', 'hytte'], 'Turisthytte': ['friluftsliv', 'hytte'], 'Severdighet': ['severdighet', 'severdighet'], 'Museum': ['kultur', 'museum'], 'Fornminne': ['kultur', 'fornminne'], 'Park': ['park', 'park'], 'Friluftsområde': ['friluftsliv', 'friluftsområde'], 'Øy': ['natur', 'øy'] };
// Wikidata P31-etikett (nb/en) → kategori. Grovt, så sitelinks må være med.
export const WD_MAP = [[/innsjø|lake|tjern/i, 'natur', 'vann'], [/fjell|mountain|hill|topp|ås\b/i, 'natur', 'topp'], [/foss|waterfall/i, 'natur', 'foss'], [/naturreservat|nature reserve|national park|nasjonalpark/i, 'natur', 'naturreservat'],
  [/museum/i, 'kultur', 'museum'], [/kirke|church|kapell|chapel/i, 'kultur', 'kirke'], [/kulturminne|listed building|fredet|heritage|historic/i, 'kultur', 'kulturminne'], [/teater|theatre|concert hall|konserthus/i, 'kultur', 'kulturarena'],
[/beach|strand|badeplass/i, 'bading', 'strand'], [/zoo|dyrepark|amusement|fornøyelses|aquarium/i, 'attraksjon', 'attraksjon'],
  [/castle|borg|fortress|festning|fort\b|ruin/i, 'severdighet', 'borg/ruin'], [/park|garden|hage/i, 'park', 'park'], [/monument|statue|skulptur|sculpture|memorial/i, 'severdighet', 'monument'], [/tourist attraction|turistattraksjon|viewpoint|utsikt/i, 'severdighet', 'attraksjon'], [/ski resort|skisenter|ski jump|hoppbakke/i, 'attraksjon', 'skisenter']];


/** Holdeplasser, skoler og gater er ikke reisemål, og «trikkestopp» traff /topp/ (sett: «Ljabru holdeplass | topp»). */
export const WD_UTELAT = /holdeplass|stasjon|station|stop|skole|school|\bgate\b|street|road|\bvei\b/i;
/**
 * Miljødirektoratets verdi («svært viktig») gjelder nærmiljøet, ikke om stedet
 * er et reisemål (sett: skolegårder, snarveier, gang- og sykkelveier). Bare
 * områdetyper man reiser TIL regnes som sterke.
 */
export const MD_REISEMÅL = /^(Utfartsområde|Stort turområde|Marka|Særlig kvalitetsområde|Strandsone)/;
/** Wikidata: språkversjoner som kreves for et sterkt signal. Kirker og kulturminner finnes i hver bydel. */
export const WD_SITELINKS = { standard: 2, kultur: 3 };

/** Én kategori-treff: { kv, k (hovedkategori), u (underkategori), sterk }. */
const treff = (kv, k, u, sterk) => ({ kv, k, u, sterk: !!sterk });

/** OSM-tagger → { kat: [...], støy: [...] }. Ren. */
export function klassifiserOsm(tags) {
  const kvs = Object.entries(tags || {}).map(([k, v]) => k + '=' + v);
  return { kat: kvs.filter(kv => OSM_MAP[kv]).map(kv => treff(kv, ...OSM_MAP[kv])), støy: kvs.filter(kv => OSM_STØY.has(kv)) };
}
/** Wikidata P31-etiketter («innsjø|lake») og språkversjoner → treff, eller [] for holdeplasser o.l. Ren. */
export function klassifiserWikidata(typer, sitelinks) {
  if (!typer || WD_UTELAT.test(typer)) return [];
  return WD_MAP.filter(([re]) => re.test(typer)).map(([, k, u]) => treff('P31:' + u, k, u, (sitelinks || 0) >= (k === 'kultur' && u !== 'museum' ? WD_SITELINKS.kultur : WD_SITELINKS.standard)));
}
/** Kartverkets navneobjekttype → treff (aldri sterkt alene). Ren. */
export function klassifiserKartverket(type) {
  const m = KV_MAP[type];
  return m ? [treff('type:' + type, m[0], m[1], false)] : [];
}
/** Miljødirektoratets områdetype og verdi → treff. Ren. */
export function klassifiserFriluft(type, verdi) {
  const k = /bade|strand/i.test(type || '') ? 'bading' : /park|grønt|byrom/i.test(type || '') ? 'park' : 'friluftsliv';
  return [treff('friluft:' + type, k, (type || '').toLowerCase(), MD_REISEMÅL.test(type || '') && /Svært viktig|Viktig/.test(verdi || ''))];
}
/**
 * Er stedet et selvstendig reisemål? Et sterkt treff, eller to UAVHENGIGE
 * kilder. Wikidata med færre enn 2 språkversjoner teller ikke som uavhengig:
 * norske steder der er i stor grad importert fra Kartverkets register (sett:
 * «Fossholtet», «Delerudåsen»). Ren.
 * @param kilder [{ kilde: 'osm'|'wikidata'|'kartverket'|'miljodir', kat: [...], sitelinks? }]
 */
export function erReisemål(kilder) {
  const uavh = new Set((kilder || []).filter(c => c.kilde !== 'wikidata' || (c.sitelinks || 0) >= WD_SITELINKS.standard).map(c => c.kilde));
  return (kilder || []).some(c => (c.kat || []).some(t => t.sterk)) || uavh.size >= 2;
}

/* ── KARTVERKETS TURRUTEBASE (v1.218.313, steg 1) ─────────────────────────
 * Kodene er fra produktspesifikasjonen (Tur- og friluftsruter 20171210) og
 * WFS-skjemaet — docs/tracer-opplevelser.md §13. CC BY 4.0, «© Kartverket». */
export const RUTEBETYDNING = Object.freeze({ 1: 'nasjonal', 2: 'regional', 3: 'lokal' });
export const GRADERING = Object.freeze({ G: 'grønn', B: 'blå', R: 'rød', S: 'svart' });
export const SPESIAL_RUTE = Object.freeze({ HF: 'historisk ferdselsvei', KY: 'kyststi', KT: 'kultursti', NT: 'natursti', TR: 'trimløype', HL: 'tilrettelagt løype' });
export const RUTETYPE_ORD = Object.freeze({ Fotrute: 'turrute', Skiløype: 'skiløype', Sykkelrute: 'sykkelrute', AnnenRute: 'turrute' });
/** Tilrettelegging i `RuteInfoPunkt`: noen er turmål, resten er fasiliteter som står som fakta. */
export const TILRETTELEGGING = Object.freeze({
  41: { navn: 'badeplass', k: 'bading', sterk: true }, 38: { navn: 'baderampe', k: 'bading' }, 30: { navn: 'stupebrett', k: 'bading' },
  46: { navn: 'utsiktspunkt', k: 'natur', sterk: true }, 50: { navn: 'severdighet', k: 'severdighet', sterk: true }, 51: { navn: 'kulturminne', k: 'kultur', sterk: true },
  42: { navn: 'betjent hytte', k: 'friluftsliv', sterk: true }, 43: { navn: 'selvbetjent hytte', k: 'friluftsliv', sterk: true }, 44: { navn: 'ubetjent hytte', k: 'friluftsliv', sterk: true },
  12: { navn: 'hytte', k: 'friluftsliv' }, 45: { navn: 'gapahuk', k: 'friluftsliv' }, 32: { navn: 'teltplass', k: 'friluftsliv' },
  35: { navn: 'toalett', fasilitet: true }, 7: { navn: 'bålplass', fasilitet: true }, 14: { navn: 'kiosk', fasilitet: true }, 22: { navn: 'parkering', fasilitet: true }, 4: { navn: 'benker', fasilitet: true },
});

/** En turrute → treff. Navngitt (ikke «Ukjent») er et turmål i seg selv. Ren. */
export function klassifiserTurrute(r) {
  if (!r) return [];
  const navngitt = !!(r.navn && r.navn !== 'Ukjent');
  return [treff('rute:' + (r.type || ''), 'friluftsliv', RUTETYPE_ORD[r.type] || 'turrute', navngitt)];
}
/** Et punkt i turrutebasen → treff (tom for fasiliteter). Ren. */
export function klassifiserTilrettelegging(kode) {
  const t = TILRETTELEGGING[kode];
  return t && t.k ? [treff('tilrettelegging:' + kode, t.k, t.navn, t.sterk)] : [];
}

/* ── FRA KANDIDATER TIL OPPLEVELSER ───────────────────────────────────── */
/** Avstand i meter: appens ene haversine (src/haversine.js — formelen har ett hjem). */
export const avstandM = (a, b) => metresBetween(a, b);
export const normNavn = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Lenger unna enn dette (luftlinje til stedets nærmeste punkt) regnes ikke som «ved stoppet». */
export const OPPLEVELSE_MAKS_M = 1500;

/**
 * Slå sammen kandidater fra alle kilder til steder: samme Wikidata-id (også
 * via OSM-taggen), eller samme navn innen 400 m. Punktet er det nærmeste
 * stoppet. Ren. Brukes av traceren og av appen (én definisjon).
 * @param kandidater [{ kilde, sid, navn, lat, lon, kat:[treff], sitelinks?, wikidata?, rute?, ... }]
 */
export function slåSammen(kandidater, stopp) {
  const unike = [];
  for (const c of (kandidater || []).filter(c => c.navn && c.navn !== 'Ukjent' && Number.isFinite(c.lat))) {
    const luft = avstandM(stopp, c);
    const lik = unike.find(u => (u.wikidata && c.kilde === 'wikidata' && u.wikidata === c.sid) || (c.wikidata && u.kilder.some(x => x.kilde === 'wikidata' && x.sid === c.wikidata))
      || (normNavn(u.navn) === normNavn(c.navn) && (avstandM(u, c) < 400 || (u.rute && c.rute))));
    // En rute er en linje: ledd med samme navn er samme rute uansett avstand (sett: «Storkjølla» tre ganger).
    if (lik) {
      lik.kilder.push(c); lik.kat.push(...c.kat);
      if (luft < lik.luft) { lik.luft = luft; lik.lat = c.lat; lik.lon = c.lon; }
      lik.wikidata = lik.wikidata || c.wikidata || null; lik.sitelinks = Math.max(lik.sitelinks, c.sitelinks || 0);
      lik.rute = slåSammenRute(lik.rute, c.rute); lik.verdi = lik.verdi || c.verdi || null;
      lik.beskrivelse = lik.beskrivelse || c.beskrivelse || null;
      lik.bildeFil = lik.bildeFil || c.bildeFil || null; lik.wikiTittel = lik.wikiTittel || c.wikiTittel || null; lik.omraade = lik.omraade || c.omraade || null; lik.info = lik.info || c.info || null;
      if (c.kilde === 'wikidata' && !lik.qid) lik.qid = c.sid;
      continue;
    }
    unike.push({ navn: c.navn, lat: c.lat, lon: c.lon, luft, flate: !!c.flate, kat: [...c.kat], kilder: [c], wikidata: c.wikidata || null, sitelinks: c.sitelinks || 0, rute: c.rute || null, verdi: c.verdi || null, beskrivelse: c.beskrivelse || null,
      bildeFil: c.bildeFil || null, wikiTittel: c.wikiTittel || null, omraade: c.omraade || null, info: c.info || null, qid: c.kilde === 'wikidata' ? c.sid : null });
  }
  return unike;
}

/** To ruteledd → én rute: høyeste betydning (1 nasjonal), første spesialtype og gradering. Ren. */
function slåSammenRute(a, b) {
  if (!a || !b) return a || b || null;
  const best = [a.betydning, b.betydning].filter(Boolean).sort()[0] || null;
  return { ...a, betydning: best, spesial: a.spesial || b.spesial || null, gradering: a.gradering || b.gradering || null };
}
/** Opplevelsene ved et stopp: sammenslått, bare reisemål, innen OPPLEVELSE_MAKS_M, nærmeste først. Ren. */
export function opplevelserVed(kandidater, stopp) {
  return slåSammen(kandidater, stopp)
    .filter(u => erReisemål(u.kilder) && u.luft <= OPPLEVELSE_MAKS_M)
    .map(u => ({ ...u, hoved: [...new Set(u.kat.map(t => t.k))], under: [...new Set(u.kat.map(t => t.u))] }))
    .sort((a, b) => a.luft - b.luft);
}

/**
 * Dagens rekkefølge (standard, uendret): trinn, så kjentest (Wikidata-språkversjoner), så nærmest. Ren.
 * Kirker sist (én i hver bydel, se rapporten §8). Leser `trinnFor` fra src/opplevelserScore.js.
 */
export const dagensRekkefølge = (a, b) => trinnFor(a) - trinnFor(b) || (b.sitelinks || 0) - (a.sitelinks || 0) || a.luft - b.luft;

/**
 * Velg `n` fra en allerede sortert liste. Alltid: høyst én rute når noe annet finnes (to pilegrimsleder på rad
 * sier mindre enn led + marka). `utvidet` (bare med score): høyst én kirke/kulturminne, ikke to nesten like
 * steder (samme navn eller innen 150 m) når andre finnes. Ren.
 */
export function velgMedVariasjon(sortert, n, utvidet = false) {
  const ut = [], annet = x => sortert.some(y => y !== x && !ut.includes(y) && !y.rute && trinnFor(y) < 4);
  const lik = (a, b) => normNavn(a.navn) === normNavn(b.navn) || (Number.isFinite(a.lat) && Number.isFinite(b.lat) && avstandM(a, b) < 150);
  for (const o of sortert) {
    if (ut.length >= n) break;
    if (o.rute && ut.some(x => x.rute) && sortert.some(x => !x.rute && !ut.includes(x) && trinnFor(x) < 4)) continue;
    if (utvidet) {
      if (erKirke(o) && ut.some(erKirke) && sortert.some(x => !erKirke(x) && !ut.includes(x))) continue;
      if (ut.some(x => lik(x, o)) && sortert.some(x => !ut.includes(x) && !ut.some(y => lik(y, x)))) continue;
    }
    ut.push(o);
  }
  for (const o of sortert) if (ut.length < n && !ut.includes(o)) ut.push(o);
  return ut;
}

/**
 * Hvilke som vises på raden (høyst `n`). Uten `kontekst`: dagens rekkefølge, nøyaktig som før.
 * Med `kontekst` (se `scoreOpplevelse`): sortert etter forklarbar score — kvalitet, popularitet, tilgang,
 * nærhet og risiko — og velges deretter med variasjonsreglene. Score påvirker aldri HVILKE som finnes, bare
 * rekkefølgen. Ren.
 */
export function velgVisning(liste, n = 2, kontekst = null) {
  const kopi = (liste || []).slice();
  if (!kontekst) return velgMedVariasjon(kopi.sort(dagensRekkefølge), n, false);
  // gangFor/tilgangFor: per opplevelse (gangen og reisen er ikke lik for alle); ellers felles verdi.
  const medScore = kopi.map(o => ({ ...o, score: scoreOpplevelse(o, { ...kontekst, gang: kontekst.gangFor ? kontekst.gangFor(o) : kontekst.gang, tilgang: kontekst.tilgangFor ? kontekst.tilgangFor(o) : kontekst.tilgang }) }));
  medScore.sort((a, b) => b.score.total - a.score.total || dagensRekkefølge(a, b));
  return velgMedVariasjon(medScore, n, true);
}
/** Kontekst for score fra datagrunnlaget kortet alt har kontrollert (`grunnlag`). Ren. */
export function scoreKontekst(g, ekstra = {}) {
  return { reise: g && g.reise ? { min: g.reise.min, bytter: g.reise.bytter, bestilling: g.reise.bestilling, ugyldig: g.reise.ugyldig } : null,
    gang: g && g.gang, tilgang: g && g.reise && g.gang ? tilgang(g.reise, g.gang).ord : 'ukjent', avvik: (g && g.avvik) || [], ...ekstra };
}

/** Underkategoriens ord på raden: «nasjonal turrute», «historisk ferdselsvei», «museum». Ren. */
export function hvaTekst(o) {
  if (o.rute) {
    const b = RUTEBETYDNING[o.rute.betydning];
    return [b ? b + ' ' + (RUTETYPE_ORD[o.rute.type] || 'turrute') : (RUTETYPE_ORD[o.rute.type] || 'turrute'), SPESIAL_RUTE[o.rute.spesial], GRADERING[o.rute.gradering] && GRADERING[o.rute.gradering] + ' gradering'].filter(Boolean).join(' · ');
  }
  const u = o.under.find(x => x && !/^leke|grønnkorridor|nærtur/.test(x)) || o.under[0] || '';
  return u;
}
/** Avstanden i radens språk. Gangtid bare når den er målt; ellers «ca. N m» — aldri en påstått gangtid. Ren. */
export function avstandTekst(o, gang) {
  if (gang && Number.isFinite(gang.min)) return gang.min <= 1 ? 'ved stoppet' : gang.min + ' min å gå';
  if (o.luft <= 100) return 'ved stoppet';
  return 'ca. ' + Math.round(o.luft / 50) * 50 + ' m';
}
/** Fasiliteter innen 300 m av opplevelsens punkt: «toalett · bålplass». Ren. */
export function fasiliteterVed(o, punkter, maksM = 300) {
  return [...new Set((punkter || []).filter(p => TILRETTELEGGING[p.kode] && TILRETTELEGGING[p.kode].fasilitet && avstandM(o, p) <= maksM).map(p => TILRETTELEGGING[p.kode].navn))];
}

/* ── OPPLEVELSESKORT (v1.218.314) — docs/tracer-opplevelser.md §18 ────────
 * Rene funksjoner: kortet leser reisesøket «ett bytte» alt har gjort, og
 * kontrollerer det før det vises. Ingen egne søk, ingen gjetting. */

/** Fire innganger over de sju kategoriene. Et sted kan høre til flere. */
export const INNGANGER = Object.freeze({ natur: 'Natur og friluftsliv', severdighet: 'Severdigheter', kultur: 'Kultur og historie', aktivitet: 'Aktiviteter og rekreasjon' });
const INNGANG_AV = { natur: 'natur', friluftsliv: 'natur', severdighet: 'severdighet', kultur: 'kultur', bading: 'aktivitet', park: 'aktivitet', attraksjon: 'aktivitet' };
export const innganger = o => [...new Set((o.hoved || []).map(k => INNGANG_AV[k]).filter(Boolean))];

/** Aktiviteter utledet fra kildene — aldri fritekst. Høyst tre. Ren. */
export function aktiviteter(o) {
  const u = (o.under || []).join(' ').toLowerCase(), b = ((o.beskrivelse && o.beskrivelse.tekst) || '').toLowerCase(), ut = [];
  const t = o.rute && o.rute.type;
  if (t === 'Fotrute' || t === 'AnnenRute') ut.push('gåtur');
  if (t === 'Skiløype') ut.push('skitur');
  if (t === 'Sykkelrute') ut.push('sykling');
  if (/marka|turområde|utfart/.test(u)) ut.push('tur i skog og mark');
  if (/\bvann\b|tjern/.test(u)) ut.push('tur til vannet');
  if (/strand|badeplass|strandsone|baderampe/.test(u)) ut.push('bading og strand');
  if (/naturreservat|landskapsvern|kvalitetsområde|utsikt/.test(u)) ut.push('naturopplevelse');
  if (/skisenter|alpin/.test(u) || /alpinsenter/.test(b)) ut.push('ski');
  if (/fornøyelsespark|dyrepark|akvarium/.test(u)) ut.push('familieaktivitet');
  if (/museum|galleri/.test(u)) ut.push('museumsbesøk');
  if (/ruin|borg|festning|kirke|kulturminne|herregård/.test(u)) ut.push('historisk sted');
  if (/teater|kulturhus|kulturarena/.test(u)) ut.push('kulturopplevelse');
  return [...new Set(ut)].slice(0, 3);
}

/** Transportmidlene reisesøket ber om (`transportModesGql`, src/api/queries.js) — og bestillingstransport. */
export const TILLATTE_MODUSER = Object.freeze(['metro', 'bus', 'tram', 'rail', 'water', 'coach']);
export const BESTILLING_MODUS = 'taxi';   // Enturs bestillingstransport (sett: linje 5031 ved Tretten)
const _t = l => Date.parse(l && (l.expectedEndTime || l.aimedEndTime));
const _s = l => Date.parse(l && (l.expectedStartTime || l.aimedStartTime));
const _stoppId = p => (p && p.quay && p.quay.stopPlace && p.quay.stopPlace.id) || (p && p.stopPlace && p.stopPlace.id) || null;

/**
 * Reisen til stoppet fra den valgte reiseplanen (`tp`). Ankomst er siste
 * etappes FAKTISKE ankomst — aldri start + varighet. Gange mellom etapper
 * teller ikke som bytte. Ren.
 * @returns {{ går, framme, min, bytter, linjer:[{kode,modus}], moduser, bestilling, ugyldig:[modus] }|null}
 */
export function reiseTilStoppet(tp) {
  const legs = (tp && tp.legs) || [];
  const kol = legs.filter(l => l && l.mode && l.mode !== 'foot');
  if (!kol.length) return null;
  const går = _s(legs[0]), framme = _t(legs[legs.length - 1]);
  if (!Number.isFinite(går) || !Number.isFinite(framme)) return null;
  const moduser = kol.map(l => l.mode);
  return { går, framme, min: Math.round((framme - går) / 60000), bytter: kol.length - 1,
    linjer: kol.map(l => ({ kode: (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || (l.line && l.line.publicCode) || l.mode, modus: l.mode })),
    moduser, bestilling: moduser.includes(BESTILLING_MODUS), ugyldig: moduser.filter(m => !TILLATTE_MODUSER.includes(m) && m !== BESTILLING_MODUS) };
}

/** Gange fra stoppet: målt (Valhalla, langs linja) eller bare luftlinje. Aldri en påstått gangtid. Ren. */
export function gangFraStopp(gang, luftM) {
  if (gang && Number.isFinite(gang.min) && Number.isFinite(gang.m)) return { kilde: 'målt', min: gang.min, m: gang.m };
  if (Number.isFinite(luftM)) return { kilde: 'luftlinje', luftM: Math.round(luftM) };
  return { kilde: 'ingen' };
}

/** Søkealder: eldre enn dette hentes reisen på nytt (samme som SJEKK_GYLDIG_MS i ett bytte). */
export const GRUNNLAG_GYLDIG_MS = 10 * 60_000;
/**
 * KONTROLL AV DATAGRUNNLAGET (presisering 5, 25.11). Kortet leser oppslaget
 * «ett bytte» alt har gjort for stedet og sjekker: startpunkt, målestopp,
 * valgt reiseplan, søketidspunkt, transportmidler og type gangmåling. Avvik
 * gir tom reiseverdi — aldri en gjetning. Ren.
 * @param oppslag { status, søkt, fra:{lat,lon}, tps }  (lagret av sjekkSted)
 * @param sted    { id, navn, lat, lon }
 * @param plan    den valgte reiseraden ({ tp }) — samme som reiseraden viser
 */
export function grunnlag(oppslag, sted, plan, gang, nå = Date.now()) {
  const avvik = [];
  if (!oppslag || oppslag.status !== 'ok') return { ok: false, avvik: ['ingen søk'], reise: null, gang: gangFraStopp(null, null), søkt: null, fra: null };
  if (!oppslag.fra || !Number.isFinite(oppslag.fra.lat)) avvik.push('startpunkt mangler');
  if (!Number.isFinite(oppslag.søkt)) avvik.push('søketidspunkt mangler');
  else if (nå - oppslag.søkt > GRUNNLAG_GYLDIG_MS) avvik.push('søket er gammelt');
  let reise = plan && plan.tp ? reiseTilStoppet(plan.tp) : null;
  if (reise) {
    if (reise.ugyldig.length) { avvik.push('transportmiddel: ' + reise.ugyldig.join(', ')); reise = null; }
  }
  if (reise) {
    // Målestopp: reisen må ende ved stedet den ble søkt til.
    const legs = plan.tp.legs, siste = legs[legs.length - 1].toPlace || {};
    const id = _stoppId(siste), navn = siste.name;
    const samme = (id && id === sted.id) || (navn && normNavn(navn) === normNavn(sted.navn));
    if (!samme && (id || navn)) { avvik.push('målestopp: ' + (navn || id)); reise = null; }
  }
  return { ok: avvik.length === 0, avvik, reise, gang, søkt: oppslag.søkt || null, fra: oppslag.fra || null, plan: plan || null };
}

/**
 * FRAMME CA. (presisering 2): ankomst ved stoppet fra reiseplanen, pluss
 * MÅLT gange fra det samme stoppet — rundet opp til hele minutter. Mangler
 * eller avviker en del: null. Tallene summeres aldri til et antall minutter. Ren.
 */
export function samletTid(g) {
  if (!g || !g.reise || !g.gang || g.gang.kilde !== 'målt') return null;
  if (g.avvik && g.avvik.some(a => /^målestopp|^transportmiddel/.test(a))) return null;
  const ms = g.reise.framme + g.gang.min * 60_000;
  return { framme: Math.ceil(ms / 60_000) * 60_000, omtrent: true };
}

/** TILGANG (hypotese, presisering 3): justerbare grenser. Påvirker aldri utvalg eller rekkefølge. */
export const TILGANG_GRENSER = Object.freeze({ enkel: Object.freeze({ reiseMin: 45, bytter: 1, gangMin: 15 }), mulig: Object.freeze({ reiseMin: 120, bytter: 2, gangMin: 25 }) });
/** → { ord: 'enkel'|'mulig'|'krevende'|'ukjent', verdier: tekst }. Uten reise eller målt gange: «ukjent». Ren. */
export function tilgang(reise, gang, grenser = TILGANG_GRENSER) {
  if (!reise || !gang || gang.kilde !== 'målt') return { ord: 'ukjent', verdier: reise ? reiseVerdier(reise) + ', gange ikke målt' : 'ingen reise i søket' };
  if (reise.bestilling) return { ord: 'ukjent', verdier: reiseVerdier(reise) + ', bestillingstransport' };
  const v = reiseVerdier(reise) + ', ' + gang.min + ' min gange';
  const innen = gr => reise.min <= gr.reiseMin && reise.bytter <= gr.bytter && gang.min <= gr.gangMin;
  return { ord: innen(grenser.enkel) ? 'enkel' : innen(grenser.mulig) ? 'mulig' : 'krevende', verdier: v };
}
const reiseVerdier = r => varighet(r.min) + ', ' + (r.bytter === 0 ? 'uten bytte' : r.bytter + (r.bytter === 1 ? ' bytte' : ' bytter'));
export const varighet = m => (m >= 60 ? Math.floor(m / 60) + ' t ' + (m % 60) + ' min' : m + ' min');

const _oslo = (ms, o) => new Date(ms).toLocaleString('nb-NO', { timeZone: 'Europe/Oslo', ...o });
export const klokke = ms => _oslo(ms, { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
/** Søketidspunktet med dato og klokkeslett (presisering 1): «onsdag 25.11. kl. 10.00». Ren. */
export function søkTekst(ms) {
  if (!Number.isFinite(ms)) return '';
  const dag = _oslo(ms, { weekday: 'long' }), dato = _oslo(ms, { day: '2-digit', month: '2-digit' }).replace(/\.?$/, '.');
  return dag + ' ' + dato + ' kl. ' + klokke(ms);
}

/**
 * Alt kortet viser, uten HTML — liste og kart leser det samme. Ren.
 * @param o  en opplevelse fra opplevelserVed (med beskrivelse når Wikidata har den)
 */
export function kortData(o, g, punkter = [], berik = null) {
  const reise = g && g.reise, gang = (g && g.gang) || gangFraStopp(null, o.luft);
  return {
    navn: o.navn, hva: hvaTekst(o), innganger: innganger(o), aktiviteter: aktiviteter(o),
    // En beskrivelse som bare gjentar typen («park» under «park») sier ingenting.
    beskrivelse: o.beskrivelse && normNavn(o.beskrivelse.tekst) !== normNavn(hvaTekst(o)) ? o.beskrivelse : null,
    hvorfor: hvorforTekst(o, berik),
    bilde: (berik && berik.bilde) || null,
    lesMer: (berik && berik.ingress && berik.ingress.url) || null,
    lat: o.lat, lon: o.lon,
    reise: reise ? { tekst: varighet(reise.min) + ' · ' + (reise.bytter === 0 ? 'uten bytte' : reise.bytter + (reise.bytter === 1 ? ' bytte' : ' bytter')), bestilling: reise.bestilling } : null,
    gang: gang.kilde === 'målt' ? { tekst: gang.min + ' min', type: 'målt' }
      // Under 100 m i luftlinje: «ved stoppet» (sett: «ca. 0 m»).
      : gang.kilde === 'luftlinje' ? (gang.luftM <= 100 ? { tekst: 'ved stoppet', type: 'luftlinje' } : { tekst: 'ca. ' + Math.round(gang.luftM / 50) * 50 + ' m', type: 'luftlinje' }) : { tekst: '–', type: 'ingen' },
    framme: (t => (t ? 'framme ca. ' + klokke(t.framme) : null))(samletTid(g)),
    tilgang: tilgang(reise, gang),
    fasiliteter: fasiliteterVed(o, punkter),
    kilder: [...new Set(o.kilder.map(c => ({ turrute: 'Kartverket', miljodir: 'Miljødirektoratet', wikidata: 'Wikidata' })[c.kilde] || c.kilde))],
    avvik: (g && g.avvik) || [],
    // Forklaringen (aldri tallet) når valget er gjort etter score (v1.218.325).
    forklaring: (o.score && o.score.forklaring) || null,
  };
}

/* ── STEDET SELGES (v1.218.315) — bilde, ingress og kreditering ───────────
 * Kilder: Wikipedia (ingress, CC BY-SA) og Wikimedia Commons (bilde, med
 * fotograf og lisens). Utprøvd kortmønster: bilde først, navn og kategori,
 * én setning om hvorfor, faktaknapper, én tydelig handling. Ingen bilde uten
 * fotograf OG lisens — krediteringen er et krav, ikke pynt. */

/** Første setning, høyst `maks` tegn (kuttet ved ord, med «…»). Ren. */
export function førsteSetning(tekst, maks = 160) {
  const t = String(tekst || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // Også punktum rett før stor bokstav (sett: «Lokal badeplass.Vesletjern og …» hos Miljødirektoratet).
  const m = /^(.+?[.!?])(\s|$|(?=[A-ZÆØÅ]))/.exec(t);
  let s = m ? m[1] : t;
  if (s.length > maks) s = s.slice(0, maks).replace(/\s+\S*$/, '') + ' …';
  return s;
}
const _side = j => j && j.query && j.query.pages && Object.values(j.query.pages)[0];
/** Wikipedia (action=query, prop=extracts|info) → { tekst, url, tittel } eller null. Ren. */
export function parseSammendrag(json) {
  const p = _side(json);
  if (!p || p.missing !== undefined || !p.extract) return null;
  return { tekst: førsteSetning(p.extract), url: p.fullurl || ('https://no.wikipedia.org/wiki/' + encodeURIComponent((p.title || '').replace(/ /g, '_'))), tittel: p.title };
}
const _rentekst = h => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
/** Commons (prop=imageinfo, extmetadata) → { url, side, fotograf, lisens, lisensUrl } eller null uten fotograf/lisens. Ren. */
export function parseBildeinfo(json) {
  const p = _side(json), ii = p && p.imageinfo && p.imageinfo[0];
  if (!ii) return null;
  const em = ii.extmetadata || {}, v = k => (em[k] && em[k].value) || '';
  const fotograf = _rentekst(v('Artist')) || _rentekst(v('Credit')), lisens = _rentekst(v('LicenseShortName'));
  const url = ii.thumburl || ii.url;
  if (!url || !fotograf || !lisens) return null;
  return { url, side: ii.descriptionurl || null, fotograf: fotograf.slice(0, 80), lisens, lisensUrl: v('LicenseUrl') || null };
}
/**
 * Hvorfor dra hit — i fast rekkefølge: Wikipedia-ingress, Wikidata-beskrivelse
 * (når den sier mer enn typen), kildenes fakta (turrute, Miljødirektoratet). Ren.
 * @returns {{ tekst, kilde }|null}
 */
export function hvorforTekst(o, berik) {
  if (berik && berik.ingress && berik.ingress.tekst) return { tekst: berik.ingress.tekst, kilde: 'Tekst: Wikipedia' };
  if (o.beskrivelse && normNavn(o.beskrivelse.tekst) !== normNavn(hvaTekst(o))) return { tekst: o.beskrivelse.tekst, kilde: 'Wikidata' + (o.beskrivelse.språk === 'en' ? ' (engelsk)' : '') };
  // Turrutebasens egen tekst om stedet, uten navnet foran (sett: «… - isbading om vinteren, …»).
  if (o.info && normNavn(o.info) !== normNavn(o.navn)) return { tekst: førsteSetning(o.info.replace(/^[^-–.:]*[-–:]\s*/, '').replace(/^./, c => c.toUpperCase()), 200), kilde: 'Kartverket, turrutebasen' };
  if (o.omraade) return { tekst: førsteSetning(o.omraade), kilde: 'Miljødirektoratet' };
  if (o.verdi) return { tekst: o.verdi, kilde: 'Miljødirektoratet' };
  return null;
}


/* UNIKE BESTE PÅ TVERS AV KORTENE (v1.218.323): samme opplevelse skal ikke være «beste» på to kort. */
/** Opplevelsens identitet: Wikidata-id, ellers normalisert navn. Ren. */
export function opplevelseNøkkel(o) {
  if (o && o.qid) return 'q:' + o.qid;
  // Bare navnet: nærmeste punkt/kant på en flate er ulikt fra hvert stopp (sett: «Nøstvetmarka» på to kort).
  return 'n:' + normNavn(o && o.navn);
}
/**
 * Går gjennom kortene i visningsrekkefølge (nær → langt). Hvert kort velger sin beste
 * (`velgVisning`) blant det en tidligere kort ikke alt har tatt; er alt tatt, står kortet uten boks.
 * Samme tilstand gir samme valg. Ren.
 * @param rader        kortene i visningsrekkefølge
 * @param kandidaterFor  r → [opplevelse] (alle kandidatene kortet har)
 * @returns Map<kort, opplevelse>
 */
export function unikeBeste(rader, kandidaterFor, kontekst = null) {
  const tatt = new Set(), ut = new Map();
  for (const r of rader || []) {
    const fri = (kandidaterFor(r) || []).filter(o => !tatt.has(opplevelseNøkkel(o)));
    const best = velgVisning(fri, 1, kontekst)[0];
    if (best) { tatt.add(opplevelseNøkkel(best)); ut.set(r, best); }
  }
  return ut;
}
