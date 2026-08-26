import { esc } from '../ui/fmt.js';
import { haver } from '../geo.js';
import { projectOnSegment } from '../ui/corridor.js';
import { livePosition } from '../api/vehicles.js';

/**
 * The journey progress strip on the "underveis" screen.
 *
 * Deliberately not the board's strip. That one shows many trains at one point
 * in space — the axis is minutes until each reaches your stop. This shows one
 * train across many points in space — the axis is the stop sequence of the leg
 * being ridden. They share a visual family and nothing else.
 *
 * It exists because the screen answers "when" twice over (a countdown and an
 * arrival clock) and never answers "where". The map cannot: at that zoom the
 * vehicle marker crosses about 0.7 px a second, so a correct position still
 * reads as frozen. Stops move in steps a person can see.
 */

function _time(call, arrival) {
  if (arrival) return call.expectedArrivalTime || call.aimedArrivalTime
    || call.expectedDepartureTime || call.aimedDepartureTime;
  return call.expectedDepartureTime || call.aimedDepartureTime
    || call.expectedArrivalTime || call.aimedArrivalTime;
}

/** The calls reduced to what the strip needs, or null if they cannot carry it. */
function _points(calls) {
  if (!Array.isArray(calls) || calls.length < 2) return null;
  const pts = calls.map(c => {
    const sp = c.quay && c.quay.stopPlace;
    const arr = _time(c, true), dep = _time(c, false);
    if (!arr || !dep) return null;
    const at = new Date(arr).getTime(), dt = new Date(dep).getTime();
    if (!at || isNaN(at) || !dt || isNaN(dt)) return null;
    return {
      name: (sp && sp.name) || null,
      lat: sp && sp.latitude != null ? sp.latitude : null,
      lon: sp && sp.longitude != null ? sp.longitude : null,
      arr: at, dep: dt,
    };
  }).filter(Boolean);
  return pts.length >= 2 ? pts : null;
}

/**
 * Project a measured position onto the stop sequence, as the same fractional
 * index the timetable path produces — so the renderer never has to know which
 * source a number came from.
 */
function _fracFromPosition(pts, pos) {
  const usable = pts.every(p => p.lat != null && p.lon != null);
  if (!usable) return null;
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = [pts[i].lat, pts[i].lon], b = [pts[i + 1].lat, pts[i + 1].lon];
    const proj = projectOnSegment(pos, a, b);
    const dist = haver(pos.lat, pos.lon, proj.lat, proj.lon);
    if (best && dist >= best.dist) continue;
    const span = haver(a[0], a[1], b[0], b[1]);
    // A zero-length segment (two stops sharing a quay coordinate) has no
    // meaningful ratio along it; treat the train as standing at its start.
    const along = span > 0 ? haver(a[0], a[1], proj.lat, proj.lon) / span : 0;
    best = { dist, frac: i + Math.max(0, Math.min(1, along)) };
  }
  return best ? best.frac : null;
}

/**
 * Where the train is on this leg, as a fraction of the stop sequence.
 *
 * Generalises _stopsAway in board.js from an integer to a fraction: an integer
 * is enough to write "3 stopp unna" but not to place a glyph that moves.
 *
 * A measured position wins while it is fresh — livePosition applies the same
 * 60-second staleness rule used everywhere else, so a feed that stopped falls
 * back to the timetable rather than drifting silently.
 *
 * @returns {{frac:number, idx:number, atStop:boolean, at:string|null,
 *            next:string|null, left:number, live:boolean}|null}
 */
