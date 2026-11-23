#!/usr/bin/env node
/**
 * Tar opp reisesøket for 4d delsteg 4 (tests/fixtures/entur/<scenario>.reisesok.json.gz).
 * Oppdagelsen SPILLES AV fra de eksisterende opptakene (så de faste referansene står),
 * og bare reisesøket hentes fra Entur. Kjøres manuelt.
 *   node scratchpad/opptakReisesok.mjs [scenario …]
 */
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { velgRepresentativt, bekreft } from '../src/reisebekreftelse.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
const HDR = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travelcompanion-reisebekreftelse' };
const UBRUKT = new Set(['situations', 'presentation', 'occupancyStatus', 'realtime', 'cancellation', 'pointsOnLink', 'steps']);
const trim = x => Array.isArray(x) ? x.map(trim) : (!x || typeof x !== 'object') ? x : Object.fromEntries(Object.entries(x).filter(([k]) => !UBRUKT.has(k)).map(([k, v]) => [k, trim(v)]));
const navn = process.argv.slice(2).length ? process.argv.slice(2) : ['mortensrud_dag', 'mortensrud_natt', 'nesttun_dag', 'ranheim_dag', 'tretten_dag'];
for (const n of navn) {
  const f = JSON.parse(gunzipSync(readFileSync(`tests/fixtures/entur/${n}.json.gz`)));
  _tømCache();
  const r = await utforsk(f.scenario, { hent: async k => f.opptak[k].svar });
  const u = velgRepresentativt(r, 10);
  const opptak = {};
  const hent = async (k, req) => { const j = await (await fetch(req.url, { method: req.method, headers: HDR, body: req.body })).json(); opptak[k] = { forespørsel: req, svar: trim(j) }; return j; };
  const b = await bekreft(u, r, f.scenario, { hent });
  writeFileSync(`tests/fixtures/entur/${n}.reisesok.json.gz`, gzipSync(JSON.stringify({ scenario: f.scenario, tatt: new Date().toISOString(), opptak })));
  console.log(n, JSON.stringify(b.rapport), b.notater.join(' '));
}
