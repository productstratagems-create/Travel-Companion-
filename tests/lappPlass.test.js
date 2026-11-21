// v1.218.233: «et konsept for å decluttre kartenes symbologi og lapper».
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ryddLapper, lappType, LAPP_PRIO } from '../src/ui/lappPlass.js';
const R = (left, top, w = 120, h = 30) => ({ left, top, right: left + w, bottom: top + h });
// Skjermbildet 23:20: Mortensrud-lappen, «Stenbråten · 10 min», «🚶 12 min» og
// linjemerker oppå hverandre rundt (200, 960).
const FIKSTUR = [
  { id: 'Stenbråten · 10 min', prio: LAPP_PRIO.annet, rekt: R(180, 965, 280, 40) },
  { id: '🚶 12 min', prio: LAPP_PRIO.gang, rekt: R(300, 995, 140, 34) },
  { id: 'Mortensrud', prio: LAPP_PRIO.stopp, rekt: R(200, 945, 480, 70), kortRekt: R(200, 945, 200, 34) },
  { id: '74', prio: LAPP_PRIO.linje, rekt: R(210, 985, 40, 24) },
];
const overlapp = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
describe('lappenes plass', () => {
  it('før-bildet: lappene overlapper; etter: ingen synlige overlapper, stoppet står', () => {
    expect(FIKSTUR.some((a, i) => FIKSTUR.some((b, j) => i < j && overlapp(a.rekt, b.rekt)))).toBe(true);
    const d = ryddLapper(FIKSTUR);
    expect(d.get('Mortensrud')).toBe('full');
    const vist = FIKSTUR.filter(l => d.get(l.id) !== 'skjult').map(l => (d.get(l.id) === 'kort' ? l.kortRekt : l.rekt));
    expect(vist.some((a, i) => vist.some((b, j) => i < j && overlapp(a, b)))).toBe(false);
  });
  it('taperen får kortform før den skjules', () => {
    const d = ryddLapper([{ id: 'gang', prio: 2, rekt: R(0, 0) }, { id: 'stopp', prio: 1, rekt: R(50, 0), kortRekt: R(200, 0, 50) }]);
    expect(d.get('stopp')).toBe('full'); expect(d.get('gang')).toBe('skjult');
    const d2 = ryddLapper([{ id: 'a', prio: 1, rekt: R(0, 0) }, { id: 'b', prio: 2, rekt: R(50, 0), kortRekt: R(130, 0, 40) }]);
    expect(d2.get('b')).toBe('kort');
  });
  it('hindre (prikken din, knappene) vinner alltid', () => {
    expect(ryddLapper([{ id: 'x', prio: 1, rekt: R(0, 0) }], [R(10, 10, 20, 20)]).get('x')).toBe('skjult');
  });
  it('ro: blant like viktige går den som sto sist først', () => {
    const l = [{ id: 'a', prio: 4, rekt: R(0, 0) }, { id: 'b', prio: 4, rekt: R(50, 0) }];
    expect(ryddLapper(l, [], new Set(['b'])).get('b')).toBe('full');
    expect(ryddLapper(l, [], new Set(['b'])).get('a')).toBe('skjult');
  });
  it('typene', () => {
    expect(lappType(['leaflet-tooltip', 'lapp-stopp'])).toBe('stopp');
    expect(lappType(['leaflet-tooltip', 'gang-pille'])).toBe('gang');
    expect(lappType(['quay-pin', 'aktiv'])).toBe('plattformDin');
    expect(lappType(['quay-pin'])).toBe('plattform');
    expect(lappType(['leaflet-tooltip', 'edd-ende-merke'])).toBe('linje');
    expect(lappType(['leaflet-tooltip', 'map-label'])).toBe('annet');
  });
  it('koblet inn i Auto-kartet for alle lapper', () => {
    expect(readFileSync('src/views/auto.js', 'utf8')).toMatch(/festLappRydding\(_aMap\)\(\);/);
  });
});
describe('Rute-kartet bruker samme konsept (v1.218.235)', () => {
  const b = readFileSync('src/views/board.js', 'utf8');
  it('ryddes etter tegning, ved zoom/flytting og når gangen er tegnet', () => {
    expect(b).toMatch(/function _ryddRute\(\) \{ if \(_bMap\) festLappRydding\(_bMap\)\(\); \}/);
    expect(b).toMatch(/  festLappRydding\(_bMap\);/);
    expect(b).toMatch(/\.finally\(_ryddRute\);/);
  });
  it('det viktigste stoppet er stopplappen (prioritet 1)', () => {
    expect(b).toMatch(/className: 'map-label' \+ \(erViktigst \? ' lapp-stopp' : ''\)/);
  });
});

describe('avgangsdetaljer og Underveis (v1.218.236)', () => {
  it('PÅ/BYTT/AV og målet er stopplapper (prioritet 1) og vinner over plattformen', () => {
    const sel = readFileSync('src/views/selected.js', 'utf8');
    expect(sel).toMatch(/className: 'sel-stop-label sel-pkt-label lapp-stopp'/);
    expect(sel).toMatch(/className: 'sel-stop-label lapp-stopp' \}\)/);
    expect(lappType(['leaflet-tooltip', 'sel-stop-label', 'sel-pkt-label', 'lapp-stopp'])).toBe('stopp');
    const d = ryddLapper([{ id: 'B', prio: LAPP_PRIO.plattform, rekt: R(0, 0, 40, 30) }, { id: 'PÅ', prio: LAPP_PRIO.stopp, rekt: R(10, 5) }]);
    expect(d.get('PÅ')).toBe('full'); expect(d.get('B')).toBe('skjult');
  });
  it('alle fire kartene fester ryddingen', () => {
    expect(readFileSync('src/views/selected.js', 'utf8')).toMatch(/festLappRydding\(_selMap\);/);
    expect(readFileSync('src/views/track.js', 'utf8')).toMatch(/festLappRydding\(_tMap\);/);
  });
});
