// Auto-reise velger linja selv, og lar deg rette den.
//
// Bestilt: «Auto-reise må i større grad greie å velge mest sannsynlige linje
// eller rute som brukeren reiser med uten at bruker har fortalt appen det.
// Ta et valg, men la bruker korrigere dersom denne ser at du velger feil.»
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { rangerKandidater, stoppPåLinja, TETT_LIKT_M } from '../src/api/ombord.js';
import { oppdaterLås } from '../src/api/ombordLaas.js';

const NÅ = Date.parse('2026-11-06T07:20:00Z');
const MIN = 60000;
const kall = (id, lat, min) => ({ expectedDepartureTime: new Date(NÅ + min * MIN).toISOString(),
  quay: { latitude: lat, longitude: 10.83, stopPlace: { id, name: id, latitude: lat, longitude: 10.83 } } });
// To turer følger sporet, med hvert sitt neste stopp. dLat er hvor langt
// unna sporet turen forventes å være (tetthet).
const spor = [0, 1, 2, 3].map(i => ({ lat: 59.85 + i * 0.001, lon: 10.83, at: NÅ - (3 - i) * 20000, acc: 8 }));
const kand = (linje, neste, dLat) => ({ nøkkel: 'sj' + linje, linje, front: 'X', farge: 'e60000',
  call: { serviceJourney: { id: 'sj' + linje, estimatedCalls: [kall('A' + linje, 59.845, -6), kall(neste, 59.86, 2), kall('Z' + linje, 59.87, 5)] } },
  forventet: spor.map(f => ({ at: f.at, lat: f.lat + dLat, lon: f.lon })) });
const T3 = kand('3', 'Bøler', 0.0001);       // ~11 m unna sporet
const B76 = kand('76', 'Ulsrud', 0.0009);    // ~100 m unna sporet
const TVIL = { kind: 'ombord-tvil', kandidater: [B76, T3] };

describe('før-bildet: ved tvil valgte appen ingenting', () => {
  it('stoppPåLinja gir null uten passerte stopp', () => {
    expect(stoppPåLinja(TVIL, NÅ, [])).toBeNull();
  });
});

describe('rangering', () => {
  it('den som følger tettest velges', () => {
    const r = rangerKandidater([B76, T3], { spor, lang: [], nå: NÅ });
    expect(r[0].k.linje).toBe('3');
    expect(r[0].grunn).toBe('følger tettest');
  });
  it('passerte stopp slår tetthet', () => {
    const lang = [{ lat: 59.845, lon: 10.83, at: NÅ - 6 * MIN, acc: 8 }, { lat: 59.845, lon: 10.83, at: NÅ - 6 * MIN + 1000, acc: 8 }];
    // Bare 76s første stopp ligger der begge startet; gi 76 et ekstra passert stopp.
    const B = kand('76', 'Ulsrud', 0.0009);
    B.call.serviceJourney.estimatedCalls.unshift(kall('Q', 59.84, -9));
    const lang2 = [...lang, { lat: 59.84, lon: 10.83, at: NÅ - 9 * MIN, acc: 8 }];
    const r = rangerKandidater([T3, B], { spor, lang: lang2, nå: NÅ });
    expect(r[0].k.linje).toBe('76');
    expect(r[0].grunn).toBe('passerte stopp');
  });
  it('tetthet slår vane, vane avgjør når de er like tette', () => {
    const bruk = new Map([['76', 5]]);
    expect(rangerKandidater([B76, T3], { spor, nå: NÅ, linjeBruk: bruk })[0].k.linje).toBe('3');
    const likT3 = kand('3', 'Bøler', 0.0002), likB = kand('76', 'Ulsrud', 0.0003);
    expect(TETT_LIKT_M).toBe(30);
    const r = rangerKandidater([likT3, likB], { spor, nå: NÅ, linjeBruk: bruk });
    expect(r[0].k.linje).toBe('76');
    expect(r[0].grunn).toBe('vanen din');
  });
});

describe('gjettet eller valgt', () => {
  it('et gjett låses som gjettet', () => {
    const r = oppdaterLås(null, { vinner: T3, vinnerKilde: 'gjettet', fartMS: 8, spor, nå: NÅ });
    expect(r.lås.kilde).toBe('gjettet');
    expect(r.hendelse).toBe('gjettet');
  });
  it('et gjett byttes når en annen tur følger deg alene', () => {
    const r = oppdaterLås({ k: B76, kilde: 'gjettet', stilleFra: null }, { låstK: B76, vinner: T3, vinnerKilde: 'sikker', fartMS: 8, spor, nå: NÅ });
    expect(r.lås.k.linje).toBe('3');
    expect(r.hendelse).toBe('byttet');
  });
  it('et valg du har gjort, holdes', () => {
    const r = oppdaterLås({ k: B76, kilde: 'valgt', stilleFra: null }, { låstK: B76, vinner: T3, vinnerKilde: 'sikker', fartMS: 8, spor, nå: NÅ });
    expect(r.lås.k.linje).toBe('76');
    expect(r.lås.kilde).toBe('valgt');
  });
});

describe('rette valget', async () => {
  const { rettLinjeHtml } = await import('../src/views/auto.js');
  it('«gjettet», grunnen og «feil linje?»', () => {
    const h = rettLinjeHtml({ k: T3, kilde: 'gjettet' }, [B76, T3], false, 'følger tettest');
    expect(h).toContain('gjettet · følger tettest');
    expect(h).toContain('feil linje?');
  });
  it('åpnet: de andre kandidatene og «ingen av disse»', () => {
    const h = rettLinjeHtml({ k: T3, kilde: 'gjettet' }, [B76, T3], true, '');
    expect(h).toContain('data-jid="sj76"');
    expect(h).not.toContain('data-jid="sj3"');
    expect(h).toContain('ingen av disse');
  });
  it('sikker eller valgt: ikke «gjettet», men fortsatt mulig å rette', () => {
    const h = rettLinjeHtml({ k: T3, kilde: 'valgt' }, [B76, T3], false, '');
    expect(h).not.toContain('gjettet');
    expect(h).toContain('feil linje?');
  });
  it('ingen lås: ingenting', () => {
    expect(rettLinjeHtml(null, [B76, T3], true, '')).toBe('');
  });
});

describe('koblingen', () => {
  const s = readFileSync('src/views/auto.js', 'utf8');
  it('ved tvil uten avgjørelse velges den øverste i rangeringen, som gjettet', () => {
    expect(s).toMatch(/if \(!vinner && dom\.kind === 'ombord-tvil'\) \{\s*const rang = rangerKandidater\(/);
    expect(s).toContain("let vinnerKilde = dom.kind === 'ombord' ? 'sikker' : 'gjettet';");
  });
  it('et trykk på en annen linje låser den som valgt', () => {
    expect(s).toContain("_lås = { k, kilde: 'valgt', stilleFra: null };");
  });
});
