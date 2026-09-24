/**
 * Posisjonen og alderen sin reiser sammen.
 *
 * Funnet gjennom et skjermbilde av underveis-skjermen: stripen øverst sa
 * «3 stopp igjen · etter rutetid» og uthevet Skullerud, mens stopplista rett
 * under sa at neste var Ryen, etter posisjon. To påstander om samme sak, på
 * samme skjerm, i strid med hverandre.
 *
 * ÅRSAKEN er to ulike dommer om ÉN posisjon:
 *
 *   posState        homeLL finnes, posAt er null  →  ageMs == null
 *                   → hopper over alle alderssjekkene → 'ok', usable: true
 *   _trainPosition  krever posAt != null og (now - posAt) < POS_STALE_MS
 *                   → avviser den
 *
 * Og de er uenige nøyaktig når posAt er null — som er tilfellet RETT ETTER
 * OPPSTART. `geo.js` lagrer posisjonen hvert tiende sekund, men bare
 * `{lat, lon}`, selv om kommentaren to linjer over sier «Kept so staleness
 * can be told». Tidsstempelet faller bort, og ved neste oppstart blir en
 * posisjon fra i går kalt fersk.
 */
import { describe, it, expect } from 'vitest';
import { posState, POS_STALE_MS, POS_DEAD_MS } from '../src/position.js';

const HER = { lat: 59.91, lon: 10.75 };
const NÅ = Date.parse('2026-09-24T08:00:00Z');

describe('en posisjon uten alder', () => {
  // FØR-BILDET. Uten tidsstempel hoppet posState over alle alderssjekkene og
  // kalte posisjonen fersk — og da vant den over ruteplanen.
  it('kalles ikke fersk', () => {
    const r = posState({ asked: true, homeLL: HER, posAt: null, now: NÅ });
    expect(r.usable).toBe(false);
  });

  // Og den sier hva den ikke vet. «Vi vet ikke hvor gammel den er» er ikke
  // samme setning som «den er fersk», og heller ikke som «den er avslått».
  it('sier at alderen er ukjent, med egne ord', () => {
    const r = posState({ asked: true, homeLL: HER, posAt: null, now: NÅ });
    expect(r.label).toBeTruthy();
    expect(r.label).not.toBe('');
    const andre = ['stedstjenester er avslått', 'leter etter posisjonen …'];
    expect(andre).not.toContain(r.label);
  });
});

describe('og de aldrene den kjenner, som før', () => {
  const med = (alderMs) => posState({ asked: true, homeLL: HER,
    posAt: NÅ - alderMs, now: NÅ });

  it('fersk er fersk', () => {
    expect(med(5000)).toMatchObject({ kind: 'ok', usable: true });
  });

  it('gammel er brukbar, men navngitt', () => {
    const r = med(POS_STALE_MS + 60000);
    expect(r.kind).toBe('gammel');
    expect(r.usable).toBe(true);
  });

  it('borte er ikke brukbar', () => {
    expect(med(POS_DEAD_MS + 60000)).toMatchObject({ kind: 'borte', usable: false });
  });

  // En posisjon lagret i går og hentet fram ved oppstart havner her når
  // tidsstempelet følger med — og det er hele poenget med at det gjør det.
  it('en posisjon fra i går er borte, ikke fersk', () => {
    expect(med(20 * 3600 * 1000).usable).toBe(false);
  });
});

/**
 * Og at lagringen faktisk tar vare på tidsstempelet.
 *
 * Kildetest, fordi `_handleFix` sitter bak et GPS-abonnement som ikke finnes
 * i vitest. Det den binder er at feltet ikke forsvinner igjen.
 */
describe('geo.js lagrer alderen med posisjonen', () => {
  const src = () => require('node:fs')
    .readFileSync('src/geo.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  // \bat: og ikke at: — «lat:» INNEHOLDER «at:», så den løse varianten
  // bestod mot dagens kode og målte ingenting.
  it('skriver tidsstempelet', () => {
    expect(src()).toMatch(/HOME_LL_KEY, JSON\.stringify\(\{[^}]*\bat:/);
  });

  // I GJENOPPRETTINGEN, ikke hvor som helst. Den løse varianten fant
  // `state.posAt = at` inne i _handleFix og bestod selv når gjenopprettingen
  // ble revet ut — riktig streng, feil sted, og mutanten overlevde.
  it('og leser det tilbake når appen starter', () => {
    const s = src();
    const i = s.indexOf('HOME_LL_KEY');
    const restore = s.slice(s.lastIndexOf('const _hlSaved'));
    expect(i).toBeGreaterThan(-1);
    expect(restore).toMatch(/Number\.isFinite\(p\.at\)/);
    expect(restore).toMatch(/state\.posAt = p\.at/);
  });
});
