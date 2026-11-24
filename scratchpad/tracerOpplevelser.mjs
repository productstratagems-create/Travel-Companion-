#!/usr/bin/env node
/**
 * TRACER: OPPLEVELSER VED «ETT BYTTE»-STEDENE (ingen appendring).
 *
 * Spørsmål: avdekker en semantisk kategorisering (friluftsliv, natur,
 * severdigheter …) reisemål som dagens «ett bytte» ikke synliggjør?
 *
 * Grunnlag: ekte Entur-opptak (tests/fixtures/entur) for fire utgangspunkter —
 * by (Mortensrud, Oslo), by (Nesttun, Bergen), forstad (Ranheim, Trondheim) og
 * bygd (Tretten). Fra hvert: «ett bytte»-stedene (ettByttVeier), et spredt
 * utvalg etter avstand. Rundt hvert sted spørres EKTE kilder:
 *   OSM      api.openstreetmap.org/api/0.6/map (bbox ± RADIUS_M), alle tagger
 *   Wikidata query.wikidata.org (wikibase:around, 1 km), P31 + sitelinks
 *   Kartverket ws.geonorge.no/stedsnavn/v1/punkt (1 km), navneobjekttype
 *   Miljødir. friluftsliv_kartlagt (ArcGIS, 500 m), verdi og områdetype
 *   Valhalla valhalla1.openstreetmap.de (fotgjenger), stopp → stedets nærmeste punkt
 * Geoapify er IKKE med: nøkkelen finnes bare i CI (VITE_GEOAPIFY_KEY).
 *
 * Kjør fra repo-roten:  NODE_USE_ENV_PROXY=1 node scratchpad/tracerOpplevelser.mjs [utdir]
 * Rå svar caches i utdir (standard: /tmp/opplevelser) så en ny kjøring ikke spør igjen.
 * Skriver sammendrag til scratchpad/data/opplevelser-resultat.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { ettByttVeier, ettByttePer } from '../src/ettBytte.js';
import { lastOpptak, avspiller } from '../tests/fixtures/entur/avspilling.js';
import { metresBetween } from '../src/haversine.js';

const UT = process.argv[2] || '/tmp/opplevelser';
fs.mkdirSync(UT, { recursive: true });
const SCEN = ['mortensrud_dag', 'nesttun_dag', 'ranheim_dag', 'tretten_dag'];
const PER_SCEN = 7;           // steder per utgangspunkt → 28
const RADIUS_M = 600;         // OSM-boks rundt stoppet
const GANG_MAKS_M = 1500;     // luftlinje: kandidater lenger unna regnes ikke som «ved stoppet»
const UA = { 'User-Agent': 'travelcompanion-tracer/1 (research, low volume)' };
const vent = ms => new Promise(r => setTimeout(r, ms));

async function hentCachet(nøkkel, f) {
  const fil = path.join(UT, nøkkel.replace(/[^a-zA-Z0-9_.-]/g, '_') + '.json');
  if (fs.existsSync(fil)) return JSON.parse(fs.readFileSync(fil, 'utf8'));
  let svar = null, feil = null;
  for (let i = 0; i < 3 && svar == null; i++) {
    try { svar = await f(); } catch (e) { feil = String(e && e.message || e); await vent(2000 * (i + 1)); }
  }
  const ut = svar != null ? { ok: true, svar } : { ok: false, feil };
  fs.writeFileSync(fil, JSON.stringify(ut));
  return ut;
}
const json = async (url, o = {}) => { const r = await fetch(url, { ...o, headers: { ...UA, ...(o.headers || {}) } }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };

/* ── 1. Stedene «ett bytte» når ─────────────────────────────────────────── */
const spredt = (xs, n) => (xs.length <= n ? xs.slice() : Array.from({ length: n }, (_, i) => xs[Math.round(i * (xs.length - 1) / (n - 1))]));
const steder = [];
for (const n of SCEN) {
  _tømCache(); const O = lastOpptak(n);
  const r = await utforsk(O.scenario, { hent: avspiller(O).hent });
  const veier = ettByttVeier(r);
  const opsjoner = new Map(r.opsjoner.map(o => [o.id, o]));
  const typer = new Map(ettByttePer(r, O.scenario.posisjon, 'knute').rader.flatMap(rad => rad.punkter.map(p => [p.id, p.type])));
  const per = new Map();
  for (const v of veier) {
    const d = opsjoner.get(v.opsjon) && opsjoner.get(v.opsjon).destinations[0];
    if (!d || !Number.isFinite(d.lat)) continue;
    const e = per.get(d.id) || per.set(d.id, { id: d.id, navn: d.name, lat: d.lat, lon: d.lon, km: metresBetween(O.scenario.posisjon, d) / 1000, type: typer.get(d.id) || null, linjer: new Set(), knuter: new Set() }).get(d.id);
    e.linjer.add(v.directionId); e.knuter.add(v.knute);
  }
  // Under 1 km er ikke en reise med bytte (sett: Mortensrud selv, 0 km).
  const alle = [...per.values()].filter(s => s.km >= 1).sort((a, b) => a.km - b.km);
  // Spredt etter avstand, men minst to stasjoner/kaier (tog, T-bane, båt) når de finnes.
  const stasjoner = alle.filter(s => s.type && s.type !== 'bus');
  const valgt = new Map(spredt(alle, PER_SCEN - Math.min(2, stasjoner.length)).map(s => [s.id, s]));
  for (const s of spredt(stasjoner, 2)) valgt.set(s.id, s);
  for (const s of valgt.values()) steder.push({ ...s, fra: n, linjer: s.linjer.size, knuter: s.knuter.size, iAlt: alle.length });
}
console.log('steder:', steder.length, steder.map(s => s.navn + ' (' + s.km.toFixed(0) + ' km)').join(', '));

