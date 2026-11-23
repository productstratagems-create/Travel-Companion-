#!/usr/bin/env node
/**
 * Tar opp Entur-svar for nettverksutforskerens fiksturer
 * (tests/fixtures/entur/<scenario>.json.gz). Kjøres manuelt; testene bruker
 * bare opptakene. Nøkkel = kallets navn; forespørselen lagres ved siden av,
 * så en test kan se om koden spør annerledes enn da opptaket ble gjort.
 *
 *   node scratchpad/opptakEntur.mjs [scenario …]
 */
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

export const SCENARIOER = {
  mortensrud_dag: { posisjon: { lat: 59.8487, lon: 10.8291 }, tid: '2026-11-24T12:00:00+01:00' },
  mortensrud_natt: { posisjon: { lat: 59.8487, lon: 10.8291 }, tid: '2026-11-25T01:30:00+01:00' },
  nesttun_dag: { posisjon: { lat: 60.3197, lon: 5.3537 }, tid: '2026-11-24T12:00:00+01:00' },
  ranheim_dag: { posisjon: { lat: 63.4286, lon: 10.5248 }, tid: '2026-11-24T12:00:00+01:00' },
  tretten_dag: { posisjon: { lat: 61.3125, lon: 10.3005 }, tid: '2026-11-24T12:00:00+01:00' },
};
const HDR = { 'Content-Type': 'application/json', 'ET-Client-Name': 'travelcompanion-nettverksutforsker' };
for (const navn of (process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SCENARIOER))) {
  const opptak = {};
  _tømCache();
  const hent = async (n, req) => {
    const r = await fetch(req.url, { method: req.method, headers: HDR, body: req.body });
    const j = await r.json();
    opptak[n] = { forespørsel: req, svar: j };
    return j;
  };
  const res = await utforsk(SCENARIOER[navn], { hent });
  writeFileSync(`tests/fixtures/entur/${navn}.json.gz`, gzipSync(JSON.stringify({ scenario: SCENARIOER[navn], tatt: new Date().toISOString(), opptak })));
  console.log(navn, JSON.stringify(res.rapport));
}
