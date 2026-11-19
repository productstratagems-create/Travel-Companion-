// v1.218.145: «Funksjonene for klokkeslett i auto-sidene … Ta de bort.»
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { KLOKKESLETT_VALG } from '../src/fraTider.js';

const auto = readFileSync('src/views/auto.js', 'utf8');
const nav = readFileSync('src/ui/nav.js', 'utf8');

describe('klokkeslettfunksjonene er tatt bort', () => {
  it('bryteren er av', () => { expect(KLOKKESLETT_VALG).toBe(false); });
  it('ingen knapper: #auto-fra fjernes før noe tegnes', () => {
    const i = auto.indexOf('function _tegnFraValg() {');
    expect(auto.slice(i, i + 300)).toMatch(/if \(!KLOKKESLETT_VALG\) \{ const gml = _el\('auto-fra'\); if \(gml\) gml\.remove\(\); return; \}/);
  });
  it('intet valg kan settes: hentingen går fra nå', () => {
    const i = auto.indexOf('export function settFraValg(valg) {');
    expect(auto.slice(i, i + 200)).toMatch(/if \(!KLOKKESLETT_VALG\) \{ valg = null; _fraModus = 'nå'; \}/);
  });
  it('ingen «avganger etter» i innstillinger', () => {
    const i = nav.indexOf('// AVGANGER ETTER');
    expect(nav.slice(i, i + 200)).toMatch(/if \(!KLOKKESLETT_VALG\) return;/);
  });
  it('retningsfilteret i Auto-tavle står', () => {
    expect(auto).toMatch(/class="auto-fra at-retning"/);
  });
});