/* ── 2. Kildene ─────────────────────────────────────────────────────────── */
const bbox = (s, m) => { const dLat = m / 111320, dLon = m / (111320 * Math.cos(s.lat * Math.PI / 180)); return [s.lon - dLon, s.lat - dLat, s.lon + dLon, s.lat + dLat].map(x => x.toFixed(5)).join(','); };
async function osm(s) {
  let r = await hentCachet('osm-' + s.id, () => json('https://api.openstreetmap.org/api/0.6/map.json?bbox=' + bbox(s, RADIUS_M)));
  if (!r.ok) r = await hentCachet('osm300-' + s.id, () => json('https://api.openstreetmap.org/api/0.6/map.json?bbox=' + bbox(s, 300)));
  await vent(800);
  return r;
}
const wd = s => hentCachet('wd-' + s.id, () => json('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(
  `SELECT ?i ?iLabel (GROUP_CONCAT(DISTINCT ?tL; separator="|") AS ?typer) (MAX(?sl) AS ?sitelinks) (MIN(?d) AS ?avst) (SAMPLE(?c) AS ?koord) WHERE {
   SERVICE wikibase:around { ?i wdt:P625 ?c . bd:serviceParam wikibase:center "Point(${s.lon} ${s.lat})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "1.5" . bd:serviceParam wikibase:distance ?d }
   ?i wdt:P31 ?t . ?i wikibase:sitelinks ?sl .
   ?t rdfs:label ?tL . FILTER(LANG(?tL) = "nb" || LANG(?tL) = "en")
   SERVICE wikibase:label { bd:serviceParam wikibase:language "nb,nn,en". } } GROUP BY ?i ?iLabel LIMIT 200`)));
