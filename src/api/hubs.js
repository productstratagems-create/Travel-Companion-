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
export const HUB_V = 2;

/** An entry we can actually reason about. */
export function hubKnown(entry) {
  return !!entry && Number(entry.v) >= HUB_V;
}

/**
 * How much this stop stands out — lines calling, plus a nudge for every mode
 * beyond the first.
 *
 * `q` is the fallback when the line field was refused, so the relative rule
 * below works in that world too, just more coarsely.
 */
export function hubScore(entry) {
  if (!entry) return 0;
  const modes = new Set((Array.isArray(entry.m) ? entry.m : []).filter(Boolean)).size;
  const base = Number(entry.l) || Number(entry.q) || 0;
  return base + Math.max(0, modes - 1);
}

/**
 * At most this share of a line may be an anchor.
 *
 * A DISPLAY decision, not a claim about transit — how many anchors a list can
 * carry before it stops being scannable. That is the difference between this
 * number and the one it replaces.
 */
export const ANCHOR_SHARE = 0.4;

/**
 * Which stops on THIS line are worth anchoring on.
 *
 * Relative, and that is the whole point. v1.81.0 used an absolute rule — two
 * or more lines calling — and reported back: "ser ut som alle holdeplasser er
 * blitt til knutepunkter". Whatever Entur actually returns for an ordinary
 * Oslo metro stop, it clears two: a night bus, a replacement bus, or simply
 * how Ruter models the place. Raising the number would have been the same
 * guess with a different digit.
 *
 * So there is no absolute number left to be wrong about. A stop anchors when
 * it stands out AGAINST THE LINE IT IS ON — above the median score — and the
 * set is capped at ANCHOR_SHARE of the stops. Marking everything is now
 * impossible by construction rather than by a lucky threshold, and a line
 * where every stop really is equal gets no anchors at all, which stopRuns
 * already reads as "show them all".
 *
 * @returns {Set<string>} stop ids
 */
export function anchorIds(stops, hubs) {
  const list = stops || [];
  const reg = hubs || {};
  const scored = list
    .map(s => ({ id: s && s.id, v: hubScore(reg[s && s.id]) }))
    .filter(x => x.id);
  if (!scored.some(x => x.v > 0)) return new Set();

  const vals = scored.map(x => x.v).sort((a, b) => a - b);
  const mid = vals.length >> 1;
  const median = vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;

  const above = scored.filter(x => x.v > median).sort((a, b) => b.v - a.v);
  const cap = Math.max(1, Math.floor(list.length * ANCHOR_SHARE));
  if (above.length <= cap) return new Set(above.map(x => x.id));
  // The cap must not cut through a tie. Two stops with the same score are the
  // same kind of place, and marking one of them and not the other is a
  // distinction the data does not make — measured: Grønland and Tøyen both
  // scored 5, and only Tøyen was anchored because it sorted first.
  const cut = above[cap - 1].v;
  return new Set(above.filter(x => x.v >= cut).map(x => x.id));
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
