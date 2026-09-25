import { storage } from '../storage.js';
import { loadConsent } from './consent.js';

/**
 * Hva appen husker om deg, i sju døgn, på din egen telefon.
 *
 * `api/smart.js` has recorded trips since v1.30-something, but it AGGREGATES
 * AS IT WRITES: the key is `destination|2-hour bucket|weekday`, and then a
 * counter goes up. Four trips last week and four trips since May are not
 * distinguishable afterwards. «Last week» was never stored, so no rule can
 * ever be written about it.
 *
 * This is the missing half: individual events with a timestamp, from which
 * aggregates can be derived — rather than instead of them.
 *
 * NOTHING LEAVES THE PHONE. No server, no model, no key. That is not a
 * limitation worked around; it is the app's published promise, and this
 * module is written so the promise stays true by construction.
 *
 * ── The invariant this module exists to enforce ──────────────────────
 *
 * EVERY FIELD STORED IS A FIELD SHOWN. `FIELD_LABELS` is the one list: it
 * drives the human-readable rendering, and `tests/eventLog.test.js` reads the
 * keys back out of the stored JSON and requires every one of them to appear
 * in it. Add a field and forget to show it, and the test falls.
 *
 * That is the difference between «we are open about it» as a sentence and as
 * a guarantee — and with coordinates in the log, a sentence is not enough.
 */

const EVENTS_KEY = 't.events';

/** How long the app remembers. Promised in the consent text and on the privacy page. */
export const MEMORY_DAYS = 7;
/** A second ceiling, against an unusual week. Oldest go first. */
export const EVENT_MAX = 300;

const DAY = 86400000;

/**
 * Every field that may be stored, and what it is called to a person.
 *
 * One named list. The screen reads it, and the test reads the stored data
 * against it. A field absent from here cannot be shown, and a field that
 * cannot be shown must not be stored.
 */
export const FIELD_LABELS = {
  kind: 'hva',
  at: 'når',
  fra: 'fra',
  til: 'til',
  linje: 'linje',
  meter: 'meter gått',
  sekunder: 'sekunder brukt',
  valgt: 'søkte etter',
  pos: 'posisjon',
  lat: 'breddegrad',
  lon: 'lengdegrad',
  noyaktighet: 'nøyaktighet',

  // REISELOGGEN. Fire utgivelser ble sendt uten at én ekte tur hadde prøvd
  // dem, og forbeholdene deres kan bare avgjøres underveis. Disse feltene er
  // ikke ny innsamling for innsamlingens skyld — hvert av dem svarer på ett
  // navngitt spørsmål vi ellers ikke kan svare på herfra.
  svarte: 'svarte',
  hvorfor: 'fordi',
  stopp: 'stopp',
  handling: 'gjorde',
  minutter: 'minutter før avgang',
  grunnlag: 'regnet ut fra',
};

/**
 * Det som er verdt å huske, og ikke noe annet.
 *
 * TYPENAVNET VISES RÅTT. `settings.js` skriver `e.kind` uendret i
 * `.mem-kind`, så navnet her er det leseren ser — derfor lesbare norske ord
 * og ikke forkortelser.
 *
 * De tre siste er reiseloggen, og hver svarer på ett åpent spørsmål:
 *
 *   kilde  vinner posisjonen over klokka, og peker den på riktig stopp?
 *   kart   åpner du kartet likevel, etter at v1.156 lukket det i hvile?
 *   gaa    var «gå nå» bygget av målt gangtid, en gjetning, eller ditt valg?
 *
 * `svarte` og `grunnlag` bruker APPENS EGNE ORD — `SRC_LABEL`-nøklene og
 * `leadMins().source` — så loggen ikke blir et tredje ordsett for begreper
 * skjermen alt har navn på.
 */
export const KINDS = {
  reise: ['fra', 'til', 'linje'],
  gange: ['meter', 'sekunder'],
  sok: ['valgt'],
  kilde: ['svarte', 'hvorfor', 'stopp'],
  kart: ['handling'],
  gaa: ['minutter', 'grunnlag'],
};

