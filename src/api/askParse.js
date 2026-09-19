/**
 * «jeg skal til Sandvika fredag halv ni» → tre utfylte felter.
 *
 * «Utforsk» (v1.123.0) asks three questions — fra, til, når — and a reader
 * who already knows the answer has to give it in four taps and two
 * suggestion lists. This reads the sentence they would have said anyway and
 * fills the form in.
 *
 * WHY THIS IS NOT A LANGUAGE MODEL, said plainly rather than left as an
 * apparent oversight: the app is a static bundle on GitHub Pages with no
 * backend of its own. config.js already records what that costs — «Vite
 * inlines the value, so it ships as a plaintext string in the bundle»,
 * checked against a real build. An API key for a model would leak the same
 * way, and a travel app's destinations are among the most revealing data a
 * phone holds. So the parsing is local, deterministic and offline.
 *
 * That is a narrower reader than a model would be. It is also one that
 * cannot invent a destination, cannot drift, costs nothing, and works in a
 * tunnel. Where it does not understand, it says so and leaves the field
 * alone — it never guesses at half a sentence.
 *
 * THE OUTPUT IS A PROPOSAL, NOT AN ACTION. Everything here lands in the form
 * for the reader to see and correct before any search runs. That is what
 * makes a wrong reading cost a glance instead of a missed bus.
 */

const DAYS = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

/** Hour words, so «halv ni» and «kvart på fem» are readable. */
const HOUR_WORDS = {
  ett: 1, en: 1, to: 2, tre: 3, fire: 4, fem: 5, seks: 6,
  sju: 7, syv: 7, åtte: 8, ni: 9, ti: 10, elleve: 11, tolv: 12,
};

/**
 * Parts of the day, as instants rather than vibes.
 *
 * These are the same values `quickTimes` uses for «i kveld» and «i morgen
 * tidlig» (api/tripTime.js) — deliberately, because two places disagreeing
 * about when the evening starts is this codebase's recurring bug in
 * miniature.
 */
