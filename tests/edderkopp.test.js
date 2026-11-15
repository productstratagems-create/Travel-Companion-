import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { edderkoppBein, EDDERKOPP_STOPP } from '../src/views/auto.js';

const NÅ = Date.parse('2026-11-15T18:16:00+01:00');
const kall = (navn, i) => ({ quay: { stopPlace: { name: navn, id: 'S' + navn, latitude: 59.86 + i * 0.002, longitude: 10.83 } },
  expectedArrivalTime: new Date(NÅ + i * 120000).toISOString() });
const retning = (front, kode, om, n) => {
  const sjc = [kall('Mortensrud', 0)];
  for (let i = 1; i <= n; i++) sjc.push(kall(front + i, i));
  const call = { serviceJourney: { line: { id: 'RUT:Line:' + kode, transportMode: 'metro' }, estimatedCalls: sjc } };
  return { frontText: front, nextMs: NÅ + om * 60000, calls: [{ ms: NÅ + om * 60000, call }], lines: [{ code: kode, colour: 'E60000', id: 'RUT:Line:' + kode, mode: 'metro' }],
    call };
};

describe('edderkoppkartet i auto-reise (v1.218.61)', () => {
  const dirs = [retning('Ellingsrudåsen', '2', 9, 10), retning('Kolsås', '3', 4, 12), retning('Bergkrystallen', '79', 6, 3)];

  it('ett bein per retning, etter neste avgang, uten stoppet du står ved', () => {
    const b = edderkoppBein(dirs, 'Mortensrud', NÅ);
    expect(b.map(x => x.kode)).toEqual(['3', '79', '2']);
    expect(b[0].stopp).toHaveLength(EDDERKOPP_STOPP);
    expect(b[0].stopp.some(s => s.name === 'Mortensrud')).toBe(false);
    expect(b[0].stopp[0].name).toBe('Kolsås1');
  });

  it('hopper over en retning med for få stopp å tegne', () => {
    const b = edderkoppBein([...dirs, retning('Kort', '9', 1, 1)], 'Mortensrud', NÅ);
    expect(b.map(x => x.kode)).not.toContain('9');
  });

  it('den foretrukne retningen (kortet) først', () => {
    expect(edderkoppBein(dirs, 'Mortensrud', NÅ, 'Ellingsrudåsen')[0].kode).toBe('2');
  });

  it('tegnes bare i utgangskartet', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/const bein = sentrert && _stop \? edderkoppBein\(/);
  });
});

import { slåSammenBein, lappRetning, lappFronter, LAPP_TEGN } from '../src/views/auto.js';

describe('lappene i edderkoppnettet (v1.218.62)', () => {
  const st = (...ids) => ids.map(id => ({ id, name: id, lat: 1, lon: 1 }));
  const b = (kode, front, ms, stopp) => ({ kode, linjeId: 'L' + kode, front, ms, stopp, dir: { f: front } });

  it('samme linje i samme korridor blir ett bein, med alle retninger og tidligste tid', () => {
    const ut = [b('3', 'Stortinget', 9, st('A', 'B', 'C')), b('3', 'Kolsås', 4, st('A', 'B', 'C', 'D')),
      b('74', 'Jernbanetorget', 6, st('A', 'B')), b('3', 'Avløs', 12, st('A', 'B'))].reduce(slåSammenBein, []);
    expect(ut).toHaveLength(2);
    expect(ut[0].fronter).toEqual(['Stortinget', 'Kolsås', 'Avløs']);
    expect(ut[0].ms).toBe(4);
    expect(ut[0].dir.f).toBe('Kolsås');
    expect(ut[0].stopp).toHaveLength(4);
  });

  it('samme linje i motsatt retning forblir to bein', () => {
    const ut = [b('3', 'Kolsås', 4, st('A', 'B')), b('3', 'Mortensrud', 5, st('X', 'Y'))].reduce(slåSammenBein, []);
    expect(ut).toHaveLength(2);
  });

  it('lappen står utover fra stoppet', () => {
    const o = { x: 100, y: 100 };
    expect(lappRetning(o, { x: 100, y: 20 })).toBe('top');
    expect(lappRetning(o, { x: 100, y: 180 })).toBe('bottom');
    expect(lappRetning(o, { x: 190, y: 110 })).toBe('right');
    expect(lappRetning(o, { x: 10, y: 90 })).toBe('left');
  });

  it('retningsteksten avkortes', () => {
    expect(lappFronter(['Kolsås'])).toBe('Kolsås');
    const t = lappFronter(['Kolsås', 'Stortinget', 'Avløs']);
    expect(t.length).toBeLessThanOrEqual(LAPP_TEGN);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/·…$/);
  });
});

