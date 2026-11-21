// v1.218.195: avgangsdetaljer for et alternativt avgangssted — «PÅ · Bøler» og nedtellingen.
import { describe, it, expect, vi } from 'vitest';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: () => {} }));
import { readFileSync } from 'node:fs';
import { påstigningPerler } from '../src/views/selected.js';

const ETAPPER = [{ stops: [{ name: 'Bøler', lat: 59.88, lon: 10.84 }, { name: 'Jernbanetorget', lat: 59.91, lon: 10.75 }] }];
const LINJE = { publicCode: '76', presentation: { colour: 'e60000' } };

describe('påstigningPerler', () => {
  it('før-bildet: kall fra Auto-tavle uten _legs ga ingen perle — nå «PÅ · Bøler · plattform 1»', () => {
    const p = påstigningPerler({ serviceJourney: { line: LINJE }, quay: { publicCode: '1' }, _fra: { name: 'Bøler' } }, ETAPPER);
    expect(p).toEqual([expect.objectContaining({ kind: 'på', tekst: 'Bøler · plattform 1', linje: '76', lat: 59.88 })]);
  });
  it('Rute-avgang som rekkes lenger ned: «PÅ» flyttes fra Mortensrud til stoppet lenger ned; «av» står', () => {
    const dep = { serviceJourney: { line: LINJE }, _rekkLengerNed: { stopp: { navn: 'Bøler' } },
      _legs: [{ mode: 'bus', fromPlace: { name: 'Mortensrud', latitude: 59.85, longitude: 10.83 }, toPlace: { name: 'Jernbanetorget', latitude: 59.91, longitude: 10.75 }, serviceJourney: { line: LINJE } }] };
    const p = påstigningPerler(dep, ETAPPER);
    expect(p.find(x => x.kind === 'på')).toMatchObject({ tekst: 'Bøler', lat: 59.88 });
    expect(p.filter(x => x.kind === 'på')).toHaveLength(1);
    expect(p.some(x => x.kind === 'av')).toBe(true);
  });
  it('vanlig avgang: som før (kartPunkter)', () => {
    const dep = { _legs: [{ mode: 'bus', fromPlace: { name: 'Mortensrud', latitude: 59.85, longitude: 10.83 }, toPlace: { name: 'Jernbanetorget', latitude: 59.91, longitude: 10.75 }, serviceJourney: { line: LINJE } }] };
    expect(påstigningPerler(dep, ETAPPER).find(x => x.kind === 'på')).toMatchObject({ lat: 59.85 });
  });
});

describe('nedtellingen for et alternativ', () => {
  it('gangen gjelder når avgangen går fra et annet stopp — ikke bare når rutas stopp er i nærheten', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toMatch(/const walkActive = selGangAktiv\(dir, c\);/);
    expect(s).toMatch(/if \(alternativ\) return gangGjelder\(fartNå\(\), false\) && !posGråNå\(\);/);
  });
});
