// v1.218.187: kartvalgene huskes.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { lesFokus, lagreFokus, lesRuteLinjer, lagreRuteLinjer, RUTE_LINJER_MAKS, FOKUS_KEY, RUTE_LINJER_KEY } from '../src/ui/kartValg.js';
import { storage } from '../src/storage.js';
import { KART_FOKUS, KART_FOKUS_TAVLE } from '../src/ui/kartFokus.js';

beforeEach(() => { storage.remove(FOKUS_KEY); storage.remove(RUTE_LINJER_KEY); });

describe('fokus per kart', () => {
  it('tur–retur', () => {
    lagreFokus('autoTavle', 'spor');
    expect(lesFokus('autoTavle', KART_FOKUS_TAVLE)).toBe('spor');
    expect(lesFokus('rute', KART_FOKUS)).toBe('oversikt');
  });
  it('en verdi kartet ikke har, gir oversikt («hele ruter» i Auto-reise)', () => {
    lagreFokus('auto', 'ruter');
    expect(lesFokus('auto', KART_FOKUS)).toBe('oversikt');
  });
});

describe('linjefilteret per rute', () => {
  it('tur–retur, og tomt filter = alle (slettes)', () => {
    lagreRuteLinjer('A|B', new Set(['76']));
    expect([...lesRuteLinjer('A|B')]).toEqual(['76']);
    lagreRuteLinjer('A|B', new Set());
    expect(lesRuteLinjer('A|B').size).toBe(0);
  });
  it(`høyst ${RUTE_LINJER_MAKS} ruter; den eldste ut`, () => {
    for (let i = 0; i <= RUTE_LINJER_MAKS; i++) lagreRuteLinjer('R' + i, ['1']);
    expect(lesRuteLinjer('R0').size).toBe(0);
    expect(lesRuteLinjer('R' + RUTE_LINJER_MAKS).size).toBe(1);
  });
});

describe('koblingen', () => {
  const a = readFileSync('src/views/auto.js', 'utf8'), b = readFileSync('src/views/board.js', 'utf8');
  it('fokusknappene lagrer', () => {
    expect(a).toMatch(/lagreFokus\(_autoTavle \? 'autoTavle' : 'auto', _kartFokus\);/);
    expect(b).toMatch(/_bKartFokus = nesteFokus\(_bKartFokus, KART_FOKUS\); lagreFokus\('rute', _bKartFokus\);/);
  });
  it('og leses der de før ble nullstilt', () => {
    expect(b).toMatch(/_bKartFokus = lesFokus\('rute', KART_FOKUS\);/);
    expect(b).toMatch(/_selectedLines = lesRuteLinjer\(ruteNøkkel\);/);
    expect(b).toMatch(/lagreRuteLinjer\(_linjeRute, _selectedLines\);/);
    expect(readFileSync('src/storage.js', 'utf8')).toMatch(/'t\.kartFokus',\s*'t\.ruteLinjer',/);
  });
});