const kv = s => hentCachet('kv-' + s.id, () => json(`https://ws.geonorge.no/stedsnavn/v1/punkt?nord=${s.lat}&ost=${s.lon}&koordsys=4258&utkoordsys=4258&radius=1500&treffPerSide=200`));
const md = s => hentCachet('md-' + s.id, () => json('https://kart.miljodirektoratet.no/arcgis/rest/services/friluftsliv_kartlagt/MapServer/0/query?' + new URLSearchParams({
  geometry: s.lon + ',' + s.lat, geometryType: 'esriGeometryPoint', inSR: '4326', distance: '800', units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects',
  outFields: 'id,omraadenavn,omraadetype_beskrivelse,omraadeverdi_beskrivelse,kommune_navn,brukerfrekvens_beskrivelse,tilrettelegging_beskrivelse', returnGeometry: 'true', outSR: '4326', maxAllowableOffset: '0.0005', f: 'json' })));

/* Kartverkets turrutebase (Nasjonal database for turruter, CC BY 4.0, «© Kartverket»):
   merkede ruter med vedlikeholdsansvar. Brukes som ADKOMST, ikke som reisemål. */
const TR_TYPER = ['Fotrute', 'Skiløype', 'Sykkelrute', 'AnnenRute', 'RuteInfoPunkt'];
async function tr(s) {
  const b = bbox(s, 800).split(',').map(Number); // lon1,lat1,lon2,lat2
  const ut = {};
  for (const t of TR_TYPER) {
    const r = await hentCachet('tr-' + t + '-' + s.id, async () => {
      const x = await fetch('https://wfs.geonorge.no/skwms1/wfs.turogfriluftsruter?service=WFS&version=2.0.0&request=GetFeature&typeNames=app:' + t + '&count=200&bbox=' + [b[1], b[0], b[3], b[2]].join(',') + ',urn:ogc:def:crs:EPSG::4326', { headers: UA });
      if (!x.ok) throw new Error('HTTP ' + x.status);
      const xml = await x.text();
      return [...xml.matchAll(new RegExp('<app:' + t + '[ >][\\s\\S]*?</app:' + t + '>', 'g'))].map(m => {
        const f = m[0], v = k => ((new RegExp('<app:' + k + '>([^<]*)</app:' + k + '>')).exec(f) || [])[1] || null;
        const tall = [...f.matchAll(/<gml:(?:posList|pos)[^>]*>([^<]+)</g)].flatMap(p => p[1].trim().split(/\s+/).map(Number));
        const pkt = []; for (let i = 0; i + 1 < tall.length; i += 2) pkt.push({ lat: tall[i], lon: tall[i + 1] });
        return { type: t, navn: v('rutenavn'), nr: v('rutenummer'), betydning: v('rutebetydning'), gradering: v('gradering'), spesial: v('spesialFotrutetype') || v('spesialSkiløypetype') || v('spesialSykkelrutetype') || v('spesialAnnenrutetype'), merket: v('merking'), ansvar: v('vedlikeholdsansvarlig'), tilrettelegging: v('tilrettelegging'), pkt };
      });
    });
    ut[t] = r.ok ? r.svar : null;
  }
  return ut;
}
const nærmest = (p, ruter) => Math.min(Infinity, ...(ruter || []).flatMap(r => r.pkt.map(q => metresBetween(p, q))));

/* ── 3. Felles kategorimodell og mapping ───────────────────────────────── */
import { slåSammen, KATEGORIER as KAT, klassifiserOsm, klassifiserWikidata, klassifiserKartverket, klassifiserFriluft, erReisemål, OSM_MAP, OSM_STØY } from '../src/opplevelser.js';

