/**
 * Which traffic messages are about YOUR journey.
 *
 * Reported with a screenshot: the reader was on metro line 3 toward
 * Jernbanetorget, and the banner said a BUS from Bjørndal was 22 minutes late.
 *
 * That message hung on Jernbanetorget's stopPlace — a stop the reader WAS
 * travelling to — so provenance alone would keep it. Only `affects`, which
 * names line 71, can tell the two apart. That is the case these tests are
 * built around.
 */
import { describe, it, expect } from 'vitest';
import { sameLine, situationScope, relevance, splitSituations, addSituation }
  from '../src/api/situations.js';

const L3 = 'RUT:Line:3', L71 = 'RUT:Line:71';
const JBT = 'NSR:StopPlace:Jernbanetorget', SKU = 'NSR:StopPlace:Skullerud';
const SJ3 = 'RUT:ServiceJourney:3-0810';

/** The reader: line 3, this journey, these stops. */
const MEG = { lineIds: [L3], journeyIds: [SJ3], stopIds: [SKU, JBT] };

const sit = (id, opts = {}) => ({
  id, severity: 'normal',
  summary: [{ language: 'no', value: opts.text || 'melding' }],
  ...(opts.affects ? { affects: opts.affects } : {}),
  ...(opts._from ? { _from: opts._from } : {}),
});

describe('sameLine', () => {
  it('matches on id', () => {
    expect(sameLine({ id: L3 }, { id: L3 })).toBe(true);
    expect(sameLine({ id: L3 }, { id: L71 })).toBe(false);
  });

  it('falls back to the public code when an id is missing', () => {
    expect(sameLine({ publicCode: '3' }, { id: L3, publicCode: '3' })).toBe(true);
    expect(sameLine({ publicCode: '3' }, { publicCode: '71' })).toBe(false);
  });

  // Same reasoning as nearStopMatch: two unknowns are not the same thing.
  it('does not match two missing ids', () => {
    expect(sameLine({}, {})).toBe(false);
    expect(sameLine(null, { id: L3 })).toBe(false);
  });

  it('prefers the id over a coinciding public code', () => {
    expect(sameLine({ id: L3, publicCode: '3' }, { id: L71, publicCode: '3' })).toBe(false);
  });
});

describe('situationScope', () => {
  // UNION, NOT REPLACEMENT. A message can hang on your leg and also name a
  // line, and losing either fact throws away the provenance this exists for.
  it('merges what Entur declares with where we found it', () => {
    const s = sit('a', {
      affects: [{ line: { id: L71 } }],
      _from: { stops: new Set([JBT]), lines: new Set(), journeys: new Set() },
    });
    const sc = situationScope(s);
    expect([...sc.lines]).toEqual([L71]);
    expect([...sc.stops]).toEqual([JBT]);
  });

  it('survives a situation with no affects at all', () => {
    const sc = situationScope(sit('a', { _from: { stops: new Set([SKU]) } }));
    expect(sc.namesLines).toBe(false);
    expect([...sc.stops]).toEqual([SKU]);
  });

  it('reads a quay affect as its stop place', () => {
    const sc = situationScope(sit('a', { affects: [{ quay: { stopPlace: { id: SKU } } }] }));
    expect([...sc.stops]).toEqual([SKU]);
  });

  it('normalises the codespace on a journey it names', () => {
    const sc = situationScope(sit('a', { affects: [{ serviceJourney: { id: 'rut:ServiceJourney:9' } }] }));
    expect([...sc.journeys]).toEqual(['RUT:ServiceJourney:9']);
  });

  it('survives junk', () => {
    expect(() => situationScope(null)).not.toThrow();
    expect(() => situationScope(sit('a', { affects: [null, {}] }))).not.toThrow();
  });
});

