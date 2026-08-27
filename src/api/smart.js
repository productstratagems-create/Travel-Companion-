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

// Return best prediction for current time, or null if no history.
// Falls back to freqArr (no time dimension) if smart history is empty.
export function predictDest() {
  const hist = _load();
  if (hist.length) {
    const now = new Date();
    const bucket = Math.floor(now.getHours() / 2);
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    let best = null, bestScore = 0;
    hist.forEach(e => {
      const diff = Math.abs(e.bucket - bucket);
      if (diff > 2) return;
      const score = e.count * (diff === 0 ? 3 : diff === 1 ? 2 : 1) * (e.isWeekend === isWeekend ? 2 : 0.5);
      if (score > bestScore) { bestScore = score; best = { fromName: e.fromName || null, toName: e.toName, toStopId: e.toStopId, fromStopId: e.fromStopId || null, score }; }
    });
    if (best) return { ...best, source: 'smart' };
  }
  // Fallback: most-visited arrival regardless of time
  try {
    const arr = JSON.parse(storage.get('t.freqArr') || '[]');
    if (arr.length) return { toName: arr[0].name, toStopId: arr[0].stopId || null, fromStopId: null, score: 0, source: 'freq' };
  } catch { /* ignore */ }
  return null;
}
