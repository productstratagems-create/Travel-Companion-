import { storage } from '../storage.js';

const HIST_KEY = 't.smartHist';
const HIST_MAX = 300;

function _load() {
  try { const v = storage.get(HIST_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}

// Record a route with time context. Called when user applies a route.
export function recordSmartTrip(fromName, toName, toStopId, toLat, toLon, fromStopId) {
  if (!fromName || !toName) return;
  const now = new Date();
  const bucket = Math.floor(now.getHours() / 2); // 2-hour slots, 0-11
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const hist = _load();
  const key = toName.toLowerCase() + '|' + bucket + '|' + (isWeekend ? 'we' : 'wd');
  const idx = hist.findIndex(e => e.key === key);
  if (idx !== -1) {
    hist[idx].count++;
    hist[idx].lastUsed = Date.now();
    if (toStopId) hist[idx].toStopId = toStopId;
    if (toLat != null) { hist[idx].toLat = toLat; hist[idx].toLon = toLon; }
    if (fromStopId) hist[idx].fromStopId = fromStopId;
    if (fromName) hist[idx].fromName = fromName;
  } else {
    hist.push({ key, fromName, toName, toStopId: toStopId || null, toLat: toLat || null, toLon: toLon || null, fromStopId: fromStopId || null, bucket, isWeekend, count: 1, lastUsed: Date.now() });
  }
  hist.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  storage.set(HIST_KEY, JSON.stringify(hist.slice(0, HIST_MAX)));
}

/**
 * How many recorded trips match this from→to pair.
 *
 * The history is keyed by destination and time-of-day bucket, so one route
 * spreads across several entries — summing them is what turns it back into a
 * usage count for the route itself.
 */
export function tripCount(fromName, toName) {
  if (!toName) return 0;
  const to = String(toName).toLowerCase();
  const from = fromName ? String(fromName).toLowerCase() : null;
  return _load().reduce((n, e) => {
    if (String(e.toName || '').toLowerCase() !== to) return n;
    if (from && String(e.fromName || '').toLowerCase() !== from) return n;
    return n + (e.count || 0);
  }, 0);
}

export function smartHistLen() {
  return _load().length;
}

/** The raw history, for callers that do their own scoring over it. */
export function loadSmartHist() {
  return _load();
}

/**
 * Best prediction for a time of day — now by default.
 *
 * `at` exists so something other than the present can ask: the trip home is
 * set in the morning and wants to know what you usually do at four, which a
 * hardcoded `new Date()` could never answer. Omitted, the behaviour is exactly
 * what it has always been.
 *
 * Falls back to freqArr (no time dimension) if smart history is empty.
 */
export function destRanking(at) {
  const now = at == null ? new Date() : new Date(at);
  const bucket = Math.floor(now.getHours() / 2);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const best = new Map();
  _load().forEach(e => {
    const diff = Math.abs(e.bucket - bucket);
    if (diff > 2) return;
    const score = e.count * (diff === 0 ? 3 : diff === 1 ? 2 : 1) * (e.isWeekend === isWeekend ? 2 : 0.5);
    // ONE ENTRY PER DESTINATION. The history is keyed by destination AND
    // time bucket, so the same place appears several times over — and two
    // rows for Jernbanetorget would look like a contest between it and
    // itself, which is how a dead heat turns into a landslide.
    const k = String(e.toName || '').toLowerCase();
    if (!k) return;
    const prev = best.get(k);
    if (!prev || score > prev.score) {
      best.set(k, { fromName: e.fromName || null, toName: e.toName, toStopId: e.toStopId,
        fromStopId: e.fromStopId || null, score });
    }
  });
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/**
 * How far ahead the favourite must be before the app acts on it by itself.
 *
 * Twice the runner-up. Below that the two are close enough that jumping is as
 * likely to be wrong as right, and being sent to the wrong place costs more
 * than the tap it saved.
 */
export const JUMP_RATIO = 2;

/**
 * Where to go without being asked — or null, which is the usual answer.
 *
 * Deliberately stricter than `predictDest`, because this one MOVES you.
 * Real history only: the freqArr fallback has score 0 and no sense of time,
 * so acting on it would mean jumping on the strength of a single past trip.
 */
export function autoJumpDest(at) {
  const ranked = destRanking(at);
  const top = ranked[0];
  if (!top || !(top.score > 0)) return null;
  const rival = ranked[1];
  if (rival && top.score < JUMP_RATIO * rival.score) return null;
  return { toName: top.toName, toStopId: top.toStopId || null, score: top.score };
}

export function predictDest(at) {
  const hist = _load();
  if (hist.length) {
    const best = destRanking(at)[0];
    if (best) return { ...best, source: 'smart' };
  }
  // Fallback: most-visited arrival regardless of time
  try {
    const arr = JSON.parse(storage.get('t.freqArr') || '[]');
    if (arr.length) return { toName: arr[0].name, toStopId: arr[0].stopId || null, fromStopId: null, score: 0, source: 'freq' };
  } catch { /* ignore */ }
  return null;
}
