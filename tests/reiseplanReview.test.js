// Review av Reiseplan-skjermen (2026-11-10), funn 1–5, alle sett i nettleseren.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('leaflet', () => ({ default: {} })); vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
import { addLegToPlan, loadPlan, legFarge } from '../src/api/plan.js';
import { legIcs, ALARM_MAKS_GANG_MIN } from '../src/api/ics.js';

beforeEach(() => localStorage.clear());
const c = (o = {}) => ({
  expectedDepartureTime: '2026-11-10T07:41:00Z', _finalArrival: '2026-11-10T08:19:00Z',
  quay: { publicCode: 'E' }, destinationDisplay: { frontText: 'Jernbanetorget' },
  serviceJourney: { id: 'RUT:ServiceJourney:x', line: { id: 'RUT:Line:74', publicCode: '74', transportMode: 'bus', presentation: { colour: 'E60000', textColour: 'FFFFFF' } }, estimatedCalls: [] },
  ...o,
});
const dir = { key: 'custom-out', from: 'Mortensrud', to: 'Jernbanetorget' };

describe('3: etappen tar vare på det linjemerket og raden trenger', () => {
  it('linje-id, transportmiddel, tekstfarge og plattform', () => {
    const l = addLegToPlan(c(), dir);
    expect(l).toMatchObject({ lineId: 'RUT:Line:74', mode: 'bus', lineFg: 'FFFFFF', quay: 'E', lineColour: 'E60000' });
  });
  it('uten linjefarge: ingen farge, ikke den brune plassholderen', () => {
    const x = c(); x.serviceJourney.line.presentation = {};
    expect(addLegToPlan(x, dir).lineColour).toBe(null);
  });
  it('gamle etapper med 7c2d12 leses som uten farge', () => {
    expect(legFarge({ lineColour: '7c2d12' })).toBe(null);
    expect(legFarge({ lineColour: 'E60000' })).toBe('E60000');
  });
  it('gange til et annet stopp følger med', () => {
    expect(addLegToPlan(c({ _gåTil: { navn: 'Mortensrud', min: 5, startTid: '2026-11-10T07:35:00Z' } }), dir).gåTil.navn).toBe('Mortensrud');
  });
  it('kortet og kartet sender id, transportmiddel og tekstfarge', () => {
    const p = readFileSync('src/views/plan.js', 'utf8');
    expect(p).toContain('linjemerke({ kode: leg.line, farge: legFarge(leg), tekst: leg.lineFg, linjeId: leg.lineId, modus: leg.mode })');
  });
});

describe('2: kartet rammer inn på nytt når en etappe legges til', () => {
  it('bare dragstart — appens egen innramming utløser zoomstart', () => {
    const p = readFileSync('src/views/plan.js', 'utf8');
    expect(p).toContain("_planMap.on('dragstart', () => { _planUserMoved = true; });");
    expect(p).not.toContain("'dragstart zoomstart'");
  });
});

describe('1: trykk på en etappe viser etappen', () => {
  it('avgangsdetaljene leser ruta fra avgangen når den har sin egen', () => {
    const s = readFileSync('src/views/selected.js', 'utf8');
    expect(s).toContain('function _selDir() { return (state.sel && state.sel._dir) || config.dirs[state.dIdx]; }');
    expect(s).not.toMatch(/const dir = config\.dirs\[state\.dIdx\];/);
  });
  it('etappen gir avgangen sin egen rute, transportmiddel, plattform og stopp', () => {
    const p = readFileSync('src/views/plan.js', 'utf8');
    expect(p).not.toContain("transportMode: 'metro',");
    expect(p).toContain('_dir: legDir(leg),');
    expect(p).toContain("quay: { publicCode: leg.quay || '?' },");
    expect(p).toContain('estimatedCalls: legKall(leg),');
  });
});

describe('4: alarmen regner ikke med en gangtid du ikke skal gå', () => {
  it(`gangtid over ${ALARM_MAKS_GANG_MIN} min er ikke gangtid til stoppet`, () => {
    const s = readFileSync('src/api/calShare.js', 'utf8');
    expect(s).toMatch(/w && w\.mins <= ALARM_MAKS_GANG_MIN \? w\.mins : null/);
    expect(ALARM_MAKS_GANG_MIN).toBe(30);
  });
});

describe('5: kalenderteksten i norsk tid', () => {
  it('«Avgang 11:41 fra Oslo S», ikke «10:41 UTC»', () => {
    const t = legIcs({ id: 'leg_1', line: 'R10', from: { name: 'Oslo S' }, to: { name: 'Drammen' }, depIso: '2026-11-10T10:41:00Z', arrIso: '2026-11-10T11:41:00Z' }, { mins: 10, source: 'gange' }, 0)
      .replace(/\r\n /g, '');
    expect(t).toContain('Avgang 11:41 fra Oslo S');
    expect(t).not.toContain('UTC');
  });
});
