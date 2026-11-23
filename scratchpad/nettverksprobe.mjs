#!/usr/bin/env node
/**
 * NETTVERKSPROBE — isolert demonstrator for nettverksutforskning
 * (plangrunnlaget steg 2, trinn 2). Kjøres manuelt mot ekte Entur; ikke en
 * del av `npm test`, ikke koblet til appen.
 *
 *   node scratchpad/nettverksprobe.mjs --sted mortensrud [--tid ISO] [--json fil]
 *     [--busM 850] [--stasjonM 1500] [--maksTilgang 15] [--perLinje 2]
 *     [--nAvg 30] [--vindu 60] [--knutepunkt 5] [--nKnute 60] [--bekreft 10]
 *     [--fly] [--utenPerLinje] [--ledd 2]
 *
 * Gjenbruker appens spørringsbyggere (boardGQL, tripGQL) og kategoriene i
 * stopCats.js. Grensene er PARAMETRE for måling, ikke produktkrav.
 * Resultatet er kandidatopsjoner i kontraktsformatet (src/opsjonsmodell.js),
 * validert med `avvik()`.
 */
import { boardGQL, tripGQL } from '../src/api/queries.js';
import { STOP_MODE } from '../src/api/stopCats.js';
import { metresBetween } from '../src/haversine.js';
import {
  nyOpsjon, nyOppdagelse, samle, avvik, velgForBekreftelse, bekreftelse, tilgjengelighet, samlestopp,
} from '../src/opsjonsmodell.js';
import { writeFileSync } from 'node:fs';

const STEDER = {
  mortensrud: { lat: 59.8487, lon: 10.8291, kjente: ['Hauketo', 'Helsfyr', 'Jernbanetorget', 'Oslo S', 'Ski', 'Lillestrøm', 'Drammen', 'Lillehammer', 'Hamar', 'Fredrikstad', 'Kongsberg', 'Halden', 'Sandvika', 'Asker', 'Bergen', 'Kristiansand', 'Tønsberg', 'Gjøvik', 'Trondheim S'] },
  nesttun: { lat: 60.3197, lon: 5.3537, kjente: ['Byparken', 'Bergen stasjon', 'Bergen busstasjon', 'Bergen lufthavn', 'Lagunen', 'Voss', 'Os', 'Arna', 'Stord', 'Haugesund'] },
  ranheim: { lat: 63.4286, lon: 10.5248, kjente: ['Trondheim S', 'Værnes', 'Stjørdal', 'Steinkjer', 'Støren', 'Hommelvik', 'Heimdal', 'Moholt', 'Lerkendal'] },
  tretten: { lat: 61.3125, lon: 10.3005, kjente: ['Lillehammer', 'Ringebu', 'Otta', 'Hamar', 'Oslo S', 'Fåberg', 'Øyer'] },
};

const arg = (() => {
  const a = process.argv.slice(2), o = {};
  for (let i = 0; i < a.length; i++) if (a[i].startsWith('--')) {
    const k = a[i].slice(2);
    o[k] = (a[i + 1] && !a[i + 1].startsWith('--')) ? a[++i] : true;
  }
  return o;
})();
const tall = (k, d) => (arg[k] !== undefined ? Number(arg[k]) : d);
const P = {
  sted: arg.sted || 'mortensrud',
  busM: tall('busM', 850), stasjonM: tall('stasjonM', 1500), maksTilgang: tall('maksTilgang', 15),
  perLinje: arg.utenPerLinje ? 0 : tall('perLinje', 2), nAvg: tall('nAvg', 30), vindu: tall('vindu', 60),
  knutepunkt: tall('knutepunkt', 5), nKnute: tall('nKnute', 60), bekreft: tall('bekreft', 10),
  fly: !!arg.fly, ledd: tall('ledd', 2),
};
const STED = STEDER[P.sted] || (() => { throw new Error('ukjent sted ' + P.sted); })();
const NÅ = arg.tid ? new Date(arg.tid) : new Date();
const POS = { lat: STED.lat, lon: STED.lon };

