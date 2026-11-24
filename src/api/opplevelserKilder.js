/**
 * OPPLEVELSER VED ET STOPP — KILDENE (v1.218.313, steg 1).
 *
 * Tre åpne kilder uten nøkkel, alle med CORS for nettleseren (sjekket 24.11):
 *   Kartverkets turrutebase  wfs.geonorge.no (WFS, alle rutetyper i ett kall)
 *   Miljødirektoratet        kartlagte friluftslivsområder (ArcGIS)
 *   Wikidata                 SPARQL, wikibase:around
 * Grunnlaget og reglene: docs/tracer-opplevelser.md. Mappingen til appens
 * kategorier er i src/opplevelser.js (én definisjon, også for traceren).
 *
 * Hver kilde feiler for seg: svarer bare to, vises det de to fant, og
 * `status` sier hvilke som ikke svarte. Svaret caches per stopp i et døgn
 * (områder og navn endrer seg sjelden; turrutebasen oppdateres ukentlig).
 */
import { fetchMedFrist } from './http.js';
import { fetchWalkRoute } from './route.js';
import { measurePath } from '../ui/path.js';
import { SPEED_MPN } from '../walkSpeed.js';
import { loadWalkSpeed } from '../geo.js';
import { parseSammendrag, parseBildeinfo, klassifiserTurrute, klassifiserTilrettelegging, klassifiserFriluft, klassifiserWikidata, opplevelserVed, avstandM } from '../opplevelser.js';

export const OPPLEVELSE_CACHE_MS = 24 * 3600_000;
const RADIUS_M = 800;
const WFS = 'https://wfs.geonorge.no/skwms1/wfs.turogfriluftsruter';
const MD = 'https://kart.miljodirektoratet.no/arcgis/rest/services/friluftsliv_kartlagt/MapServer/0/query';
const WD = 'https://query.wikidata.org/sparql';
export const RUTETYPER = ['Fotrute', 'Skiløype', 'Sykkelrute', 'AnnenRute'];

const boks = (s, m) => { const dLat = m / 111320, dLon = m / (111320 * Math.cos(s.lat * Math.PI / 180)); return [s.lat - dLat, s.lon - dLon, s.lat + dLat, s.lon + dLon]; };

export function turruteUrl(s) {
  return WFS + '?service=WFS&version=2.0.0&request=GetFeature&count=400&typeNames='
    + [...RUTETYPER, 'RuteInfoPunkt'].map(t => 'app:' + encodeURIComponent(t)).join(',')
    + '&bbox=' + boks(s, RADIUS_M).map(x => x.toFixed(5)).join(',') + ',urn:ogc:def:crs:EPSG::4326';
}
/**
 * WFS-svaret → kandidater (ruter, nærmeste punkt mot stoppet) og punkter
 * (RuteInfoPunkt med tilretteleggingskode). Regex, ikke DOMParser: samme kode
 * i nettleseren og i testene. Ren.
 */
/** Navnet i et `informasjon`-felt: teksten før « - », kolon eller første punktum, høyst 60 tegn. Ren. */
export function infoNavn(info) {
  return String(info || '').split(/\s[-–]\s|[.:](?:\s|$)/)[0].trim().slice(0, 60);
}
export function parseTurruter(xml, stopp) {
  const kandidater = [], punkter = [];
  for (const type of [...RUTETYPER, 'RuteInfoPunkt']) {
    for (const m of String(xml || '').matchAll(new RegExp('<app:' + type + '[ >][\\s\\S]*?</app:' + type + '>', 'g'))) {
      const f = m[0], v = k => ((new RegExp('<app:' + k + '>([^<]*)</app:' + k + '>')).exec(f) || [])[1] || null;
      const tall = [...f.matchAll(/<gml:(?:posList|pos)[^>]*>([^<]+)</g)].flatMap(p => p[1].trim().split(/\s+/).map(Number));
      const pkt = []; for (let i = 0; i + 1 < tall.length; i += 2) pkt.push({ lat: tall[i], lon: tall[i + 1] });
      if (!pkt.length) continue;
      if (type === 'RuteInfoPunkt') {
        const kode = v('tilrettelegging');
        punkter.push({ kode, lat: pkt[0].lat, lon: pkt[0].lon });
        const kat = klassifiserTilrettelegging(kode);
        // `informasjon` er ofte en hel setning (sett: «Angelskjæret badeplass - isbading om vinteren, …»):
        // navnet er det før « - » eller første punktum, resten selger stedet (v1.218.315).
        const info = v('informasjon');
        if (kat.length && info) kandidater.push({ kilde: 'turrute', sid: v('lokalId'), navn: infoNavn(info), info: info.trim(), lat: pkt[0].lat, lon: pkt[0].lon, kat });
        continue;
      }
      const near = pkt.reduce((b, p) => (avstandM(stopp, p) < avstandM(stopp, b) ? p : b), pkt[0]);
      const rute = { type, navn: v('rutenavn'), betydning: v('rutebetydning'), gradering: v('gradering'),
        spesial: v('spesialFotrutetype') || v('spesialSkiløypetype') || v('spesialSykkelrutetype') || v('spesialAnnenrutetype'), merket: v('merking') };
      kandidater.push({ kilde: 'turrute', sid: v('lokalId'), navn: rute.navn, lat: near.lat, lon: near.lon, kat: klassifiserTurrute(rute), rute });
    }
  }
  return { kandidater, punkter };
}

