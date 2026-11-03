// Kjøretøyet peker langs linja også når kartet er dreid.
//
// Rapportert med skjermbilde fra underveis: kartet var dreid, linja kom inn
// fra vest, bussen pekte nord-nordøst. leaflet-rotate holder markører rett
// opp på skjermen med mindre `rotateWithView` er satt; ikonet var dreid til
// kursen mot nord, ikke mot kartet slik det står.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { VEHICLE_MARKER_OPTS } from '../src/ui/mapIcons.js';

const SKJERMER = ['src/views/track.js', 'src/views/selected.js', 'src/views/board.js'];

describe('kjøretøymarkøren følger kartets dreining', () => {
  it('den felles definisjonen dreier med kartet', () => {
    expect(VEHICLE_MARKER_OPTS.rotateWithView).toBe(true);
  });

  it.each(SKJERMER)('%s lager kjøretøymarkøren med den felles definisjonen', (fil) => {
    const src = readFileSync(fil, 'utf8');
    // Hver L.marker som får et kjøretøyikon (direkte eller via `icon`/`icon()`
    // bygd av makeVehicleIcon) skal spre VEHICLE_MARKER_OPTS inn.
    const kall = src.match(/L\.marker\(\[pos\.lat, pos\.lon\][^;]*?\)\s*(?:\.|\n)/gs) || [];
    expect(kall.length).toBeGreaterThan(0);
    for (const k of kall) expect(k).toContain('...VEHICLE_MARKER_OPTS');
  });
});
