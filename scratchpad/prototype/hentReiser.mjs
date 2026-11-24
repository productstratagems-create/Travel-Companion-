#!/usr/bin/env node
/**
 * Prototype for opplevelseskort: ekte reisedata for utvalget i inn.json.
 *   Entur  reisesøk fra utgangspunktet til stoppet, i morgen kl. 10 (Europe/Oslo)
 *   Valhalla  gange stopp → opplevelsens nærmeste punkt (der traceren ikke har målt)
 *   Wikidata  kort beskrivelse (nb, ellers en) for steder med Q-id
 * Kjør fra repo-roten: NODE_USE_ENV_PROXY=1 node scratchpad/prototype/hentReiser.mjs
 */
import fs from 'node:fs';
const inn = JSON.parse(fs.readFileSync('scratchpad/prototype/inn.json', 'utf8'));
const TID = '2026-11-25T10:00:00+01:00';
const UA = { 'User-Agent': 'travelcompanion-prototype', 'ET-Client-Name': 'productstratagems-travel-companion' };
const q = (fra, til) => `{ trip(from:{coordinates:{latitude:${fra.lat},longitude:${fra.lon}}}, to:{place:"${til}"}, dateTime:"${TID}", numTripPatterns:4, walkSpeed:1.3) {
  tripPatterns { expectedStartTime expectedEndTime duration legs { mode distance expectedStartTime expectedEndTime fromPlace{name} toPlace{name} line{publicCode} } } } }`;
const ut = [];
for (const o of inn) {
  const r = await (await fetch('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q(o.fra.pos, o.stopp.id) }) })).json();
  const tps = (r.data && r.data.trip.tripPatterns || []).filter(p => p.legs.some(l => l.mode !== 'foot'));
  const p = tps.sort((a, b) => Date.parse(a.expectedEndTime) - Date.parse(b.expectedEndTime))[0];
  const reise = p && { går: p.expectedStartTime, framme: p.expectedEndTime, min: Math.round(p.duration / 60),
    bytter: p.legs.filter(l => l.mode !== 'foot').length - 1, linjer: p.legs.filter(l => l.mode !== 'foot').map(l => (l.line && l.line.publicCode) || l.mode),
    fra: (p.legs.find(l => l.mode !== 'foot') || {}).fromPlace?.name || null, gangFørst: Math.round(p.legs.filter((l, i) => l.mode === 'foot' && i === 0).reduce((s, l) => s + (Date.parse(l.expectedEndTime) - Date.parse(l.expectedStartTime)) / 60000, 0)) };
  // Bare gange (sett: Skogstadrampa, 1,2 km fra Tretten): det er svaret, og det sies.
  let fots = null;
  if (!reise) {
    const f = await (await fetch('https://api.entur.io/journey-planner/v3/graphql', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q(o.fra.pos, o.stopp.id).replace('walkSpeed:1.3)', 'walkSpeed:1.3, modes:{directMode:foot})') }) })).json();
    fots = (f.data && f.data.trip.tripPatterns || [])[0] || null;
  }
  const reise2 = reise || (fots && { tilFots: true, ingenKollektiv: true, går: fots.expectedStartTime, framme: fots.expectedEndTime, min: Math.round(fots.duration / 60), bytter: 0, linjer: [] });
  let gang = o.gangTracer ? { ...o.gangTracer, kilde: 'valhalla (tracer)' } : null;
  if (!gang && Number.isFinite(o.lat)) {
    try {
      const v = await (await fetch('https://valhalla1.openstreetmap.de/route', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/json' }, body: JSON.stringify({ locations: [{ lat: o.stopp.lat, lon: o.stopp.lon }, { lat: o.lat, lon: o.lon }], costing: 'pedestrian', units: 'kilometers' }) })).json();
      if (v.trip) gang = { m: Math.round(v.trip.summary.length * 1000), min: Math.max(1, Math.round(v.trip.summary.time / 60)), kilde: 'valhalla' };
    } catch (_) {}
    await new Promise(r => setTimeout(r, 1100));
  }
  const qid = (o.kilder.find(k => k.startsWith('wikidata:')) || '').split(':')[1] || null;
  let beskrivelse = null;
  if (qid) {
    const w = await (await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(`SELECT ?nb ?en WHERE { OPTIONAL { wd:${qid} schema:description ?nb FILTER(LANG(?nb)="nb") } OPTIONAL { wd:${qid} schema:description ?en FILTER(LANG(?en)="en") } }`), { headers: { ...UA, Accept: 'application/json' } })).json();
    const b = w.results.bindings[0] || {};
    beskrivelse = (b.nb && { tekst: b.nb.value, språk: 'nb' }) || (b.en && { tekst: b.en.value, språk: 'en' }) || null;
  }
  ut.push({ ...o, qid, beskrivelse, reise: reise2, gang });
  console.log(o.navn.padEnd(36), '|', reise2 ? (reise2.tilFots ? `gå hele veien, ${reise2.min} min` : `${reise2.min} min · ${reise2.bytter} bytte · ${reise2.linjer.join('→')}`) : 'ingen reise', '|', gang ? gang.min + ' min gange' : 'gange ukjent', '|', beskrivelse ? beskrivelse.tekst : '–');
}
fs.writeFileSync('scratchpad/prototype/data.json', JSON.stringify({ hentet: new Date().toISOString(), avreise: TID, kort: ut }, null, 1));