/* ---------- måleinstrument ---------- */
const KALL = [];
const HDR = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travelcompanion-nettverksprobe' };
async function gql(navn, q) {
  const t = Date.now();
  const r = await fetch('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: HDR, body: JSON.stringify({ query: q }) });
  const j = await r.json().catch(() => ({ errors: [{ message: 'ikke JSON, HTTP ' + r.status }] }));
  KALL.push({ navn, ms: Date.now() - t, bytes: q.length, feil: (j.errors || []).map(e => e.message).slice(0, 2) });
  return j;
}
async function geokoder() {
  const t = Date.now();
  const km = Math.max(P.busM, P.stasjonM) / 1000;
  const u = `https://api.entur.io/geocoder/v1/reverse?point.lat=${POS.lat}&point.lon=${POS.lon}&boundary.circle.radius=${km}&size=100&layers=venue`;
  const j = await (await fetch(u, { headers: HDR })).json();
  KALL.push({ navn: 'geokoder', ms: Date.now() - t, feil: [] });
  return j.features || [];
}
/** En byggers `{stopPlace(…){…}}` → `alias: stopPlace(…){…}` for batching. */
const somAlias = (alias, q) => alias + ': ' + q.trim().replace(/^\{\s*/, '').replace(/\}\s*$/, '');
const notater = [];

/* ---------- A. tilgangspunkter ---------- */
const STASJON = new Set(['railStation', 'metroStation', 'ferryStop', 'harbourPort', 'airport']);
async function tilgangspunkter() {
  const f = await geokoder();
  const alle = f.map(x => {
    const cats = x.properties.category || [];
    const [lon, lat] = x.geometry.coordinates;
    const m = metresBetween(POS, { lat, lon });
    const stasjon = cats.some(c => STASJON.has(c));
    const moduser = [...new Set(cats.map(c => STOP_MODE[c]).filter(Boolean))];
    return { id: x.properties.id, name: x.properties.name, lat, lon, m: Math.round(m), cats, stasjon, moduser };
  }).filter(s => s.id.startsWith('NSR:StopPlace') && s.moduser.length);
  const inn = alle.filter(s => s.m <= (s.stasjon ? P.stasjonM : P.busM));
  // Stasjoner først (de er grunnen til den lengre radien), så nærmeste.
  inn.sort((a, b) => (b.stasjon - a.stasjon) || a.m - b.m);
  const valgt = inn.slice(0, P.maksTilgang);
  return { alle, innenfor: inn, valgt, kappet: inn.slice(P.maksTilgang) };
}

/* ---------- B/D. avganger med stoppene videre ---------- */
async function avgangerFra(stopp, n, navn) {
  const bygg = per => '{' + stopp.map((s, i) => somAlias('s' + i, boardGQL(s.id, n, NÅ, true, P.vindu, null, per || 0))).join(' ') + '}';
  let j = await gql(navn, bygg(P.perLinje));
  if (P.perLinje && j.errors && JSON.stringify(j.errors).includes('PerLine')) {
    notater.push(`${navn}: numberOfDeparturesPerLineAndDestinationDisplay avvist — faller tilbake til globalt tak`);
    j = await gql(navn + ' (uten perLinje)', bygg(0));
  }
  const ut = [];
  stopp.forEach((s, i) => {
    const sp = j.data && j.data['s' + i];
    if (!sp) return;
    for (const c of sp.estimatedCalls || []) {
      const sj = c.serviceJourney || {}, line = sj.line || {};
      const kall = sj.estimatedCalls || [];
      const k = kall.findIndex(x => x.quay && c.quay && x.quay.id === c.quay.id);
      ut.push({
        fra: s, quayId: c.quay && c.quay.id, tid: c.expectedDepartureTime,
        lineId: line.id, kode: line.publicCode, mode: line.transportMode, retning: c.destinationDisplay && c.destinationDisplay.frontText,
        videre: (k >= 0 ? kall.slice(k + 1) : []).map(x => ({ id: x.quay.stopPlace.id, name: x.quay.stopPlace.name, lat: x.quay.stopPlace.latitude, lon: x.quay.stopPlace.longitude, ank: x.expectedArrivalTime })),
      });
    }
  });
  return { avganger: ut, feil: j.errors };
}

/* ---------- C. knutepunkter ---------- */
async function stoppInfo(ids) {
  const q = f => `{stopPlaces(ids:${JSON.stringify(ids)}){id name ${f} quays{lines{id transportMode}}}}`;
  let j = await gql('stoppinfo (parent)', q('parent{id name latitude longitude}'));
  if (j.errors && !j.data) {
    notater.push('stopPlaces.parent avvist — knutepunkt vurderes på understopp');
    j = await gql('stoppinfo', q(''));
  }
  const m = new Map();
  for (const s of (j.data && j.data.stopPlaces) || []) if (s) m.set(s.id, s);
  return m;
}
const MODUSSKIFTE = new Set(['rail', 'metro', 'water']);

/* ---------- E. bekreftelse ---------- */
async function bekreft(opsjoner) {
  const del = opsjoner.map((o, i) => {
    let q = tripGQL(POS, o.destinations[0].id, null, 3, 1.3, NÅ, true, true, true, false, false, false, false, true, null);
    if (P.fly) q = q.replace('transportModes:[', 'transportModes:[{transportMode:air},');
    return somAlias('t' + i, q);
  });
  const j = await gql(`reisesøk ×${opsjoner.length}`, '{' + del.join(' ') + '}');
  return opsjoner.map((o, i) => {
    const t = j.data && j.data['t' + i];
    const req = { from: POS, to: o.destinations[0].id, modes: P.fly ? ['alle+air'] : ['metro', 'bus', 'tram', 'rail', 'water', 'coach', 'taxi'], travelTime: NÅ.toISOString() };
    const base = { searchedAt: NÅ.toISOString(), request: req };
    if (!t) return { ...base, state: 'unknown', grunn: (j.errors || []).map(e => e.message)[0] || 'tomt svar' };
    const tp = (t.tripPatterns || []);
    if (!tp.length) return { ...base, state: 'unknown', grunn: 'ingen reise i søkevinduet (ikke bevis for at ingen finnes)' };
    const første = tp.map(p => p.legs.find(l => l.mode !== 'foot') || p.legs[0]).map(l => l.expectedStartTime).sort()[0];
    const best = tp[0];
    const gang = best.legs[0] && best.legs[0].mode === 'foot' ? Math.round((Date.parse(best.legs[0].expectedEndTime) - Date.parse(best.legs[0].expectedStartTime)) / 60000) : 0;
    return {
      ...base, state: 'confirmed', firstDeparture: første,
      raw: { varighetMin: Math.round(best.duration / 60), bytter: best.legs.filter(l => l.mode !== 'foot').length - 1, gangMin: gang,
        legs: best.legs.filter(l => l.mode !== 'foot').map(l => ({ mode: l.mode, lineId: l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.id, kode: l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode,
          from: { stopPlaceId: l.fromPlace?.quay?.stopPlace?.id, quayId: l.fromPlace?.quay?.id, name: l.fromPlace?.name }, to: { stopPlaceId: l.toPlace?.quay?.stopPlace?.id, quayId: l.toPlace?.quay?.id, name: l.toPlace?.name },
          start: l.expectedStartTime, end: l.expectedEndTime })),
        etapper: best.legs.map(l => l.mode + (l.serviceJourney && l.serviceJourney.line ? ' ' + l.serviceJourney.line.publicCode : '')), påstigning: (best.legs.find(l => l.mode !== 'foot') || {}).fromPlace?.name },
    };
  });
}

/* ---------- kjøring ---------- */
const t0 = Date.now();
const T = await tilgangspunkter();
const tilgang = T.valgt;
const oppdagelse = nyOppdagelse({ posisjon: POS, tid: NÅ, tilgangspunkter: tilgang.map(s => ({ parentId: s.id, stopPlaceId: s.id, mode: s.moduser[0], distanceM: s.m })) });
const disc = [{ oppdagelse: oppdagelse.id, source: 'nettverksprobe', at: oppdagelse.tid }];

const L1 = await avgangerFra(tilgang, P.nAvg, 'ledd 1');
const ledd1Stopp = new Map();
for (const a of L1.avganger) for (const v of a.videre) if (!ledd1Stopp.has(v.id)) ledd1Stopp.set(v.id, v);

// C: knutepunkter — på samlestoppet
const info = await stoppInfo([...ledd1Stopp.keys()]);
const perSamle = new Map();
for (const [id, s] of info) {
  const pid = (s.parent && s.parent.id) || id;
  const e = perSamle.get(pid) || { id: pid, name: (s.parent && s.parent.name) || s.name, barn: new Set(), linjer: new Set(), moduser: new Set() };
  e.barn.add(id);
  for (const q of s.quays || []) for (const l of q.lines || []) { e.linjer.add(l.id); e.moduser.add(l.transportMode); }
  perSamle.set(pid, e);
}
// Søsken: samlestoppets andre understopp er ikke med i ledd 1 — parent-spørringen fanger dem i ledd 2.
const tilgangIder = new Set(tilgang.map(s => s.id));
const kandidatKnuter = [...perSamle.values()].filter(e => !tilgangIder.has(e.id))
  .map(e => ({ ...e, skifte: [...e.moduser].some(m => MODUSSKIFTE.has(m)), nLinjer: e.linjer.size }));
kandidatKnuter.sort((a, b) => (b.skifte - a.skifte) || (b.nLinjer - a.nLinjer) || (a.id < b.id ? -1 : 1));
const knuter = kandidatKnuter.filter(e => e.skifte || e.nLinjer >= 8).slice(0, P.knutepunkt);

const L2 = P.ledd >= 2 && knuter.length ? await avgangerFra(knuter, P.nKnute, 'ledd 2') : { avganger: [] };

// Kandidatopsjoner
const samleAv = id => { const s = info.get(id); return (s && s.parent && s.parent.id) || id; };
const kand = [];
for (const a of L1.avganger) {
  const tp = { parentId: a.fra.id, stopPlaceId: a.fra.id, quayId: a.quayId, mode: a.mode, lineId: a.lineId, distanceM: a.fra.m };
  const sti = { discoverer: 'nettverksprobe:ledd1', oppdagelse: oppdagelse.id, accessPoint: tp, lineId: a.lineId, hubs: [] };
  kand.push(nyOpsjon({ type: 'transport_offer', nøkkel: { tilgang: a.fra.id, modus: a.mode, linje: a.lineId }, label: `${a.mode} ${a.kode} fra ${a.fra.name}`, intent: 'bruke et tilbud i nærheten', origin: POS, accessPoints: [tp], discovery: disc, provenance: [sti], timetable: 'running' }));
  kand.push(nyOpsjon({ type: 'direction', nøkkel: { basis: 'line', nøkkel: `${a.lineId}>${a.retning}` }, label: `${a.kode} mot ${a.retning}`, intent: 'følge en retning', origin: POS, destinations: a.videre.slice(-1).map(v => ({ id: samleAv(v.id), name: v.name, lat: v.lat, lon: v.lon })), accessPoints: [tp], discovery: disc, provenance: [sti] }));
  for (const v of a.videre) kand.push(nyOpsjon({ type: 'destination', nøkkel: { destinasjon: samleAv(v.id) }, label: v.name, intent: 'reise til et sted', origin: POS, destinations: [{ id: samleAv(v.id), name: v.name, lat: v.lat, lon: v.lon }], accessPoints: [tp], discovery: disc, provenance: [sti] }));
}
const knuteNavn = new Map(knuter.map(k => [k.id, k]));
const tilKnute = new Map(); // knutepunkt → stier fra ledd 1 som når det
for (const a of L1.avganger) for (const v of a.videre) {
  const k = samleAv(v.id);
  if (knuteNavn.has(k)) (tilKnute.get(k) || tilKnute.set(k, []).get(k)).push(a);
}
for (const b of L2.avganger) {
  const inn = tilKnute.get(b.fra.id) || [];
  for (const v of b.videre) {
    const dest = { id: samleAv(v.id), name: v.name, lat: v.lat, lon: v.lon };
    const stier = inn.slice(0, 3).map(a => ({ discoverer: 'nettverksprobe:ledd2', oppdagelse: oppdagelse.id, accessPoint: { stopPlaceId: a.fra.id, quayId: a.quayId, mode: a.mode }, lineId: `${a.lineId}+${b.lineId}`, hubs: [b.fra.id] }));
    kand.push(nyOpsjon({ type: 'destination', nøkkel: { destinasjon: dest.id }, label: v.name, intent: 'reise til et sted', origin: POS, destinations: [dest], hubs: [b.fra.id], accessPoints: inn.slice(0, 3).map(a => ({ parentId: a.fra.id, stopPlaceId: a.fra.id, quayId: a.quayId, mode: a.mode, lineId: a.lineId, distanceM: a.fra.m })), discovery: disc, provenance: stier.length ? stier : [{ discoverer: 'nettverksprobe:ledd2', oppdagelse: oppdagelse.id, lineId: b.lineId, hubs: [b.fra.id] }] }));
  }
}
const opsjoner = samle(kand);
const dest = opsjoner.filter(o => o.type === 'destination');

// E: utvelgelse + bekreftelse
const { valgt, utenfor } = velgForBekreftelse(dest.filter(o => !tilgangIder.has(o.destinations[0].id)), P.bekreft);
const svar = valgt.length ? await bekreft(valgt) : [];
const forbindelser = [];
valgt.forEach((o, i) => {
  const { raw, ...c } = svar[i];
  o.confirmations.push(svar[i]);
  if (!raw || !raw.legs.length) return;
  const legs = raw.legs.map(({ kode, ...l }) => l);
  const hubs = legs.slice(1).map(l => l.from.stopPlaceId).filter(Boolean);
  const real = { accessPoint: { stopPlaceId: legs[0].from.stopPlaceId, quayId: legs[0].from.quayId, mode: legs[0].mode, lineId: legs[0].lineId }, departure: legs[0].start, legs, hubs, destination: o.destinations[0].id, times: { start: legs[0].start, end: legs.at(-1).end } };
  o.realisations.push(real);
  // En reise med bytte er også en FORBINDELSE — egen opsjon, samme reisesøk som grunnlag.
  if (hubs.length) forbindelser.push(nyOpsjon({ type: 'connection', nøkkel: { fra: legs[0].from.stopPlaceId, via: hubs, til: o.destinations[0].id },
    label: [legs[0].from.name, ...legs.slice(1).map(l => l.from.name), o.label].join(' → '), intent: 'kombinere transportmidler', origin: POS, destinations: o.destinations, hubs,
    realisations: [real], discovery: disc, provenance: [{ discoverer: 'nettverksprobe:reisesøk', oppdagelse: oppdagelse.id, accessPoint: real.accessPoint, lineId: legs.map(l => l.lineId).join('+'), hubs }],
    confirmations: [svar[i]] }));
});
opsjoner.push(...forbindelser);
const totalMs = Date.now() - t0;
const ugyldige = opsjoner.map(o => [o.id, avvik(o)]).filter(([, f]) => f.length);

/* ---------- sammenligning: dagens tavle ---------- */
// Tilnærming til dagens Auto-tavle [Kode: AUTO_BOARD_DEPARTURES=30, nærmeste stopp ≤ 850 m, uten tak per linje]:
// nærmeste tilgangspunkt, de 30 første avgangene i tid.
const nærmeste = T.innenfor.filter(s => s.m <= 850).sort((a, b) => a.m - b.m)[0];
const tavleRetninger = new Set(), tavleStopp = new Set();
if (nærmeste) {
  const L0 = L1.avganger.filter(a => a.fra.id === nærmeste.id).sort((a, b) => (a.tid < b.tid ? -1 : 1)).slice(0, 30);
  for (const a of L0) { tavleRetninger.add(`${a.lineId}>${a.retning}`); for (const v of a.videre) tavleStopp.add(samleAv(v.id)); }
}
const nyeDest = dest.filter(o => !tavleStopp.has(o.destinations[0].id));
const nyeRetn = opsjoner.filter(o => o.type === 'direction' && !tavleRetninger.has(o.nøkkel.nøkkel));

/* ---------- rapport ---------- */
const tell = (arr, f) => arr.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const finnes = navn => dest.find(o => (o.label || '').toLowerCase().includes(navn.toLowerCase()));
const dekning = STED.kjente.map(n => ({ n, funnet: !!finnes(n) }));
const rapport = {
  sted: P.sted, tid: NÅ.toISOString(), parametre: P,
  tilgang: { innenfor: T.innenfor.length, valgt: tilgang.length, kappet: T.kappet.map(s => `${s.name} (${s.m} m)`), stasjoner: tilgang.filter(s => s.stasjon).map(s => `${s.name} ${s.m} m [${s.cats.join(',')}]`) },
  ledd1: { avganger: L1.avganger.length, perModus: tell(L1.avganger, a => a.mode), linjer: new Set(L1.avganger.map(a => a.lineId)).size, unikeStoppVidere: ledd1Stopp.size, feil: L1.feil && L1.feil.map(e => e.message).slice(0, 2) },
  knutepunkt: { kandidater: kandidatKnuter.filter(e => e.skifte || e.nLinjer >= 8).length, valgt: knuter.map(k => `${k.name} (${k.nLinjer} linjer, ${[...k.moduser].join('/')}, ${k.barn.size} understopp sett)`) },
  ledd2: { avganger: L2.avganger.length, perModus: tell(L2.avganger, a => a.mode), linjer: new Set(L2.avganger.map(a => a.lineId)).size },
  opsjoner: { totalt: opsjoner.length, perType: tell(opsjoner, o => o.type), destinasjoner: dest.length, perScope: tell(dest, o => o.scope), tilgangspunkter: new Set(opsjoner.flatMap(o => o.accessPoints.map(t => t.quayId || t.stopPlaceId))).size, realiseringer: opsjoner.reduce((s, o) => s + o.realisations.length, 0), stier: opsjoner.reduce((s, o) => s + o.provenance.length, 0), flereStier: dest.filter(o => o.provenance.length > 1).length, ugyldige: ugyldige.length, ugyldigeEks: ugyldige.slice(0, 3), forbindelser: forbindelser.map(o => o.label) },
  bekreftelse: {
    valgt: valgt.length, utenforBudsjett: utenfor.length,
    perStatus: tell(valgt, o => bekreftelse(o, NÅ)), perTilgjengelighet: tell(valgt, o => tilgjengelighet(o, NÅ)),
    rader: valgt.map((o, i) => ({ mål: o.label, scope: o.scope, gruppe: o.hubs[0] ? knuteNavn.get(o.hubs[0])?.name : 'direkte', status: svar[i].state, tilgj: tilgjengelighet(o, NÅ), første: svar[i].firstDeparture, ...(svar[i].raw || {}), grunn: svar[i].grunn })),
  },
  nyeMotDagensTavle: { nærmeste: nærmeste && `${nærmeste.name} ${nærmeste.m} m`, tavleStopp: tavleStopp.size, tavleRetninger: tavleRetninger.size, nyeDestinasjoner: nyeDest.length, nyeRetninger: nyeRetn.length },
  dekning: { funnet: dekning.filter(d => d.funnet).length, av: dekning.length, mangler: dekning.filter(d => !d.funnet).map(d => d.n) },
  api: { kall: KALL.length, totalMs, kallListe: KALL.map(k => `${k.navn}: ${k.ms} ms${k.feil.length ? ' FEIL ' + k.feil.join(' | ') : ''}`) },
  notater,
};
console.log(JSON.stringify(rapport, null, 1));
if (arg.json) writeFileSync(arg.json, JSON.stringify({ rapport, opsjoner: opsjoner.slice(0, 50) }, null, 1));
