import { storage } from '../storage.js';
import { enturFetch } from './http.js';
import { logMsg } from '../ui/log.js';
import config from '../config.js';
import { stopPlacesGQL } from './queries.js';

const KEY = 't.hubs';

/**
 * What kind of place each stop is, kept so it is asked once and not again.
 *
 * Asked for: "analyser hvilke stopp på Entur sitt api som er knutepunkter og
 * lagre dette som et register for oppslag". The register holds the RAW FACTS
 * — how many platforms, which modes — and not the verdict.
 *
 * That distinction is the important one. The threshold below is the single
 * thing about this feature that cannot be checked from here: I do not know
 * how many platforms Helsfyr has against Godlia, because the proxy reaches
 * neither api.entur.io nor Entur's docs. Storing facts means the threshold
 * can be moved later without asking Entur anything again.
 */
export function loadHubs() {
  try {
    const v = JSON.parse(storage.get(KEY) || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}

export function saveHubs(map) {
  try { storage.set(KEY, JSON.stringify(map)); } catch { /* quota; harmless */ }
}

/**
 * The register, as a person can read it.
 *
 * Read from STORAGE, not caught in flight. The log line this replaces could
 * not be read at all: logMsg keeps thirty entries, the departure board writes
 * about five per poll every ten seconds, and the only way to open the debug
 * panel is a dot in the BOARD header — so getting to the panel flushed the
 * line on the way. Twice sent, twice not there. The register is stored, so
 * the panel should read the store.
 *
 * @returns {string} one line per stop, or a plain sentence when empty
 */
export function hubReport() {
  const reg = loadHubs();
  const ids = Object.keys(reg);
  if (!ids.length) return 'registeret er tomt — åpne en retning på auto-reise';
  return ids.map(id => {
    const e = reg[id] || {};
    const name = e.n || String(id).replace(/^NSR:StopPlace:/, '');
    const r = Array.isArray(e.r)
      ? (e.r.map(x => String(x).replace(/^\w+:Line:/, '')).join(',') || '(ingen)')
      : '—';
    return name.padEnd(22).slice(0, 22)
      + ' r=' + r.padEnd(12).slice(0, 12)
      + ' q=' + String(e.q == null ? '?' : e.q).padEnd(3)
      + ' m=' + ((e.m || []).join('+') || '-');
  }).join('\n');
}

/** Test seam, and what a profile switch should do. */
export function _resetHubs() {
  try { storage.remove(KEY); } catch { /* ignore */ }
  _rejected = false;
  _plainOnly = false;
}

/**
 * The shape of a stored entry.
 *
 * Bumped when the facts collected change, because an entry written by an
 * older build would otherwise never be re-asked — and the reader who has
 * already used the app is exactly the one who would see no improvement at
 * all. Entries below this are treated as unknown.
 */
export const HUB_V = 3;

/** An entry we can actually reason about. */
export function hubKnown(entry) {
  return !!entry && Number(entry.v) >= HUB_V;
}

/** Modes that run on rails, and therefore cannot quietly take another road. */
const RAIL_MODES = new Set(['metro', 'tram', 'rail']);

const _set = (a) => new Set((Array.isArray(a) ? a : []).filter(Boolean));
const _railModes = (a) =>
  new Set((Array.isArray(a) ? a : []).filter(m => RAIL_MODES.has(m)));

/**
 * How many rail-bound lines make a stop somewhere you can change.
 *
 * TWO, and this is a definition rather than a tuning knob: "lagre alle
 * stoppesteder som tjener fler enn én linje". It is not a number to move if
 * the answer looks wrong — if it looks wrong, the facts are wrong.
 */
export const HUB_MIN_LINES = 2;

/**
 * Which stops along this direction are worth anchoring on.
 *
 * A stop serves more than one rail-bound line, or more than one rail-bound
 * mode. That is all.
 *
 * THE FIFTH DEFINITION, AND IT IS THE READER'S OWN — and the one variant that
 * was never tried. v1.81.0 tried "more than one line" and marked every stop,
 * so the idea was written off; but it counted ALL lines, buses included, and
 * every Oslo metro station has buses. Only v1.84.0 narrowed what is stored to
 * RAIL-BOUND lines, and by then the rule had already moved on to comparing
 * neighbours. So an absolute count over the rail-only set was skipped past
 * rather than rejected.
 *
 * Comparing neighbours was wrong for a reason worth keeping written down: it
 * finds JUNCTIONS, not interchanges. Reported with a screenshot — Borgen and
 * Gjettum anchored while Majorstuen and Jernbanetorget did not, because
 * inside a shared stretch nothing changes however many lines call there.
 * "Where the line's composition changes" and "where you can change" are
 * different questions, and only the second was ever asked.
 *
 *   Hellerud        r=2,3          → 2 lines → anchor
 *   Majorstuen      r=1,2,3,4,5    → 5 lines → anchor
 *   Jernbanetorget  r=1,2,3,4,5    → 5 lines → anchor
 *   Bogerud         r=3            → 1 line  → not
 *
 * A stop with no line data is not an anchor: unknown is not the same fact as
 * "one line", and with Quay.lines refused nothing anchors at all — which
 * stopRuns reads as "show every stop", the list as it was.
 *
 * @param {Array} stops in travel order
 * @returns {Set<string>} stop ids
 */
export function anchorIds(stops, hubs) {
  const list = stops || [];
  const reg = hubs || {};
  const out = new Set();
  list.forEach(s => {
    const e = s && s.id ? reg[s.id] : null;
    if (!e || !Array.isArray(e.r)) return;
    if (_set(e.r).size >= HUB_MIN_LINES || _railModes(e.m).size >= HUB_MIN_LINES) {
      out.add(s.id);
    }
  });
  // No valve here, and its removal is the point rather than an omission.
  //
  // v1.84.1 refused an answer that marked more than 60% of a line, as
  // insurance against a signal firing everywhere. Under an absolute rule that
  // insurance turns harmful: on a trunk where ten of seventeen stops really do
  // serve several lines, "most of this line is an interchange" is TRUE, and
  // the valve threw the correct answer away. Measured — six of nine stops on
  // the line 3 fixture, and the whole set came back empty.
  //
  // The rule protects itself instead: a stop with one line is never an anchor,
  // and if every stop genuinely has several then nothing folds and the list is
  // the full list. The failure mode is still the old screen.
  return out;
}

// Remembered for the session, like the per-line cap in entur.js: a rejected
// field must cost one request, not one per line for the rest of the day.
let _rejected = false;

/** Test seam. */
export function _hubProbeRejected() { return _rejected; }

/**
 * Fill in whatever the register does not know about these stops.
 *
 * One request for the unknown ids, or none at all when they are all known.
 * Resolves to the register either way — the caller redraws, and a list that
 * never gets an answer simply stays as it is.
 */
/** Has the richer query been turned down this session? */
let _plainOnly = false;

/** Test seam. */
export function _hubRichRefused() { return _plainOnly; }

function _ask(ids, rich) {
  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: stopPlacesGQL(ids, rich) }),
  }).then(r => (r && r.ok ? r.json() : null));
}

