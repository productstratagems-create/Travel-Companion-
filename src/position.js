/**
 * What the app knows about where you are — and when it knows nothing.
 *
 * A LEAF MODULE, like stopId.js: it imports nothing, so geo.js, the views and
 * the tests can all reach it without dragging the watch, the geocoder and the
 * logger along with them.
 *
 * FIVE FACTS WORE ONE SENTENCE. `noPosText` took a single argument,
 * `state.gpsError`, which is null, 'denied' or 'nostops' — so:
 *
 *   «ikke spurt»      the watch has not started. Nothing has been asked.
 *   «leter»           asked, and no fix has come back yet.
 *   «utilgjengelig»   the device tried and failed (PositionError code 2).
 *   «tidsavbrudd»     it ran out of time (code 3).
 *   «unøyaktig»       fixes ARE arriving and ACC_GATE is throwing them away.
 *
 * ...all rendered as the same «vi vet ikke hvor du er». Only «avslått» and
 * «ingen holdeplass» had words of their own. Codes 2 and 3 never even reached
 * state: the watch's error handler recorded code 1 and logged the rest.
 *
 * «UNØYAKTIG» IS THE ONE THAT COST SOMETHING. ACC_GATE discards any fix worse
 * than ±40 m once a fix exists — routine indoors, in a tunnel, in an urban
 * canyon — and geo.js says so in its own comment: «silently discards». The dot
 * stops moving, the walk time keeps being computed from where you were, and
 * the screen looks exactly as it does when everything is fine. Silence reads
 * as «alt er i orden»; that is the whole reason this module exists.
 *
 * Same shape as api/liveness.js, deliberately: one pure verdict function, the
 * thresholds beside it, and the renderers deriving their words from the kind
 * rather than each testing the inputs again.
 */

/**
 * Metres. Once a fix exists, a noisier one than this is not an improvement —
 * it would drag the smoothed position around by more than the error it fixes.
 *
 * Lived in geo.js, where only geo.js could see it. The rule that reads it now
 * needs it too, and geo.js re-exports it so no call site moves.
 */
export const ACC_GATE = 40;

/**
 * Metres per second. Faster than any Norwegian service, so a reading that
 * implies more than this is not a movement — it is a bad reading.
 *
 * Chosen against the traffic this app serves, not measured: an airliner or a
 * 250 km/h train would hit the ceiling, and the app would then SAY so rather
 * than fall silent, which is the right way round to be wrong.
 */
export const MAX_SPEED_MS = 70;

/**
 * Metres. Below this, no claim is made about speed at all.
 *
 * Found by the suite, not by reasoning: `watchPosition` can deliver fixes a
 * millisecond or two apart, and two metres in one millisecond is 2000 m/s. The
 * veto fired on jitter, threw the position away and forced a fresh lookup —
 * five where there should have been two.
 *
 * A teleport is what this rule is for. Two metres is not a teleport whatever
 * the clock says, and at short intervals the clock is the least trustworthy
 * part of the reading.
 */
export const JUMP_MIN_M = 250;

/**
 * Does this reading require a speed nobody travels at?
 *
 * The reported screen — «DU ER VED Jernbanetorget · 10221 m å gå · posisjonen
 * er unøyaktig (±148 m)» — happened because there was nothing to compare the
 * one reading against. With the previous fix in hand it is arithmetic.
 *
 * Says nothing when time does not move forward: the tab was backgrounded, or
 * the clock was set. An undefined speed is not evidence of a jump, and
 * treating it as one would reject every fix after a resume.
 */
export function fixJump(prev, next) {
  const no = { jumped: false, speed: null, metres: null };
  if (!prev || !next) return no;
  if (![prev.lat, prev.lon, prev.at, next.lat, next.lon, next.at].every(Number.isFinite)) return no;
  const dt = (next.at - prev.at) / 1000;
  if (!(dt > 0)) return no;
  const m = _metres(prev, next);
  const speed = m / dt;
  return { jumped: m >= JUMP_MIN_M && speed > MAX_SPEED_MS, speed, metres: m };
}

