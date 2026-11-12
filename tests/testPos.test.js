// Bestilt: «et sted i innstillinger der jeg kan legge inn et sted for å kunne teste appen i ulike
// områder. Det stedet skal benyttes i stedet for gps posisjon for testformål.»
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { hentTestPos, settTestPos, slettTestPos, TEST_STEDER, testPosPå } from '../src/api/testPos.js';
import { state } from '../src/state.js';
import { logEvent } from '../src/api/eventLog.js';
import { recordSmartTrip, loadSmartHist } from '../src/api/smart.js';
import { testStripeTekst } from '../src/ui/testStripe.js';
import { testPosStatus } from '../src/views/settings.js';

const PARADIS = TEST_STEDER.find(p => p.navn === 'Bergen, Paradis');

describe('lagring', () => {
  beforeEach(() => { localStorage.clear(); });
  it('settes, hentes og slettes; i ALL_KEYS', () => {
    expect(hentTestPos()).toBe(null);
    settTestPos(PARADIS);
    expect(hentTestPos()).toEqual({ navn: 'Bergen, Paradis', lat: 60.3684, lon: 5.3418 });
    expect(testPosPå()).toBe(true);
    slettTestPos();
    expect(testPosPå()).toBe(false);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.testPos',");
  });
});

describe('i stedet for GPS', () => {
  beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
  it('ingen watchPosition; en fiks med testkoordinatene, hvert 5. sekund', async () => {
    const watch = vi.fn(() => 1);
    vi.stubGlobal('navigator', { geolocation: { watchPosition: watch, clearWatch: vi.fn() }, onLine: true });
    const geo = await import('../src/geo.js');
    geo.brukTestPos(PARADIS);
    expect(watch).not.toHaveBeenCalled();
    const sist = () => state.posTrail[state.posTrail.length - 1];
    expect(sist()).toMatchObject({ lat: 60.3684, lon: 5.3418 });
    const n = state.posTrail.length;
    vi.advanceTimersByTime(geo.TEST_FIKS_MS * 2);
    expect(state.posTrail.length).toBeGreaterThan(n);
    // Testposisjonen lagres aldri som din.
    expect(localStorage.getItem('default::t.homeLL') || localStorage.getItem('t.homeLL')).toBe(null);
    // Av: GPS igjen, og sporet nullstilt.
    geo.brukTestPos(null);
    expect(watch).toHaveBeenCalled();
    expect(state.posTrail.length).toBe(0);
    vi.useRealTimers(); vi.unstubAllGlobals();
  });
});

describe('ingenting fra testen i minnet ditt', () => {
  beforeEach(() => { localStorage.clear(); });
  it('reiseloggen og vanene skrives ikke', () => {
    localStorage.setItem('t.memoryConsent', '1');
    settTestPos(PARADIS);
    expect(logEvent('reise', { fra: 'Paradis', til: 'Byparken' }, null)).toBe(false);
    recordSmartTrip('Paradis', 'Byparken', null, 60.39, 5.32, null);
    expect(loadSmartHist()).toEqual([]);
    expect(readFileSync('src/api/turopptak.js', 'utf8')).toMatch(/\|\| testPosPå\(\)\) return false;/);
  });
});

describe('synlig', () => {
  it('stripen og statuslinja', () => {
    expect(testStripeTekst(PARADIS)).toBe('TESTPOSISJON · Bergen, Paradis · slå av');
    expect(testStripeTekst(null)).toBe('');
    expect(testPosStatus(PARADIS)).toContain('<b>Bergen, Paradis</b>. GPS er av.');
    expect(testPosStatus(null)).toBe('Av. Appen bruker GPS.');
  });
});