/* ── 4. Per sted: kandidater fra alle kilder ───────────────────────────── */
const normNavn = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9æøå ]/g, ' ').replace(/\s+/g, ' ').trim();
function osmKandidater(s, d) {
  const el = d.elements || [], noder = new Map(el.filter(e => e.type === 'node').map(e => [e.id, e]));
  const ut = [];
  for (const e of el) {
    const t = e.tags; if (!t) continue;
    const treff = Object.entries(t).map(([k, v]) => k + '=' + v).filter(kv => OSM_MAP[kv] || OSM_STØY.has(kv));
    if (!treff.length) continue;
    // Nærmeste punkt: noden selv, eller nærmeste node på veien (randpunkt, ikke flatens sentrum).
    let pkt = null;
    if (e.type === 'node') pkt = { lat: e.lat, lon: e.lon };
    else if (e.type === 'way') { const ns = (e.nodes || []).map(id => noder.get(id)).filter(Boolean); pkt = ns.sort((a, b) => metresBetween(s, a) - metresBetween(s, b))[0] || null; }
    if (!pkt) continue; // relasjoner: geometrien er ikke med i map-kallet (sies i rapporten)
    const kat = klassifiserOsm(t).kat;
    ut.push({ kilde: 'osm', sid: e.type + '/' + e.id, navn: t.name || null, lat: pkt.lat, lon: pkt.lon, flate: e.type !== 'node', kat, støy: treff.filter(kv => OSM_STØY.has(kv)), tagger: treff,
      wikidata: t.wikidata || null, info: !!(t.description || t.website || t.wikipedia || t.wikidata || t.opening_hours) });
  }
  return ut;
}
function wdKandidater(d) {
  return ((d.results && d.results.bindings) || []).map(b => {
    const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.koord.value);
    const typer = b.typer.value;
    const kat = klassifiserWikidata(typer, +b.sitelinks.value);
    if (!kat.length) return null;
    return { kilde: 'wikidata', sid: b.i.value.split('/').pop(), navn: /^Q\d+$/.test(b.iLabel.value) ? null : b.iLabel.value, lat: +m[2], lon: +m[1], kat, typer, sitelinks: +b.sitelinks.value, info: true };
  }).filter(x => x && x.kat.length);
}
function kvKandidater(d) {
  return (d.navn || []).map(n => {
    const kat = klassifiserKartverket(n.navneobjekttype); if (!kat.length) return null;
    const p = n.representasjonspunkt || {};
    return { kilde: 'kartverket', sid: String(n.stedsnummer), navn: n.stedsnavn && n.stedsnavn[0] && n.stedsnavn[0].skrivemåte, lat: p.nord, lon: p.øst, kat, info: false };
  }).filter(x => x && Number.isFinite(x.lat));
}
function mdKandidater(s, d) {
  return (d.features || []).map(f => {
    const a = f.attributes, ringer = (f.geometry && f.geometry.rings) || [];
    // Nærmeste randpunkt av flaten — ikke sentrum (oppdraget §6).
    let best = null; for (const r of ringer) for (const [lon, lat] of r) { const m = metresBetween(s, { lat, lon }); if (!best || m < best.m) best = { lat, lon, m }; }
    return best && { kilde: 'miljodir', sid: a.id, navn: a.omraadenavn, lat: best.lat, lon: best.lon, flate: true, inni: false,
      kat: klassifiserFriluft(a.omraadetype_beskrivelse, a.omraadeverdi_beskrivelse),
      verdi: a.omraadeverdi_beskrivelse, bruk: a.brukerfrekvens_beskrivelse, info: true };
  }).filter(Boolean);
}

/* ── 5. Gang: Valhalla fotgjenger, stopp → stedets nærmeste punkt ──────── */
async function gang(s, p) {
  const r = await hentCachet('vh-' + s.id + '-' + p.lat.toFixed(5) + ',' + p.lon.toFixed(5), async () => {
    await vent(1100);
    return json('https://valhalla1.openstreetmap.de/route', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: [{ lat: s.lat, lon: s.lon }, { lat: p.lat, lon: p.lon }], costing: 'pedestrian', units: 'kilometers' }) });
  });
  if (!r.ok || !r.svar.trip) return null;
  return { m: Math.round(r.svar.trip.summary.length * 1000), min: Math.round(r.svar.trip.summary.time / 60) };
}

