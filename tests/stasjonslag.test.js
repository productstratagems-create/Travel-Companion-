import { describe, it, expect } from 'vitest';
import { ruterFor, plattformerFraBoksSvar, RUTE_GRAD } from '../src/api/quays.js';
import { stasjonsInnhold } from '../src/ui/stasjonslag.js';

describe('stasjonslaget på alle kart (v1.218.59)', () => {
  it('dekker utsnittet med ruter på RUTE_GRAD', () => {
    const r = ruterFor({ sør: 59.861, nord: 59.862, vest: 10.828, øst: 10.829 });
    expect(r).toEqual(['5986,1082']);
    expect(ruterFor({ sør: 59.8695, nord: 59.8705, vest: 10.8295, øst: 10.8305 })).toHaveLength(4);
    expect(RUTE_GRAD).toBe(0.01);
  });

  it('gjør bbox-svaret om til plattformer på alle stoppene, med stopId', () => {
    const q = (k, la) => ({ id: 'Q' + k, publicCode: k, latitude: la, longitude: 10.8, lines: [{ transportMode: 'metro' }] });
    const l = plattformerFraBoksSvar({ data: { stopPlacesByBbox: [
      { id: 'S1', quays: [q('1', 59.1), q('2', 59.2)] }, { id: 'S2', quays: [q('A', 59.3)] }] } });
    expect(l.map(x => x.stopId + ':' + x.kode)).toEqual(['S1:1', 'S1:2', 'S2:A']);
  });

  it('uthever bare din plattform på ditt stopp, ikke samme kode på nabostoppet', () => {
    const p = [{ id: 'a', stopId: 'S1', kode: '1', lat: 1, lon: 1 }, { id: 'b', stopId: 'S2', kode: '1', lat: 2, lon: 2 }];
    const i = [{ id: 7, lat: 1, lon: 1 }, { id: 8, lat: 1, lon: 1 }];
    const ut = stasjonsInnhold(p, i, { stopId: 'S1', kode: '1', inngangId: 8 });
    expect(ut.plattformer.map(x => x.id + (x.aktiv ? '*' : ''))).toEqual(['a*', 'b']);
    expect(ut.innganger.map(x => x.id + (x.aktiv ? '*' : ''))).toEqual(['7', '8*']);
  });

  it('uten aktiv reise: alle stasjoner tegnes, ingen utheves, ingen duplikater', () => {
    const p = [{ id: 'a', stopId: 'S1', kode: '1' }, { id: 'a', stopId: 'S1', kode: '1' }];
    const ut = stasjonsInnhold(p, [], null);
    expect(ut.plattformer).toHaveLength(1);
    expect(ut.plattformer[0].aktiv).toBe(false);
  });
});

import { aktivFraAvgang } from '../src/ui/stasjonslag.js';
import fs from 'node:fs';

describe('din plattform på alle skjermer (v1.218.60)', () => {
  it('leser kode og stopp fra avgangen', () => {
    expect(aktivFraAvgang({ quay: { publicCode: '2', stopPlace: { id: 'S1' } } }, 'X'))
      .toEqual({ stopId: 'S1', kode: '2', inngangId: null });
  });
  it('bruker stoppet skjermen kjenner når avgangen ikke bærer det', () => {
    expect(aktivFraAvgang({ quay: { publicCode: 'E' } }, 'S9', 7)).toEqual({ stopId: 'S9', kode: 'E', inngangId: 7 });
  });
  it('ingen kode, ingen påstand', () => {
    expect(aktivFraAvgang(null, 'S1')).toBeNull();
    expect(aktivFraAvgang({ quay: { publicCode: '?' } }, 'S1')).toBeNull();
    expect(aktivFraAvgang({ quay: { publicCode: '1' } }, null)).toBeNull();
  });
  it('avgangen uthever riktig plattform, ikke samme kode på nabostoppet', () => {
    const p = [{ id: 'a', stopId: 'S1', kode: '1' }, { id: 'b', stopId: 'S2', kode: '1' }];
    const a = aktivFraAvgang({ quay: { publicCode: '1', stopPlace: { id: 'S2' } } }, 'S1');
    expect(stasjonsInnhold(p, [], a).plattformer.map(x => x.id + (x.aktiv ? '*' : ''))).toEqual(['a', 'b*']);
  });
  it('tavla, avgangsdetaljer og auto-reise bruker samme regel', () => {
    ['board', 'selected', 'auto'].forEach(f =>
      expect(fs.readFileSync('src/views/' + f + '.js', 'utf8')).toMatch(/uthevAvgang\([^;]*(stopId|_stop && _stop\.id)/));
  });
});
