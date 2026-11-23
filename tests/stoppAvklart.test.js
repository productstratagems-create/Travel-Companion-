import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { stoppAvklart, AVKLAR_ACC_M, AVKLAR_MAKS_MS, merkelappMedRo, MERKE_UT_M } from '../src/views/auto.js';

describe('«beste stopp herfra» avklares før det låses (v1.218.273)', () => {
  it('god posisjon og stoppinfo: avklart', () => {
    expect(stoppAvklart({ acc: 30, infoKjent: true, ms: 1200 })).toBe(true);
  });
  it('før-bildet: ±400 m eller uten stoppinfo låste valget straks; nå foreløpig', () => {
    expect(stoppAvklart({ acc: 400, infoKjent: true, ms: 500 })).toBe(false);
    expect(stoppAvklart({ acc: 30, infoKjent: false, ms: 500 })).toBe(false);
    expect(stoppAvklart({ acc: AVKLAR_ACC_M, infoKjent: true, ms: 0 })).toBe(true);
  });
  it('taket gjør at det alltid ender — også på bygda uten svar', () => {
    expect(stoppAvklart({ acc: 900, infoKjent: false, ms: AVKLAR_MAKS_MS - 1 })).toBe(false);
    expect(stoppAvklart({ acc: 900, infoKjent: false, ms: AVKLAR_MAKS_MS })).toBe(true);
    expect(stoppAvklart({ acc: null, infoKjent: false, ms: AVKLAR_MAKS_MS })).toBe(true);
  });
  it('merkelappen blafrer ikke ved grensen', () => {
    expect(merkelappMedRo('du er ved', 'nærmeste stopp', 130, false)).toBe('du er ved');
    expect(merkelappMedRo('du er ved', 'nærmeste stopp', 120 + MERKE_UT_M + 1, false)).toBe('nærmeste stopp');
    expect(merkelappMedRo('du er ved', 'neste stopp på 3', 50, true)).toBe('neste stopp på 3');
  });
  it('koblingen: foreløpig sier «nærmeste stopp» og «finner beste stopp …», og henter ikke på nytt per bytte', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/const foreløpig = !_avklar\.ferdig && !holdt;/);
    expect(a).toMatch(/foreløpig && !fart \? 'nærmeste stopp'/);
    expect(a).toMatch(/finner beste stopp …/);
    expect(a).toMatch(/const nyTavle = !visning && \(foreløpig \? \(picked\.changed && _avklar\.dirsFor == null\)/);   // v1.218.283: et visningsbytte henter ikke
  });
});
