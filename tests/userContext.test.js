/* USERCONTEXT (#809 steg 2, v1.218.330) — datagrunnlag uten konsument. Testene bygger fra de ekte `posState` og `ombord`
 * med baseline-forløpene fra steg 1 (tests/fixtures/posisjon/baseline.js; KONSTRUERT, ikke ekte GPS). */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/storage.js', () => { let s = {}; return { storage: { get: k => s[k] ?? null, set: (k, v) => { s[k] = v; }, remove: k => { delete s[k]; } } }; });

import { byggUserContext, userContextGyldig, KONTEKST_UTLØP_MS, TRANSIT_AV_OMBORD } from '../src/userContext.js';
import { posState, POS_STALE_MS } from '../src/position.js';
import { ombord } from '../src/api/ombord.js';
import { FORLØP, LAT } from './fixtures/posisjon/baseline.js';
import { støyspor } from './fixtures/posisjon/bevegelse.js';

const SISTE = f => f.spor[f.spor.length - 1];
const posT = (f, ekstra = {}, nå = SISTE(f).at + 1000) => { const p = SISTE(f); return posState({ asked: true, homeLL: { lat: p.lat, lon: p.lon }, posAt: p.at, acc: p.acc, now: nå, ...ekstra }); };
const ombordFor = f => ombord({ spor: f.spor, fartMS: f.fartMS, kandidater: [{ nøkkel: 'k', linje: '37', front: 'x', call: {}, forventet: f.spor.map(p => ({ at: p.at, lat: LAT, lon: p.lon })) }] });
const bygg = (n, ekstra = {}, nå) => { const f = FORLØP[n], t = nå ?? SISTE(f).at + 1000; return byggUserContext({ pos: SISTE(f), posTilstand: posT(f, {}, t), fartMS: f.fartMS, ombord: ombordFor(f), nå: t, ...ekstra }); };

describe('oversettelse av ombord-status', () => {
  it('buss og T-bane → onboard; gange og stillstand → unknown (aldri «ikke ombord»)', () => {
    expect(bygg('sitter på buss (10 m/s østover)').transit.state).toBe('onboard');
    expect(bygg('sitter på T-bane (18 m/s østover)').transit.state).toBe('onboard');
    for (const n of ['står stille ved et stopp', 'går mot Granebakken (1,4 m/s, 110 m unna)', 'GPS hopper og mister nøyaktighet']) expect(bygg(n).transit.state).toBe('unknown');
  });
  it('tabellen: ombord-tvil → uncertain, vet-ikke → unknown, ukjent verdi → unknown; ingen verdi heter «not_onboard»', () => {
    expect(TRANSIT_AV_OMBORD).toEqual({ ombord: 'onboard', 'ombord-tvil': 'uncertain', 'vet-ikke': 'unknown' });
    expect(Object.values(TRANSIT_AV_OMBORD)).not.toContain('not_onboard');
    const f = FORLØP['står stille ved et stopp'];
    expect(byggUserContext({ pos: SISTE(f), posTilstand: posT(f), ombord: { kind: 'ny-ukjent-verdi' }, nå: SISTE(f).at + 1000 }).transit.state).toBe('unknown');
    expect(byggUserContext({ pos: SISTE(f), posTilstand: posT(f), ombord: null, nå: SISTE(f).at + 1000 }).transit.state).toBe('unknown');
  });
});

describe('bevegelse (steg 3): fra inferBevegelse når spor gis; ellers unknown. Stopp: fortsatt unknown', () => {
  it('uten spor: movement.state unknown, bare observert fart bæres med; stopRelation unknown', () => {
    for (const n of Object.keys(FORLØP)) { const c = bygg(n); expect(c.movement).toMatchObject({ state: 'unknown', confidence: 0, windowSeconds: 0, evidenceCount: 0 }); expect(c.stopRelation).toEqual({ state: 'unknown', stopId: null }); }
    expect(bygg('sitter på buss (10 m/s østover)').movement.fartMS).toBe(10);
    expect(bygg('står stille ved et stopp', { fartMS: null }).movement.fartMS).toBe(null);
    expect(bygg('står stille ved et stopp', { fartMS: -1 }).movement.fartMS).toBe(null);
  });
  it('med langt nok spor: stationary/moving med confidence, vindu og antall; med ubrukbar/utløpt posisjon: tom kontekst (unknown, 0)', () => {
    const still = støyspor({ x: () => 0, sigma: 3, n: 60, seed: 3 }), går = støyspor({ x: t => 1.4 * t, sigma: 3, n: 60, seed: 4 });
    const ctx = (sp, ekstra = {}) => { const p = sp[sp.length - 1], nå = p.at + 500; return byggUserContext({ pos: p, posTilstand: { kind: 'ok', usable: true }, spor: sp, nå, ...ekstra }); };
    expect(ctx(still).movement).toMatchObject({ state: 'stationary' });
    expect(ctx(går).movement).toMatchObject({ state: 'moving' });
    expect(ctx(går).movement.confidence).toBeGreaterThan(0); expect(ctx(går).movement.evidenceCount).toBeGreaterThan(50);
    expect(ctx(går, { posTilstand: { kind: 'avslatt', usable: false } }).movement).toMatchObject({ state: 'unknown', confidence: 0, evidenceCount: 0 });
    const p = går[går.length - 1];
    expect(byggUserContext({ pos: p, posTilstand: { kind: 'ok', usable: true }, spor: går, nå: p.at + KONTEKST_UTLØP_MS }).movement.state).toBe('unknown');
  });
  it('forrigeBevegelse sendes videre (hysterese): i dødsonen beholdes forrige', () => {
    const dø = støyspor({ x: t => 0.125 * t, sigma: 0, accRap: 5, n: 60, seed: 2 }), p = dø[dø.length - 1];
    const m = f => byggUserContext({ pos: p, posTilstand: { kind: 'ok', usable: true }, spor: dø, nå: p.at + 500, forrigeBevegelse: f }).movement.state;
    expect(m({ state: 'moving' })).toBe('moving'); expect(m(null)).toBe('unknown');
  });
});

