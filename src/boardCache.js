import { storage } from './storage.js';

/**
 * Last known departure board, persisted so that opening the app in a tunnel
 * shows something rather than an empty list.
 *
 * This is deliberately *not* done in the service worker: the board comes from
 * a GraphQL POST, and a cached POST response replayed as if it were fresh is
 * indistinguishable from realtime. Going through state instead means the
 * restored board lands behind the existing "sist oppdatert HH:MM" stamp and
 * the stale-row dimming, which already exist and already tell the truth.
 */
const KEY = 't.lastBoard';

// Past this the countdowns are meaningless even with a stamp on them, and the
// snapshot is more clutter than help.
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

// Enough to fill the screen; keeps the serialised blob small enough that a
// trip-pattern board can't blow the localStorage quota.
const MAX_DEPS = 12;

/** Identity of the route a snapshot belongs to. */
function sig(dir) {
  if (!dir) return '';
  return [dir.from, dir.via || '', dir.to].join('|');
}

export function saveBoardSnapshot(dir, deps, ts) {
  if (!deps || !deps.length) return;
  try {
    storage.set(KEY, JSON.stringify({
      sig: sig(dir),
      ts: ts || Date.now(),
      deps: deps.slice(0, MAX_DEPS),
    }));
  } catch {
    // Quota, or a dep that won't serialise. A missing snapshot is harmless.
  }
}

/** @returns {{deps: any[], ts: number}|null} */
export function loadBoardSnapshot(dir) {
  let snap;
  try { snap = JSON.parse(storage.get(KEY)); } catch { return null; }
  if (!snap || !Array.isArray(snap.deps) || !snap.deps.length) return null;
  // A board for a different route would be worse than nothing.
  if (snap.sig !== sig(dir)) return null;
  if (!snap.ts || Date.now() - snap.ts > MAX_AGE_MS) return null;
  return { deps: snap.deps, ts: snap.ts };
}

export function clearBoardSnapshot() {
  storage.remove(KEY);
}
