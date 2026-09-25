/**
 * One leg to the phone's own calendar — the one ladder, with one owner.
 *
 * This lived inside `views/plan.js` while the bell on the plan card was its
 * only caller. The moment the departure screen wanted the same sheet the
 * instant a leg is added, it became the shape this codebase keeps paying for:
 * two places building the same file, free to drift on the alarm, the file
 * name or the SEQUENCE. So it has one name before the second caller exists.
 *
 * A LADDER, like the rest of this app's outward edges: share sheet first
 * because that is the iOS path — a text/calendar File lands in Kalender from
 * there — then a download for desktop and Android, then a word rather than
 * nothing.
 *
 * TRANSIENT USER ACTIVATION is why this stays callable straight from a click
 * handler and does nothing asynchronous before `navigator.share`: the browser
 * only opens the sheet while the tap is still fresh. Put a fetch in front of
 * it and the sheet is refused — which is exactly why `addLegToPlan` writing
 * to localStorage (and nothing else) is what makes the add-time sheet legal.
 *
 * Nothing leaves the phone that the reader did not send: the file is built
 * here and handed to the operating system, which asks them where it goes.
 */
import { legIcs, leadMins, loadLeadPref, LEAD_AUTO } from './ics.js';
import { storage } from '../storage.js';
import { placeName, placeLL } from './place.js';
import { logEvent } from './eventLog.js';
import { logMsg } from '../ui/log.js';
import { loadWalkBuffer, walkMinsTo } from '../geo.js';
import { state } from '../state.js';
import config from '../config.js';

/**
 * SEQUENCE per leg, so a second export of the same leg MOVES the entry the
 * calendar already holds instead of leaving a stale alarm beside a new one.
 * The UID is the leg's own; this is the number that says «this is newer».
 */
export const CAL_SEQ_KEY = 't.calSeq';

export function calSeq(id) {
  let map = {};
  try { map = JSON.parse(storage.get(CAL_SEQ_KEY) || '{}') || {}; } catch { map = {}; }
  const next = (Number(map[id]) || 0) + 1;
  map[id] = next;
  try { storage.set(CAL_SEQ_KEY, JSON.stringify(map)); } catch { /* full */ }
  return next - 1;
}

/** The alarm offset for a leg, read from the one setting. */
export function legLead(leg) {
  const pref = loadLeadPref();
  // TIL ETAPPENS EGET STOPP.
  //
  // Dette målte før til `state.statLL[dirs[dIdx].key]` — stoppet for den
  // retningen du TILFELDIGVIS hadde valgt akkurat nå, ikke etappens. For en
  // plan med to etapper var det målbart feil på minst én av dem, og for en
  // plan du åpnet fra en annen rute var det feil på alle.
  //
  // Etappen bærer nå koordinatene sine, så det finnes et riktig svar. En
  // gammel lagret etappe har dem ikke; da faller det tilbake på den gamle
  // veien, og `leadMins` sier at gangtiden er gjettet.
  const egen = placeLL(leg && leg.from);
  const w = walkMinsTo(egen
    || (state.statLL && state.statLL[config.dirs[state.dIdx].key]));
  return leadMins(leg, {
    pref: pref === LEAD_AUTO ? null : pref,
    walkMins: w ? w.mins : null,
    buffer: loadWalkBuffer(),
    fallback: config.defaultWalkMinutes,
  });
}

/** The file for a leg, built without touching the network. */
export function legCalFile(leg) {
  const lead = legLead(leg);
  // Q3: var «gå nå» bygget av målt gangtid, en gjetning eller ditt eget valg?
  // Marginen er regnet ut her uansett; uten loggen forsvinner den inn i fila
  // og kan aldri sammenliknes med om du faktisk rakk avgangen.
  logEvent('gaa', { minutter: lead.mins, grunnlag: lead.source });
  const text = legIcs(leg, lead, calSeq(leg.id));
  const name = 'reise-' + leg.line + '-' + leg.depIso.slice(11, 16).replace(':', '') + '.ics';
  return new File([text], name, { type: 'text/calendar' });
}

/**
 * Er dette en telefon som selv kan ta imot en kalenderfil?
 *
 * ET STEDFORTREDENDE MÅL, og det sies rett ut: det finnes ingen ærlig måte å
 * spørre nettleseren «har du en Kalender-app». Støtte for å dele FILER via
 * operativsystemets ark er det nærmeste — sant på iOS og Android, falskt på
 * de fleste skrivebord — og det er derfor det brukes her, selv om stigen selv
 * ikke lenger deler. Den brukes BARE til å avgjøre om kalenderen skal tilbys
 * uoppfordret når en etappe legges til, så et skrivebord ikke får en fil i
 * Nedlastinger hver gang. Bjella tilbyr den uansett, for der har leseren spurt.
 */
export function canOfferCalendar() {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    const probe = new File(['BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'],
      'p.ics', { type: 'text/calendar' });
    return !!navigator.canShare({ files: [probe] });
  } catch { return false; }
}

/**
 * RETTET MOT TELEFONEN, etter et skjermbilde: delingsarket sto først, og det
 * arket er til for å sende en fil til en PERSON — det lister kontakter,
 * Meldinger, AirDrop. «Legg til i Kalender» er ikke der.
 *
 * Det som faktisk åpner Kalender er ANKERET: iOS svarer på en text/calendar-
 * ressurs med «… prøver å vise deg en kalenderinvitasjon. Vil du tillate
 * det?», og «Tillat» legger den inn. Leseren så nettopp det — men bare fordi
 * hen AVVISTE delingsarket, `navigator.share` avviste med AbortError, og
 * koden falt gjennom hit. Reserven gjorde jobben som skulle vært først.
 *
 * Så ankeret er trinn én. Delingsarket blir igjen som reserve for et sted
 * uten nedlasting, ikke som veien.
 *
 * @param {object} leg
 */
export async function shareLegCalendar(leg) {
  if (!leg) return false;
  const file = legCalFile(leg);

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch { /* fall through to the sheet */ }

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Linje ' + leg.line + ' → ' + placeName(leg.to) });
      return true;
    }
  } catch { /* the reader cancelled, or the sheet refused */ }

  logMsg('kunne ikke lage kalenderoppføring her', 'err');
  return false;
}
