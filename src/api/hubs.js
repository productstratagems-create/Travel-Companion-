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
const _same = (a, b) => {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
};

/**
 * Which stops along this direction are worth anchoring on.
 *
 * A stop is an anchor when its set of rail-bound lines, or its set of modes,
 * DIFFERS FROM THE STOP BEFORE IT. That is what a junction is: a line joins
 * or leaves, right there.
 *
 * THIS IS THE THIRD DEFINITION, and the first with nothing left to guess.
 * v1.81.0 used an absolute count — every stop became an anchor. v1.82.0 made
 * it relative to the line — which measured POPULARITY, not interchange, and
 * the reader found the hole immediately: Hellerud, where lines 2 and 3 part
 * company, scored 2 against a median of 2 and was dropped, while Grønland — a
 * through-station where all five lines run the same way — was kept. Measured:
 *
 *   scores  1 1 1 1 1 1 1 2 2 4 4 5 5 5 5 5 5   median 2, cap 6 of 17
 *   kept    Tøyen Grønland Jernbanetorget Stortinget Nationaltheatret Majorstuen
 *   dropped Hellerud (2), and Helsfyr (4) — above the median, but the cap was
 *           already full of the six tunnel stops
 *
 * No median, no cap, no threshold. "How many lines call here" simply answers
 * a different question from "can I change here".
 *
 * BOTH FAILURE MODES LAND ON TODAY'S LIST, which is the property the two
 * previous attempts lacked. With Quay.lines refused there are no ids, nothing
 * can differ, and there are no anchors — stopRuns then shows every stop. And
 * if the rule ever marked too many, nothing folds and the list is the full
 * list again. Neither end is an empty screen.
 *
 * @param {Array} stops in travel order
 * @returns {Set<string>} stop ids
 */
export function anchorIds(stops, hubs) {
  const list = stops || [];
  const reg = hubs || {};
  const out = new Set();
  let prev = null;
  list.forEach(s => {
    const e = s && s.id ? reg[s.id] : null;
    // No line data at all means nothing can be compared. Not "no lines here"
    // — unknown, which must not read as a change.
    if (!e || !Array.isArray(e.r)) { prev = null; return;  }
    const cur = { r: _set(e.r), m: _set(e.m) };
    if (prev && (!_same(cur.r, prev.r) || !_same(cur.m, prev.m))) out.add(s.id);
    prev = cur;
  });
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
  // The rail-bound line IDS, sorted, not a count. A count answered the wrong
  // question — see anchorIds. Only claimed when the rich query answered:
  // absent means "not asked", which is not the same as "no lines here".
  if (lines.size) e.r = [...lines].sort();
  return e;
}

export function ensureHubs(ids) {
  const have = loadHubs();
  // An entry written by an older build knows less than we now need, so it is
  // asked again rather than trusted.
  const want = [...new Set((ids || []).filter(id => id && !hubKnown(have[id])))];
  if (_rejected || !want.length) return Promise.resolve(have);

  const store = (j) => {
    const places = (j.data && j.data.stopPlaces) || [];
    const next = { ...have };
    places.forEach(sp => { if (sp && sp.id) next[sp.id] = _factsOf(sp); });
    // What Entur actually said, in the panel, one line per answer.
    //
    // v1.81.0 shipped an absolute threshold reasoned out from what an Oslo
    // metro stop OUGHT to look like, and it marked every stop. The register
    // is a fact about real data, and there is no way to check it from a
    // sandbox that cannot reach api.entur.io — so it says what it learned
    // rather than leaving the next person to reason again.
    if (places.length) {
      logMsg('knutepunkt: ' + places.slice(0, 12).map(sp =>
        String(sp.id).replace(/^NSR:StopPlace:/, '')
        + ' l=' + ((next[sp.id] && next[sp.id].l) || 0)
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