describe('posisjonskvalitet: holdt adskilt, tom kontekst når ubrukelig', () => {
  const f = FORLØP['står stille ved et stopp'], p = SISTE(f), nå = p.at + 1000;
  const med = (ekstra, pos = p) => byggUserContext({ pos, posTilstand: posState({ asked: true, homeLL: { lat: p.lat, lon: p.lon }, posAt: pos.at, acc: pos.acc, now: nå, ...ekstra }), nå });
  it('brukbar posisjon: available, kind ok, nøyaktighet og tidspunkt med', () => {
    const c = med({});
    expect(c.position).toMatchObject({ available: true, usable: true, kind: 'ok', accuracyM: 10, observedAt: p.at, ageMs: 1000 });
    expect(c.expiresAt).toBe(p.at + KONTEKST_UTLØP_MS);
  });
  it('hver ubrukbare tilstand beholder SIN kind (ikke én generell status) og gir tom kontekst', () => {
    const kinds = {};
    const gammel = { ...p, at: p.at - 90_000 };
    for (const [navn, ekstra, pos] of [['avslatt', { gpsError: 'denied' }], ['utilgjengelig', { gpsError: 'unavailable' }], ['tidsavbrudd', { gpsError: 'timeout' }],
      ['leter', { homeLL: null }], ['ukjent-alder', { posAt: null }], ['gammel', {}, gammel], ['borte', { posAt: p.at - 400_000 }, { ...p, at: p.at - 400_000 }]]) {
      const c = med(ekstra, pos || p);
      expect(c.position.available, navn).toBe(false); expect(c.position.usable).toBe(false);
      expect(c.transit.state).toBe('unknown'); expect(c.movement.fartMS).toBe(null); expect(c.movement.state).toBe('unknown'); expect(c.expiresAt).toBe(null);
      kinds[navn] = c.position.kind;
    }
    expect(kinds).toEqual({ avslatt: 'avslatt', utilgjengelig: 'utilgjengelig', tidsavbrudd: 'tidsavbrudd', leter: 'leter', 'ukjent-alder': 'ukjent-alder', gammel: 'gammel', borte: 'borte' });   // alle forskjellige, ingen slått sammen
  });
  it('«unøyaktig» er brukbar i posState (posisjonen holdes): available, men kind sier hvorfor den er mistenkelig', () => {
    const c = med({ rejAt: p.at + 500 });
    expect(c.position).toMatchObject({ available: true, kind: 'unoyaktig' });
  });
  it('en ubrukbar posisjon med ombord-svar «ombord» gir likevel tom kontekst (ingen foreldet tilstand)', () => {
    const c = byggUserContext({ pos: p, posTilstand: { kind: 'avslatt', usable: false }, ombord: { kind: 'ombord' }, fartMS: 10, nå });
    expect(c.transit.state).toBe('unknown'); expect(c.movement.fartMS).toBe(null);
  });
});

describe('utløp: grenseverdiene rundt KONTEKST_UTLØP_MS (foreløpig 60 s, umålt)', () => {
  const f = FORLØP['sitter på buss (10 m/s østover)'], p = SISTE(f), ok = { kind: 'ok', usable: true };
  const ved = nå => byggUserContext({ pos: p, posTilstand: ok, ombord: { kind: 'ombord' }, fartMS: 10, nå });
  it('konstanten er navngitt og lik posisjonsporten', () => expect(KONTEKST_UTLØP_MS).toBe(POS_STALE_MS));
  it('ett ms før utløp: gyldig; på utløpet: utløpt; ett ms etter: utløpt', () => {
    const u = p.at + KONTEKST_UTLØP_MS;
    expect(userContextGyldig(ved(u - 1), u - 1)).toBe(true);
    expect(ved(u - 1).transit.state).toBe('onboard');
    expect(userContextGyldig(ved(u - 1), u)).toBe(false);        // samme kontekst, sett på utløpet
    for (const nå of [u, u + 1]) { const c = ved(nå); expect(c.position.available).toBe(false); expect(c.position.kind).toBe('utløpt'); expect(c.transit.state).toBe('unknown'); expect(userContextGyldig(c, nå)).toBe(false); }
  });
  it('tom kontekst og manglende argumenter er aldri gyldige og kaster ikke', () => {
    expect(userContextGyldig(null)).toBe(false); expect(userContextGyldig(byggUserContext(undefined))).toBe(false);
    expect(byggUserContext({}).position.available).toBe(false);
  });
});

describe('isolert: ingen konsument (userContext og bevegelse), og baselinen er uendret', () => {
  it('auto.js, geo.js, ombord.js og trail.js importerer ikke userContext (ingen anbefaling, rangering eller visning leser den)', () => {
    for (const fil of ['src/views/auto.js', 'src/geo.js', 'src/api/ombord.js', 'src/trail.js', 'src/position.js']) expect(fs.readFileSync(fil, 'utf8')).not.toMatch(/userContext/);
    const ALLE = fs.readdirSync('src', { recursive: true }).filter(f => String(f).endsWith('.js')).map(f => 'src/' + f);
    expect(ALLE.filter(f => f !== 'src/userContext.js' && /userContext/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
  });
  it('rangeringen kontrolleres av de EKSISTERENDE baseline-testene (tests/posisjonBaseline.test.js), ikke av denne modulen', () => {
    expect(fs.existsSync('tests/posisjonBaseline.test.js')).toBe(true);
  });
});
