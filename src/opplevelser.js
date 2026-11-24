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
  [/park|garden|hage/i, 'park', 'park'], [/beach|strand|badeplass/i, 'bading', 'strand'], [/zoo|dyrepark|amusement|fornøyelses|aquarium/i, 'attraksjon', 'attraksjon'],
  [/castle|borg|fortress|festning|fort\b|ruin/i, 'severdighet', 'borg/ruin'], [/monument|statue|skulptur|sculpture|memorial/i, 'severdighet', 'monument'], [/tourist attraction|turistattraksjon|viewpoint|utsikt/i, 'severdighet', 'attraksjon'], [/ski resort|skisenter|ski jump|hoppbakke/i, 'attraksjon', 'skisenter']];


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
