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
      continue;
    }
    unike.push({ navn: c.navn, lat: c.lat, lon: c.lon, luft, flate: !!c.flate, kat: [...c.kat], kilder: [c], wikidata: c.wikidata || null, sitelinks: c.sitelinks || 0, rute: c.rute || null, verdi: c.verdi || null });
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
 * Hvilke to som vises på raden. Rekkefølge, ingen poengsum:
 * nasjonal eller regional turrute, sterkt reisemål (ikke kirke), andre turruter
 * og friluftsområder, resten — kirker sist (én i hver bydel, se rapporten §8).
 * Innen samme trinn: nærmest først. Ren.
 */
export function velgVisning(liste, n = 2) {
  const kirke = o => o.under.every(u => u === 'kirke' || u === 'kulturminne');
  // Sykkelruter følger ofte bygater (sett: «Pilegrimsruta · nasjonal sykkelrute» ved tre bystopp i Oslo):
  // de står med de andre rutene, ikke øverst.
  const tur = o => o.rute && o.rute.type !== 'Sykkelrute';
  const trinn = o => (tur(o) && o.rute.betydning === '1') ? 0
    : ((tur(o) && o.rute.betydning === '2') || (!kirke(o) && o.kat.some(t => t.sterk) && !o.rute)) ? 1
    : (o.rute || o.hoved.includes('friluftsliv')) ? 2 : kirke(o) ? 4 : 3;
  // Innen samme trinn: kjentest først (språkversjoner i Wikidata), så nærmest (sett: Leangen gård foran Ringve Musikkmuseum).
  const sortert = (liste || []).slice().sort((a, b) => trinn(a) - trinn(b) || (b.sitelinks || 0) - (a.sitelinks || 0) || a.luft - b.luft);
  // Høyst én rute når det finnes noe annet: to pilegrimsleder på rad sier mindre enn led + marka.
  const ut = [];
  for (const o of sortert) {
    if (ut.length >= n) break;
    if (o.rute && ut.some(x => x.rute) && sortert.some(x => !x.rute && !ut.includes(x) && trinn(x) < 4)) continue;
    ut.push(o);
  }
  for (const o of sortert) if (ut.length < n && !ut.includes(o)) ut.push(o);
  return ut;
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
