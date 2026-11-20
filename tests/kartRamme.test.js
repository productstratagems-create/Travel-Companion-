// v1.218.188: kartregler — én zoomtrapp, én margin, én innramming.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
import { readFileSync } from 'node:fs';
import { ZOOM, ramme } from '../src/ui/kartRamme.js';

const kart = h => { const kall = []; return { kall, getContainer: () => ({ clientHeight: h }),
  setView: (...a) => kall.push(['setView', ...a]), fitBounds: (...a) => kall.push(['fitBounds', ...a]) }; };

describe('trappen', () => {
  it('fem navngitte trinn, synkende', () => {
    expect(ZOOM).toEqual({ PLATTFORM: 18, GANG: 17, NÆRHET: 16, REISE: 15, RUTER: 14 });
  });
});

describe('ramme', () => {
  it('ett punkt: NÆRHET, aldri taket', () => {
    const m = kart(200); ramme(m, [[59.9, 10.7]], ZOOM.PLATTFORM);
    expect(m.kall[0]).toEqual(['setView', [59.9, 10.7], 16, { animate: false }]);
  });
  it('flere: kartets egen margin og trinnet som tak; animasjon bare når bedt', () => {
    const m = kart(200); ramme(m, [[1, 1], [2, 2]], ZOOM.GANG);
    expect(m.kall[0][2]).toEqual({ padding: [24, 24], maxZoom: 17, animate: false });
    const m2 = kart(200); ramme(m2, [[1, 1], [2, 2]], ZOOM.REISE, { animer: true, pad: 50 });
    expect(m2.kall[0][2]).toEqual({ padding: [50, 50], maxZoom: 15, animate: true });
  });
  it('tomt: ingenting', () => {
    const m = kart(200); expect(ramme(m, [], ZOOM.GANG)).toBe(false); expect(m.kall).toEqual([]);
  });
});

describe('ingen kart velger sitt eget tall', () => {
  const filer = ['board', 'selected', 'track', 'plan', 'leisure', 'settings'].map(f => 'src/views/' + f + '.js');
  it('ingen maxZoom-tall og ingen faste px-marginer i skjermene', () => {
    filer.forEach(f => {
      const s = readFileSync(f, 'utf8');
      expect([f, s.match(/maxZoom: \d+/g)]).toEqual([f, null]);
      expect([f, s.match(/padding: \[\d+, \d+\]/g)]).toEqual([f, null]);
      expect([f, s.match(/setView\([^)]*, 1\d\)/g)]).toEqual([f, null]);
    });
  });
});
