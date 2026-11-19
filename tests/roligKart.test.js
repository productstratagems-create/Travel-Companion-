// v1.218.150: «Dersom bruker har justert noe må ikke systemet endre på det av seg selv.»
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { rammeNøkkel, BRUKER_INPUT_MS } from '../src/views/auto.js';

const s = readFileSync('src/views/auto.js', 'utf8');
const basis = { stoppId: 'S', åpen: null, kort: 'K', gåHit: null, fokus: 'oversikt', størrelse: '382x382' };

describe('rammen følger det du har bedt om, ikke klokka', () => {
  it('nytt stopp, ny åpen retning, nytt fokus eller ny størrelse: ny ramme', () => {
    const k = rammeNøkkel(basis);
    expect(rammeNøkkel({ ...basis, stoppId: 'T' })).not.toBe(k);
    expect(rammeNøkkel({ ...basis, åpen: 'R1' })).not.toBe(k);
    expect(rammeNøkkel({ ...basis, fokus: 'ruter' })).not.toBe(k);
    expect(rammeNøkkel({ ...basis, størrelse: '382x600' })).not.toBe(k);
  });
  it('minuttet og avgangene er ikke i rammen', () => {
    const i = s.indexOf('const rKey = rammeNøkkel(');
    const linje = s.slice(i, s.indexOf(');', i));
    expect(linje).not.toMatch(/Date\.now|nextMs|60000/);
    expect(s).toMatch(/const fitStale = !_aUserMoved && \(_aFitKey !== rKey \|\| ute\);/);
  });
});

describe('justeringen din står', () => {
  it('knipe-zoom og hjul teller som justering, appens egne rammer gjør ikke', () => {
    expect(BRUKER_INPUT_MS).toBe(800);
    expect(s).toMatch(/_aMap\.on\('zoomstart movestart', \(\) => \{\s*if \(!_aProgrammatisk && Date\.now\(\) - _aSisteInput < BRUKER_INPUT_MS\) _aUserMoved = true;/);
    expect(s).toMatch(/_rammer\(\(\) => _aMap\.setView\(midtpunkt\(rammePts\)/);
  });
  it('et stopp appen bytter selv, tar ikke tilbake fokuset du valgte', () => {
    expect(s).toMatch(/if \(_kartFokus !== 'oversikt' && !_aUserMoved\) \{ _kartFokus = 'oversikt'; _aFitKey = ''; \}/);
  });
  it('justeringen nullstilles bare av handlinger du gjør', () => {
    const resets = (s.match(/_aUserMoved = false/g) || []).length;
    // reset av kartet, fokus «oversikt», åpen retning, to «beste holdeplass»-trykk
    expect(resets).toBe(6);   // deklarasjonen + reset av kartet, «oversikt», åpen retning, to holdeplass-trykk
  });
});
