// v1.218.171: Auto-tavle til fots — gangtid per rad, «gå om», rangering og gangavstand.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { radGang, gåOm, knutepunkt, TAVLE_GANG_M, KNUTEPUNKT_M, canCatch } from '../src/views/auto.js';

const nå = Date.UTC(2026, 10, 20, 8, 0), M = 60_000;
const NABO = { id: 'N', name: 'Tveita T' };
const gangTil = s => (s.id === 'N' ? 7 : null);

describe('gangtid per rad', () => {
  // FØR-BILDET: hovedstoppet 2 min unna, nabostoppet 7 min. Avgang fra naboen om 5 min.
  it('en avgang fra nabostoppet om 5 min, 7 min å gå: rekker ikke', () => {
    const call = { _fra: NABO };
    expect(canCatch(nå + 5 * M, 2, nå)).toBe(true);                       // med hovedstoppets gangtid
    expect(canCatch(nå + 5 * M, radGang(call, 2, gangTil), nå)).toBe(false);
  });
  it('rader fra hovedstoppet bruker hovedstoppets gangtid', () => {
    expect(radGang({}, 2, gangTil)).toBe(2);
  });
});

describe('når du må gå', () => {
  it('buss om 9 min, 8 min unna: gå om 1 min — og står over en avgang om 6 min, 1 min unna', () => {
    expect(gåOm(nå + 9 * M, 8, nå)).toBe(1);
    const rader = [{ ms: nå + 6 * M, gang: 1 }, { ms: nå + 9 * M, gang: 8 }];
    rader.sort((a, b) => (a.ms - a.gang * M) - (b.ms - b.gang * M));
    expect(rader[0].gang).toBe(8);
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/del\.rekker\.sort\(\(a, b\) => \(a\.ms - a\.gang \* 60_000\) - \(b\.ms - b\.gang \* 60_000\)\);/);
  });
});

describe('gangavstand i tavla', () => {
  const her = { id: 'H', lat: 59.9, lon: 10.8, modes: ['bus'] };
  const langt = { id: 'L', lat: 59.9054, lon: 10.8, modes: ['bus'] };   // ~600 m
  it('et stopp 600 m unna er med i tavla, ikke i Auto-reise', () => {
    expect(knutepunkt(her, [langt]).map(s => s.id)).toEqual(['H']);
    expect(knutepunkt(her, [langt], TAVLE_GANG_M, 5).map(s => s.id)).toEqual(['H', 'L']);
    expect(KNUTEPUNKT_M).toBe(250);
  });
});
