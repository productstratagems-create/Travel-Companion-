import config from './config.js';
import { storage } from './storage.js';

function loadDirIndex() {
  return Math.min(parseInt(storage.get(config.storage.dir) || '0', 10), config.dirs.length - 1);
}

export const state = {
  view: 'board',
  dIdx: loadDirIndex(),
  deps: [],
  sel: null,
  jny: null,
  lastFetch: null,
  homeLL: null,
  nearestStation: null,
  nearestStations: [],
  statLL: {},
  walkOvr: null,
  walkFromLL: null,
  gpsError: null,
  debugOpen: false,
  serviceAlerts: [],
  // The serviceJourney ID the user is currently focused on or riding.
  // Set at tap(), confirmed at doBoard(), cleared at clearJny().
  // Consumers (selected screen, tracking, future features) can read this
  // without coupling to the departure or journey object shape.
  lockedJourneyId:   null,
  // Latest normalised metadata for that journey (JourneyMeta from fetchJourneyMeta).
  // Shape: { journeyId, calls[], cancelled, delayMins, quay, realtime, fetchedAt }
  lockedJourneyMeta: null,
};

export const intervals = {
  board: null,
  track: null,
  sel: null,
  spectate: null,
};

let _seq = 0;
export function nextSeq() { return ++_seq; }
export function currentSeq() { return _seq; }
