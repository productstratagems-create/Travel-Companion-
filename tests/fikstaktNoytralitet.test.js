/* ATFERDSNØYTRALITET OG FEILSIKKERHET for GPS-fikstakt-målingen (#809, v1.218.333).
 * Samme fikssekvens gjennom geo.js med målingen av og på (og med en måling som kaster) skal gi IDENTISK posisjonsbehandling. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0, nearestStation: null, nearestStations: [], gpsError: null, posAt: null,
                posAsked: false, posAcc: null, posRejAt: null, posTrail: [], posTrailLang: [], posJumpAt: null, posJumpM: null };
vi.mock('../src/state.js', () => ({ state, intervals: {} }));
vi.mock('../src/config.js', () => ({ default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }], api: { geocoderReverse: 'https://x/reverse' } } }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

const lager = new Map(), setKall = [];
vi.mock('../src/storage.js', () => ({ storage: { get: k => (lager.has(k) ? lager.get(k) : null), set: (k, v) => { setKall.push(k); lager.set(k, v); }, remove: k => { lager.delete(k); } } }));
const geocode = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ features: [{ properties: { name: 'Mortensrud', id: 'NSR:StopPlace:1', category: ['metroStation'] }, geometry: { coordinates: [10.82, 59.86] } }] }) }));
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => geocode(...a) }));

const M = 1 / 111_320, T0 = Date.UTC(2026, 10, 2, 7, 0, 0);
const fix = (lat, lon, acc, ts) => ({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: ts });
/** En lang, blandet sekvens: stille, gange, støy, et hopp, ujevn takt, gjentatt og bakover-tidsstempel. Deterministisk. */
function sekvens() {
  const ut = []; let t = T0, lat = 59.8600; const lon = 10.8200;
  const slå = (dtMs, dLat, acc) => { t += dtMs; lat += dLat; ut.push(fix(lat, lon, acc, t)); };
  for (let i = 0; i < 40; i++) slå(1000, (i % 3) * M * 0.3, 8);
  for (let i = 0; i < 120; i++) slå(1000, 1.4 * M, 8);
  for (let i = 0; i < 30; i++) slå(700 + (i % 5) * 400, (i % 2 ? 1 : -1) * 25 * M, 60);   // støy og ujevn takt, dårlig acc
  slå(2000, 3000 * M, 10); slå(1000, 0, 10); slå(1000, 0, 10); slå(1000, 0, 10);        // hopp (holdes tilbake)
  for (let i = 0; i < 50; i++) slå(1000, 1.4 * M, 6);
  ut.push(fix(lat, lon, 8, t));                                                          // gjentatt tidsstempel
  ut.push(fix(lat, lon, 8, t - 5000));                                                   // bakover
  return ut;
}

async function kjør({ måling, kaster = false }) {
  vi.resetModules(); lager.clear(); setKall.length = 0; geocode.mockClear();
  Object.assign(state, { homeLL: null, nearestStation: null, nearestStations: [], gpsError: null, posAt: null, posAsked: false, posAcc: null, posRejAt: null, posTrail: [], posTrailLang: [], posJumpAt: null, posJumpM: null });
  if (måling) lager.set('t.memoryConsent', '1');
  if (kaster) vi.doMock('../src/api/fikstakt.js', () => ({ registrerFiks: () => { throw new Error('måling feilet'); } }));
  else vi.doUnmock('../src/api/fikstakt.js');
  let cb, opts; vi.stubGlobal('navigator', { geolocation: { watchPosition: (ok, _f, o) => { cb = ok; opts = o; return 7; }, clearWatch: () => {} } });
  const geo = await import('../src/geo.js'); geo._nullstillFilter();
  geo.locateUser(() => {}, () => {});
  const seq = sekvens(); setKall.length = 0; let kasterUt = 0;
  for (const p of seq) { try { cb(p); } catch { kasterUt++; } }
  const underCallback = [...setKall];
  await new Promise(r => setTimeout(r, 0));
  const sluttT = seq[seq.length - 1].timestamp + 1000;
  const ut = { posTrail: JSON.parse(JSON.stringify(state.posTrail)), posTrailLang: JSON.parse(JSON.stringify(state.posTrailLang)), homeLL: JSON.parse(JSON.stringify(state.homeLL)),
    posAt: state.posAt, posAcc: state.posAcc, posRejAt: state.posRejAt, posJumpAt: state.posJumpAt, posJumpM: state.posJumpM, gpsError: state.gpsError,
    nearest: JSON.parse(JSON.stringify(state.nearestStation)), geokodeKall: geocode.mock.calls.length, fart: geo.fartNå(sluttT), framskrevet: geo.framskrevetPos(sluttT), kasterUt };
  return { ut, underCallback, opts, geo };
}
afterEach(() => { vi.unstubAllGlobals(); vi.doUnmock('../src/api/fikstakt.js'); });

describe('samme GPS-sekvens: posisjonsbehandlingen er identisk med målingen av, på og kastende', () => {
  it('posTrail, posTrailLang, homeLL, posAt, posAcc, posRejAt, hopp, nærmeste stopp, geokodekall, fart og framskrevet pos er dypt like', async () => {
    const av = await kjør({ måling: false }), på = await kjør({ måling: true }), kaster = await kjør({ måling: true, kaster: true });
    expect(av.ut.posTrail.length).toBeGreaterThan(5); expect(av.ut.geokodeKall).toBeGreaterThan(0);
    expect(på.ut).toEqual(av.ut);
    expect(kaster.ut).toEqual(av.ut);                    // en måling som kaster påvirker ikke posisjonsbehandlingen
    expect(kaster.ut.kasterUt).toBe(0);                  // og kaster ikke ut av callbacken
  });
  it('ingen synkron lagring i GPS-veien: målingen skriver ikke t.fikstakt under callbackene; skriver først ved skjult side', async () => {
    const på = await kjør({ måling: true }), av = await kjør({ måling: false });
    expect(på.underCallback).toEqual(av.underCallback);  // nøyaktig samme lagringskall som uten måling
    expect(på.underCallback).not.toContain('t.fikstakt');
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(lager.has('t.fikstakt')).toBe(true);
  });
  it('watchPosition-alternativene er uendret, og pos-objektet muteres ikke (frosset pos kaster ikke)', async () => {
    const r = await kjør({ måling: true });
    expect(r.opts).toEqual({ enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
    vi.resetModules(); lager.clear(); lager.set('t.memoryConsent', '1');
    let cb; vi.stubGlobal('navigator', { geolocation: { watchPosition: ok => { cb = ok; return 7; }, clearWatch: () => {} } });
    const geo = await import('../src/geo.js'); geo._nullstillFilter(); geo.locateUser(() => {}, () => {});
    const frosset = Object.freeze({ coords: Object.freeze({ latitude: 59.86, longitude: 10.82, accuracy: 8 }), timestamp: T0 });
    expect(() => cb(frosset)).not.toThrow();
  });
  it('geo.js kaller målingen i try/catch rett etter destruktureringen, og leser aldri noe tilbake', async () => {
    const fs = await import('node:fs'); const kilde = fs.readFileSync('src/geo.js', 'utf8');
    expect(kilde).toMatch(/const \{ latitude, longitude, accuracy, speed, heading \} = pos\.coords;[\s\S]{0,400}try \{ registrerFiks\(pos, Date\.now\(\)\); \} catch/);
    expect((kilde.match(/registrerFiks/g) || []).length).toBe(2);   // import + ett kall
    expect(kilde).not.toMatch(/=\s*registrerFiks\(/);               // returverdien brukes ikke
  });
});
