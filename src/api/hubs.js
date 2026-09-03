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
 * Is this somewhere you can change?
 *
 * Two ways to qualify: enough platforms, or more than one mode calling. The
 * second matters because a two-platform stop where the bus meets the metro is
 * an interchange in the only sense the reader cares about.
 */
export function isHub(entry) {
  if (!entry) return false;
  const modes = Array.isArray(entry.m) ? entry.m.filter(Boolean) : [];
  if (new Set(modes).size > 1) return true;
  return Number(entry.q) >= HUB_QUAYS;
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
export function ensureHubs(ids) {
  const have = loadHubs();
  const want = [...new Set((ids || []).filter(id => id && !have[id]))];
  if (_rejected || !want.length) return Promise.resolve(have);

  return enturFetch(config.api.journeyPlanner, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: stopPlacesGQL(want) }),
  })
    .then(r => (r && r.ok ? r.json() : null))
    .then(j => {
      if (!j) return have;
      if (!j.data && j.errors) {
        // The fields could not be checked from here, so this is the expected
        // half of the probe. One line in the log, no anchors, and never asked
        // again this session.
        _rejected = true;
        logMsg('knutepunkt: feltene ble avvist — lista vises uten ankre', 'err');
        return have;
      }
      const places = (j.data && j.data.stopPlaces) || [];
      const next = { ...have };
      places.forEach(sp => {
        if (!sp || !sp.id) return;
        next[sp.id] = {
          q: Array.isArray(sp.quays) ? sp.quays.length : 0,
          m: sp.transportMode ? [sp.transportMode] : [],
          ts: Date.now(),
        };
      });
      // Stops the answer said nothing about are recorded as known-and-plain,
      // or every opening of the line would ask about them again for ever.
      want.forEach(id => { if (!next[id]) next[id] = { q: 0, m: [], ts: Date.now() }; });
      saveHubs(next);
      return next;
    })
    .catch(() => have);
}
