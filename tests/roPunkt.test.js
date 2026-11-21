import { describe, it, expect } from 'vitest';
import { roPunkt, ROM_M, FLYTT_MS } from '../src/roPunkt.js';
import { readFileSync } from 'node:fs';
const m = (lat, dN) => lat + dN / 111000;
const P = (dN, acc) => ({ lat: m(59.855, dN), lon: 10.832, acc });
describe('ro-punktet (v1.218.212, «nervøs og skjelvende»)', () => {
  it('stillestående med støy: punktet står', () => {
    let r = roPunkt(null, P(0, 15), 0);
    const start = r;
    [8, -12, 20, -5, 25, 3].forEach((d, i) => { r = roPunkt(r, P(d, 15), (i + 1) * 1000); });
    expect(r).toBe(start);
  });
  it('ett hopp langt unna flytter ikke; vedvarende flytting gjør det', () => {
    let r = roPunkt(null, P(0, 15), 0);
    r = roPunkt(r, P(120, 15), 1000);
    expect(r.lat).toBe(P(0).lat);
    r = roPunkt(r, P(2, 15), 2000);         // tilbake: hoppet glemmes
    r = roPunkt(r, P(120, 15), 3000);
    r = roPunkt(r, P(121, 15), 3000 + FLYTT_MS - 1);
    expect(r.lat).toBe(P(0).lat);
    r = roPunkt(r, P(122, 15), 3000 + FLYTT_MS);
    expect(r.lat).toBe(P(122).lat);
  });
  it('en usikker fiks (±1126 m) flytter ikke stedet', () => {
    let r = roPunkt(null, P(0, 15), 0);
    for (let t = 1; t < 30; t++) r = roPunkt(r, P(400, 1126), t * 1000);
    expect(r.lat).toBe(P(0).lat);
  });
  it('skarpere fiks inni gammel usikkerhet forbedrer med én gang', () => {
    let r = roPunkt(null, P(0, 80), 0);
    r = roPunkt(r, P(50, 10), 1000);
    expect(r).toMatchObject({ lat: P(50).lat, acc: 10 });
    expect(ROM_M).toBe(30);
  });
});
describe('koblingen', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('adressen slås opp for ro-punktet, ikke hver fiks', () => {
    expect(a).toMatch(/stedNavn\(_herRo, /);
  });
  it('spørsmålet følger hysteresen, ikke hver fiks', () => {
    expect(a).toMatch(/if \(kind === 'spørsmål' && !usikker\) kind = 'påstand';/);
  });
  it('ingen ±meter i teksten (godkjent mønster: posisjonens kvalitet vises på kartet)', () => {
    expect(readFileSync('src/ui/stedVelger.js', 'utf8')).not.toMatch(/'\(±' \+ Math\.round\(acc\)/);
  });
});
