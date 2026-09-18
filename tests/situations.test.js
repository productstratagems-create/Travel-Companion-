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
import { sameLine, situationScope, relevance, splitSituations, addSituation, byLine }
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

// ── Meldingen hører til raden den gjelder (v1.120.0) ───────────────────────
//
// Reported with a screenshot of auto-reise at Jernbanetorget: four traffic
// messages filled the screen above «du er ved», the map and every departure.
// Measured before the change: five cards open, «du er ved» at 351px, the first
// departure at 609px on an 844px screen.
//
// The rule above was right and its CONTEXT made it empty. auto.js passed «the
// lines that actually leave from here» as the reader's own lines. At
// Mortensrud that is three lines and the filter works; at Jernbanetorget it is
// every line in Oslo, so every line-specific message counted as the reader's
// and nothing was ever folded.
describe('byLine', () => {
  const L = (n) => 'RUT:Line:' + n;
  const msg = (id, lines) => ({
    id, summary: [{ language: 'no', value: id }],
    ...(lines ? { affects: lines.map(l => ({ line: { id: L(l) } })) } : {}),
  });

  it('hands each message to the lines it names', () => {
    const m = byLine([msg('a', ['12', '15']), msg('b', ['17'])]);
    expect([...m.keys()].sort()).toEqual([L('12'), L('15'), L('17')]);
    expect(m.get(L('12')).map(s => s.id)).toEqual(['a']);
    expect(m.get(L('15')).map(s => s.id)).toEqual(['a']);
  });

  // The one that belongs in the banner: it is about the stop, not a line, and
  // no row can carry it.
  it('gives a message that names no line to nobody', () => {
    expect(byLine([msg('høstferien', null)]).size).toBe(0);
  });

  it('gathers two messages about one line under that line', () => {
    const m = byLine([msg('a', ['3']), msg('b', ['3'])]);
    expect(m.get(L('3')).map(s => s.id)).toEqual(['a', 'b']);
  });

  // A message reaching a line twice — named by `affects` and found hanging on
  // it — is one message, not two. situationScope returns a Set, so this one
  // holds by construction.
  it('does not repeat one message under one line', () => {
    const both = { ...msg('a', ['3']), _from: { lines: new Set([L('3')]) } };
    expect(byLine([both]).get(L('3'))).toHaveLength(1);
  });

  // AND THE CASE THE GUARD IS ACTUALLY FOR: the same message twice in the
  // list. `_alerts` comes from a Map today so it cannot happen — but the guard
  // is the difference between «cannot happen» and «shows the same disruption
  // twice on one row», and an untested guard is one a later edit removes.
  it('counts one message once however many times it is handed over', () => {
    const one = msg('a', ['3']);
    expect(byLine([one, one]).get(L('3'))).toHaveLength(1);
  });

  it('survives junk', () => {
    expect(byLine(null).size).toBe(0);
    expect(byLine([null, msg('a', null)]).size).toBe(0);
  });

  // THE REPORTED SCREEN, END TO END. With the stop's own lines passed as the
  // reader's, every message is «mine» and the banner keeps all of them; with
  // no line claimed yet, the line-specific ones fold and go to the rows.
  it('splits a hub’s messages once no line is claimed', () => {
    const hub = ['1', '2', '3', '4', '5', '12', '15', '17', '18', '19'].map(L);
    const msgs = [msg('høst', null), msg('t12', ['12']), msg('t17', ['17']), msg('t18', ['18'])];
    const somAlle = splitSituations(msgs, { stopIds: ['S'], lineIds: hub, journeyIds: [] });
    expect(somAlle.mine).toHaveLength(4);

    const somNå = splitSituations(msgs, { stopIds: ['S'], lineIds: [], journeyIds: [] });
    expect(somNå.mine.map(s => s.id)).toEqual(['høst']);
    expect(somNå.other).toHaveLength(3);
    // NOTHING IS DROPPED, as ever.
    expect(somNå.mine.length + somNå.other.length).toBe(msgs.length);
  });
});
