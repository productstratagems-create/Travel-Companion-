// v1.218.129: «La Rute kartet få samme zoom og kartstørrelsesknapper som Auto-reise. Og ta bort + og −.»
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({ makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(), mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 38 }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
const b = await import('../src/views/board.js');
const auto = await import('../src/views/auto.js');
const kf = await import('../src/ui/kartFokus.js');

describe('Rute-kartet', () => {
  it('formene er de samme som auto-reise, bred som standard, fullskjerm huskes ikke', () => {
    expect(b.RUTE_KART_FORMER).toEqual(['kvadrat', 'bred', 'full']);
    expect(b.ruteKartForm()).toBe('bred');
    b.settRuteKartForm('kvadrat'); expect(b.ruteKartForm()).toBe('kvadrat');
    b.settRuteKartForm('full'); expect(b.ruteKartForm()).toBe('kvadrat');
    b.settRuteKartForm('bred');
  });
  it('utsnittene: deg, stoppet og plattformen til første avgang', () => {
    const d = b.ruteFokusData({ _fromLat: 59.85, _fromLon: 10.83 }, { lat: 59.86, lon: 10.82 },
      { _legs: [{ fromPlace: { latitude: 59.8501, longitude: 10.8302 } }] });
    expect(kf.fokusRamme('vei', d).pts.length).toBe(2);
    expect(kf.fokusRamme('spor', d).pts).toEqual([[59.8501, 10.8302]]);
  });
  it('samme definisjon for begge kartene; + og − skjult', () => {
    expect(auto.fokusRamme).toBe(kf.fokusRamme);
    const src = readFileSync('src/views/board.js', 'utf8');
    expect(src).toMatch(/settVerktøy\(_bMap, 'inn', \{ skjult: true \}\);\s*settVerktøy\(_bMap, 'ut', \{ skjult: true \}\);/);
    expect(src).toMatch(/syklus: RUTE_KART_FORMER/);
  });
});