function _load() {
  try {
    const v = storage.get(EVENTS_KEY);
    const list = v ? JSON.parse(v) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function _save(list) {
  try { storage.set(EVENTS_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/**
 * Drop what is older than the window, and anything above the ceiling.
 *
 * ENFORCED ON WRITE, not as a filter on read. A filter would leave the old
 * data sitting in storage while the screen claimed seven days — and what is
 * stored, not what is displayed, is what someone with the phone can read.
 */
export function prune(list, now) {
  const t = Number.isFinite(now) ? now : Date.now();
  const cut = t - MEMORY_DAYS * DAY;
  const kept = (list || []).filter(e => e && Number.isFinite(e.at) && e.at >= cut);
  kept.sort((a, b) => a.at - b.at);
  return kept.length > EVENT_MAX ? kept.slice(kept.length - EVENT_MAX) : kept;
}

/**
 * Keep only the fields this kind declares, plus a position when one is given.
 *
 * A whitelist, not a copy: a caller handing over a whole `dir` object must
 * not be able to smuggle a stop id, a URL or anything else into the log by
 * accident. What is stored is what `KINDS` and `FIELD_LABELS` name.
 */
function _shape(kind, data, pos) {
  const out = { kind, at: Date.now() };
  for (const f of (KINDS[kind] || [])) {
    const v = data ? data[f] : undefined;
    if (v !== undefined && v !== null && v !== '') out[f] = v;
  }
  // `noyaktighet` always travels with the point. A fix at ±3000 m is a
  // different fact from one at ±8 m, and v1.108.0 exists because a screen
  // asserted something it did not know.
  if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lon)) {
    out.pos = { lat: pos.lat, lon: pos.lon, noyaktighet: Number.isFinite(pos.acc) ? Math.round(pos.acc) : null };
  }
  return out;
}

/**
 * Record one event — or, without consent, do nothing at all.
 *
 * THE GUARD LIVES HERE, not at the call sites. A new caller added in a year
 * cannot forget it, and there is exactly one place to read to know whether
 * the app can write.
 *
 * @param {'reise'|'gange'|'sok'} kind
 * @param {object} data   fields named by KINDS[kind]
 * @param {{lat:number, lon:number, acc:number}|null} pos
 */
/**
 * Skal dette skrives ned nå?
 *
 * ET EGET NAVN, fordi regelen bærer to ting på én gang og begge kan brytes
 * stille: at noe bare logges når det har ENDRET SEG, og at det ikke logges
 * oftere enn `minMs`. Den bodde først inne i en indre funksjon i
 * `views/track.js`, der ingen test kunne kalle den — og tre mutanter
 * overlevde nettopp derfor.
 *
 * `whereAmI` regnes ut hver tegning, altså 1 Hz. En tunnel kan få kilden til
 * å flakke, og uten dempingen ville én tjue minutters tur skrevet over tusen
 * hendelser mot et tak på 300. Turen hadde da slettet sitt eget bevis.
 *
 * @param {{key: string|null, at: number}} forrige
 * @param {string} nokkel
 * @param {number} naa
 * @param {number} minMs
 */
export function skalLogges(forrige, nokkel, naa, minMs) {
  const f = forrige || {};
  if (nokkel === f.key) return false;
  if (Number.isFinite(f.at) && naa - f.at < minMs) return false;
  return true;
}

export function logEvent(kind, data, pos) {
  if (!loadConsent()) return false;
  if (!KINDS[kind]) return false;
  const list = prune(_load(), Date.now());
  list.push(_shape(kind, data, pos));
  _save(prune(list, Date.now()));
  return true;
}

/** What is in the log, newest first. Pruned here too, so a stale read cannot over-report. */
export function recentEvents(now) {
  const t = Number.isFinite(now) ? now : Date.now();
  return prune(_load(), t).slice().reverse();
}

export function clearEvents() {
  try { storage.remove(EVENTS_KEY); } catch { /* ignore */ }
}

const _p = n => String(n).padStart(2, '0');

/**
 * One event, as a line a person can read and judge.
 *
 * Built from `FIELD_LABELS`, so it cannot silently fall behind what is
 * stored — that is the invariant, and the test binds them.
 */
export function describeEvent(e) {
  if (!e || !e.kind) return null;
  const d = new Date(e.at);
  const when = _p(d.getDate()) + '.' + _p(d.getMonth() + 1) + ' ' + _p(d.getHours()) + ':' + _p(d.getMinutes());
  const parts = [];
  for (const f of (KINDS[e.kind] || [])) {
    if (e[f] !== undefined) parts.push(FIELD_LABELS[f] + ' ' + e[f]);
  }
  if (e.pos) {
    const acc = e.pos.noyaktighet;
    parts.push(FIELD_LABELS.pos + ' ' + e.pos.lat.toFixed(5) + ', ' + e.pos.lon.toFixed(5)
      + (acc == null ? ' (ukjent nøyaktighet)' : ' (±' + acc + ' m)'));
  }
  return { when, kind: e.kind, text: parts.join(' · '), pos: e.pos || null };
}
