// v1.218.120: «legge til en overgang ved å klikke på en gitt avgang» i Underveis.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(), mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30 }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));
const { legFraMeta, leggTilOvergang, fjernOvergang } = await import('../src/journey.js');
const { overgangFra } = await import('../src/views/track.js');

const iso = m => new Date(Date.UTC(2026, 10, 18, 15, m)).toISOString();
const META = { journeyId: 'SJ2', lineCode: '2', lineBg: '#EC700C', mode: 'metro', dest: 'Ellingsrudåsen',
  calls: [['Tøyen', 0], ['Helsfyr', 4], ['Hellerud', 8], ['Tveita', 10], ['Furuset', 16], ['Ellingsrudåsen', 20]]
    .map(([name, m], i) => ({ name, lat: 59.9 + i / 100, lon: 10.8, quay: '1', aimed: iso(m), expected: iso(m) })) };
const JNY = () => ({ dest: 'Hellerud', from: 'Mortensrud', arrival: { time: iso(5), clk: '16:05' }, _toLat: 1, _toLon: 2,
  legs: [{ lineCode: '3', fromStation: 'Mortensrud', toStation: 'Hellerud', stops: [] }] });

describe('én etappe av en tur', () => {
  it('fra og til, tider og stoppene videre', () => {
    const l = legFraMeta(META, 2, 4);
    expect([l.fromStation, l.toStation, l.lineCode]).toEqual(['Hellerud', 'Furuset', '2']);
    expect(l.depTime.time).toBe(iso(8));
    expect(l.arrTime.time).toBe(iso(16));
    expect(l.stops[0].quay.stopPlace.name).toBe('Hellerud');
    expect(legFraMeta(META, 4, 2)).toBe(null);
  });
  it('ankomststoppet finnes i turens stoppliste', () => {
    expect(overgangFra(META.calls, 'Hellerud')).toBe(2);
    expect(overgangFra(META.calls, 'Bøler')).toBe(-1);
  });
});

describe('overgangen', () => {
  it('legges sist, og målet flytter seg', () => {
    const j = JNY();
    expect(leggTilOvergang(j, META, 2, 4)).toBe(true);
    expect(j.legs.length).toBe(2);
    expect(j.dest).toBe('Furuset');
    expect(j.arrival.time).toBe(iso(16));
    expect(j._toLat).toBeCloseTo(59.94);
  });
  it('«fjern» setter alt tilbake, men aldri reisens egne etapper', () => {
    const j = JNY();
    leggTilOvergang(j, META, 2, 4);
    expect(fjernOvergang(j)).toBe(true);
    expect(j.legs.length).toBe(1);
    expect(j.dest).toBe('Hellerud');
    expect(j.arrival.clk).toBe('16:05');
    expect(fjernOvergang(j)).toBe(false);
  });
});

const { _setArrBoard, _renderArrBoardHtml } = await import('../src/views/track.js');
const { state } = await import('../src/state.js');
describe('raden kan trykkes', () => {
  it('en avgang med tur er en knapp; en innstilt er det ikke', () => {
    state.jny = { ...JNY(), arrival: { time: new Date(Date.now() + 5 * 60_000).toISOString() } };
    const L2 = { publicCode: '2', transportMode: 'metro', presentation: { colour: 'EC700C' } };
    _setArrBoard([
      { ln: L2, journeyId: 'SJ2', dest: 'Ellingsrudåsen', depTs: Date.now() + 10 * 60_000, quay: '1' },
      { ln: L2, journeyId: 'SJ3', dest: 'Østerås', depTs: Date.now() + 12 * 60_000, quay: '2', cancelled: true },
    ]);
    const h = _renderArrBoardHtml();
    expect(h).toMatch(/hn-arr-trykk"[^>]*data-jid="SJ2"[^>]*aria-expanded="false"/);
    expect(h).not.toMatch(/data-jid="SJ3"/);
    state.jny = null;
  });
});
