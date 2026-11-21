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
    expect(herLinjeHtml({ kind: 'påstand', navn: 'Stenbråtveien 14' })).toMatch(/Du er her: <b>Stenbråtveien 14<\/b><\/span><span class="her-valg">[\s\S]*data-her="ja"[\s\S]*ikke riktig\?/);
    const q = herLinjeHtml({ kind: 'spørsmål', navn: 'Stenbråtveien', acc: 150 });
    expect(q).toMatch(/Er du her\?/); expect(q).not.toMatch(/±/); expect(q).toMatch(/data-her="ja"/); expect(q).toMatch(/nei, velg sted/);
    expect(herLinjeHtml({ kind: 'manuell', navn: 'Stenbråten' })).toMatch(/bruk GPS igjen/);
    expect(herLinjeHtml({ kind: 'ukjent' })).toMatch(/Hvor er du\?/);
  });
  it('«ja» gjelder til du har flyttet deg 100 m', () => {
    const ja = { lat: 59.85, lon: 10.83 };
    expect(herTilstand({ kind: 'ok', acc: 150 }, false, ja, { lat: 59.8501, lon: 10.83 })).toBe('bekreftet');
    // v1.218.212: spørsmålet krever at usikkerheten har VART (hysteresen) — én fiks på ±150 m spør ikke.
    expect(herTilstand({ kind: 'ok', acc: 150 }, false, ja, { lat: 59.852, lon: 10.83 })).toBe('påstand');
    expect(herTilstand({ kind: 'ok', acc: 150 }, false, ja, { lat: 59.852, lon: 10.83 }, true)).toBe('spørsmål');
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

describe('bekreftet posisjon (v1.218.202)', () => {
  it('«ja» på påstanden tar spørsmålet bort til du har flyttet deg 100 m', () => {
    const ja = { lat: 59.85, lon: 10.83 };
    expect(herTilstand({ kind: 'ok', acc: 10 }, false, ja, { lat: 59.8501, lon: 10.83 })).toBe('bekreftet');
    expect(herTilstand({ kind: 'ok', acc: 10 }, false, ja, { lat: 59.852, lon: 10.83 })).toBe('påstand');
    expect(herTilstand({ kind: 'ok', acc: 10 }, false, null, { lat: 59.85, lon: 10.83 })).toBe('påstand');
  });
  it('bekreftet: ingen spørsmål, men linja kan trykkes for å endre', () => {
    const h = herLinjeHtml({ kind: 'bekreftet', navn: 'Stenbråtveien 14' });
    expect(h).not.toMatch(/ikke riktig|Stemmer/);
    expect(h).toMatch(/data-her="velg"[^>]*aria-label="Du er her: Stenbråtveien 14\. Endre sted"/);
  });
});

describe('bekreftelsen huskes (v1.218.203)', () => {
  it('lagres ved «ja», leses ved oppstart, og nøkkelen er registrert', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/_lagreHerJa\(_herJa\);/);
    expect(a).toMatch(/let _herÅpen = false, _herJa = _lesHerJa\(\),/);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.herBekreftet'");
  });
});

import { usikkerMedRo, USIKKER_INN_MS, SIKKER_UT_MS } from '../src/views/auto.js';
describe('usikkerhet med ro (v1.218.205)', () => {
  const p = acc => ({ kind: 'ok', acc });
  it('svært usikker en stund: bekreftelsen holder ikke, appen spør', () => {
    let s = usikkerMedRo(null, p(784), 0);
    expect(s.usikker).toBe(false);
    s = usikkerMedRo(s, p(784), USIKKER_INN_MS);
    expect(s.usikker).toBe(true);
    expect(herTilstand({ kind: 'ok', acc: 784 }, false, { lat: 59.85, lon: 10.83 }, { lat: 59.85, lon: 10.83 }, s.usikker)).toBe('spørsmål');
  });
  it('bølger rundt grensen: ingen bytte (ro)', () => {
    let s = null;
    for (let t = 0; t < 120_000; t += 5_000) s = usikkerMedRo(s, p(t % 10_000 ? 200 : 40), t);
    expect(s.usikker).toBe(false);
  });
  it('sikker igjen først når nøyaktigheten har vært god lenge', () => {
    let s = { usikker: true, siden: null };
    s = usikkerMedRo(s, p(30), 0); expect(s.usikker).toBe(true);
    s = usikkerMedRo(s, p(100), 20_000); expect(s.usikker).toBe(true);   // mellom grensene: tellingen nullstilles
    s = usikkerMedRo(s, p(30), 30_000); s = usikkerMedRo(s, p(30), 30_000 + SIKKER_UT_MS);
    expect(s.usikker).toBe(false);
  });
});