describe('relevance', () => {
  // THE REPORTED CASE, IN ONE ASSERTION. The message hung on Jernbanetorget —
  // a stop the reader passes — but it names line 71 and the reader is on 3.
  it('sets aside a message that names someone else’s line, even at your stop', () => {
    const s = sit('bjorndal', {
      text: 'Avgangen fra Bjørndal kl. 08:10 er ca. 22 minutter forsinket',
      affects: [{ line: { id: L71 } }],
      _from: { stops: new Set([JBT]) },
    });
    expect(relevance(s, MEG)).toBe('other');
  });

  it('keeps a message that names your line', () => {
    expect(relevance(sit('a', { affects: [{ line: { id: L3 } }] }), MEG)).toBe('mine');
  });

  // Your own service journey settles it whatever else is mentioned.
  it('keeps a message about your own departure, whatever else it names', () => {
    const s = sit('a', { affects: [{ serviceJourney: { id: SJ3 } }, { line: { id: L71 } }] });
    expect(relevance(s, MEG)).toBe('mine');
  });

  // WITHOUT affects, rule 1 cannot fire — and the behaviour must be exactly
  // today's, not worse. A closed station is a stopPlace message with no line.
  it('keeps a stop message on a stop you pass when nothing names a line', () => {
    const s = sit('stengt', { text: 'Skullerud er stengt', _from: { stops: new Set([SKU]) } });
    expect(relevance(s, MEG)).toBe('mine');
  });

  it('sets aside a stop message for a stop you never touch', () => {
    const s = sit('a', { _from: { stops: new Set(['NSR:StopPlace:Bergen']) } });
    expect(relevance(s, MEG)).toBe('other');
  });

  // Nothing known about it either way: shown rather than buried. We cannot
  // prove it is irrelevant.
  it('keeps a message we know nothing about', () => {
    expect(relevance(sit('a'), MEG)).toBe('mine');
  });

  it('keeps everything when the screen knows no context', () => {
    const s = sit('a', { affects: [{ line: { id: L71 } }] });
    expect(relevance(s, {})).toBe('other');
    expect(relevance(sit('b'), {})).toBe('mine');
  });
});

describe('splitSituations', () => {
  const list = [
    sit('mine1', { affects: [{ line: { id: L3 } }] }),
    sit('other1', { affects: [{ line: { id: L71 } }], _from: { stops: new Set([JBT]) } }),
    sit('mine2', { _from: { stops: new Set([SKU]) } }),
    sit('other2', { _from: { stops: new Set(['NSR:StopPlace:Bergen']) } }),
  ];

  it('sorts them into two piles', () => {
    const { mine, other } = splitSituations(list, MEG);
    expect(mine.map(s => s.id)).toEqual(['mine1', 'mine2']);
    expect(other.map(s => s.id)).toEqual(['other1', 'other2']);
  });

  // THE ONE WAY «sorted» BECOMES «hidden» BY ACCIDENT.
  it('never drops a message', () => {
    const { mine, other } = splitSituations(list, MEG);
    expect(mine.length + other.length).toBe(list.length);
  });

  it('survives an empty or missing list', () => {
    expect(splitSituations(null, MEG)).toEqual({ mine: [], other: [] });
    expect(splitSituations([null, undefined], MEG).mine.length).toBe(0);
  });
});

describe('addSituation', () => {
  // fetchTrip used sitMap.set(s.id, s), so the last hit won and everything
  // earlier — the only handle on relevance — was lost.
  it('keeps every place a message was found', () => {
    const m = new Map();
    addSituation(m, sit('a'), { stop: JBT });
    addSituation(m, sit('a'), { line: L3, journey: SJ3 });
    const sc = situationScope(m.get('a'));
    expect([...sc.stops]).toEqual([JBT]);
    expect([...sc.lines]).toEqual([L3]);
    expect([...sc.journeys]).toEqual([SJ3]);
  });

  it('ignores a situation with no id', () => {
    const m = new Map();
    addSituation(m, { summary: [] }, { stop: JBT });
    expect(m.size).toBe(0);
  });

  it('normalises the journey codespace on the way in', () => {
    const m = new Map();
    addSituation(m, sit('a'), { journey: 'rut:ServiceJourney:9' });
    expect([...situationScope(m.get('a')).journeys]).toEqual(['RUT:ServiceJourney:9']);
  });
});
