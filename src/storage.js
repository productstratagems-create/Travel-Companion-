// All user-specific localStorage keys — used for migration and profile deletion.
const ALL_KEYS = [
  't.dest', 't.dep', 't.via', 't.walkSpeed', 't.walkBuf', 't.walkFrom',
  't.weekendMode', 't.theme', 't.dir', 't.jny', 't.favs', 't.plan',
  't.modes', 't.recentDests', 't.lastBoard', 't.route', 't.return', 't.returnSkip', 't.alertHid',
  // Both decide which screen the app opens on — t.autoMode directly, and
  // t.smartHist because the landing ladder falls through to auto-reise
  // exactly when there is no history. A key that picks the first screen has
  // to travel with the profile and be deleted with it.
  't.autoMode', 't.smartHist',
  // The interchange register: learned per device, and worth keeping with the
  // profile so a switch does not inherit another reader's answers.
  't.hubs',
  // Which order the auto-reise list is drawn in. A display choice, but one
  // the reader made, so it travels with the profile like the rest.
  't.autoSort',
  // Whether the nearby-stops list on auto-reise is open. A display choice the
  // reader made, so it travels with the profile like the rest.
  't.autoStops',
  // Found missing all at once by a test that enumerates them, after t.destPeek
  // was noticed by hand. Every one is personal, and t.homeLL is the one that
  // matters: the privacy page promises the app does not track you, so a
  // remembered position has to die with the profile that made it.
  't.destPeek', 't.freqArr', 't.freqDep', 't.homeLL', 't.palette', 't.walkDist',
];

const PROFILES_KEY = '__profiles';
const ACTIVE_KEY   = '__activeProfile';

// One-time migration: copy any pre-profile t.* keys into the 'default' namespace.
(function migrate() {
  if (localStorage.getItem(ACTIVE_KEY)) return;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(['default']));
  localStorage.setItem(ACTIVE_KEY, 'default');
  ALL_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) {
      localStorage.setItem('default::' + k, v);
      localStorage.removeItem(k);
    }
  });
})();

export function listProfiles() {
  try { return JSON.parse(localStorage.getItem(PROFILES_KEY)) || ['default']; }
  catch { return ['default']; }
}

export function getActiveProfile() {
  return localStorage.getItem(ACTIVE_KEY) || 'default';
}

export function createProfile(name) {
  const profiles = listProfiles();
  if (!profiles.includes(name)) {
    profiles.push(name);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
  }
}

export function switchProfile(name) {
  localStorage.setItem(ACTIVE_KEY, name);
  window.location.reload();
}

export function deleteProfile(name) {
  if (name === 'default') return;
  ALL_KEYS.forEach(k => localStorage.removeItem(name + '::' + k));
  const remaining = listProfiles().filter(p => p !== name);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(remaining.length ? remaining : ['default']));
  if (getActiveProfile() === name) switchProfile('default');
}

function _key(k) {
  return getActiveProfile() + '::' + k;
}

export const storage = {
  get:    (k)    => { try { return localStorage.getItem(_key(k));         } catch { return null; } },
  set:    (k, v) => { try { localStorage.setItem(_key(k), v);             } catch {} },
  remove: (k)    => { try { localStorage.removeItem(_key(k));             } catch {} },
};
