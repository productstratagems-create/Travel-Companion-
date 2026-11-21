// v1.218.197: onboarding steg 1 — «er dette riktig sted?»
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { readFileSync } from 'node:fs';
import { posBekreftelse } from '../src/position.js';
import { herLinjeHtml } from '../src/ui/stedVelger.js';
import { herTilstand, whereLabel } from '../src/views/auto.js';
import { reverseUrl } from '../src/api/stedNavn.js';

describe('posBekreftelse', () => {
  it('god posisjon: påstand', () => expect(posBekreftelse({ kind: 'ok', acc: 12 })).toBe('påstand'));
  it('±150 m eller grå prikk: spørsmål', () => {
    expect(posBekreftelse({ kind: 'ok', acc: 150 })).toBe('spørsmål');
    expect(posBekreftelse({ kind: 'gammel', acc: 10 })).toBe('spørsmål');
    expect(posBekreftelse({ kind: 'unoyaktig', acc: 60 })).toBe('spørsmål');
  });
  it('ingen posisjon: «hvor er du?»', () => {
    expect(posBekreftelse({ kind: 'avslatt' })).toBe('ukjent');
    expect(posBekreftelse(null)).toBe('ukjent');
  });
  it('satt av deg: manuell', () => expect(posBekreftelse({ kind: 'ok' }, true)).toBe('manuell'));
});

describe('linja', () => {
  it('påstand med «ikke riktig?», spørsmål med ja/nei og nøyaktighet, manuell med «bruk GPS igjen»', () => {
    expect(herLinjeHtml({ kind: 'påstand', navn: 'Stenbråtveien 14' })).toMatch(/Du er her: <b>Stenbråtveien 14<\/b>[\s\S]*ikke riktig\?/);
    const q = herLinjeHtml({ kind: 'spørsmål', navn: 'Stenbråtveien', acc: 150 });
    expect(q).toMatch(/Er du her\?/); expect(q).toMatch(/±150 m/); expect(q).toMatch(/data-her="ja"/); expect(q).toMatch(/nei, velg sted/);
    expect(herLinjeHtml({ kind: 'manuell', navn: 'Stenbråten' })).toMatch(/bruk GPS igjen/);
    expect(herLinjeHtml({ kind: 'ukjent' })).toMatch(/Hvor er du\?/);
  });
  it('«ja» gjelder til du har flyttet deg 100 m', () => {
    const ja = { lat: 59.85, lon: 10.83 };
    expect(herTilstand({ kind: 'ok', acc: 150 }, false, ja, { lat: 59.8501, lon: 10.83 })).toBe('påstand');
    expect(herTilstand({ kind: 'ok', acc: 150 }, false, ja, { lat: 59.852, lon: 10.83 })).toBe('spørsmål');
  });
});

describe('overskriften motsier seg ikke', () => {
  it('før-bildet: «du er ved» 605 m unna — nå «nærmeste stopp»', () => {
    expect(whereLabel(false, null, 605)).toBe('nærmeste stopp');
    expect(whereLabel(false, null, 40)).toBe('du er ved');
  });
});

describe('koblingen', () => {
  it('stedet du velger blir walkFromLL, og stoppene søkes der', () => {
    const a = readFileSync('src/views/auto.js', 'utf8'), g = readFileSync('src/geo.js', 'utf8');
    expect(a).toMatch(/state\.walkFromLL = \{ lat: ll\.lat, lon: ll\.lon \};\s*saveWalkFrom\(\{ label, lat: ll\.lat, lon: ll\.lon \}\);/);
    expect(g).toMatch(/export function søkePunkt\(gps\) \{ return state\.walkFromLL \|\| gps; \}/);
    expect(g).toMatch(/const sp = søkePunkt\(accepted\);/);
  });
  it('omvendt stedsoppslag går til geokoderens /reverse (probe — fallback «nær <stopp>»)', () => {
    expect(reverseUrl({ lat: 59.85, lon: 10.83 })).toMatch(/\/geocoder\/v1\/reverse\?point\.lat=59\.85&point\.lon=10\.83/);
  });
});