export function friluftUrl(s) {
  return MD + '?' + new URLSearchParams({ geometry: s.lon + ',' + s.lat, geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(RADIUS_M), units: 'esriSRUnit_Meter',
    spatialRel: 'esriSpatialRelIntersects', outFields: 'id,omraadenavn,omraadetype_beskrivelse,omraadeverdi_beskrivelse,omraadebeskrivelse', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0005', f: 'json' });
}
/** Områdene → kandidater med nærmeste punkt på kanten (ikke sentrum). Ren. */
export function parseFriluft(json, stopp) {
  return ((json && json.features) || []).map(f => {
    const a = f.attributes || {}, ringer = (f.geometry && f.geometry.rings) || [];
    let best = null;
    for (const r of ringer) for (const [lon, lat] of r) { const m = avstandM(stopp, { lat, lon }); if (!best || m < best.m) best = { lat, lon, m }; }
    return best && { kilde: 'miljodir', sid: a.id, navn: a.omraadenavn, lat: best.lat, lon: best.lon, kat: klassifiserFriluft(a.omraadetype_beskrivelse, a.omraadeverdi_beskrivelse), verdi: a.omraadeverdi_beskrivelse, omraade: a.omraadebeskrivelse || null };
  }).filter(Boolean);
}

export function wikidataUrl(s) {
  // Beskrivelsen (schema:description) i samme kall (v1.218.314): norsk, ellers engelsk. Valgfri.
  const q = `SELECT ?i ?iLabel (GROUP_CONCAT(DISTINCT ?tL; separator="|") AS ?typer) (MAX(?sl) AS ?sitelinks) (SAMPLE(?c) AS ?koord) (SAMPLE(?bnb) AS ?beskNb) (SAMPLE(?ben) AS ?beskEn) (SAMPLE(?p18) AS ?bilde) (SAMPLE(?art) AS ?wiki) WHERE {
   SERVICE wikibase:around { ?i wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${s.lon} ${s.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1.5" }
   ?i wdt:P31 ?t . ?i wikibase:sitelinks ?sl . ?t rdfs:label ?tL . FILTER(LANG(?tL) = "nb" || LANG(?tL) = "en")
   OPTIONAL { ?i schema:description ?bnb FILTER(LANG(?bnb) = "nb") } OPTIONAL { ?i schema:description ?ben FILTER(LANG(?ben) = "en") }
   OPTIONAL { ?i wdt:P18 ?p18 } OPTIONAL { ?art schema:about ?i ; schema:isPartOf <https://no.wikipedia.org/> }
   SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en". } } GROUP BY ?i ?iLabel LIMIT 200`;
  return WD + '?format=json&query=' + encodeURIComponent(q);
}
/** SPARQL-svaret → kandidater. Ren. */
export function parseWikidata(json) {
  return ((json && json.results && json.results.bindings) || []).map(b => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec((b.koord && b.koord.value) || '');
    const kat = klassifiserWikidata(b.typer && b.typer.value, +(b.sitelinks && b.sitelinks.value));
    if (!m || !kat.length || /^Q\d+$/.test(b.iLabel.value)) return null;
    const beskrivelse = b.beskNb ? { tekst: b.beskNb.value, språk: 'nb' } : b.beskEn ? { tekst: b.beskEn.value, språk: 'en' } : null;
    // Bilde (P18) og norsk Wikipedia-artikkel (v1.218.315): navnene, ikke innholdet — det hentes bare for det som vises.
    const bildeFil = b.bilde ? decodeURIComponent(b.bilde.value.split('/').pop()) : null;
    const wikiTittel = b.wiki ? decodeURIComponent(b.wiki.value.split('/').pop()).replace(/_/g, ' ') : null;
    return { kilde: 'wikidata', sid: b.i.value.split('/').pop(), navn: b.iLabel.value, lat: +m[2], lon: +m[1], kat, sitelinks: +b.sitelinks.value, beskrivelse, bildeFil, wikiTittel };
  }).filter(Boolean);
}

/* ── Henting, med cache per stopp ─────────────────────────────────────── */
const _cache = new Map();   // stopp-id → { tid, løfte }
export function _tømOpplevelser() { _cache.clear(); }
const json = url => fetchMedFrist(url, { headers: { Accept: 'application/json' } }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
const tekst = url => fetchMedFrist(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });

/**
 * Opplevelsene ved et stopp. → { liste, punkter, status: { turrute, miljodir, wikidata } }
 * der status er 'ok' eller 'feil'. `hent` kan injiseres (tester).
 */
export function hentOpplevelser(stopp, { nå = Date.now(), hent = { json, tekst } } = {}) {
  if (!stopp || !stopp.id || !Number.isFinite(stopp.lat)) return Promise.resolve(null);
  const c = _cache.get(stopp.id);
  if (c && nå - c.tid < OPPLEVELSE_CACHE_MS) return c.løfte;
  const løfte = Promise.allSettled([hent.tekst(turruteUrl(stopp)), hent.json(friluftUrl(stopp)), hent.json(wikidataUrl(stopp))]).then(([t, f, w]) => {
    const tr = t.status === 'fulfilled' ? parseTurruter(t.value, stopp) : { kandidater: [], punkter: [] };
    const kandidater = [...tr.kandidater, ...(f.status === 'fulfilled' ? parseFriluft(f.value, stopp) : []), ...(w.status === 'fulfilled' ? parseWikidata(w.value) : [])];
    const status = { turrute: t.status === 'fulfilled' ? 'ok' : 'feil', miljodir: f.status === 'fulfilled' ? 'ok' : 'feil', wikidata: w.status === 'fulfilled' ? 'ok' : 'feil' };
    // Feilet alle tre, huskes det ikke: neste valg prøver igjen.
    if (Object.values(status).every(x => x === 'feil')) _cache.delete(stopp.id);
    return { liste: opplevelserVed(kandidater, stopp), punkter: tr.punkter, status };
  });
  _cache.set(stopp.id, { tid: nå, løfte });
  return løfte;
}

/* Gange stopp → opplevelsens nærmeste punkt: Valhalla, lengden målt på linja (samme regel som walkDist.js). */
const _gang = new Map();
export function hentGang(stopp, o) {
  const k = stopp.id + '|' + o.lat.toFixed(5) + ',' + o.lon.toFixed(5);
  if (!_gang.has(k)) {
    _gang.set(k, fetchWalkRoute({ lat: stopp.lat, lon: stopp.lon }, { lat: o.lat, lon: o.lon }).then(linje => {
      if (!linje || !linje.length) return null;
      const mål = measurePath(linje), m = mål && mål.total;
      return Number.isFinite(m) ? { m: Math.round(m), min: Math.max(1, Math.ceil(m / (SPEED_MPN[loadWalkSpeed()] || SPEED_MPN.middels))) } : null;
    }).catch(() => null));
  }
  return _gang.get(k);
}

/* GANGE HELE VEIEN (v1.218.314): bare når reisesøket ikke fant noen kollektivreise.
   Entur, kun gange (directMode: foot) — samme fra-punkt og tid som reisesøket. */
export function gangHeleVeienGql(fra, stedId, tidIso) {
  return '{ eb: trip(from:{coordinates:{latitude:' + fra.lat + ',longitude:' + fra.lon + '}} to:{place:"' + stedId + '"} dateTime:"' + tidIso + '" walkSpeed:1.3 modes:{directMode:foot}) { tripPatterns { duration walkDistance legs { mode } } } }';
}
/** → { m, min, kilde: 'entur' } eller null. Ren. */
export function parseGangHeleVeien(json) {
  const p = (((json && json.data && json.data.eb) || (json && json.data && json.data.trip) || {}).tripPatterns || [])[0];
  if (!p || !(p.legs || []).every(l => l.mode === 'foot') || !Number.isFinite(p.duration)) return null;
  return { m: Math.round(p.walkDistance), min: Math.round(p.duration / 60), kilde: 'entur' };
}

/* BERIKELSE (v1.218.315): ingress fra Wikipedia og bilde fra Commons — bare for
   de opplevelsene som vises (høyst 2 per sted). Begge har åpen CORS (origin=*).
   Cache per Wikidata-id (ellers navn) i et døgn. Feiler et kall, mangler bare den delen. */
export function sammendragUrl(tittel) {
  return 'https://no.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=extracts|info&inprop=url&exintro=1&explaintext=1&redirects=1&titles=' + encodeURIComponent(tittel);
}
export function bildeinfoUrl(fil) {
  return 'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url|extmetadata&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|Credit&iiurlwidth=640&titles=' + encodeURIComponent('File:' + fil);
}
const _berik = new Map();
export function _tømBerikelse() { _berik.clear(); }
export function hentBerikelse(o, { nå = Date.now(), hent = { json } } = {}) {
  if (!o || (!o.wikiTittel && !o.bildeFil)) return Promise.resolve(null);
  const k = o.qid || o.navn, c = _berik.get(k);
  if (c && nå - c.tid < OPPLEVELSE_CACHE_MS) return c.løfte;
  const løfte = Promise.allSettled([o.wikiTittel ? hent.json(sammendragUrl(o.wikiTittel)) : null, o.bildeFil ? hent.json(bildeinfoUrl(o.bildeFil)) : null])
    .then(([a, b]) => ({ ingress: a.status === 'fulfilled' ? parseSammendrag(a.value) : null, bilde: b.status === 'fulfilled' ? parseBildeinfo(b.value) : null }));
  _berik.set(k, { tid: nå, løfte });
  return løfte;
}
