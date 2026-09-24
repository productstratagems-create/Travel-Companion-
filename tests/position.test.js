/**
 * «Ikke spurt», «leter», «avslått», «unøyaktig» og «gammel» er ikke samme
 * setning.
 *
 * Five facts wore one sentence: noPosText took only state.gpsError, which is
 * null, 'denied' or 'nostops'. PositionError codes 2 and 3 never reached state
 * at all, and ACC_GATE threw away noisy fixes without recording that it had —
 * geo.js called that discard «silent» in its own comment. The dot stopped
 * moving and the screen looked exactly as it does when all is well.
 */
import { describe, it, expect } from 'vitest';
import { posState, gpsErrorKind, ACC_GATE, POS_STALE_MS, POS_DEAD_MS }
  from '../src/position.js';

const NOW = Date.parse('2026-09-17T08:00:00Z');
const ago = (ms) => NOW - ms;
const LL = { lat: 59.9, lon: 10.75 };
const ps = (o) => posState({ now: NOW, ...o });

describe('posState — the five that were one', () => {
  it('tells «not asked» from «searching»', () => {
    expect(ps({ asked: false, homeLL: null }).kind).toBe('ikke-spurt');
    expect(ps({ asked: true, homeLL: null }).kind).toBe('leter');
  });

  it('names each refusal by its own cause', () => {
    expect(ps({ gpsError: 'denied', homeLL: LL }).kind).toBe('avslatt');
    expect(ps({ gpsError: 'unavailable', homeLL: LL }).kind).toBe('utilgjengelig');
    expect(ps({ gpsError: 'timeout', homeLL: LL }).kind).toBe('tidsavbrudd');
  });

  // A refusal outranks a position we still hold: it names something the reader
  // can act on, and the held fix only gets older from here.
  it('lets a refusal outrank a position we still have', () => {
    expect(ps({ gpsError: 'denied', homeLL: LL, posAt: NOW }).usable).toBe(false);
  });

  it('is silent when the fix is good', () => {
    const s = ps({ asked: true, homeLL: LL, posAt: ago(5000) });
    expect(s.kind).toBe('ok');
    expect(s.label).toBe('');
    expect(s.usable).toBe(true);
  });

  // THE ONE THAT COST SOMETHING. ACC_GATE discards anything worse than ±40 m
  // once a fix exists. Fixes ARE arriving; the screen simply froze.
  it('says the position is inaccurate rather than freezing in silence', () => {
    const s = ps({ asked: true, homeLL: LL, posAt: ago(90_000), rejAt: ago(2000), acc: 120 });
    expect(s.kind).toBe('unoyaktig');
    expect(s.label).toContain('120');
  });

  // «±120 m» explains the staleness; «2 min gammel» only reports it. So the
  // explanation has to win — and this is the assertion that says so.
  it('prefers the cause over the symptom when both are true', () => {
    const s = ps({ asked: true, homeLL: LL, posAt: ago(5 * 60_000), rejAt: ago(1000), acc: 90 });
    expect(s.kind).toBe('unoyaktig');
  });

  // A discard from ten minutes ago explains nothing about now — the device may
  // have stopped answering entirely, which is a different sentence.
  it('stops blaming accuracy once the discards have stopped too', () => {
    const s = ps({ asked: true, homeLL: LL, posAt: ago(9 * 60_000), rejAt: ago(8 * 60_000), acc: 90 });
    expect(s.kind).toBe('borte');
  });

  // An accepted fix NEWER than the last discard means the gate let one
  // through: whatever was wrong has passed.
  it('does not call it inaccurate when a good fix arrived after the bad one', () => {
    expect(ps({ asked: true, homeLL: LL, posAt: ago(1000), rejAt: ago(30_000), acc: 90 }).kind)
      .toBe('ok');
  });

  it('escalates from old to gone, on the boundary in seconds', () => {
    expect(ps({ asked: true, homeLL: LL, posAt: ago(POS_STALE_MS) }).kind).toBe('ok');
    expect(ps({ asked: true, homeLL: LL, posAt: ago(POS_STALE_MS + 1000) }).kind).toBe('gammel');
    expect(ps({ asked: true, homeLL: LL, posAt: ago(POS_DEAD_MS) }).kind).toBe('gammel');
    expect(ps({ asked: true, homeLL: LL, posAt: ago(POS_DEAD_MS + 1000) }).kind).toBe('borte');
  });

  // Position fine, nothing within the radius — the one state here that is not
  // about the sensor. It must stay usable: there IS a position.
  it('keeps «no stop nearby» separate from «no position»', () => {
    const s = ps({ asked: true, homeLL: LL, posAt: NOW, gpsError: 'nostops' });
    expect(s.kind).toBe('ingen-stopp');
    expect(s.usable).toBe(true);
  });

  it('treats a future timestamp as no age rather than as fresh', () => {
    expect(ps({ asked: true, homeLL: LL, posAt: NOW + 60_000 }).kind).toBe('ok');
  });

  it('survives junk', () => {
    expect(() => posState(null)).not.toThrow();
  });

  /* Og et tidsstempel som ikke er et tall er IKKE «fersk».
   *
   * Denne testen bandt før `kind === 'ok'` for `posAt: 'i går'`, og det var
   * nettopp feilen: uten en brukbar alder falt alle alderssjekkene bort og
   * funksjonen endte på 'ok'. Samme hull traff en ekte sak — en posisjon
   * gjenopprettet fra forrige økt, der `geo.js` lagret lat/lon men ikke
   * tidsstempelet. Den ble kalt fersk, vant over ruteplanen på
   * underveis-skjermen, og sa noe annet enn stripen to centimeter over, som
   * dømte den samme posisjonen etter sin egen regel.
   *
   * «Vi vet ikke hvor gammel den er» er sin egen setning. */
  it('kaller en posisjon uten brukbar alder for ukjent, ikke fersk', () => {
    const r = ps({ asked: true, homeLL: LL, posAt: 'i går' });
    expect(r.kind).toBe('ukjent-alder');
    expect(r.usable).toBe(false);
    expect(ps({ asked: true, homeLL: LL, posAt: null }).kind).toBe('ukjent-alder');
  });
});

