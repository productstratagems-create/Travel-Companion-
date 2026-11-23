import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kanVisesHer, listeStoppKandidat } from '../src/views/auto.js';

// Oslo (opptaket): tavla er Mortensrud med Stenbråten flettet inn; reisesøket
// peker på Kantarellen (15 min, ikke i tavla). Trondheim: Ranheim med
// Vikhammer utenfor tavla.
const kall = fra => ({ ms: 0, call: fra ? { _fra: { id: fra } } : {} });
const OSLO = [{ calls: [kall(null), kall('Stb')] }];
const TRD = [{ calls: [kall(null)] }];

describe('overskriften flyttes bare til stopp i tavla (v1.218.284)', () => {
  it('før-bildet: Kantarellen (utenfor tavla) flyttet overskriften og ga ny tavle; nå står den', () => {
    expect(kanVisesHer('Kantarellen', 'Mrud', OSLO)).toBe(false);
    expect(kanVisesHer('Vikhammer', 'Ranheim', TRD)).toBe(false);
  });
  it('tavlas eget stopp og stopp som er flettet inn: ja', () => {
    expect(kanVisesHer('Stb', 'Mrud', OSLO)).toBe(true);
    expect(kanVisesHer('Mrud', 'Mrud', OSLO)).toBe(true);
    expect(kanVisesHer(null, 'Mrud', OSLO)).toBe(false);
  });
  it('telleregelen: kall uten _fra går fra tavlas stopp, kandidaten måles mot overskriften', () => {
    const nå = 0, gang = () => 0;
    const k = (fra, min) => ({ ms: min * 60000, call: fra ? { _fra: { id: fra } } : {} });
    const dirs = [{ calls: [k(null, 5)] }, { calls: [k(null, 6)] }, { calls: [k(null, 7)] }, { calls: [k('Stb', 8)] }];
    // Overskriften står på Stb, tavla er Mrud: Mrud har 3, Stb 1 → Mrud er kandidaten, målt mot Stb.
    expect(listeStoppKandidat(dirs, 'Mrud', gang, nå, 5, 'Stb')).toEqual({ id: 'Mrud', antall: 3, eget: 1 });
  });
  it('koblingen: reisesøkets stopp må kunne vises her', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/const kandidat = viaReise && kanVisesHer\(viaReise\.id, _tavle\(\) && _tavle\(\)\.id, _dirs\)/);
  });
});
