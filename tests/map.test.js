import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('leaflet', () => ({ default: { map: vi.fn(), tileLayer: vi.fn(), control: {} } }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));

import { currentTileUrl } from '../src/ui/map.js';

beforeEach(() => document.documentElement.removeAttribute('data-theme'));

describe('currentTileUrl', () => {
  it('uses the light basemap for light themes', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).toContain('/alidade_smooth/');
  });

  it('uses the dark basemap for dark themes', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).toContain('/alidade_smooth_dark/');
  });

  it('defaults to dark when no theme is set', () => {
    // The boot script always stamps data-theme, but a missing attribute
    // should not fall back to a bright canvas.
    expect(currentTileUrl()).toContain('/alidade_smooth_dark/');
  });

  it('keeps the retina placeholder so detectRetina can fill it', () => {
    // Without {r} in the URL, detectRetina has nothing to substitute and
    // every phone silently gets 1x tiles — the bug this replaced.
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).toContain('{r}');
  });

  // The maps went out covered in a repeating "API key required" watermark
  // because CARTO started requiring a key on basemaps.cartocdn.com and is
  // retiring those raster endpoints. Nothing may point back at them.
  it('does not request tiles from CARTO in either theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('cartocdn');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).not.toContain('cartocdn');
  });

  it('carries no {s} placeholder, which the single-host provider would not fill', () => {
    // Left in, Leaflet substitutes nothing and every tile 404s.
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('{s}');
  });

  it('does not use the old Voyager style in either theme', () => {
    document.documentElement.setAttribute('data-theme', 'light');
    expect(currentTileUrl()).not.toContain('voyager');
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(currentTileUrl()).not.toContain('voyager');
  });
});