export function _journeyProgress(calls, now, live) {
  const pts = _points(calls);
  if (!pts) return null;
  const last = pts.length - 1;

  let frac = null;
  let liveUsed = false;
  if (live && live.lat != null && live.lon != null) {
    const f = _fracFromPosition(pts, live);
    if (f != null) { frac = f; liveUsed = true; }
  }

  if (frac == null) {
    if (now <= pts[0].dep) frac = 0;
    else if (now >= pts[last].arr) frac = last;
    else {
      for (let i = 0; i < pts.length; i++) {
        if (now >= pts[i].arr && now <= pts[i].dep) { frac = i; break; }
        const next = pts[i + 1];
        if (next && now > pts[i].dep && now < next.arr) {
          const span = next.arr - pts[i].dep;
          frac = i + (span > 0 ? (now - pts[i].dep) / span : 0);
          break;
        }
      }
      if (frac == null) return null;
    }
  }

  // No clamp needed: projectOnSegment bounds the live path to a real segment,
  // and every timetable branch already yields 0..last.
  const idx = Math.round(frac);
  // Within a tenth of a stop reads as standing at it — below that the glyph
  // and the tick are the same pixel anyway.
  const atStop = Math.abs(frac - idx) < 0.1;
  // Standing at stop i leaves the stops after it; between i and i+1 leaves the
  // same set, since i+1 has not been reached either.
  const behind = atStop ? idx : Math.floor(frac);
  return {
    frac, idx, atStop,
    at: atStop ? pts[idx].name : null,
    next: behind >= last ? null : pts[behind + 1].name,
    left: Math.max(0, last - behind),
    live: liveUsed,
    total: last,
    from: pts[0].name,
    to: pts[last].name,
  };
}

/**
 * Draw it. Ticks are evenly spaced because this is a schematic — position is
 * by stop index, not by distance, exactly as on the board's strip.
 */
export function renderJourneyStrip(el, calls, now, livePos, journeyId) {
  if (!el) return null;
  const p = _journeyProgress(calls, now, livePosition(livePos, journeyId, now));
  if (!p) { el.style.display = 'none'; return null; }
  el.style.display = 'block';

  // Inset so the end glyphs are not half off the rail, matching the board.
  const INSET = 0.05;
  const pct = (f) => 100 * (INSET + (f / p.total) * (1 - 2 * INSET));

  let ticks = '';
  for (let i = 0; i <= p.total; i++) {
    const cls = 'js-tick' + (i < p.frac - 0.05 ? ' js-past' : '')
      + (i === 0 || i === p.total ? ' js-end' : '');
    ticks += '<span class="' + cls + '" style="left:' + pct(i).toFixed(2) + '%"></span>';
  }

  const body = p.left > 0 ? '<b>' + p.left + '</b>' : '<b>&#10003;</b>';
  const title = (p.at ? 'ved ' + p.at : p.next ? 'neste stopp ' + p.next : 'framme')
    + ' · ' + (p.live ? 'sanntid' : 'etter rutetid');

  el.innerHTML =
    '<div class="js-rail">'
    + '<span class="js-done" style="width:' + pct(p.frac).toFixed(2) + '%"></span>'
    + ticks
    + '<span class="js-train' + (p.live ? ' js-live' : '') + (p.atStop ? ' js-at' : '') + '"'
    + ' style="left:' + pct(p.frac).toFixed(2) + '%"'
    + ' title="' + esc(title) + '">' + body + '</span>'
    + '</div>'
    + '<div class="js-ends">'
    + '<span class="js-end-from">' + esc(p.from || '') + '</span>'
    + '<span class="js-end-to">' + esc(p.to || '') + '</span>'
    + '</div>';

  el.setAttribute('aria-label', _journeySummary(p));
  return p;
}

/** What the strip says, in words. Pure, so the Norwegian is tested. */
export function _journeySummary(p) {
  if (!p) return '';
  const where = p.at ? 'Ved ' + p.at : p.next ? 'Neste stopp ' + p.next : 'Framme';
  if (p.left <= 0) return where + '. Du er framme.';
  // Naming the destination twice in one breath — "Neste stopp Jernbanetorget.
  // 1 stopp igjen til Jernbanetorget." — is what the last stop produces if the
  // two halves are written independently.
  if (p.next && p.to && p.next === p.to) return where + '. Siste stopp.';
  return where + '. ' + p.left + ' stopp igjen til ' + (p.to || 'endestasjonen') + '.';
}