/** What one StopPlace in the answer tells us. Raw facts, never the verdict. */
function _factsOf(sp) {
  const quays = Array.isArray(sp.quays) ? sp.quays : [];
  const lines = new Set();
  const modes = new Set();
  if (sp.transportMode) modes.add(sp.transportMode);
  quays.forEach(q => {
    (Array.isArray(q && q.lines) ? q.lines : []).forEach(ln => {
      if (!ln) return;
      // Rail-bound lines only. Every kerb has different bus routes, so a bus
      // number changing between neighbours is not a junction — it is just a
      // different kerb, and counting it would make every stop an anchor.
      // Buses still speak, on the MODE dimension below.
      if (ln.id && RAIL_MODES.has(ln.transportMode)) lines.add(ln.id);
      if (ln.transportMode) modes.add(ln.transportMode);
    });
  });
  const e = { v: HUB_V, q: quays.length, m: [...modes], ts: Date.now() };
  // The name, so the register can be read back by a person. Not used by any
  // rule — an id is simply not something anyone can report to me, and the
  // whole reason this register is inspectable is that four definitions of an
  // interchange have been wrong.
  if (sp._name) e.n = sp._name;
  // The rail-bound line IDS, sorted, not a count. A count answered the wrong
  // question — see anchorIds. Only claimed when the rich query answered:
  // absent means "not asked", which is not the same as "no lines here".
  if (lines.size) e.r = [...lines].sort();
  return e;
}

