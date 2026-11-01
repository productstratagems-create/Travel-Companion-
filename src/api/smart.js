import { storage } from '../storage.js';
import { MEMORY_DAYS } from './eventLog.js';

const HIST_KEY = 't.smartHist';
const HIST_MAX = 300;

function _load() {
  try { const v = storage.get(HIST_KEY); return v ? JSON.parse(v) : []; } catch { return []; }
}

// Record a route with time context. Called when user applies a route.
export function recordSmartTrip(fromName, toName, toStopId, toLat, toLon, fromStopId) {
  if (!fromName || !toName) return;
  const now = new Date();
  const bucket = Math.floor(now.getHours() / 2); // 2-hour slots, 0-11
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const hist = _load();
  const key = toName.toLowerCase() + '|' + bucket + '|' + (isWeekend ? 'we' : 'wd');
  const idx = hist.findIndex(e => e.key === key);
  if (idx !== -1) {
    hist[idx].count++;
    hist[idx].lastUsed = Date.now();
    if (toStopId) hist[idx].toStopId = toStopId;
    if (toLat != null) { hist[idx].toLat = toLat; hist[idx].toLon = toLon; }
    if (fromStopId) hist[idx].fromStopId = fromStopId;
    if (fromName) hist[idx].fromName = fromName;
  } else {
    hist.push({ key, fromName, toName, toStopId: toStopId || null, toLat: toLat || null, toLon: toLon || null, fromStopId: fromStopId || null, bucket, isWeekend, count: 1, lastUsed: Date.now() });
  }
  hist.sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed);
  storage.set(HIST_KEY, JSON.stringify(hist.slice(0, HIST_MAX)));
}

/**
 * How many recorded trips match this from→to pair.
 *
 * The history is keyed by destination and time-of-day bucket, so one route
 * spreads across several entries — summing them is what turns it back into a
 * usage count for the route itself.
 */
export function tripCount(fromName, toName) {
  if (!toName) return 0;
  const to = String(toName).toLowerCase();
  const from = fromName ? String(fromName).toLowerCase() : null;
  return _load().reduce((n, e) => {
    if (String(e.toName || '').toLowerCase() !== to) return n;
    if (from && String(e.fromName || '').toLowerCase() !== from) return n;
    return n + (e.count || 0);
  }, 0);
}

export function smartHistLen() {
  return _load().length;
}

/**
 * Glem alle vaner.
 *
 * KNAPPEN SIER «SLETT ALT APPEN HUSKER», og `t.smartHist` sto igjen — med
 * destinasjonsnavn, avreisesteder OG koordinater (`toLat`/`toLon`), uten
 * noe vindu. Tredje gang den feilen er funnet i den knappen: først
 * `recentDests`, så `t.freqArr`/`t.freqDep` (v1.187.0), nå denne.
 *
 * Her, og ikke i `settings.js`, så nøkkelen har én eier — samme grunn som
 * `glemAlleSteder` i `usage.js` finnes.
 */
export function glemVaner() {
  try { storage.remove(HIST_KEY); } catch { /* ignore */ }
}

/** The raw history, for callers that do their own scoring over it. */
export function loadSmartHist() {
  return _load();
}

/**
 * Best prediction for a time of day — now by default.
 *
 * `at` exists so something other than the present can ask: the trip home is
 * set in the morning and wants to know what you usually do at four, which a
 * hardcoded `new Date()` could never answer. Omitted, the behaviour is exactly
 * what it has always been.
 *
 * Falls back to freqArr (no time dimension) if smart history is empty.
 */
