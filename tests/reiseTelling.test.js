/**
 * Hva «tatt 28 ganger» teller — og fra nå av: reiser.
 *
 * Spurt: «Tellingen gir ikke mening. Hva er det som telles egentlig?
 * Oppleves som for høye tall.» Svaret var: hver gang du ÅPNET TAVLA for et
 * mål. `recordSmartTrip` satt i `_recordChoice`, som kjørte ved hvert trykk
 * på et kort, en snarvei, en favoritt eller et stopp. Å se er ikke å reise,
 * og kortene under «Dit du ofte skal» telte seg selv opp.
 *
 * Valgt av deg: tell bare faktiske reiser, og nullstill historikken.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { registrerReise, nullstillVaneTelling, VANE_TELLING } from '../src/api/smart.js';
import { loadSmartHist, destRanking } from '../src/api/smart.js';
import { storage } from '../src/storage.js';

const NÅ = Date.UTC(2026, 10, 3, 7, 30, 0);          // tirsdag
const rå = (k) => JSON.parse(localStorage.getItem('default::' + k) || 'null');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

describe('en reise', () => {
  const R = { fra: 'Mortensrud', til: 'Jernbanetorget', tilStopId: 'NSR:StopPlace:J',
    fraStopId: 'NSR:StopPlace:M', tilLat: 59.91, tilLon: 10.75, linje: '3' };

  it('telles i vanehistorikken', () => {
    registrerReise(R);
    const h = loadSmartHist();
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ fromName: 'Mortensrud', toName: 'Jernbanetorget', count: 1 });
  });

  /* Og reiseloggen får den SAMME hendelsen, fra samme dør. `sistReist` leser
   * den som «du reiste dit»; skrevet ved et trykk ville den sagt noe annet
   * enn tellingen. */
  it('og i reiseloggen, når den er slått på', () => {
    localStorage.setItem('default::t.memoryConsent', '1');
    registrerReise(R);
    const ev = rå('t.events') || [];
    expect(ev.filter(e => e.kind === 'reise').map(e => e.til)).toEqual(['Jernbanetorget']);
  });

  it('og uten mål teller den ingenting', () => {
    registrerReise({ fra: 'Mortensrud', til: '' });
    registrerReise(null);
    expect(loadSmartHist()).toHaveLength(0);
  });
});

describe('dørene', () => {
  const strip = f => require('node:fs').readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  it('«på» og «følg reisen» registrerer reisen', () => {
    const j = strip('src/journey.js');
    for (const fn of ['export function doBoard', 'export function joinJourney']) {
      const i = j.indexOf(fn);
      const kropp = j.slice(i, j.indexOf('\n}\n', i));
      expect(kropp, fn).toMatch(/registrerReise\(/);
    }
  });

  /* En oppfriskning er ikke en ny reise. `activateTracking` kjører også når
   * en lagret reise gjenopprettes ved oppstart. */
  it('men ikke en gjenopprettet reise', () => {
    const j = strip('src/journey.js');
    const i = j.indexOf('export function activateTracking');
    expect(j.slice(i, j.indexOf('\n}\n', i))).not.toMatch(/registrerReise\(/);
  });

  it('og å velge en rute registrerer ingen reise', () => {
    const s = strip('src/views/settings.js');
    const i = s.indexOf('function _recordChoice');
    const kropp = s.slice(i, s.indexOf('\n}\n', i));
    expect(kropp).not.toMatch(/recordSmartTrip\(|logEvent\('reise'/);
    expect(kropp).toMatch(/trackPlace\(/);
  });
});

/* ── HVERDAG OG HELG TELLES HVER FOR SEG ────────────────────────────────
 *
 * v1.192.0 summerte alle poster innenfor ±4 timer, hverdag og helg om
 * hverandre. 28 turer på lørdager er ikke dekning for en tirsdag. */
describe('summen', () => {
  it('teller ikke helgeturer på en hverdag', () => {
    const b = Math.floor(new Date(NÅ).getHours() / 2);
    storage.set('t.smartHist', JSON.stringify([
      { key: 'j|' + b + '|wd', toName: 'Jernbanetorget', bucket: b, isWeekend: false, count: 5, lastUsed: NÅ },
      { key: 'j|' + b + '|we', toName: 'Jernbanetorget', bucket: b, isWeekend: true, count: 23, lastUsed: NÅ },
    ]));
    expect(destRanking(NÅ)[0].count).toBe(5);
  });
});

/* ── NULLSTILLINGEN ─────────────────────────────────────────────────────
 *
 * De gamle tallene var trykk, ikke reiser, og kan ikke regnes om: appen
 * lagret ikke når hvert trykk skjedde. Valgt: nullstill. */
describe('nullstillingen', () => {
  const sett = () => {
    storage.set('t.smartHist', JSON.stringify([{ key: 'x', toName: 'X', count: 28, lastUsed: NÅ }]));
    storage.set('t.events', JSON.stringify([
      { kind: 'reise', at: NÅ, fra: 'A', til: 'B' },
      { kind: 'sok', at: NÅ, valgt: 'C' },
    ]));
  };

  it('sletter vanene og de gamle reise-hendelsene, og bare dem', () => {
    sett();
    nullstillVaneTelling();
    expect(rå('t.smartHist')).toBeNull();
    expect((rå('t.events') || []).map(e => e.kind)).toEqual(['sok']);
  });

  it('kjører én gang', () => {
    sett();
    nullstillVaneTelling();
    registrerReise({ fra: 'A', til: 'B' });
    nullstillVaneTelling();
    expect(loadSmartHist()).toHaveLength(1);
    expect(storage.get('t.vaneTelling')).toBe(VANE_TELLING);
  });

  it('og følger profilen', () => {
    const src = require('node:fs').readFileSync('src/storage.js', 'utf8');
    expect(src).toMatch(/'t\.vaneTelling'/);
  });

  it('og kalles ved oppstart, før noe leser vanene', () => {
    const m = require('node:fs').readFileSync('src/main.js', 'utf8');
    expect(m).toMatch(/nullstillVaneTelling\(\)/);
  });
});