const PARTS = {
  morgen: 7, tidlig: 7, formiddag: 10, lunsj: 11,
  ettermiddag: 15, kveld: 18, natt: 23,
};

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Same whitespace tidying, WITHOUT flattening the case. */
function tidy(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

/** Set hh:mm on a date `dayOffset` days from `now`, as a local instant. */
function on(now, dayOffset, hh, mm) {
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.getTime();
}

/**
 * Which DAY the sentence points at, as an offset in days, or null.
 *
 * «fredag» means the coming Friday, and on a Friday it means a week today
 * rather than this morning — «fredag» spoken on Friday afternoon is never
 * about the hour that has passed. «neste fredag» adds a week to that.
 */
function readDay(t, now) {
  if (/\bi overmorgen\b/.test(t)) return { off: 2, hit: 'i overmorgen' };
  if (/\bi morgen\b/.test(t)) return { off: 1, hit: 'i morgen' };
  if (/\bi dag\b/.test(t)) return { off: 0, hit: 'i dag' };
  const m = /\b(neste\s+)?(søndag|mandag|tirsdag|onsdag|torsdag|fredag|lørdag)\b/.exec(t);
  if (!m) return null;
  const want = DAYS.indexOf(m[2]);
  const today = new Date(now).getDay();
  let off = (want - today + 7) % 7;
  if (off === 0) off = 7;          // «fredag» on a Friday is next Friday
  if (m[1]) off += 7;
  return { off, hit: m[0] };
}

/**
 * Which TIME, as {hh, mm} or null — and what text to strip.
 *
 * Ordered most specific first. «08:30» before «8», «halv ni» before «ni»,
 * or the looser pattern eats the tighter one's digits and «kl 08:30»
 * becomes eight o'clock.
 */
function readTime(t) {
  let m;

  if ((m = /\bom (\d{1,3}) ?(min|minutt|minutter)\b/.exec(t))) {
    return { rel: Number(m[1]), hit: m[0] };
  }
  if ((m = /\bom (en |ett |1 )?(time|timer)\b/.exec(t))) {
    return { rel: 60, hit: m[0] };
  }
  if ((m = /\bom (\d{1,2}) (time|timer)\b/.exec(t))) {
    return { rel: Number(m[1]) * 60, hit: m[0] };
  }

  // 08:30, 8.30, kl 0830
  if ((m = /\b(?:kl\.?\s*)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(t))) {
    return { hh: Number(m[1]), mm: Number(m[2]), hit: m[0], exact: true };
  }

  const w = '(' + Object.keys(HOUR_WORDS).join('|') + '|\\d{1,2})';
  const val = s => (HOUR_WORDS[s] !== undefined ? HOUR_WORDS[s] : Number(s));
  // `\b` IS NOT USABLE AT THE START OF A NORWEGIAN WORD.
  //
  // JavaScript defines it on [A-Za-z0-9_], so «å» is not a word character
  // and the position before it is not a boundary: /\båtte\b/ never matches
  // «åtte». A third of the hour words begin with one of æøå, and a parser
  // for Norwegian built on \b is silently deaf to them. `EDGE` is the
  // boundary that includes them.
  const EDGE = '(?<![0-9a-zæøåA-ZÆØÅ])';
  const EDGE_END = '(?![0-9a-zæøåA-ZÆØÅ])';

  // «halv ni» is 08:30 — half TO nine, not half past.
  if ((m = new RegExp('\\bhalv ' + w + '\\b').exec(t))) {
    const h = val(m[1]);
    return { hh: (h + 11) % 12 + (h > 12 ? 12 : 0) || 12, mm: 30, hit: m[0], _halv: h };
  }
  if ((m = new RegExp('\\bkvart over ' + w + '\\b').exec(t))) {
    return { hh: val(m[1]), mm: 15, hit: m[0] };
  }
  if ((m = new RegExp('\\bkvart på ' + w + '\\b').exec(t))) {
    const h = val(m[1]);
    return { hh: (h + 11) % 12 + (h > 12 ? 12 : 0) || 12, mm: 45, hit: m[0] };
  }
  // «kl 8», «klokka 20»
  if ((m = new RegExp('\\b(?:kl\\.?|klokka|klokken)\\s*' + w + '\\b').exec(t))) {
    return { hh: val(m[1]), mm: 0, hit: m[0] };
  }
  // A bare part of the day, last: «i kveld», «i morgen tidlig».
  //
  // `(?:en)?` and not `en?` — the second requires the E, so «i kveld»
  // matched nothing while «i kvelde» would have. Caught by the smoke test
  // on the first sentence that used it.
  for (const [k, hh] of Object.entries(PARTS)) {
    const re = new RegExp('\\b(?:i |på |om )?' + k + '(?:en)?\\b');
    if ((m = re.exec(t))) {
      // «i kveld åtte» says both. The part of the day is the weaker claim,
      // so a bare hour beside it wins — but only to set the hour, never to
      // override an explicit 20:15.
      const bare = new RegExp(EDGE + w + EDGE_END).exec(t.replace(m[0], ' '));
      if (bare) {
        const h = val(bare[1]);
        // TWO strings to strip, so `hits` is a list. It was a single
        // 'a|b' string, which no replace could find — the hour stayed in
        // the sentence and became part of the place name («jobb åtte»).
        if (h >= 0 && h <= 23) return { hh: h, mm: 0, hits: [m[0], bare[0]], soft: true, part: k };
      }
      return { hh, mm: 0, hits: [m[0]], soft: true, part: k };
    }
  }
  return null;
}

/**
 * The two ends.
 *
 * «fra X til Y», «til Y», or a bare place. The time words are stripped
 * BEFORE this runs, or «Sandvika fredag» becomes a place name — which is
 * exactly the kind of quietly-wrong answer that costs a reader their bus.
 */
function readPlaces(t) {
  let m;
  if ((m = /\bfra (.+?) til (.+)$/.exec(t))) return { from: m[1], to: m[2] };
  if ((m = /\btil (.+?) fra (.+)$/.exec(t))) return { from: m[2], to: m[1] };
  if ((m = /\btil (.+)$/.exec(t))) return { from: null, to: m[1] };
  if ((m = /\bfra (.+)$/.exec(t))) return { from: m[1], to: null };
  return { from: null, to: null };
}

const FILLER = /\b(jeg|eg|skal|vil|må|reise|reiser|dra|drar|gå|går|komme|kommer|meg|til å|en tur|tur)\b/g;

function clean(s) {
  if (!s) return null;
  let out = tidy(String(s).replace(new RegExp(FILLER.source, 'gi'), ' ').replace(/[,.;!?]+$/, ''));
  // The time phrase leaves its preposition behind: «til Bergen på mandag»
  // minus «mandag» is «Bergen på», and a geocoder asked for «Bergen på»
  // is a geocoder asked for the wrong thing.
  out = tidy(out.replace(/\s+(på|den|kl\.?|om|i)$/i, '').replace(/^(på|den|kl\.?|om|i)\s+/i, ''));
  return out || null;
}

/**
 * Read a sentence into the three fields «Utforsk» asks for.
 *
 * @returns {{from:string|null, to:string|null, atMs:number|null,
 *            understood:string[], text:string}}
 *   `understood` names the parts that were actually read, so the screen can
 *   show what it did with the sentence rather than silently rearranging it.
 */
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function parseAsk(text, now) {
  const t0 = Number.isFinite(now) ? now : Date.now();
  let t = norm(text);
  // THE READER'S OWN CASING, kept alongside the lowercased string the
  // matching runs on. Matching needs one case; the form shows the other.
  // Without this the fields read «oslo s» back at someone who typed
  // «Oslo S» — and the note under the field is this feature's whole safety
  // mechanism, so it has to read like the sentence they wrote. Caught in a
  // screenshot, by nothing in 1620 tests.
  let raw = tidy(text);
  const cut = hit => { raw = raw.replace(new RegExp(esc(hit), 'i'), ' '); };
  const understood = [];
  if (!t) return { from: null, to: null, atMs: null, understood, text: '' };

  const day = readDay(t, t0);
  if (day) { understood.push('dag'); t = t.replace(day.hit, ' '); cut(day.hit); }

  const time = readTime(t);
  if (time) {
    understood.push('tid');
    for (const h of (time.hits || [time.hit])) { t = t.replace(h, ' '); cut(h); }
  }

  let atMs = null;
  if (time && time.rel != null) {
    atMs = t0 + time.rel * 60_000;
  } else if (time) {
    let hh = time.hh;
    // «åtte» said in the evening means twenty. Only ever moves a bare
    // 1–11 forward, never a written 20:15 back.
    if (hh >= 1 && hh <= 11 && /\bkveld|natt|ettermiddag\b/.test(norm(text))) hh += 12;
    atMs = on(t0, day ? day.off : 0, hh, time.mm);
    // No day named and the hour has gone. Try the afternoon of the SAME
    // day before rolling over: «kvart på fem» at ten in the morning means
    // 16:45 today, not 04:45 tomorrow. Only for a bare 1–11 — a written
    // 08:15 that has passed is tomorrow's 08:15, not tonight's.
    if (!day && !time.exact && atMs <= t0 && hh >= 1 && hh <= 11) {
      const pm = on(t0, 0, hh + 12, time.mm);
      if (pm > t0) atMs = pm;
    }
    if (!day && atMs <= t0) atMs = on(t0, 1, hh, time.mm);
  } else if (day) {
    // A day with no hour: the start of it, not this moment on that date.
    atMs = on(t0, day.off, 0, 0);
  }

  // Read the structure from the lowercased text, then take the same spans
  // out of the original so the casing survives.
  const places = readPlaces(t);
  const rawPlaces = readPlaces(raw);
  const pick = (lower, orig) => clean(orig && norm(orig).length === norm(lower || '').length ? orig : lower);
  const from = pick(places.from, rawPlaces.from);
  let to = pick(places.to, rawPlaces.to);
  // A bare «Sandvika» with no preposition is a destination, which is what
  // someone typing one word into a journey search means.
  if (!from && !to) {
    const bare = clean(norm(raw).length === norm(t).length ? raw : t);
    if (bare && bare.length > 1) to = bare;
  }
  if (from) understood.push('fra');
  if (to) understood.push('til');

  return { from, to, atMs, understood, text: norm(text) };
}
