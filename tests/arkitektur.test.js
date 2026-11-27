/**
 * ARKITEKTURGRENSEN (v1.218.288, plangrunnlaget steg 1b). Håndhever
 * avhengighetsretningen mellom de personlige reiseoppgavene og den bredere
 * mulighetsoppdagelsen — via faktiske import-er (også transitive), ikke
 * tekstsøk etter kategorinavn:
 *
 *   reiseoppgaver.js       → reiseberegning.js
 *   mulighetsoppdagelse.js → reiseberegning.js
 *   ikke: mulighetsoppdagelse.js → reiseoppgaver.js (eller omvendt)
 *   ikke: reiseberegning.js → noen av dem
 *
 * views/auto.js (presentasjonen) er det eneste stedet som setter dem sammen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ROT = resolve('src');
const fil = n => resolve(ROT, n);
/** Import-er og re-eksporter i én fil, løst til filstier i src/. */
export function importerI(sti, kilde = readFileSync(sti, 'utf8')) {
  const ut = [];
  const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]|(?:^|\n)\s*import\s+['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(kilde))) {
    const r = m[1] || m[2] || m[3];
    let p = resolve(dirname(sti), r);
    if (!p.endsWith('.js') && !p.endsWith('.json')) p += '.js';
    if (existsSync(p)) ut.push(p);
  }
  return ut;
}
/** Alle filer en fil når, transitivt. */
function når(start, overstyr = {}) {
  const sett = new Set(), kø = [start];
  while (kø.length) {
    const f = kø.pop();
    if (sett.has(f) || !f.endsWith('.js')) continue;
    sett.add(f);
    importerI(f, overstyr[f]).forEach(x => kø.push(x));
  }
  sett.delete(start);
  return sett;
}
const OPPG = fil('reiseoppgaver.js'), MUL = fil('mulighetsoppdagelse.js'), BER = fil('reiseberegning.js');
const navn = s => [...s].map(f => relative(ROT, f));

describe('arkitekturgrensen: snarveier og andre muligheter (steg 1b)', () => {
  it('reiseoppgavene bruker felles beregning, men når ikke mulighetsoppdagelsen', () => {
    const n = når(OPPG);
    expect(n.has(BER)).toBe(true);
    expect(navn(n)).not.toContain('mulighetsoppdagelse.js');
    expect(navn(n)).not.toContain('views/auto.js');
  });
  it('mulighetsoppdagelsen når ikke reiseoppgavene', () => {
    const n = når(MUL);
    expect(navn(n)).not.toContain('reiseoppgaver.js');
    expect(navn(n)).not.toContain('views/auto.js');
  });
  it('felles beregning når ingen av domenene', () => {
    const n = navn(når(BER));
    expect(n).not.toContain('reiseoppgaver.js');
    expect(n).not.toContain('mulighetsoppdagelse.js');
    expect(n).not.toContain('views/auto.js');
  });
  it('presentasjonen setter dem sammen — filtrerRetning eier ingen av domenene', () => {
    const a = readFileSync(fil('views/auto.js'), 'utf8');
    const i = a.indexOf('export function filtrerRetning('), kropp = a.slice(i, a.indexOf('\n}', i));
    expect(kropp).toMatch(/iSnarvei\(/);
    expect(kropp).toMatch(/andreRetninger\(/);
    expect(kropp).toMatch(/iOmråde\(/);
    expect(kropp).not.toMatch(/=== 'mot'|=== 'hjem'|startsWith\('omr:'\)/);
  });
  it('opsjonsmodellen (steg 2) når verken reiseoppgavene, mulighetsoppdagelsen eller presentasjonen', () => {
    const n = navn(når(fil('opsjonsmodell.js')));
    expect(n).not.toContain('reiseoppgaver.js');
    expect(n).not.toContain('mulighetsoppdagelse.js');
    expect(n.filter(x => x.startsWith('views/'))).toEqual([]);
    expect(n.filter(x => x.startsWith('api/'))).toEqual([]); // ren modell: ingen API
  });
  it('nettverksutforskeren (trinn 4) når verken snarveier, relevans, presentasjon eller UI', () => {
    const n = navn(når(fil('nettverksutforsker.js')));
    expect(n).toContain('opsjonsmodell.js');
    expect(n).not.toContain('reiseoppgaver.js');
    expect(n).not.toContain('mulighetsoppdagelse.js');
    expect(n.filter(x => x.startsWith('views/') || x.startsWith('ui/') || x === 'config.js')).toEqual([]);
  });
  it('reisebekreftelsen (4d) tar oppdagelsen som data: når verken utforskeren, snarveier, relevans eller UI', () => {
    const n = navn(når(fil('reisebekreftelse.js')));
    for (const x of ['nettverksutforsker.js', 'reiseoppgaver.js', 'mulighetsoppdagelse.js', 'config.js']) expect(n).not.toContain(x);
    expect(n.filter(x => x.startsWith('views/') || x.startsWith('ui/'))).toEqual([]);
  });
  it('«ett bytte» (eksperiment) når verken snarveier, relevans eller presentasjon', () => {
    const n = navn(når(fil('ettBytte.js')));
    for (const x of ['reiseoppgaver.js', 'mulighetsoppdagelse.js', 'reisebekreftelse.js']) expect(n).not.toContain(x);
    expect(n.filter(x => x.startsWith('views/') || x.startsWith('ui/'))).toEqual([]);
  });
  // Måleinstrumentet selv: en innsmuglet import, direkte eller via en mellomfil, skal fanges.
  it('vakten fanger en import (mutasjon)', () => {
    const kilde = readFileSync(MUL, 'utf8');
    const med = "import { motSentrum } from './reiseoppgaver.js';\n" + kilde;
    expect(navn(når(MUL, { [MUL]: med }))).toContain('reiseoppgaver.js');
    const via = "import { x } from './maalomrader.js';\n";
    const malKilde = readFileSync(fil('maalomrader.js'), 'utf8');
    expect(navn(når(MUL, { [MUL]: via + kilde, [fil('maalomrader.js')]: "import './reiseoppgaver.js';\n" + malKilde }))).toContain('reiseoppgaver.js');
  });
});

/* BRUKERKONTEKSTEN (#809 steg 2, v1.218.330): ren og selvstendig. Når bare posisjonsporten (position.js → haversine.js); ikke state, geo,
 * api/*, views/*, ui/* — og ingen av dem importerer den (ingen konsument ennå). */
describe('arkitekturgrensen: userContext (#809 steg 2)', () => {
  const UC = fil('userContext.js');
  it('når bare position.js og haversine.js — ingen state, geo, nettverk, visning', () => {
    expect(navn(når(UC)).sort()).toEqual(['haversine.js', 'position.js']);
  });
  it('vakten fanger en innsmuglet import (mutasjon)', () => {
    const kilde = readFileSync(UC, 'utf8');
    expect(navn(når(UC, { [UC]: "import { state } from './state.js';\n" + kilde }))).toContain('state.js');
    expect(navn(når(UC, { [UC]: "import { fartNå } from './geo.js';\n" + kilde }))).toContain('geo.js');
  });
});
