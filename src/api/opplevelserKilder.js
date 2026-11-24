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
import { klassifiserTurrute, klassifiserTilrettelegging, klassifiserFriluft, klassifiserWikidata, opplevelserVed, avstandM } from '../opplevelser.js';

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
        if (kat.length && v('informasjon')) kandidater.push({ kilde: 'turrute', sid: v('lokalId'), navn: v('informasjon'), lat: pkt[0].lat, lon: pkt[0].lon, kat });
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
    spatialRel: 'esriSpatialRelIntersects', outFields: 'id,omraadenavn,omraadetype_beskrivelse,omraadeverdi_beskrivelse', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0005', f: 'json' });
}
/** Områdene → kandidater med nærmeste punkt på kanten (ikke sentrum). Ren. */
export function parseFriluft(json, stopp) {
  return ((json && json.features) || []).map(f => {
    const a = f.attributes || {}, ringer = (f.geometry && f.geometry.rings) || [];
    let best = null;
    for (const r of ringer) for (const [lon, lat] of r) { const m = avstandM(stopp, { lat, lon }); if (!best || m < best.m) best = { lat, lon, m }; }
    return best && { kilde: 'miljodir', sid: a.id, navn: a.omraadenavn, lat: best.lat, lon: best.lon, kat: klassifiserFriluft(a.omraadetype_beskrivelse, a.omraadeverdi_beskrivelse), verdi: a.omraadeverdi_beskrivelse };
  }).filter(Boolean);
}

export function wikidataUrl(s) {
  const q = `SELECT ?i ?iLabel (GROUP_CONCAT(DISTINCT ?tL; separator="|") AS ?typer) (MAX(?sl) AS ?sitelinks) (SAMPLE(?c) AS ?koord) WHERE {
   SERVICE wikibase:around { ?i wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${s.lon} ${s.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1.5" }
   ?i wdt:P31 ?t . ?i wikibase:sitelinks ?sl . ?t rdfs:label ?tL . FILTER(LANG(?tL) = "nb" || LANG(?tL) = "en")
   SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en". } } GROUP BY ?i ?iLabel LIMIT 200`;
  return WD + '?format=json&query=' + encodeURIComponent(q);
}
/** SPARQL-svaret → kandidater. Ren. */
export function parseWikidata(json) {
  return ((json && json.results && json.results.bindings) || []).map(b => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec((b.koord && b.koord.value) || '');
    const kat = klassifiserWikidata(b.typer && b.typer.value, +(b.sitelinks && b.sitelinks.value));
    if (!m || !kat.length || /^Q\d+$/.test(b.iLabel.value)) return null;
    return { kilde: 'wikidata', sid: b.i.value.split('/').pop(), navn: b.iLabel.value, lat: +m[2], lon: +m[1], kat, sitelinks: +b.sitelinks.value };
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
