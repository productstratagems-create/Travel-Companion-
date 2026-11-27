/* STÅR STILLE / BEVEGER SEG (#809 steg 3, v1.218.331). KONSTRUERTE, seedede støyspor — IKKE ekte GPS: målefrekvens, støyfordeling i bykløfter,
 * innendørs, strupet bakgrunnsmodus, tunneler og stillestående busser er ikke målt. Tersklene er hypoteser kalibrert mot denne simuleringen. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inferBevegelse, renset, Z_NED, Z_OPP, MIN_FIKSER, UTLØP_MS, BEVEGELSE_MAKS_ACC_M } from '../src/bevegelse.js';
import { støyspor, T0, prng } from './fixtures/posisjon/bevegelse.js';

const slutt = sp => sp[sp.length - 1].at;
const inf = (spor, ekstra = {}) => inferBevegelse({ spor, nå: slutt(spor) + 500, ...ekstra });
const stille = (o = {}) => støyspor({ x: () => 0, sigma: 5, n: 60, seed: 3, ...o });
const gange = (o = {}) => støyspor({ x: t => 1.4 * t, sigma: 5, n: 60, seed: 4, ...o });

describe('de ti forløpene', () => {
  it('1 står stille, små GPS-utslag → stationary', () => expect(inf(stille()).state).toBe('stationary'));
  it('2 går jevnt over tid → moving', () => expect(inf(gange()).state).toBe('moving'));
  it('3 begynner å gå etter å ha stått stille: gradvis overgang, ingen flapping', () => {
    const alt = støyspor({ x: t => Math.max(0, t - 90) * 1.4, sigma: 5, n: 180, seed: 5 });
    const tilstander = []; let forrige = null;
    for (let i = 60; i < alt.length; i++) { const r = inferBevegelse({ spor: alt.slice(i - 59, i + 1), nå: alt[i].at + 100, forrige }); tilstander.push(r.state); forrige = r; }
    const kompakt = tilstander.filter((s, i) => i === 0 || s !== tilstander[i - 1]);
    expect(kompakt[0]).toBe('stationary'); expect(kompakt[kompakt.length - 1]).toBe('moving');
    expect(kompakt.filter(s => s === 'stationary').length).toBe(1);                       // stationary → … → moving: aldri tilbake
    expect(kompakt.indexOf('moving')).toBe(kompakt.lastIndexOf('moving'));               // og moving flakker ikke
  });
  it('4 stanser etter å ha gått: gradvis overgang til stationary, ingen flapping', () => {
    const alt = støyspor({ x: t => Math.min(t, 90) * 1.4, sigma: 5, n: 200, seed: 6 });
    const tilstander = []; let forrige = null;
    for (let i = 60; i < alt.length; i++) { const r = inferBevegelse({ spor: alt.slice(i - 59, i + 1), nå: alt[i].at + 100, forrige }); tilstander.push(r.state); forrige = r; }
    const kompakt = tilstander.filter((s, i) => i === 0 || s !== tilstander[i - 1]);
    expect(kompakt[0]).toBe('moving'); expect(kompakt[kompakt.length - 1]).toBe('stationary');
    expect(kompakt.filter(s => s === 'moving').length).toBe(1);
  });
  it('5 store tilfeldige GPS-hopp (rapportert acc lyver) → unknown, ikke automatisk moving', () => {
    const { rnd } = prng(9), sp = stille({ accRap: 8 }).map(f => ({ ...f, lon: f.lon + (rnd() - 0.5) * 0.01 }));   // ±~280 m tilfeldig
    expect(inf(sp).state).toBe('unknown');
  });
  it('6 få målinger → unknown (selv med stor forflytning)', () => {
    for (const n of [1, 2, MIN_FIKSER - 1]) expect(inf(støyspor({ x: t => 50 * t, n, seed: 7 })).state).toBe('unknown');
    expect(inf(støyspor({ x: t => 50 * t, n: 1, seed: 7 })).reason).toBe('for-faa-fikser');
  });
  it('7 gammel posisjon → unknown, også med et sterkt «moving»-spor', () => {
    const sp = gange();
    expect(inf(sp).state).toBe('moving');
    const gammel = inferBevegelse({ spor: sp, nå: slutt(sp) + UTLØP_MS });
    expect(gammel).toMatchObject({ state: 'unknown', reason: 'gammel', confidence: 0 });
    expect(inferBevegelse({ spor: sp, nå: slutt(sp) + UTLØP_MS - 1 }).state).toBe('moving');   // grensen
  });
  it('8 dårlig/motstridende grunnlag → unknown: dårlig acc gir ikke falsk sikkerhet; filteret mot forflytning gir unknown', () => {
    expect(inf(stille({ sigma: 30, accRap: 30 })).state).not.toBe('moving');
    expect(inf(stille({ sigma: 5, accRap: BEVEGELSE_MAKS_ACC_M + 1 })).state).toBe('unknown');            // acc over grensen teller ikke
    expect(inf(gange(), { fartMS: 0.0 })).toMatchObject({ state: 'unknown', reason: 'motstridende' });    // forflytning sier bevegelse, filteret ro
  });
  it('9 kortvarig fartstopp midt i gange: ingen unødvendig tilstandsveksling', () => {
    const alt = støyspor({ x: t => (t < 40 ? 1.4 * t : t < 50 ? 56 : 56 + 1.4 * (t - 50)), sigma: 5, n: 200, seed: 11 });
    const s = []; let forrige = null;
    for (let i = 60; i < alt.length; i++) { const r = inferBevegelse({ spor: alt.slice(i - 59, i + 1), nå: alt[i].at + 100, forrige }); s.push(r.state); forrige = r; }
    expect(s.filter((x, i) => i > 0 && x !== s[i - 1] && x !== 'unknown' && s[i - 1] !== 'unknown').length).toBe(0);   // aldri direkte moving ↔ stationary
    expect(s).not.toContain('stationary');
  });
  it('10 GPS-avbrudd: tilstanden utløper (ingen lang levetid for siste svar)', () => {
    const sp = gange();
    for (const dt of [UTLØP_MS, 2 * UTLØP_MS, 10 * UTLØP_MS]) expect(inferBevegelse({ spor: sp, nå: slutt(sp) + dt, forrige: { state: 'moving' } }).state).toBe('unknown');
  });
});

describe('dårlig posisjonskvalitet gir ikke falsk sikkerhet', () => {
  it('ubrukbare fikser (acc over grensen) kastes, og de gode avgjør: gange med hvert 5. punkt som løgnaktig hopp er fortsatt moving', () => {
    const sp = gange().map((f, i) => (i % 5 === 2 ? { ...f, lon: f.lon + 0.006, acc: 200 } : f));
    expect(inf(sp).state).toBe('moving');
    expect(renset(sp, slutt(sp) + 1).every(f => f.acc <= BEVEGELSE_MAKS_ACC_M)).toBe(true);
  });
  it('for optimistisk rapportert nøyaktighet (acc 1 m, faktisk støy 8 m) gir ikke «moving» for en som står stille (σ-gulvet)', () => {
    for (const seed of [21, 22, 23, 24, 25, 26]) expect(inf(støyspor({ x: () => 0, sigma: 8, accRap: 1, n: 40, seed })).state, 'seed' + seed).not.toBe('moving');
  });
});

describe('hysterese har betydning (dødsone mellom Z_NED og Z_OPP)', () => {
  // Sann forflytning uten støy, rapportert acc 5 → z ≈ 2,7: mellom terskelene.
  const død = () => støyspor({ x: t => 0.125 * t, sigma: 0, accRap: 5, n: 60, seed: 2 });
  it('i dødsonen beholdes forrige tilstand; uten forrige er svaret unknown', () => {
    expect(inf(død(), { forrige: { state: 'moving' } }).state).toBe('moving');
    expect(inf(død(), { forrige: { state: 'stationary' } }).state).toBe('stationary');
    expect(inf(død()).state).toBe('unknown');
    expect(Z_NED).toBeLessThan(Z_OPP);
  });
  it('ro krever strengere evidens enn «ikke bevegelse»: et kort, rolig spor gir unknown (aldri stationary), og en tidligere moving holdes', () => {
    const kort = støyspor({ x: () => 0, sigma: 0, accRap: 3, n: 14, seed: 8 });   // ~12 s, null støy, men gange kan ikke utelukkes
    expect(inf(kort)).toMatchObject({ state: 'unknown', reason: 'inkonklusiv' });
    expect(inf(kort, { forrige: { state: 'moving' } }).state).toBe('moving');
    expect(inf(kort, { forrige: { state: 'stationary' } }).state).toBe('stationary');
  });
});

describe('enkeltmålinger og utliggere', () => {
  it('én måling kan ikke utløse moving; ett løgnaktig hopp midt i et rolig spor snur ikke tilstanden', () => {
    expect(inf(støyspor({ x: () => 0, sigma: 0, n: 1 }).concat(støyspor({ x: () => 500, sigma: 0, n: 1, fra: 2 }))).state).toBe('unknown');
    for (const i of [10, 20, 40, 50]) expect(inf(støyspor({ x: () => 0, sigma: 5, n: 60, seed: 3, hopp: [{ i, m: 400 }] })).state, 'hopp i punkt ' + i).toBe('stationary');   // median, ikke snitt (mutant)
  });
});

describe('tidsrekkefølge, duplikater og ujevn tidsavstand', () => {
  it('usortert og duplisert spor gir samme svar som renset og sortert', () => {
    const sp = gange(), blandet = [...sp].reverse().concat(sp.slice(10, 20)), nå = slutt(sp) + 500;
    expect(inferBevegelse({ spor: blandet, nå })).toEqual(inferBevegelse({ spor: sp, nå }));
    expect(renset(blandet, slutt(sp) + 1)).toEqual(renset(sp, slutt(sp) + 1));
  });
  it('ujevn tidsavstand (0,5–5 s) og fremtidige tidsstempler', () => {
    for (const takt of [0.5, 2, 5]) expect(inf(støyspor({ x: t => 1.4 * t, sigma: 4, n: Math.round(70 / takt), takt, seed: 12 })).state).toBe('moving');
    const sp = stille(); expect(inferBevegelse({ spor: [...sp, { ...sp[0], at: slutt(sp) + 1e6 }], nå: slutt(sp) + 500 }).state).toBe('stationary');
  });
});

describe('simulering: falsk «moving» og oversett gange (seedet, KONSTRUERT støy — ikke ekte GPS)', () => {
  function rate(x, sigma, takt, seed) {
    const alt = støyspor({ x, sigma, takt, n: Math.round(600 / takt), seed }), c = { moving: 0, stationary: 0, unknown: 0 }; let forrige = null;
    for (let i = 0; i < alt.length; i++) {
      const vindu = alt.filter(f => f.at <= alt[i].at && alt[i].at - f.at <= 60_000);
      if (alt[i].at - alt[0].at < 60_000) continue;
      const r = inferBevegelse({ spor: vindu, nå: alt[i].at + 100, forrige }); c[r.state]++; forrige = r;
    }
    const tot = c.moving + c.stationary + c.unknown; return { moving: c.moving / tot, stationary: c.stationary / tot, unknown: c.unknown / tot };
  }
  it('stillestående telefon (σ 3–20 m, takt 1–3 s, 60 s vindu): falsk «moving» < 1 %', () => {
    for (const sigma of [3, 5, 10, 20]) for (const takt of [1, 3]) expect(rate(() => 0, sigma, takt, 100 + sigma).moving, 'σ' + sigma + ' takt' + takt).toBeLessThan(0.01);
  });
  it('gange 1,0–1,6 m/s (σ ≤ 10 m, 60 s vindu): «moving» i minst 90 %, aldri «stationary» mer enn 1 %', () => {
    for (const v of [1.0, 1.4, 1.6]) for (const sigma of [3, 5, 10]) { const r = rate(t => v * t, sigma, 1, 200 + sigma); expect(r.moving, v + '/' + sigma).toBeGreaterThanOrEqual(0.9); expect(r.stationary).toBeLessThan(0.01); }
  });
  it('FUNN: stillstand gjenkjennes bare med lang nok spor og lav nok støy (60 s ved σ ≤ 8 m); korte spor gir unknown — ikke feil svar', () => {
    expect(rate(() => 0, 3, 1, 300).stationary).toBeGreaterThan(0.9);
    expect(rate(() => 0, 8, 1, 301).stationary).toBeGreaterThan(0.8);
    expect(inf(støyspor({ x: () => 0, sigma: 8, n: 12, seed: 5 })).state).toBe('unknown');    // 12 fikser ≈ dagens posTrail-lengde ved 1 Hz
  });
});

describe('confidence og felt', () => {
  it('felt og avrunding: state, speedMps, confidence (0,05-steg, 0 for unknown), windowSeconds, evidenceCount', () => {
    const r = inf(gange());
    expect(Object.keys(r).sort()).toEqual(['confidence', 'evidenceCount', 'reason', 'speedMps', 'state', 'windowSeconds']);
    expect(r.confidence).toBeGreaterThan(0); expect(r.confidence).toBeLessThanOrEqual(1); expect(Math.round(r.confidence * 20) / 20).toBe(r.confidence);
    expect(r.evidenceCount).toBeGreaterThanOrEqual(55); expect(r.windowSeconds).toBeGreaterThan(50);
    expect(inf(gange({ n: 2 })).confidence).toBe(0);
  });
  it('mer og bedre data gir ikke lavere confidence (monoton i spennet)', () => {
    const c = n => inf(støyspor({ x: t => 1.4 * t, sigma: 3, n, seed: 4 })).confidence;
    expect(c(30)).toBeLessThanOrEqual(c(60));
  });
});

describe('de sju baseline-forløpene fra steg 1 gjennom inferensen (korte spor, acc 10 m: unknown er et gyldig og ærlig svar)', () => {
  it('stillstand og kort gange (30 s, acc 10) → unknown; 100 s gange, buss og T-bane → moving; GPS-hopp (4 brukbare) → unknown', async () => {
    const { FORLØP } = await import('./fixtures/posisjon/baseline.js');
    const ut = Object.fromEntries(Object.entries(FORLØP).map(([n, f]) => [n, inferBevegelse({ spor: f.spor, fartMS: f.fartMS, nå: f.spor[f.spor.length - 1].at + 500 }).state]));
    expect(ut).toEqual({
      'står stille ved et stopp': 'unknown', 'går mot Granebakken (1,4 m/s, 110 m unna)': 'moving',
      'går bort fra Stenbråten, 82 m unna (innenfor båndet)': 'unknown', 'går bort fra Stenbråten, 180 m unna (utenfor båndet)': 'moving',
      'sitter på buss (10 m/s østover)': 'moving', 'sitter på T-bane (18 m/s østover)': 'moving', 'GPS hopper og mister nøyaktighet': 'unknown',
    });
  });
});

describe('isolert', () => {
  it('ingen andre enn userContext importerer bevegelse.js; auto.js, geo.js, pickStop er urørt', () => {
    const ALLE = fs.readdirSync('src', { recursive: true }).filter(f => String(f).endsWith('.js')).map(f => 'src/' + f);
    expect(ALLE.filter(f => !['src/bevegelse.js', 'src/userContext.js'].includes(f) && /bevegelse\.js|inferBevegelse/.test(fs.readFileSync(f, 'utf8')))).toEqual([]);
    for (const f of ['src/views/auto.js', 'src/geo.js', 'src/api/ombord.js', 'src/trail.js', 'src/position.js']) expect(fs.readFileSync(f, 'utf8')).not.toMatch(/inferBevegelse|userContext/);
  });
});
