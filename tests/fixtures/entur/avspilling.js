/**
 * Avspilling av Entur-opptak for nettverksutforskeren. Opptakene tas med
 * scratchpad/opptakEntur.mjs; testene trenger ikke nett, og avhenger ikke av
 * at Entur-data forblir uendret.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';

export const SCENARIOER = ['mortensrud_dag', 'mortensrud_natt', 'nesttun_dag', 'ranheim_dag', 'tretten_dag'];
export function lastOpptak(navn) {
  return JSON.parse(gunzipSync(readFileSync(resolve('tests/fixtures/entur', navn + '.json.gz'))));
}
/**
 * `hent` som spiller av. `endre(navn, svar)` kan bytte svaret (feil, manglende
 * data); `kast` = navn som skal feile helt. Teller kallene.
 */
export function avspiller(opptak, { endre, kast = [] } = {}) {
  const kall = [];
  const hent = async (navn, req) => {
    kall.push({ navn, req });
    if (kast.includes(navn)) throw new Error('nettverksfeil (simulert)');
    const o = opptak.opptak[navn];
    if (!o) throw new Error('mangler i opptaket: ' + navn);
    const svar = JSON.parse(JSON.stringify(o.svar));
    return endre ? endre(navn, svar) : svar;
  };
  return { hent, kall };
}