export function destRanking(at) {
  const now = at == null ? new Date() : new Date(at);
  const bucket = Math.floor(now.getHours() / 2);
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;
  const best = new Map();
  /* TREFFTALLET, SOM BLE REGNET UT OG KASTET.
   *
   * `count` ligger på hver post og gikk inn i `score`, der det ble blandet
   * med bøtteavstand og ukedag til ett tall ingen kan lese baklengs. Da kan
   * ingen si om en gjetning har førti turer eller én bak seg — og skjermen
   * merket raden likt uansett (`auto.js`, `class="auto-usual"`). Summert her,
   * ved siden av scoren, ikke i stedet for den.
   *
   * SUMMERT OVER BØTTENE SOM SLAPP GJENNOM FILTERET, ikke over hele
   * historikken: spørsmålet `vanestyrke` stiller er «pleier du å reise hit
   * NÅ», og en tur til samme sted klokka 23 er ikke dekning for klokka 08. */
  const turer = new Map();
  _load().forEach(e => {
    const diff = Math.abs(e.bucket - bucket);
    if (diff > 2) return;
    const score = e.count * (diff === 0 ? 3 : diff === 1 ? 2 : 1) * (e.isWeekend === isWeekend ? 2 : 0.5);
    // ONE ENTRY PER DESTINATION. The history is keyed by destination AND
    // time bucket, so the same place appears several times over — and two
    // rows for Jernbanetorget would look like a contest between it and
    // itself, which is how a dead heat turns into a landslide.
    const k = String(e.toName || '').toLowerCase();
    if (!k) return;
    turer.set(k, (turer.get(k) || 0) + (e.count || 0));
    const prev = best.get(k);
    if (!prev || score > prev.score) {
      best.set(k, { fromName: e.fromName || null, toName: e.toName, toStopId: e.toStopId,
        fromStopId: e.fromStopId || null, score,
        // Vinnerpostens egne to fakta, båret ut i stedet for å forsvinne
        // inn i scoren: traff vi RETT tidsbøtte, og rett slags ukedag.
        diff, ukedag: e.isWeekend === isWeekend });
    }
  });
  // Trefftallet legges på til slutt: det er destinasjonens, ikke vinnerpostens.
  return [...best.values()]
    .map(v => ({ ...v, count: turer.get(String(v.toName || '').toLowerCase()) || 0 }))
    .sort((a, b) => b.score - a.score);
}

/**
 * How far ahead the favourite must be before the app acts on it by itself.
 *
 * Twice the runner-up. Below that the two are close enough that jumping is as
 * likely to be wrong as right, and being sent to the wrong place costs more
 * than the tap it saved.
 */
export const JUMP_RATIO = 2;

/**
 * Where to go without being asked — or null, which is the usual answer.
 *
 * Deliberately stricter than `predictDest`, because this one MOVES you.
 * Real history only: the freqArr fallback has score 0 and no sense of time,
 * so acting on it would mean jumping on the strength of a single past trip.
 */
export function autoJumpDest(at, fersk) {
  const ranked = destRanking(at);
  const top = ranked[0];
  if (!top || !(top.score > 0)) return null;
  const rival = ranked[1];
  if (rival && top.score < JUMP_RATIO * rival.score) return null;
  /* OG EN VANE DU HAR SLUTTET MED FLYTTER DEG IKKE.
   *
   * `vanestyrke` demoterer «sterk» til «før» når loggen viser at du ikke har
   * reist dit denne uka. Gjorde ikke denne det samme, ville skjermen sagt
   * «før (40)» om en destinasjon appen nettopp hadde flyttet deg til — to
   * steder som dømmer samme faktum, og uenige. Det er feilformen denne
   * kodebasen har rettet rundt tjuefem ganger.
   *
   * `ukjent` flytter deg fortsatt: uten logg er dette nøyaktig regelen fra
   * før, og en funksjon som krevde et bevis ingen samler inn ville slått av
   * hoppet for alle som ikke har slått på loggen. */
  if (fersk === 'gammel') return null;
  return { toName: top.toName, toStopId: top.toStopId || null, score: top.score };
}

export function predictDest(at) {
  const hist = _load();
  if (hist.length) {
    const best = destRanking(at)[0];
    if (best) return { ...best, source: 'smart' };
  }
  // Fallback: most-visited arrival regardless of time
  try {
    const arr = JSON.parse(storage.get('t.freqArr') || '[]');
    if (arr.length) return { toName: arr[0].name, toStopId: arr[0].stopId || null, fromStopId: null, score: 0, source: 'freq' };
  } catch { /* ignore */ }
  return null;
}