/* ── 6. Kjør ──────────────────────────────────────────────────────────── */
const resultat = [];
for (const s of steder) {
  const [o, w, k, m, t] = [await osm(s), await wd(s), await kv(s), await md(s), await tr(s)];
  const rå = [...(o.ok ? osmKandidater(s, o.svar) : []), ...(w.ok ? wdKandidater(w.svar) : []), ...(k.ok ? kvKandidater(k.svar) : []), ...(m.ok ? mdKandidater(s, m.svar) : [])]
    .map(c => ({ ...c, luft: Math.round(metresBetween(s, c)) }));
  const ruter = [...(t.Fotrute || []), ...(t.Skiløype || []), ...(t.Sykkelrute || []), ...(t.AnnenRute || [])];
  resultat.push({ sted: s, turruter: { ruter, punkter: t.RuteInfoPunkt || [], ok: Object.values(t).every(Boolean) }, kilder: { osm: o.ok ? 'ok' : o.feil, wikidata: w.ok ? 'ok' : w.feil, kartverket: k.ok ? 'ok' : k.feil, miljodir: m.ok ? 'ok' : m.feil }, rå });
  process.stdout.write('.');
}
console.log();

// Sammenslåing: src/opplevelser.js (én definisjon med appen).
const RELEVANT_SITELINKS = 2;
const sum = { steder: resultat.length, rå: 0, råMedNavn: 0, unike: 0, relevante: 0, tilgjengelige: 0, gangVerifisert: 0, borteRelevans: 0, borteGang: 0, duplikater: 0, flereKategorier: 0, flereKilder: 0,
  perKategori: {}, perKilde: {}, stederMedEn: 0, stederMedFlere: 0, nyttNavn: 0 };
