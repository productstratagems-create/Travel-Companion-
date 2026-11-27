/* STÅR STILLE / BEVEGER SEG (#809 steg 3, v1.218.331). KONSTRUERTE, seedede støyspor — IKKE ekte GPS: målefrekvens, støyfordeling i bykløfter,
 * innendørs, strupet bakgrunnsmodus, tunneler og stillestående busser er ikke målt. Tersklene er hypoteser kalibrert mot denne simuleringen. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { inferBevegelse, renset, Z_NED, Z_OPP, MIN_FIKSER, UTLØP_MS, HOLD_MS, BEVEGELSE_MAKS_ACC_M } from '../src/bevegelse.js';
import { støyspor, T0, prng } from './fixtures/posisjon/bevegelse.js';

const slutt = sp => sp[sp.length - 1].at;
const inf = (spor, ekstra = {}) => inferBevegelse({ spor, nå: slutt(spor) + 500, ...ekstra });
/** En bekreftet forrige tilstand, bekreftet `agoMs` før siste fiks (+500 ms som `inf` bruker). */
const bekr = (state, sp, agoMs = 5000) => ({ state, bekreftetVed: slutt(sp) + 500 - agoMs });
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
    for (const dt of [UTLØP_MS, 2 * UTLØP_MS, 10 * UTLØP_MS]) expect(inferBevegelse({ spor: sp, nå: slutt(sp) + dt, forrige: { state: 'moving', bekreftetVed: slutt(sp) } }).state).toBe('unknown');
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
    const d = død();
    expect(inf(d, { forrige: bekr('moving', d) })).toMatchObject({ state: 'moving', reason: 'dødsone' });
    expect(inf(d, { forrige: bekr('stationary', d) }).state).toBe('stationary');
    expect(inf(d).state).toBe('unknown');
    expect(inf(d, { forrige: { state: 'moving' } }).state).toBe('unknown');        // ubekreftet forrige (ingen bekreftetVed) holdes ikke
    expect(Z_NED).toBeLessThan(Z_OPP);
  });
  it('ro krever strengere evidens enn «ikke bevegelse»: et kort, rolig spor gir unknown (aldri stationary), og en tidligere moving holdes', () => {
    const kort = støyspor({ x: () => 0, sigma: 0, accRap: 3, n: 14, seed: 8 });   // ~12 s, null støy, men gange kan ikke utelukkes
    expect(inf(kort)).toMatchObject({ state: 'unknown', reason: 'inkonklusiv' });
    expect(inf(kort, { forrige: bekr('moving', kort) }).state).toBe('moving');
    expect(inf(kort, { forrige: bekr('stationary', kort) }).state).toBe('stationary');
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

describe('HYSTERESEN HAR UTLØP (v1.218.332): bekreftet tilstand holdes høyst HOLD_MS i dødsonen', () => {
  const d = støyspor({ x: t => 0.125 * t, sigma: 0, accRap: 5, n: 60, seed: 2 });   // z i dødsonen
  it('holdes ved HOLD_MS, utløper like etter; holdingen fornyer ikke bekreftelsen', () => {
    const nå = slutt(d) + 500;
    const med = ago => inferBevegelse({ spor: d, nå, forrige: { state: 'moving', bekreftetVed: nå - ago } });
    expect(med(HOLD_MS).state).toBe('moving');
    expect(med(HOLD_MS + 1).state).toBe('unknown');
    expect(med(HOLD_MS).bekreftetVed).toBe(nå - HOLD_MS);   // ikke fornyet
    // Kjede: samme dødsone-spor mates gjentatt; etter HOLD_MS fra siste bekreftelse er tilstanden unknown, uansett hvor mange ganger den er holdt.
    let r = { state: 'moving', bekreftetVed: nå }, sist = 'moving';
    for (let t = 0; t <= 3 * HOLD_MS; t += 1000) { r = inferBevegelse({ spor: d, nå: nå + t, forrige: r }); sist = r.state; if (t > HOLD_MS) expect(r.state, 't=' + t).toBe('unknown'); }
    expect(sist).toBe('unknown');
  });
});

describe('simulering over lange tidsforløp (seedet mulberry32, ≥ 30 seeds, KONSTRUERT støy — ikke ekte GPS)', () => {
  const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i * 7919);
  /** Glidende vindu over en lang serie. `hysterese`: mater forrige resultat tilbake. → tilstand per sekund-steg. */
  function kjør(alt, vinS, hysterese) {
    const ut = []; let forrige = null;
    for (const f of alt) {
      if (f.at - alt[0].at < vinS * 1000) continue;
      const v = alt.filter(g => g.at <= f.at && f.at - g.at <= vinS * 1000);
      const r = inferBevegelse({ spor: v, nå: f.at + 100, forrige: hysterese ? forrige : null }); ut.push({ at: f.at, state: r.state }); forrige = r;
    }
    return ut;
  }
  const andel = (ut, s) => ut.filter(x => x.state === s).length / ut.length;
  const lang = (x, sigma, takt, seed, dur = 600) => støyspor({ x, sigma, takt, n: Math.round(dur / takt), seed });

  it('stillestående telefon: falsk «moving» < 1 % per vindu OG med hysterese (σ 3–20, takt 1–5 s, vindu 30 og 60 s, 30 seeds)', () => {
    for (const sigma of [3, 8, 20]) for (const takt of [1, 5]) for (const vin of [30, 60]) for (const hyst of [false, true]) {
      const snitt = SEEDS.reduce((s, seed) => s + andel(kjør(lang(() => 0, sigma, takt, seed), vin, hyst), 'moving'), 0) / SEEDS.length;
      expect(snitt, `σ${sigma} takt${takt} vindu${vin} ${hyst ? 'med' : 'uten'} hysterese`).toBeLessThan(0.01);
    }
  });
  it('VARIGHET: hver falsk «moving»-episode for en stillestående telefon varer høyst 2·HOLD_MS (ny positiv evidens kan fornye den én gang; en LÅS ville vart minutter), i alle 30 seeds', () => {
    for (const [sigma, takt] of [[8, 1], [8, 5], [15, 1]]) for (const seed of SEEDS) {
      const ut = kjør(lang(() => 0, sigma, takt, seed), 60, true); let start = null, maks = 0;
      for (const x of ut) { if (x.state === 'moving') { if (start == null) start = x.at; maks = Math.max(maks, x.at - start); } else start = null; }
      expect(maks, `σ${sigma} takt${takt} seed${seed}`).toBeLessThanOrEqual(2 * HOLD_MS);
    }
  });
  it('gange 1,0–1,6 m/s: «moving» ≥ 90 % (σ ≤ 10, takt ≤ 3, vindu 60 s), aldri «stationary» > 1 %', () => {
    for (const v of [1.0, 1.4, 1.6]) for (const sigma of [3, 10]) {
      const ut = SEEDS.slice(0, 10).map(seed => kjør(lang(t => v * t, sigma, 2, seed), 60, true));
      expect(ut.reduce((s, u) => s + andel(u, 'moving'), 0) / ut.length, v + '/' + sigma).toBeGreaterThanOrEqual(0.9);
      expect(ut.reduce((s, u) => s + andel(u, 'stationary'), 0) / ut.length).toBeLessThan(0.01);
    }
  });
  it('TID ETTER AT BEVEGELSEN OPPHØRER: «moving» varer høyst vindu + HOLD_MS (ikke minutter), og «stationary» nås når data bevis', () => {
    // 150 s gange, så 300 s stille (tett takt, lav støy) — gjentatt med 12 seeds.
    for (const seed of SEEDS.slice(0, 12)) {
      const alt = lang(t => Math.min(t, 150) * 1.4, 4, 1, seed, 450), ut = kjør(alt, 60, true), stopp = alt[0].at + 150_000;
      const sisteMoving = Math.max(...ut.filter(x => x.state === 'moving').map(x => x.at));
      expect(sisteMoving - stopp, 'seed' + seed).toBeLessThanOrEqual(60_000 + HOLD_MS + 2000);   // vinduet må renses + holdetid
      expect(ut[ut.length - 1].state, 'seed' + seed).toBe('stationary');
    }
  });
  it('LANGE SEKVENSER med gjentatte overganger (stille → gange → stille → GPS-støy → avbrudd → stille): bare to ekte overganger (ingen flapping), ingen låsing, og unknown i avbruddet', () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const x = t => (t < 120 ? 0 : t < 240 ? (t - 120) * 1.4 : t < 360 ? 168 : t < 420 ? 168 : 168);
            const alt = støyspor({ x, sigma: 4, takt: 1, n: 600, seed }).filter(f => { const t = (f.at - T0) / 1000; return !(t >= 440 && t < 520); });   // GPS-avbrudd 80 s
      const ut = kjør(alt, 60, true);
      const kompakt = ut.map(u => u.state).filter(x => x !== 'unknown').filter((x, i, a2) => i === 0 || x !== a2[i - 1]);
      expect(kompakt, 'tilstandsrekkefølge, seed' + seed).toEqual(['stationary', 'moving', 'stationary']);   // to ekte overganger, ingen flapping
      const avbrudd = ut.filter(u => (u.at - T0) / 1000 >= 440 + 60 + 1 && (u.at - T0) / 1000 < 519);   // vinduet tomt eller utløpt
      expect(avbrudd.every(u => u.state === 'unknown'), 'avbrudd, seed' + seed).toBe(true);
    }
  });
});

describe('confidence og felt', () => {
  it('felt og avrunding: state, speedMps, confidence (0,05-steg, 0 for unknown), windowSeconds, evidenceCount', () => {
    const r = inf(gange());
    expect(Object.keys(r).sort()).toEqual(['bekreftetVed', 'confidence', 'evidenceCount', 'reason', 'speedMps', 'state', 'windowSeconds']);
    expect(r.bekreftetVed).toBe(slutt(gange()) + 500);                    // direkte evidens bekreftes «nå»
    expect(inf(gange({ n: 2 })).bekreftetVed).toBe(null);
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
