/**
 * An upcoming leg as a calendar entry, with the alarm on «gå nå».
 *
 * Asked: «Hvordan kan upcoming reiser i reiseplanen varsles til brukeren?»
 *
 * ── Why the calendar ────────────────────────────────────────────────────
 *
 * Real web push needs someone to SEND it, with a VAPID private key. config.js
 * says in plain words why a key cannot live in this build, and privacy.html
 * promises «ingen server». That holds on iOS 16.4+ too, where push works —
 * but only for a home-screen PWA, and still with a sender.
 *
 * And anything resting on the tab being alive dies: iOS freezes a backgrounded
 * tab within seconds. `TimestampTrigger`, built for exactly this, is Chrome
 * only and abandoned; Periodic Background Sync is Android only and the browser
 * picks the cadence.
 *
 * A calendar entry is the one thing that fires with the app closed and no
 * server anywhere: the phone's own OS does it. We make a file; the reader
 * decides where it goes. Nothing leaves the phone that they did not send.
 *
 * ── And the alarm says «go», not «it leaves» ────────────────────────────
 *
 * A notice at the departure time is useless — by then you are late. The app
 * already holds this idea in `minsToLeave` and WALK_FOCUS_MINS. Here it is
 * the departure minus the walk minus the buffer.
 *
 * ── The format is unforgiving ───────────────────────────────────────────
 *
 * Break the escaping, the CRLF endings or the 75-octet folding and iOS
 * rejects the whole file in silence — no error, just no entry. Hence the two
 * exported helpers below, tested on their own.
 */
import { LEG_FALLBACK_MINS } from './plan.js';

/** Part of the UID, so a re-export REPLACES rather than adds. */
export const ICS_DOMAIN = 'travel-companion.local';

/**
 * RFC 5545 §3.3.11: backslash first, or the others escape their own escapes.
 *
 * Every replacement here is a TWO-character string — `'\\;'` is backslash
 * plus semicolon. Written with one backslash it is just a semicolon, JS drops
 * unknown escapes silently, and the file goes out unescaped. That happened
 * once already, on the way in through a shell heredoc, and the test caught it.
 */
export function icsEscape(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold at 75 OCTETS, not characters, and never mid-character.
 *
 * «Jernbanetorget» is fourteen characters and fourteen octets; «Brynseng, Ø»
 * is not. A fold counted in characters overruns the limit on any Norwegian
 * stop name, and a fold that splits a two-byte æøå produces a replacement
 * character the calendar cannot read.
 */
export function icsFold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  // TextEncoder, ALLTID — ikke Buffer.
  //
  // Node har `Buffer` og nettleseren har den ikke, og `Buffer.byteLength ? …`
  // er ikke en trygg sjekk: et bart navn som ikke finnes KASTER, det blir
  // ikke undefined. Alle testene passerte derfor i vitest mens hele
  // funksjonen kastet «Buffer is not defined» på telefonen. Nettleserprøven
  // fant det; ingen enhetstest i dette repoet kunne.
  const enc = new TextEncoder();
  for (const ch of String(line)) {
    const n = enc.encode(ch).length;
    // A continuation line carries a leading space, which counts too.
    const cap = out.length ? 74 : 75;
    if (bytes + n > cap) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ' ' + l : l)).join('\r\n');
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]|\.\d{3}/g, '');

/**
 * How long before the departure the alarm should fire, and where that number
 * came from.
 *
 * `addLegToPlan` stores no coordinates for the origin stop, so `walkMinsTo`
 * has nothing to measure against and the walk cannot always be known. Then
 * the default is used — AND THE ENTRY SAYS SO. Pretending to know is worse
 * than admitting the guess.
 */
export function leadMins(leg, o) {
  const c = o || {};
  const buffer = Number.isFinite(c.buffer) ? c.buffer : 2;
  const known = Number.isFinite(c.walkMins) && c.walkMins != null;
  const walk = known ? c.walkMins
    : (Number.isFinite(c.fallback) ? c.fallback : 8);
  return {
    mins: Math.max(1, Math.round(walk + buffer)),
    source: known ? 'gange' : 'standard',
  };
}

/**
 * One leg as one VEVENT.
 *
 * `seq` is the SEQUENCE: a calendar ignores an update that does not claim to
 * be newer than what it holds. Raise it and the same UID moves the alarm
 * instead of leaving a stale one behind.
 */
export function legIcs(leg, lead, seq) {
  const dep = new Date(leg.depIso).getTime();
  const arr = leg.arrIso ? new Date(leg.arrIso).getTime()
    : dep + LEG_FALLBACK_MINS * 60000;
  const mins = (lead && lead.mins) || 1;
  const why = (lead && lead.source) === 'gange'
    ? mins + ' min før avgang: gangtid og margin'
    : mins + ' min før avgang: standard gangtid, ikke målt for dette stoppet';
  const desc = 'Alarmen sier GÅ NÅ, ikke at avgangen går nå — den er satt '
    + why + '.\n'
    + 'Avgang ' + new Date(dep).toISOString().slice(11, 16) + ' UTC fra ' + leg.from + '.\n'
    + 'En forsinkelse når ikke kalenderen. Sjekk appen før du går.';

  const rows = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//' + ICS_DOMAIN + '//reiseplan//NO',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + leg.id + '@' + ICS_DOMAIN,
    'SEQUENCE:' + (Number.isFinite(seq) ? seq : 0),
    'DTSTAMP:' + stamp(Date.now()),
    'DTSTART:' + stamp(dep),
    'DTEND:' + stamp(arr),
    'SUMMARY:' + icsEscape('Linje ' + leg.line + ' → ' + leg.to),
    'LOCATION:' + icsEscape(leg.from),
    'DESCRIPTION:' + icsEscape(desc),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'TRIGGER:-PT' + mins + 'M',
    'DESCRIPTION:' + icsEscape('Gå nå — linje ' + leg.line + ' fra ' + leg.from),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return rows.map(icsFold).join('\r\n') + '\r\n';
}
