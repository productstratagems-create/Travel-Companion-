// «Videre med kollektivt» spør fra ankomsten, med tak per linje.
//
// Rapportert ved Tveita, 17 min før ankomst: lista spurte om de åtte neste
// fra NÅ, alle åtte gikk før du var framme, og bare to grå rader sto igjen.
// Svarene under er Tveita T slik Entur ga dem 2026-11-04.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapIcons.js', () => ({
  makeStopIcon: vi.fn(), makeVehicleIcon: vi.fn(), makeRouteStopIcon: vi.fn(),
  mapHalo: vi.fn(), sideVehicleSvg: () => '', SIDE_VEHICLE_MAX_PX: 30,
}));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/views/spectate.js', () => ({ closeSpectatePanel: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { arrRows, arrBoardSpørsmål, ARR_BOARD_LOOKBACK_MINS, ARR_BOARD_PER_LINE, ARR_BOARD_ASK } from '../src/views/track.js';
import { arrBoardGQL } from '../src/api/queries.js';

const ANK = Date.parse('2026-11-04T07:08:00Z');          // 08:08 lokal
const T = hhmm => Date.parse('2026-11-04T' + hhmm + ':00+01:00');
const rad = (hhmm, linje, mode, dest) => ({ depTs: T(hhmm), ln: { publicCode: linje, transportMode: mode }, dest, quay: '1' });

// Slik dagens spørring svarte: de åtte neste fra 07:51.
const FRA_NÅ = [rad('07:54', '69', 'bus', 'Lutvann'), rad('07:56', '2', 'metro', 'Østerås'), rad('07:57', '2', 'metro', 'Østerås'),
  rad('07:58', '58', 'bus', 'Bøler T'), rad('07:59', '2', 'metro', 'Ellingsrudåsen'), rad('08:00', '58', 'bus', 'Nydalen'),
  rad('08:02', '2', 'metro', 'Ellingsrudåsen'), rad('08:05', '2', 'metro', 'Østerås')];
// Slik det svarer fra ankomst, med tak per linje og retning.
const FRA_ANKOMST = [rad('08:11', '2', 'metro', 'Avløs'), rad('08:15', '58', 'bus', 'Bøler T'), rad('08:19', '2', 'metro', 'Østerås'),
  rad('08:20', '2', 'metro', 'Ellingsrudåsen'), rad('08:20', '58', 'bus', 'Nydalen'), rad('08:24', '69', 'bus', 'Lutvann'),
  rad('08:26', '2', 'metro', 'Østerås'), rad('08:27', '2', 'metro', 'Ellingsrudåsen'), rad('08:30', '58', 'bus', 'Nydalen')];

describe('før-bildet: spurt fra nå', () => {
  it('gir to grå rader og ingen du kan ta', () => {
    const r = arrRows(FRA_NÅ, ANK, 0, '1');
    expect(r).toHaveLength(2);
    expect(r.every(x => x.rcls === 'missed')).toBe(true);
  });
});

describe('spurt fra ankomst', () => {
  it('spørsmålet starter like før ankomst, med tak per linje', () => {
    const o = arrBoardSpørsmål(ANK);
    expect(o.fraMs).toBe(ANK - ARR_BOARD_LOOKBACK_MINS * 60000);
    expect(o.perLinje).toBe(ARR_BOARD_PER_LINE);
    const q = arrBoardGQL('NSR:StopPlace:59517', ARR_BOARD_ASK, false, o.fraMs, o.perLinje, o.vinduMin);
    expect(q).toContain('startTime:"' + new Date(ANK - ARR_BOARD_LOOKBACK_MINS * 60000).toISOString() + '"');
    expect(q).toContain('numberOfDeparturesPerLineAndDestinationDisplay:2');
    expect(q).toContain('numberOfDepartures:' + ARR_BOARD_ASK);
  });
  it('gir avganger du rekker, med T-bane og buss og bussen mot Lutvann', () => {
    const r = arrRows(FRA_ANKOMST, ANK, 0, '1').filter(x => x.rcls !== 'missed');
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(new Set(r.map(x => x.c.ln.transportMode))).toEqual(new Set(['metro', 'bus']));
    expect(r.some(x => x.c.ln.publicCode === '69')).toBe(true);
  });
  it('og uten tidspunkt er spørsmålet som før, for andre kallere', () => {
    expect(arrBoardGQL('X', 8)).not.toMatch(/startTime:"|PerLine/);
  });
});

describe('koblingen', () => {
  it('_fetchArrBoardData spør fra ankomsten', () => {
    const s = fs.readFileSync('src/views/track.js', 'utf8');
    expect(s).toMatch(/fetchArrBoard\(_arrBoardStopId, ARR_BOARD_ASK, arrBoardSpørsmål\(_arrivalDate\(\)\.getTime\(\)\)\)/);
  });
  it('fetchArrBoard sender tidspunktet og taket videre', () => {
    const s = fs.readFileSync('src/api/entur.js', 'utf8');
    expect(s).toMatch(/arrBoardGQL\(stopId, n, false, opt\.fraMs, perLinje, opt\.vinduMin\)/);
  });
});