/* ── HVOR MYE GJETNINGEN ER VERDT ───────────────────────────────────────
 *
 * `destRanking` har alltid regnet ut hvor sterk en vane er. Skjermen gjorde
 * hele den regningen om til ÉN ting: `class="auto-usual"` på raden, som i
 * `settings.css:609` er en rammefarge. Ikke et tall, ikke et ord, og ikke i
 * `aria-label` — en forskjell halve lesergruppa ikke har.
 *
 * Følgen var at «du pleier å reise hit» så nøyaktig like sikkert ut enten
 * det lå førti reiser eller én bak, og enten tidsbøtta var den rette eller
 * to timer unna. AGENTS.md regel 2, ordrett: «Er verdien regnet ut, skal
 * den stå på skjermen.»
 *
 * SAMME FORM SOM `seksjon`, `belegg`, `liveness`, `posState` og
 * `alightEyebrow` — mønsteret `alight.js:138` skriver ned: én ren dom,
 * skjermen avleder ordene sine av `kind`. Derfor bor den her og ikke som en
 * `if` inne i visningen: da kan den prøves uten en DOM.
 */

/** Domsvokabularet. Nummer tretten i denne kodebasen. */
export const VANE_KINDS = ['sterk', 'gammel', 'svak', 'gjetning', 'ingen'];

/* ── FERSKHET ───────────────────────────────────────────────────────────
 *
 * `t.smartHist` teller opp og kaster klokka: fire turer forrige uke og fire
 * turer siden mai er samme rad. En vane på førti turer du sluttet med i vår
 * er ikke en vane — og v1.191.0 kalte den «vanlig nå».
 *
 * Reiseloggen har tidspunktene. Den har alltid hatt dem; de ble bare lest av
 * én skjerm ingen ser på. Dette er de sju døgnene satt i arbeid, ikke et
 * lengre vindu: `MEMORY_DAYS` er importert og ikke kopiert, så loggen og
 * dommen om ferskhet ikke kan bli uenige.
 *
 * TRE SVAR, IKKE TO. «Loggen er av» og «loggen er på og tom» er ikke samme
 * setning (AGENTS.md regel 4). Uten logg VET vi ikke om vanen er fersk, og
 * fravær av bevis vi aldri samlet inn skal ikke telle mot leseren.
 */
export const FERSK_KINDS = ['fersk', 'gammel', 'ukjent'];

/**
 * @param {number|null} sist `sistReist()` — når du sist faktisk reiste dit
 * @param {number} [nå]
 * @param {boolean} [loggPå] om reiseloggen er slått på i det hele tatt
 * @returns {'fersk'|'gammel'|'ukjent'}
 */
export function ferskhet(sist, nå, loggPå) {
  if (!loggPå) return 'ukjent';
  const t = Number.isFinite(nå) ? nå : Date.now();
  if (!Number.isFinite(sist)) return 'gammel';
  // Innenfor loggens eget vindu. Utenfor det kan ingen tur VÆRE, så et
  // større tall her ville bare vært en annen måte å skrive «fersk» på.
  return (t - sist) <= MEMORY_DAYS * 86400000 ? 'fersk' : 'gammel';
}

/**
 * Minste antall turer før en vane er en vane.
 *
 * IKKE MÅLT MOT EKTE BRUK — sandkassen har ingen. Fire er valgt fordi tre er
 * tallet der et sammentreff slutter å være sannsynlig og en vane begynner å
 * være forklaringen, og fordi feilen den beskytter mot er den dyre: å si «du
 * pleier å reise hit nå» etter én tur er nettopp den selvsikre løgnen
 * `docs/produktretning.md` sier appen ikke skal fortelle. Å si «svak» om en
 * ekte vane koster leseren ingenting.
 *
 * Samme forbehold som `kalman.js:AKSELERASJON_MS2` og `auto.js:PICK_MARGIN_M`
 * bærer, av samme grunn: dette er tallet som mest sannsynlig må flyttes når
 * noen har gått med det.
 */
export const VANE_MIN_TURER = 4;

/** Ordene. Ett sted, så to skjermer ikke finner opp hvert sitt. */
const VANE_ORD = {
  sterk:    'du pleier å reise hit nå',
  gammel:   'du pleide å reise hit, men ikke denne uka',
  svak:     'du har reist hit rundt denne tiden',
  gjetning: 'mest besøkt — uten tid på døgnet',
  ingen:    '',
};

/**
 * De korte ordene, for merket inne i radens badge-stripe.
 *
 * To former for ett faktum er kodebasens signaturfeil, så de bor ved siden
 * av de lange og avledes av samme `kind`. Setningen er for `aria-label` og
 * langtrykk; merket er for en rad som ikke har plass til den.
 */