/**
 * @param {string[]} ids
 * @param {Object<string,string>} [names] id → name, for the log line only.
 *   NSR:StopPlace:6013 is not something a person can read, and this line
 *   exists to be read: four definitions of an interchange have been wrong, and
 *   it is what the fifth is meant to be set from.
 */
export function ensureHubs(ids, names) {
  const have = loadHubs();
  // An entry written by an older build knows less than we now need, so it is
  // asked again rather than trusted.
  const want = [...new Set((ids || []).filter(id => id && !hubKnown(have[id])))];
  if (_rejected || !want.length) return Promise.resolve(have);

  const store = (j) => {
    const places = (j.data && j.data.stopPlaces) || [];
    const next = { ...have };
    places.forEach(sp => {
      if (!sp || !sp.id) return;
      next[sp.id] = _factsOf({ ...sp, _name: names && names[sp.id] });
    });
    // What Entur actually said, in the panel, one line per answer.
    //
    // v1.81.0 shipped an absolute threshold reasoned out from what an Oslo
    // metro stop OUGHT to look like, and it marked every stop. The register
    // is a fact about real data, and there is no way to check it from a
    // sandbox that cannot reach api.entur.io — so it says what it learned
    // rather than leaving the next person to reason again.
    if (places.length) {
      // Every stop that was asked about, not the first twelve. Line 3 has
      // seventeen onward stops, so the cap cut off exactly the ones the
      // question is about — Jernbanetorget and Stortinget. logMsg sets no
      // length limit and the panel scrolls, so twelve was a guess at what
      // would fit rather than a limit.
      logMsg('knutepunkt: ' + places.map(sp =>
        ((names && names[sp.id]) || String(sp.id).replace(/^NSR:StopPlace:/, ''))
        // `r`, not `l`. v1.84.0 renamed the fact and left this printing a
        // field that no longer existed, so the one instrument built to stop
        // the guessing quietly showed l=0 for every stop.
        + ' r=' + (((next[sp.id] && next[sp.id].r) || [])
          .map(x => String(x).replace(/^\w+:Line:/, '')).join(',') || '-')
        + ' q=' + ((next[sp.id] && next[sp.id].q) || 0)
        + ' m=' + (((next[sp.id] && next[sp.id].m) || []).join('+') || '-')
      ).join(' | '), 'ok');
    }
    // Stops the answer said nothing about are recorded as known-and-plain,
    // or every opening of the line would ask about them again for ever.
    want.forEach(id => {
      if (!hubKnown(next[id])) next[id] = { v: HUB_V, q: 0, m: [], ts: Date.now() };
    });
    saveHubs(next);
    return next;
  };

  return _ask(want, !_plainOnly)
    .then(j => {
      if (!j) return have;
      if (j.data || !j.errors) return store(j);
      if (_plainOnly) {
        // Even the plain query is gone. One line in the log, no anchors, and
        // never asked again this session.
        _rejected = true;
        logMsg('knutepunkt: feltene ble avvist — lista vises uten ankre', 'err');
        return have;
      }
      // Quay.lines could not be checked from here, so this is the expected
      // half of the probe. Drop to the query v1.72.0 shipped, for the session.
      _plainOnly = true;
      logMsg('knutepunkt: linjefeltet ble avvist — teller perronger i stedet', 'err');
      return _ask(want, false).then(j2 => {
        if (!j2 || (!j2.data && j2.errors)) {
          _rejected = true;
          return have;
        }
        return store(j2);
      });
    })
    .catch(() => have);
}