// Own copy, because this module imports nothing — the same reason geo.js's
// haver() cannot be reached from here.
function _metres(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Past this the fix behind the dot is old enough to say so. */
export const POS_STALE_MS = 60_000;

/**
 * Past this, «slightly old» has become «we lost you». The watch delivers about
 * once a second while it is working, so five minutes of nothing is not a gap.
 */
export const POS_DEAD_MS = 5 * 60_000;

/** In the order of how much a reader can do about them. */
export const POS_KINDS = ['ok', 'leter', 'ikke-spurt', 'unoyaktig', 'gammel',
  'borte', 'ingen-stopp', 'tidsavbrudd', 'utilgjengelig', 'ikke-stottet', 'avslatt'];

/**
 * How much to trust the dot right now.
 *
 * @param {{asked?: boolean, homeLL?: object|null, posAt?: number|null,
 *          gpsError?: string|null, rejAt?: number|null, acc?: number|null,
 *          now?: number}} o
 *   `rejAt` is when a fix last arrived AND WAS THROWN AWAY by ACC_GATE. It is
 *   the only evidence that the device is still working while the dot is not
 *   moving, and nothing recorded it before v1.108.0.
 * @returns {{kind: string, label: string, ageMins: number|null,
 *            acc: number|null, usable: boolean}}
 */
export function posState(o) {
  const c = o || {};
  const now = Number.isFinite(c.now) ? c.now : Date.now();
  const at = Number.isFinite(c.posAt) ? c.posAt : null;
  // A clock that jumped, or a timestamp from the future, is not freshness.
  const ageMs = at == null ? null : Math.max(0, now - at);
  const ageMins = ageMs == null ? null : Math.floor(ageMs / 60000);
  const acc = Number.isFinite(c.acc) ? Math.round(c.acc) : null;
  const mk = (kind, label, usable) => ({ kind, label, ageMins, acc, usable: !!usable });

  // A REFUSAL OUTRANKS EVERYTHING, including a position we still hold. It
  // names a cause the reader can act on, and the held position will only get
  // older from here.
  if (c.gpsError === 'denied') return mk('avslatt', 'stedstjenester er avslått', false);
  if (c.gpsError === 'unavailable') return mk('utilgjengelig', 'finner ikke posisjonen', false);
  if (c.gpsError === 'timeout') return mk('tidsavbrudd', 'posisjonen tok for lang tid', false);
  // The device has no geolocation at all. Telling this reader to «turn on
  // location services» points at a switch that is not there.
  if (c.gpsError === 'unsupported') {
    return mk('ikke-stottet', 'enheten kan ikke oppgi posisjon', false);
  }

  // Nothing to be old, nothing to be inaccurate.
  if (!c.homeLL) {
    return c.asked
      ? mk('leter', 'leter etter posisjonen …', false)
      // «IKKE SPURT» TURNED OUT TO BE TWO THINGS, and the probe is what
      // separated them. main.js calls locateUser unconditionally at load, so
      // the app always asks — this is only the instant before that line runs,
      // during which there is nothing a reader could do and nothing worth a
      // different sentence. The state worth its own words is the browser that
      // CANNOT be asked (insecure context, an embedded webview, an old
      // browser), and that one is 'ikke-stottet' below.
      : mk('ikke-spurt', 'leter etter posisjonen …', false);
  }

  // VI VET IKKE HVOR GAMMEL DEN ER — og det er ikke det samme som «fersk».
  //
  // Dette var hullet: uten tidsstempel falt alle alderssjekkene under bort,
  // og funksjonen endte på 'ok'. En posisjon gjenopprettet fra forrige økt
  // ble dermed kalt fersk, vant over ruteplanen på underveis-skjermen, og sa
  // noe annet enn stripen to centimeter over — som dømte den samme
  // posisjonen etter sin egen regel.
  //
  // FØR 'nostops', og det er ikke tilfeldig: «ingen holdeplass i nærheten»
  // er en påstand om omgivelsene, ikke om sensoren, og den kortsluttet til
  // usable: true uten å ha sett på alderen i det hele tatt. En posisjon av
  // ukjent alder kan heller ikke bære DEN påstanden.
  if (ageMs == null) {
    return mk('ukjent-alder', 'vet ikke hvor gammel posisjonen er', false);
  }

  // Position fine, nothing within the radius. Its own fact, and the one state
  // here that is not about the sensor at all.
  if (c.gpsError === 'nostops') return mk('ingen-stopp', 'ingen holdeplass i nærheten', true);

  // FIXES ARE ARRIVING AND BEING DISCARDED. Checked before staleness, because
  // it explains the staleness: «±120 m» tells the reader why the dot has
  // stopped, where «2 min gammel» only tells them that it has.
  const rejAt = Number.isFinite(c.rejAt) ? c.rejAt : null;
  if (rejAt != null && (at == null || rejAt > at) && now - rejAt < POS_STALE_MS) {
    return mk('unoyaktig',
      'posisjonen er unøyaktig' + (acc != null ? ' (±' + acc + ' m)' : ''), true);
  }

  if (ageMs != null && ageMs > POS_DEAD_MS) {
    return mk('borte', 'ingen posisjon på ' + ageMins + ' min', false);
  }
  if (ageMs != null && ageMs > POS_STALE_MS) {
    return mk('gammel', 'posisjon ' + ageMins + ' min gammel', true);
  }
  return mk('ok', '', true);
}

/**
 * The name the Geolocation API's numbers go by.
 *
 * PositionError is 1/2/3 and the watch recorded only the first, so two real
 * failures were logged and forgotten. Named here rather than in the handler so
 * the states and their causes are written down in one place.
 */
export function gpsErrorKind(code) {
  if (code === 1) return 'denied';
  if (code === 2) return 'unavailable';
  if (code === 3) return 'timeout';
  return null;
}
