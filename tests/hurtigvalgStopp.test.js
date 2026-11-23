import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { listeStoppKandidat, listeStoppRo, bestFor } from '../src/views/auto.js';

// Bergen, som skjermbildet: nærmere stopp (A, 4 min) uten avganger mot sentrum;
// stopp B 12 min unna med begge avgangene mot sentrum.
const nå = Date.parse('2026-11-23T22:51:00+01:00');
const kall = (fra, min) => ({ ms: nå + min * 60000, call: { _fra: { id: fra } } });
const mot = [{ calls: [kall('B', 13)] }, { calls: [kall('B', 17)] }, { calls: [kall('B', 25)] }];
const ut = [{ calls: [kall('A', 6)] }, { calls: [kall('A', 9)] }, { calls: [kall('A', 15)] }];
const gang = id => (id === 'A' ? 4 : 12);

describe('hurtigvalget avgjør «beste stopp herfra» (v1.218.274)', () => {
  it('før-bildet: alle retninger telt → A sto; mot sentrum telt → B', () => {
    expect(listeStoppKandidat([...mot, ...ut], 'A', gang, nå).id).toBe('A');
    const k = listeStoppKandidat(mot, 'A', gang, nå);
    expect(k).toMatchObject({ id: 'B', antall: 3, eget: 0 });
  });
  it('et trykk gir svar straks; uten trykk gjelder ro (90 s)', () => {
    const k = listeStoppKandidat(mot, 'A', gang, nå);
    expect(listeStoppRo(null, k, 'A', nå).bytt).toBeNull();
    expect(listeStoppRo(null, k, 'A', nå, true).bytt).toBe('B');
  });
  it('kravet om to flere avganger gjelder også etter et trykk', () => {
    expect(listeStoppRo(null, { id: 'B', antall: 2, eget: 1 }, 'A', nå, true).bytt).toBeNull();
  });
  it('merkelappen sier hva «beste» gjelder', () => {
    expect(bestFor('beste stopp herfra', 'mot', 'mot sentrum')).toBe('beste stopp mot sentrum');
    expect(bestFor('beste stopp herfra', 'hjem', 'hjemover')).toBe('beste stopp hjemover');
    expect(bestFor('beste stopp herfra', 'andre', 'andre retninger')).toBe('beste stopp for andre retninger');
    expect(bestFor('beste stopp herfra', 'alle', 'alle')).toBe('beste stopp herfra');
    expect(bestFor('du er ved', 'mot', 'mot sentrum')).toBe('du er ved');
  });
  it('koblingen: lista teller _iRetning, trykket gir straks, ikke ved stoppet', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    // v1.218.278: telleregelen er reserven når reisesøket mangler; samme _iRetning.
    expect(a).toMatch(/listeStoppKandidat\(_iRetning\(_dirs, nåW\), _stop\.id, gangId, nåW\)/);
    expect(a).toMatch(/_listeRo = listeStoppRo\(_listeRo, kandidat, _stop\.id, nåW, straks\);/);
    expect(a).toMatch(/_hurtigStraks = true; _listeValgt = null; _renderBody\(\); _renderWhere\(\);/);
    expect(a).toMatch(/!_stopPinned && !picked\.changed && _stop && _dirs && _dirs\.length && !vedStoppet/);
  });
});