export const VANE_MARK = {
  sterk:    'vanlig nå',
  gammel:   'før',
  svak:     'av og til',
  gjetning: '',
  ingen:    '',
};

/**
 * Hvor mye `predictDest`/`destRanking` sin gjetning er verdt.
 *
 * @param {Array} ranked `destRanking()`-lista, i dens egen rekkefølge
 * @param {string|null} [source] `predictDest().source` — `'freq'` betyr at
 *   gjetningen kom fra `t.freqArr`, som ikke har noen tidsdimensjon i det
 *   hele tatt
 * @param {'fersk'|'gammel'|'ukjent'} [fersk] fra `ferskhet()`. Utelatt betyr
 *   `ukjent`, altså nøyaktig oppførselen fra v1.191.0.
 * @returns {{kind:string, label:string, antall:number, fersk:string}}
 */
export function vanestyrke(ranked, source, fersk) {
  const f = FERSK_KINDS.includes(fersk) ? fersk : 'ukjent';
  const ord = k => ({ kind: k, label: VANE_ORD[k], antall: 0, fersk: f });

  /* FALLBACKEN ER IKKE EN SVAK VANE — DEN ER EN ANNEN SETNING.
   *
   * `predictDest` faller til `t.freqArr` når historikken er tom. Den lista
   * er «mest besøkte sted», uten klokke og uten ukedag, og `autoJumpDest`
   * nekter alt å handle på den («acting on it would mean jumping on the
   * strength of a single past trip»). Å kalle den «svak vane» ville vært å
   * påstå noe om tidspunktet som ingen har målt. */
  if (source === 'freq') return ord('gjetning');

  const top = (ranked || [])[0];
  if (!top || !(top.score > 0)) return ord('ingen');

  const rival = (ranked || [])[1];
  /* ÉN TERSKEL FOR «SIKKER NOK», IKKE TO.
   *
   * `autoJumpDest` har alt et navngitt uttrykk for det: dobbelt så god som
   * nummer to. Et andre tall her ville vært to steder som skriver ned samme
   * faktum — kodebasens signaturfeil, funnet rundt tjuefem ganger, og den
   * ville drevet fra hverandre i den verste retningen: skjermen sa «sterk»
   * om noe appen ikke ville flyttet deg på. */
  const sikker = !rival || top.score >= JUMP_RATIO * rival.score;
  const nok = (top.count || 0) >= VANE_MIN_TURER;
  // Rett tidsbøtte OG rett slags ukedag. En tur på en lørdag er ikke dekning
  // for tirsdag, og `destRanking` vekter det alt — her leses det, framfor å
  // gjettes tilbake ut av scoren.
  const treff = top.diff === 0 && top.ukedag === true;

  /* OG «STERK» BETYR DET SAMME SOM AT APPEN VILLE FLYTTET DEG.
   *
   * Funnet av nettleserprøven, ikke av resonnementet: med en sterk vane
   * kjører `_maybeJump` først og lista tegnes aldri. Det er ikke en kollisjon
   * — det er den ene terskelen som gjør nettopp det den skal. Merket er
   * derfor til for radene leseren kommer TILBAKE til: pinnet stopp, hopp
   * allerede brukt, eller en destinasjon ingen linje herfra går til. */
  /* OG «STERK» KREVER FERSK.
   *
   * En vane er ikke noe du HADDE. Førti turer i rett bøtte på rett ukedag, og
   * ingen av dem denne uka, er en jobb du har sluttet i — og det er nettopp
   * da appen skal slutte å si «vanlig nå». Den sier «før» i stedet, som er
   * en annen setning og ikke en svakere utgave av den samme.
   *
   * `ukjent` demoterer IKKE. Er loggen av, har vi ikke spurt, og å straffe
   * leseren for et svar vi aldri ba om ville vært å lese stillhet som et
   * nei. Da gjelder v1.191.0-regelen uendret. */
  const sterkNok = sikker && nok && treff;
  const kind = !sterkNok ? 'svak' : (f === 'gammel' ? 'gammel' : 'sterk');
  return { kind, label: VANE_ORD[kind], antall: top.count || 0, fersk: f };
}
