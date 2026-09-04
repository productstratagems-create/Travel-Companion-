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
 * How many platforms make a place worth anchoring on.
 *
 * A guess, and named so it can stop being one. Four is roughly where an Oslo
 * metro stop stops being a pair of side platforms and starts being somewhere
 * you change — but that is reasoning, not measurement, and it is written here
 * rather than buried in a comparison so the next person can move it after one
 * look at real data.
 */
export const HUB_QUAYS = 4;

/**
 * The shape of a stored entry.
 *
 * Bumped when the facts collected change, because an entry written by an
 * older build would otherwise never be re-asked — and the reader who has
 * already used the app is exactly the one who would see no improvement at
 * all. Entries below this are treated as unknown.
 */
export const HUB_V = 2;

/** An entry we can actually reason about. */
export function hubKnown(entry) {
  return !!entry && Number(entry.v) >= HUB_V;
}

/**
 * Is this somewhere you can change?
 *
 * The reader's own definition, in their words: "alle holdeplasser som har
 * overganger til andre linjer eller som både fungerer som t-bane-stopp og
 * buss-holdeplasser".
 *
 *   more than one mode   the bus meets the metro
 *   two or more lines    somewhere you can change to another line
 *   four or more quays   the old rule, kept for when Quay.lines was refused
 *
 * The mode test used to be here and could never fire: `m` was built from
 * StopPlace.transportMode, which is a single value, so the set never had two
 * elements. In practice the whole rule was the quay count, and Helsfyr —
 * four metro lines and the buses, two platforms — did not qualify. That was
 * the reported bug, and it was a dead branch rather than a wrong threshold.
 *
 * `l` is absent when only the plain query succeeded, and that branch then
 * skips itself rather than treating "unknown" as "one".
 */
export function isHub(entry) {
  if (!entry) return false;
  const modes = Array.isArray(entry.m) ? entry.m.filter(Boolean) : [];
  if (new Set(modes).size > 1) return true;
  if (Number(entry.l) >= HUB_LINES) return true;
  return Number(entry.q) >= HUB_QUAYS;
}

/** Two lines meeting is a change. One line calling twice is not — `l` counts
 *  distinct line ids, so a line in both directions stays one. */
export const HUB_LINES = 2;

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
      if (ln.id) lines.add(ln.id);
      if (ln.transportMode) modes.add(ln.transportMode);
    });
  });
  const e = { v: HUB_V, q: quays.length, m: [...modes], ts: Date.now() };
  // Only claimed when the rich query answered. Absent means "not asked", and
  // isHub skips that test rather than reading it as one line.
  if (lines.size) e.l = lines.size;
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
