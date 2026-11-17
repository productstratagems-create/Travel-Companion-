// v1.218.96: stripa viser «du» på aksen. En brikke du ikke rekker dempes,
// med SAMME dom som raden (`rekkeFor`), ikke en egen regel.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(() => '#fff'), sideVehicleSvg: vi.fn(() => '<svg/>'), SIDE_VEHICLE_MAX_PX: 38,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));

const { _buildStrip, stripeDuPos, _stripPct, _stripRekkeOrd, _stripSummary } = await import('../src/views/board.js');
const { reachCls, minsToLeave } = await import('../src/geo.js');

const NOW = Date.parse('2026-05-26T15:41:00+02:00');
const dep = (min, id) => ({
  expectedDepartureTime: new Date(NOW + min * 60000).toISOString(),
  serviceJourney: { id, line: { publicCode: '3', transportMode: 'metro' } },
});
// Samme regel som raden: minsToLeave med gangtid 5, så reachCls.
const radDom = gang => c => reachCls(minsToLeave(new Date(c.expectedDepartureTime).getTime(), gang, NOW));

describe('stripa vet om du rekker avgangen', () => {
  it('gangtid 5: avgangen om 2 er «missed», den om 9 er ikke det', () => {
    const d = _buildStrip([dep(2, 'a'), dep(9, 'b')], { from: 'Mortensrud' }, () => true, NOW, null, radDom(5));
    const r = Object.fromEntries(d.trains.map(t => [t.id, t.rekke]));
    expect(r.a).toBe('missed');
    expect(r.b).not.toBe('missed');
  });
  it('uten gangtid sier stripa ingenting om rekkevidde', () => {
    const d = _buildStrip([dep(2, 'a')], {}, () => true, NOW, null);
    expect(d.trains[0].rekke).toBe(null);
  });
  it('markøren står på gangtiden, på samme akse som brikkene', () => {
    const d = _buildStrip([dep(5, 'a')], {}, () => true, NOW, null);
    expect(_stripPct(stripeDuPos(5))).toBeCloseTo(_stripPct(d.trains[0].pos), 6);
    expect(stripeDuPos(null)).toBe(null);
    expect(stripeDuPos(600)).toBe(-1);
  });
  it('setningen for skjermleser sier det samme', () => {
    const d = _buildStrip([dep(2, 'a'), dep(9, 'b')], { from: 'X' }, () => true, NOW, null, radDom(5));
    expect(_stripRekkeOrd(d.trains, 5)).toContain('neste om 9');
    expect(_stripSummary(d, null)).not.toContain('rekker');
  });
  it('raden og stripa leser samme definisjon', () => {
    const src = readFileSync('src/views/board.js', 'utf8');
    expect(src).toContain('const { mtl, rcls } = rekkeFor(c, walkActive);');
    expect(src).toContain('c => rekkeFor(c, walkActive).rcls');
    expect(src).toMatch(/t\.rekke === 'missed'[\s\S]{0,120}ls-missed/);
  });
});
