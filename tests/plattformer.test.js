// «bedre/mer detaljerte kart for stasjonsområder med merking av spor og holdeplassmerking» —
// plattformmarkører med kode, og gangruten til plattformen avgangen går fra (v1.218.56).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { plattformerFraSvar, plattformMedKode } from '../src/api/quays.js';
import { plattformMarkører, PLATTFORM_ZOOM } from '../src/views/board.js';

const SVAR = { data: { stopPlace: { id: 'NSR:StopPlace:5687', quays: [
  { id: 'NSR:Quay:1', publicCode: '1', latitude: 59.8494, longitude: 10.8295, lines: [{ transportMode: 'metro' }] },
  { id: 'NSR:Quay:2', publicCode: '2', latitude: 59.8492, longitude: 10.8299, lines: [{ transportMode: 'metro' }] },
  { id: 'NSR:Quay:E', publicCode: 'E', latitude: 59.8490, longitude: 10.8310, lines: [{ transportMode: 'bus' }] },
  { id: 'NSR:Quay:x', publicCode: null, latitude: 59.85, longitude: 10.83, lines: [] },
  { id: 'NSR:Quay:y', publicCode: 'F', latitude: null, longitude: null, lines: [] },
] } } };

describe('plattformene på stasjonen', () => {
  it('kode, koordinat og tekst; uten kode eller koordinat utelatt', () => {
    const l = plattformerFraSvar(SVAR);
    expect(l.map(q => q.kode)).toEqual(['1', '2', 'E']);
    expect(l.map(q => q.tekst)).toEqual(['spor 1', 'spor 2', 'plattform E']);
  });
  it('plattformen avgangen går fra, på kode', () => {
    const l = plattformerFraSvar(SVAR);
    expect(plattformMedKode(l, '2')).toMatchObject({ lat: 59.8492, lon: 10.8299 });
    expect(plattformMedKode(l, '?')).toBe(null);
    expect(plattformMedKode(null, '2')).toBe(null);
  });
  it('markørene: den aktive uthevet', () => {
    const m = plattformMarkører(plattformerFraSvar(SVAR), 'E');
    expect(m.filter(x => x.aktiv).map(x => x.kode)).toEqual(['E']);
    expect(PLATTFORM_ZOOM).toBe(16);
  });
  it('gangruten på tavla går til plattformen når den er kjent', () => {
    const s = readFileSync('src/views/board.js', 'utf8');
    expect(s).toMatch(/const stopLL = pl \? \{ lat: pl\.lat, lon: pl\.lon \} : \(state\.statLL && state\.statLL\[dir\.key\]\);/);
  });
});
