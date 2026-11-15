import { describe, it, expect } from 'vitest';
import { sporLag, SPOR_ZOOM, SPOR_URL } from '../src/ui/map.js';
import { PLATTFORM_ZOOM } from '../src/views/board.js';

describe('sporlaget ved høy zoom (v1.218.58)', () => {
  it('vises først fra SPOR_ZOOM, som er samme terskel som plattformmerkene', () => {
    const l = sporLag();
    expect(l.options.minZoom).toBe(SPOR_ZOOM);
    expect(PLATTFORM_ZOOM).toBe(SPOR_ZOOM);
    // Følger kartets tak (20): over maxZoom fjerner Leaflet laget helt.
    expect(l.options.maxZoom).toBe(20);
  });
  it('henter OpenRailwayMap og krediterer det', () => {
    const l = sporLag();
    expect(SPOR_URL).toMatch(/openrailwaymap\.org\/standard/);
    expect(l.options.attribution).toMatch(/OpenRailwayMap/);
    expect(l.options.className).toBe('spor-tiles');
  });
});
