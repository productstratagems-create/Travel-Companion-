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
  // When the accepted fix behind homeLL was taken. Without it the position
  // could go stale silently — ACC_GATE discards noisy fixes, so the dot simply
  // stopped moving and nothing could say why.
  posAt: null,
  // Has the watch been started at all? Without it «leter etter posisjonen»
  // and «posisjon ikke slått på» are the same state.
  posAsked: false,
  // The accuracy of the LAST fix, accepted or discarded, and when a fix was
  // last discarded by ACC_GATE. Together they are the only evidence that the
  // device is still working while the dot has stopped moving.
  posAcc: null,
  posRejAt: null,
  // THE LAST MINUTE OF WHERE YOU HAVE BEEN. In memory only, for as long as the
  // tab lives: never written to disk, never in the event log, never sent
  // anywhere. See src/trail.js for why that line is drawn where it is.
  posTrail: [],
  // When a fix was last held back for demanding a speed nobody travels at,
  // and how far it wanted to move you. Recorded so the screen can SAY it —
  // a silently withheld fix is exactly the fault 'unoyaktig' was added to fix.
  posJumpAt: null,
  posJumpM: null,
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