const eksempler = [], negative = [];
for (const r of resultat) {
  const s = r.sted;
  sum.rå += r.rå.length; sum.råMedNavn += r.rå.filter(c => c.navn).length;
  const unike = slåSammen(r.rå, s).map(u => ({ ...u, stopp: s }));
  sum.unike += unike.length; sum.duplikater += unike.reduce((a, u) => a + u.kilder.length - 1, 0);
  const vurdert = [];
  for (const u of unike) {
    const kats = [...new Set(u.kat.map(k => k.k))];
    const sterk = erReisemål(u.kilder);
    const støy = u.kilder.every(c => (c.kat || []).length === 0);
    const sammeSomStopp = normNavn(u.navn) === normNavn(s.navn);
    if (støy || !kats.length) { negative.push({ sted: s.navn, navn: u.navn, hvorfor: 'bare støy-tagg: ' + u.kilder.flatMap(c => c.støy || []).join(', '), kilde: u.kilder.map(c => c.kilde).join('+') }); continue; }
    if (!sterk) { sum.borteRelevans++; if (negative.filter(n => n.type === 'svak').length < 40) negative.push({ type: 'svak', sted: s.navn, navn: u.navn, hvorfor: 'svakt signal: ' + u.kat.map(k => k.kv).join(', '), kilde: u.kilder.map(c => c.kilde).join('+'), luft: u.luft }); continue; }
    if (u.luft > GANG_MAKS_M) { sum.borteGang++; continue; }
    vurdert.push({ ...u, kats, sammeSomStopp });
  }
  // Gang for de relevante (stopp → nærmeste punkt). Uten svar: uverifisert, ikke forkastet.
  for (const u of vurdert) {
    const g = await gang(s, u);
    u.gang = g;
    u.gangbar = g ? (g.m <= 2000 && g.m <= Math.max(3 * u.luft, u.luft + 600)) : null;
  }
  const ruterHer = r.turruter.ruter;
  for (const u of vurdert) u.merketRute = nærmest(u, ruterHer) <= 200;
  r.ruteVedStopp = nærmest(s, ruterHer) <= 500;
  const nær = ruterHer.filter(x => nærmest(s, [x]) <= 500);
  r.ruteNavn = [...new Set(nær.filter(x => x.navn && x.navn !== 'Ukjent').map(x => x.navn))].slice(0, 6);
  r.ruteTyper = [...new Set(nær.map(x => x.type))];
  r.ruteBetydning = [...new Set(nær.map(x => x.betydning).filter(Boolean))].sort();
  r.ruteGradering = [...new Set(nær.map(x => x.gradering).filter(Boolean))].sort();
  r.ruteSpesial = [...new Set(nær.map(x => x.spesial).filter(Boolean))].sort();
  const tilgj = vurdert.filter(u => u.gangbar !== false);
  if (vurdert.some(u => u.gangbar === false)) sum.borteGang += vurdert.filter(u => u.gangbar === false).length;
  sum.relevante += vurdert.length; sum.tilgjengelige += tilgj.length; sum.gangVerifisert += tilgj.filter(u => u.gangbar === true).length;
  for (const u of tilgj) {
    for (const k of u.kats) sum.perKategori[k] = (sum.perKategori[k] || 0) + 1;
    for (const k of new Set(u.kilder.map(c => c.kilde))) sum.perKilde[k] = (sum.perKilde[k] || 0) + 1;
    if (u.kats.length > 1) sum.flereKategorier++;
    if (new Set(u.kilder.map(c => c.kilde)).size > 1) sum.flereKilder++;
    if (!u.sammeSomStopp && !normNavn(s.navn).includes(normNavn(u.navn)) && !normNavn(u.navn).includes(normNavn(s.navn))) sum.nyttNavn++;
  }
  sum.stopperMedMerketRute = (sum.stopperMedMerketRute || 0) + (r.ruteVedStopp ? 1 : 0);
  sum.opplevelserMedMerketRute = (sum.opplevelserMedMerketRute || 0) + tilgj.filter(u => u.merketRute).length;
  sum.friluftNaturMedMerketRute = (sum.friluftNaturMedMerketRute || 0) + tilgj.filter(u => u.merketRute && u.kats.some(k => k === 'friluftsliv' || k === 'natur')).length;
  sum.friluftNatur = (sum.friluftNatur || 0) + tilgj.filter(u => u.kats.some(k => k === 'friluftsliv' || k === 'natur')).length;
  sum.ruteInfoPunkter = (sum.ruteInfoPunkter || 0) + r.turruter.punkter.length;
  if (tilgj.length >= 1) sum.stederMedEn++;
  if (tilgj.length >= 2) sum.stederMedFlere++;
  r.opplevelser = tilgj.map(u => ({ navn: u.navn, kategorier: u.kats.map(k => KAT[k]), under: [...new Set(u.kat.map(k => k.u))], kilder: [...new Set(u.kilder.map(c => c.kilde + ':' + c.sid))], luft: Math.round(u.luft), gang: u.gang, gangbar: u.gangbar, flate: u.flate, sitelinks: u.sitelinks, verdi: u.verdi, merketRute: u.merketRute }));
}
const ut = { kjørt: new Date().toISOString(), parametre: { SCEN, PER_SCEN, RADIUS_M, GANG_MAKS_M, RELEVANT_SITELINKS }, sum,
  steder: resultat.map(r => ({ sted: { navn: r.sted.navn, id: r.sted.id, lat: r.sted.lat, lon: r.sted.lon, fra: r.sted.fra, km: +r.sted.km.toFixed(1), type: r.sted.type, linjer: r.sted.linjer, iAlt: r.sted.iAlt }, kilder: r.kilder, rå: r.rå.length, turruter: { vedStopp: r.ruteVedStopp, navn: r.ruteNavn, typer: r.ruteTyper, betydning: r.ruteBetydning, gradering: r.ruteGradering, spesial: r.ruteSpesial, punkter: r.turruter.punkter.length, ok: r.turruter.ok }, opplevelser: r.opplevelser })),
  negative: negative.slice(0, 80) };
fs.mkdirSync('scratchpad/data', { recursive: true });
fs.writeFileSync('scratchpad/data/opplevelser-resultat.json', JSON.stringify(ut, null, 1));
console.log(JSON.stringify(sum, null, 1));