describe('gpsErrorKind', () => {
  // The watch recorded code 1 and logged the other two, so two real failures
  // were indistinguishable from never having asked.
  it('names all three PositionError codes', () => {
    expect(gpsErrorKind(1)).toBe('denied');
    expect(gpsErrorKind(2)).toBe('unavailable');
    expect(gpsErrorKind(3)).toBe('timeout');
  });

  // An unknown code is not a denial: telling the reader to change a permission
  // that is already granted is worse than saying nothing.
  it('does not invent a cause for a code it does not know', () => {
    expect(gpsErrorKind(9)).toBeNull();
    expect(gpsErrorKind(undefined)).toBeNull();
  });
});

describe('ACC_GATE', () => {
  it('is one number, in one place', () => {
    expect(ACC_GATE).toBe(40);
  });
});

// The state that turned out to be real, when «ikke spurt» turned out not to
// be. main.js calls locateUser unconditionally, so the app always asks — but a
// browser with no Geolocation API cannot be asked at all, and telling that
// reader to turn on location services points at a switch that is not there.
describe('a browser that cannot be asked', () => {
  it('is its own state, not «searching»', () => {
    const s = posState({ now: NOW, asked: false, homeLL: null, gpsError: 'unsupported' });
    expect(s.kind).toBe('ikke-stottet');
    expect(s.usable).toBe(false);
  });

  // The brief window before locateUser runs needs no different words: there is
  // nothing a reader could do about it, and it lasts a few milliseconds.
  it('shares its words with «searching», because nothing else would help', () => {
    const notYet = posState({ now: NOW, asked: false, homeLL: null });
    const looking = posState({ now: NOW, asked: true, homeLL: null });
    expect(notYet.kind).toBe('ikke-spurt');
    expect(notYet.label).toBe(looking.label);
  });
});
