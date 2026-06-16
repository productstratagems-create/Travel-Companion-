// All user-specific localStorage keys — used for migration and profile deletion.
const ALL_KEYS = [
  't.dest', 't.dep', 't.via', 't.walkSpeed', 't.walkBuf', 't.walkFrom',
  't.weekendMode', 't.theme', 't.dir', 't.jny', 't.favs', 't.plan',
  't.modes', 't.recentDests',
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
