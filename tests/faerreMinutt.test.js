// v1.218.244: «færre slike [minutt-tall], slik at betydningen fremgår mer intuitivt».
import { describe, it, expect } from 'vitest';
import { tavleRadHtml, gåStort } from '../src/ui/tavleRad.js';
const nå = Date.parse('2026-11-22T11:49:00+01:00');
const x = o => ({ d: { frontText: 'Jernbanetorget', lines: [{ code: '74', mode: 'bus' }] }, ms: nå + 14 * 60000, call: {}, rekker: true, herNavn: 'Mortensrud', gang: 12, gåOm: 2, ...o });
const minutter = h => (h.replace(/<[^>]+>/g, ' ').match(/\d+\s*min/g) || []);
describe('ett minutt-tall per kort', () => {
  it('før-bildet: «14 MIN», «12 min å gå» og «gå om 2 min» — nå bare «gå om 2 min»', () => {
    const h = tavleRadHtml(x(), nå, 0);
    expect(h).toMatch(/at-min-gaa"><small>gå om<\/small>2<small>min<\/small>/);
    expect(minutter(h)).toEqual(['2 min']);
  });
  it('gå nå', () => {
    expect(tavleRadHtml(x({ gåOm: 0 }), nå, 0)).toMatch(/at-min-gaa"><small><\/small>gå nå/);
  });
  it('uten gangtid (om bord / i fart): nedtelling til avgang som før', () => {
    expect(gåStort(x({ gåOm: null }))).toBe(false);
    expect(tavleRadHtml(x({ gåOm: null }), nå, 0)).toMatch(/class="at-min">14<small>min<\/small>/);
  });
  it('rekker den ikke: nedtellingen, ikke «gå om»', () => {
    expect(gåStort(x({ rekker: false }))).toBe(false);
  });
});