describe('kartet og lista er enige om hva du rekker (v1.218.63)', () => {
  it('rapportert: 12 min gange, 3 om 6 min er strøket — lappen viser neste du rekker', () => {
    const d = retning('Kolsås', '3', 6, 8);
    d.calls.push({ ms: NÅ + 21 * 60000, call: d.call });
    const [b] = edderkoppBein([d], 'Mortensrud', NÅ, null, 12);
    expect(b.ms).toBe(NÅ + 21 * 60000);
  });
  it('en retning du ikke rekker noe av, får ikke bein', () => {
    expect(edderkoppBein([retning('Bjørndal', '71', 4, 8)], 'Mortensrud', NÅ, null, 12)).toEqual([]);
  });
  it('uten posisjon teller alt, som i lista', () => {
    expect(edderkoppBein([retning('Bjørndal', '71', 4, 8)], 'Mortensrud', NÅ, null, null)).toHaveLength(1);
  });
});

describe('hele linja, duset etter sjette stopp (v1.218.64)', () => {
  it('beinet er seks stopp; resten går fra sjette stopp til endestoppet', () => {
    const [b] = edderkoppBein([retning('Kolsås', '3', 4, 12)], 'Mortensrud', NÅ);
    expect(b.stopp).toHaveLength(EDDERKOPP_STOPP);
    expect(b.rester).toHaveLength(1);
    expect(b.rester[0][0]).toEqual(b.stopp[EDDERKOPP_STOPP - 1]);
    expect(b.rester[0][b.rester[0].length - 1].name).toBe('Kolsås12');
  });
  it('en kort linje har ingen rest', () => {
    expect(edderkoppBein([retning('Bergkrystallen', '79', 6, 4)], 'Mortensrud', NÅ)[0].rester).toEqual([]);
  });
  it('grener i samme korridor beholder hver sin rest', () => {
    const st = (...ids) => ids.map(id => ({ id, name: id, lat: 1, lon: 1 }));
    const ut = [{ kode: '3', linjeId: 'L3', front: 'Kolsås', ms: 4, stopp: st('A', 'B'), rester: [st('B', 'K')] },
      { kode: '3', linjeId: 'L3', front: 'Stortinget', ms: 5, stopp: st('A', 'B'), rester: [st('B', 'S')] }].reduce(slåSammenBein, []);
    expect(ut[0].rester.map(r => r[1].id)).toEqual(['K', 'S']);
  });
  it('rammen følger bare de klare beina, ikke restene', () => {
    expect(fs.readFileSync('src/views/auto.js', 'utf8')).toMatch(/bein\.map\(b => \{ const e = b\.stopp\[b\.stopp\.length - 1\]/);
  });
});

import { lappNivåer, nivåTak, beinMaks, LAPP_NIVÅ, LAPP_ANDEL } from '../src/views/auto.js';

describe('lappene skalerer med zoom, kart og antall (v1.218.65)', () => {
  const n = k => Array.from({ length: k }, (_, i) => ({ kode: String(i) }));
  const flate = v => v.reduce((s, x) => s + LAPP_NIVÅ[x].b * LAPP_NIVÅ[x].h, 0);

  it('ett bein på et stort kart ved zoom 16: full detalj', () => {
    expect(lappNivåer(n(1), { bredde: 382, høyde: 700, zoom: 16 })).toEqual([4]);
  });
  it('åtte bein på et bånd: de viktigste beholder mest, innenfor budsjettet', () => {
    const v = lappNivåer(n(8), { bredde: 382, høyde: 140, zoom: 14 });
    expect(v[0]).toBeGreaterThanOrEqual(v[7]);
    for (let i = 1; i < v.length; i++) expect(v[i - 1]).toBeGreaterThanOrEqual(v[i]);
    expect(v[7]).toBeLessThanOrEqual(1);
    expect(flate(v)).toBeLessThanOrEqual(382 * 140 * LAPP_ANDEL + LAPP_NIVÅ[2].b * LAPP_NIVÅ[2].h);
  });
  it('den viktigste viser alltid neste avgang', () => {
    expect(lappNivåer(n(8), { bredde: 100, høyde: 60, zoom: 16 })[0]).toBe(2);
  });
  it('utzoomet: bare merket', () => {
    // Utzoomet: de andre bare merket, men den viktigste viser fortsatt tid.
    expect(lappNivåer(n(3), { bredde: 382, høyde: 700, zoom: 11 })).toEqual([2, 1, 1]);
    // Zoom 12, som utgangskartet på telefonen: merke og tid.
    expect(nivåTak(12)).toBe(2);
    expect(nivåTak(15)).toBe(3);
  });
  it('fullskjerm viser flere lapper enn et bånd', () => {
    const synlig = v => v.filter(x => x > 0).length;
    const bånd = lappNivåer(n(6), { bredde: 382, høyde: 140, zoom: 15 });
    const full = lappNivåer(n(6), { bredde: 382, høyde: 700, zoom: 15 });
    expect(synlig(full)).toBeGreaterThan(synlig(bånd));
  });
  it('antall bein vokser med kartflaten', () => {
    expect(beinMaks(382, 140)).toBe(4);
    expect(beinMaks(382, 383)).toBeGreaterThan(4);
    expect(beinMaks(382, 700)).toBe(8);
  });
});

import { lappAnker } from '../src/views/auto.js';
describe('lappen står der beinet synes (v1.218.65)', () => {
  const st = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  it('siste synlige stopp', () => { expect(lappAnker(st, s => s.id <= 2).id).toBe(2); });
  it('alt synlig: enden', () => { expect(lappAnker(st, () => true).id).toBe(4); });
  it('ingenting synlig: første stopp', () => { expect(lappAnker(st, () => false).id).toBe(1); });
});

import { lappPasser } from '../src/views/auto.js';
describe('hele lappen innenfor kartet (v1.218.65)', () => {
  const stopp = { x: 200, y: 200 };
  it('en lapp til venstre trenger sin bredde til venstre for stoppet', () => {
    expect(lappPasser({ x: 60, y: 200 }, stopp, 80, 18, 382, 382)).toBe(false);
    expect(lappPasser({ x: 100, y: 200 }, stopp, 80, 18, 382, 382)).toBe(true);
  });
  it('en lapp over trenger sin høyde over', () => {
    expect(lappPasser({ x: 200, y: 20 }, stopp, 80, 32, 382, 382)).toBe(false);
    expect(lappPasser({ x: 200, y: 60 }, stopp, 80, 32, 382, 382)).toBe(true);
  });
});

import { stoppLappSide, lappForskyv, STOPP_LAPP_ZOOM } from '../src/views/auto.js';
describe('lappene unna knappene, og holdeplasslappen (v1.218.66)', () => {
  const stopp = { x: 200, y: 200 };
  const zoomKnapper = { venstre: 330, høyre: 382, topp: 290, bunn: 382 };
  it('en lapp som ville dekket zoomknappene, passer ikke', () => {
    expect(lappPasser({ x: 300, y: 320 }, stopp, 80, 18, 382, 382, [zoomKnapper])).toBe(false);
    expect(lappPasser({ x: 300, y: 320 }, stopp, 80, 18, 382, 382, [])).toBe(true);
  });
  it('holdeplasslappen går til siden uten bein', () => {
    expect(stoppLappSide(stopp, [{ x: 200, y: 50 }, { x: 200, y: 350 }, { x: 50, y: 200 }])).toBe('right');
    expect(stoppLappSide(stopp, [])).toBe('top');
  });
  it('forskyvningen følger siden', () => {
    expect(lappForskyv('left', 44)).toEqual([-44, 0]);
    expect(lappForskyv('bottom', 8)).toEqual([0, 8]);
  });
  it('holdeplasslappen er fast først fra STOPP_LAPP_ZOOM', () => {
    expect(STOPP_LAPP_ZOOM).toBeGreaterThan(12);
    expect(fs.readFileSync('src/views/auto.js', 'utf8')).toMatch(/permanent: sentrert && z >= STOPP_LAPP_ZOOM/);
  });
});

import { lappPlass } from '../src/views/auto.js';
describe('lappen prøver alle sider før den gir opp (v1.218.66)', () => {
  const st = [{ id: 1 }, { id: 2 }];
  it('naturlig side først', () => {
    expect(lappPlass(st, () => true, () => 'bottom')).toEqual({ stopp: st[1], side: 'bottom' });
  });
  it('ellers en annen side på samme bein', () => {
    expect(lappPlass(st, (s, r) => r === 'left', () => 'bottom')).toEqual({ stopp: st[1], side: 'left' });
  });
  it('ingen plass: ingen lapp', () => {
    expect(lappPlass(st, () => false, () => 'top')).toBeNull();
  });
  it('holdeplasslappen velger en side der den får plass', () => {
    expect(stoppLappSide({ x: 200, y: 200 }, [{ x: 200, y: 50 }, { x: 200, y: 350 }, { x: 50, y: 200 }], r => r !== 'right')).toBe('top');
  });
});

describe('holdeplasslappen viker for den viktigste linja (v1.218.66)', () => {
  it('beinet med vekt får siden for seg selv', () => {
    const o = { x: 200, y: 200 };
    expect(stoppLappSide(o, [{ x: 200, y: 50 }, { x: 200, y: 350, vekt: 3 }, { x: 50, y: 200 }], r => r !== 'right')).toBe('top');
    expect(stoppLappSide(o, [{ x: 200, y: 50, vekt: 3 }, { x: 200, y: 350 }, { x: 50, y: 200 }], r => r !== 'right')).toBe('bottom');
  });
});
