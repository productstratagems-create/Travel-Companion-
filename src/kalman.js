/**
 * Hvor du er, når fiksene er dårlige — og hvor du trolig er når de slutter.
 *
 * `geo.js` jevnet posisjonen med et eksponentielt snitt:
 *
 *     const EMA_α = 0.3;
 *     lat = α * ny.lat + (1 - α) * forrige.lat;
 *
 * Den demper, og den gjør bare det. Tre ting følger av det:
 *
 *   1. EN FIKS PÅ ±5 M TELLER NØYAKTIG LIKE MYE SOM EN PÅ ±35. `accuracy`
 *      kommer med hver eneste fiks og ble aldri brukt til annet enn porten.
 *   2. `coords.speed` OG `coords.heading` KASTES VED DESTRUKTURERING
 *      (`geo.js:660`). Den siste gode fiksen før en tunnel bærer altså en
 *      hastighetsvektor appen har og ikke leser.
 *   3. SLUTTER FIKSENE, FRYSER PRIKKEN. `position.js` sier det høyt — det er
 *      hele grunnen til at modulen finnes — men ingen vet HVOR du er blitt av.
 *
 * Et konstant-hastighets Kalman-filter løser alle tre med én tilstand:
 * posisjon og hastighet, og en usikkerhet som VOKSER når ingenting kommer
 * inn. «Framskrevet, ±80 m» er en setning appen kan stå for; «prikken står
 * der den sto» er det ikke.
 *
 * ── TO 1-D FILTRE, IKKE ETT 4-D ────────────────────────────────────────
 *
 * Lærebokas versjon er fire tilstander og 4×4-matriser. Men både målestøyen
 * (en sirkulær `accuracy`) og prosesstøyen (akselerasjon uten retning) er
 * BLOKKDIAGONALE her: øst og nord kobles ikke. Da er det 4-D-filteret
 * nøyaktig to uavhengige 2-D-filtre, og «nøyaktig» er ikke en tilnærming —
 * det er hva matrisemultiplikasjonen reduserer til når kryssleddene er null.
 *
 * Så dette er ~femti linjer uten matrisebibliotek, framfor en tredje
 * runtime-avhengighet i et repo som har to. Velger noen senere å modellere
 * noe som KOBLER aksene — en kurs som dreier, en korridor å snappe mot — er
 * det 4×4 som trengs, og da er dette forutsetningen som brytes.
 *
 * ── METER, IKKE GRADER ─────────────────────────────────────────────────
 *
 * En grad lengde er 111 km ved ekvator og 55 i Oslo. Et filter som regner i
 * grader ville hatt dobbelt så stor prosesstøy i nord-sør som i øst-vest her,
 * uten at noen hadde bestemt det. Alt regnes derfor i meter fra et anker, og
 * konverteres på kanten.
 *
 * EN BLADMODUL, som `position.js` og `trail.js`. Den importerer én ting:
 * `STILL_MS`, fordi «står du stille» er ett faktum og ikke to.
 */
import { STILL_MS } from './trail.js';

/** Meter per grad bredde. Konstant nok: variasjonen er under en halv promille. */
const M_PER_DEG = 111320;

/**
 * Hvor rykkete bevegelsen får være, som akselerasjon i m/s².
 *
 * Dette er den ene knappen på filteret. Lav verdi gir en glatt strek som er
 * treg i svingene; høy verdi følger hver fiks og jevner lite.
 *
 * 1,5 m/s² er valgt for det appen faktisk brukes til: en som går, og en
 * T-bane som akselererer ut fra en plattform. IKKE målt mot ekte spor —
 * sandkassen har ingen — og det er dette tallet som mest sannsynlig må
 * flyttes når noen har gått med det. Samme forbehold `auto.js:1247` bærer om
 * `PICK_MARGIN_M`, av samme grunn.
 */
export const AKSELERASJON_MS2 = 1.5;

/**
 * Hvor lenge en framskriving er verdt å vise.
 *
 * Etter dette er usikkerheten så stor at tallet ikke sier noe en leser kan
 * handle på. Det er IKKE en påstand om når filteret slutter å regne — det
 * regner videre — men om når skjermen skal slutte å late som.
 */
export const FRAMSKRIV_MAKS_MS = 3 * 60_000;

/** Prosesstøyens spektraltetthet. Ett navn, avledet av akselerasjonen. */
const Q = AKSELERASJON_MS2 * AKSELERASJON_MS2;

/**
 * Korteste tidssteg filteret regner med, i sekunder.
 *
 * FUNNET AV PRØVESUITEN, IKKE AV RESONNEMENT — og `position.js:56` hadde
 * allerede skrevet ned hvorfor: «`watchPosition` can deliver fixes a
 * millisecond or two apart … at short intervals the clock is the least
 * trustworthy part of the reading.»
 *
 * Med `dt = 0` legges det ingen prosesstøy til. Kommer to hundre fikser i
 * samme millisekund, krymper kovariansen hver gang uten noen gang å vokse, og
 * filteret blir uendelig selvsikkert: det SLUTTER Å FØLGE MÅLINGENE. På
 * skjermen ser det ut som en prikk som henger fast — altså nøyaktig feilen
 * dette filteret ble skrevet for å fjerne, i ny form.
 *
 * Ett tidels sekund er under enhver ekte fiksfrekvens, og over null.
 */
const MIN_DT_S = 0.1;

/* ── ÉN AKSE ────────────────────────────────────────────────────────────
 *
 * Tilstand [p, v] og kovarians [[p00, p01], [p01, p11]]. Symmetrisk, så p10
 * lagres ikke — to tall som må være like er to tall som kan drive fra
 * hverandre.
 */

function _nyAkse(p, v, varP, varV) {
  return { p, v, p00: varP, p01: 0, p11: varV };
}

/** Framskriv `dt` sekunder. Uten måling er det DETTE som er svaret. */
function _predikerAkse(a, dt) {
  a.p += a.v * dt;
  // Rekkefølgen er bundet: p00 leser p01 og p11 slik de var FØR dette steget.
  const p01 = a.p01, p11 = a.p11;
  a.p00 += dt * (2 * p01 + dt * p11) + Q * dt * dt * dt / 3;
  a.p01 = p01 + dt * p11 + Q * dt * dt / 2;
  a.p11 = p11 + Q * dt;
}

/** Ta inn en måling med varians `r`. Jo større `r`, jo mindre flytter den. */
function _oppdaterAkse(a, z, r) {
  const S = a.p00 + r;
  if (!(S > 0)) return;
  const K0 = a.p00 / S, K1 = a.p01 / S;
  const y = z - a.p;
  a.p += K0 * y;
  a.v += K1 * y;
  const p01 = a.p01;
  a.p00 -= K0 * a.p00;
  a.p01 -= K0 * p01;
  a.p11 -= K1 * p01;
}

/* ── FILTERET ───────────────────────────────────────────────────────── */

/**
 * @param {{lat:number, lon:number, at:number, acc:number,
 *          speed?:number, heading?:number}} fiks
 * @returns {object} et filter, eller null om fiksen ikke er en posisjon
 */
export function nyttFilter(fiks) {
  if (!fiks || !Number.isFinite(fiks.lat) || !Number.isFinite(fiks.lon)) return null;
  const acc = Number.isFinite(fiks.acc) && fiks.acc > 0 ? fiks.acc : 50;
  const mPerDegLon = M_PER_DEG * Math.cos(fiks.lat * Math.PI / 180);

  /* HASTIGHETEN FRA FIKSEN, NÅR DEN FINNES.
   *
   * `coords.speed` og `coords.heading` ble kastet ved destrukturering. De er
   * målt av samme brikke som posisjonen, og den siste gode fiksen før en
   * tunnel er nøyaktig der de er verdt mest.
   *
   * `heading` er null når du står stille — spesifikasjonen sier det — så
   * terskelen er `STILL_MS`, det ene navnet appen alt har for «beveger seg
   * ikke». Uten fart starter hastigheten på null med stor usikkerhet, og
   * filteret finner den selv i løpet av et par fikser. */
  const fart = Number.isFinite(fiks.speed) && fiks.speed >= STILL_MS ? fiks.speed : null;
  const kurs = fart != null && Number.isFinite(fiks.heading) ? fiks.heading : null;
  const rad = kurs == null ? 0 : kurs * Math.PI / 180;
  const vØst = kurs == null ? 0 : fart * Math.sin(rad);
  const vNord = kurs == null ? 0 : fart * Math.cos(rad);
  // En oppgitt fart er omtrent like god som posisjonen den fulgte med; en
  // gjettet null er ikke, og får en usikkerhet som dekker gange og T-bane.
  const varV = kurs == null ? 25 : 4;

  return {
    anker: { lat: fiks.lat, lon: fiks.lon },
    mPerDegLon,
    at: fiks.at,
    ø: _nyAkse(0, vØst, acc * acc, varV),
    n: _nyAkse(0, vNord, acc * acc, varV),
  };
}

/**
 * Framskriv filteret til `nå`. Trygt å kalle uten at noe har kommet inn —
 * det er selve poenget.
 */
export function prediker(f, nå) {
  if (!f || !Number.isFinite(nå)) return f;
  const dt = (nå - f.at) / 1000;
  // Negativ dt er en klokke som har gått bakover, ikke en bevegelse.
  if (!(dt >= 0)) return f;
  // Men null er ikke «ingen tid gikk» — det er «klokka kan ikke måle det».
  const steg = Math.max(dt, MIN_DT_S);
  _predikerAkse(f.ø, steg);
  _predikerAkse(f.n, steg);
  f.at = nå;
  return f;
}

/**
 * Ta inn en fiks.
 *
 * EN DÅRLIG FIKS KASTES IKKE. `ACC_GATE` i `position.js` kaster alt over
 * ±40 m, og `trail.js` sier allerede hvorfor det er feil for en SERIE: «A fix
 * too noisy for the dot is still kept here, with its accuracy … a series that
 * inherited that rule would be blind exactly where it is needed.»
 *
 * Her gjelder det samme, og filteret gjør det riktige av seg selv: en fiks på
 * ±120 m får en varians på 14 400 og flytter estimatet nesten ikke når
 * filteret er sikkert — og mye når det ikke er det, som er akkurat da den er
 * den eneste opplysningen som finnes.
 */
export function oppdater(f, fiks) {
  if (!f || !fiks || !Number.isFinite(fiks.lat) || !Number.isFinite(fiks.lon)) return f;
  prediker(f, fiks.at);
  const acc = Number.isFinite(fiks.acc) && fiks.acc > 0 ? fiks.acc : 50;
  const r = acc * acc;
  _oppdaterAkse(f.ø, (fiks.lon - f.anker.lon) * f.mPerDegLon, r);
  _oppdaterAkse(f.n, (fiks.lat - f.anker.lat) * M_PER_DEG, r);
  f.at = fiks.at;
  return f;
}

/**
 * Hvor filteret tror du er, og hvor sikkert det er på det.
 *
 * `sigmaM` er standardavviket i meter — ett tall, radielt, fordi det er det
 * `accuracy` alt er og det skjermen alt kan si «±N m» om. Den VOKSER når
 * ingenting kommer inn, og det er hele forskjellen på en framskriving og en
 * frossen prikk.
 */
export function anslag(f) {
  if (!f) return null;
  return {
    lat: f.anker.lat + f.n.p / M_PER_DEG,
    lon: f.anker.lon + f.ø.p / f.mPerDegLon,
    // Kvadratsummen av de to aksenes varianser: usikkerheten er en sirkel,
    // ikke to tall en leser skal sammenstille selv.
    sigmaM: Math.sqrt(Math.max(0, f.ø.p00) + Math.max(0, f.n.p00)),
    fartMS: Math.hypot(f.ø.v, f.n.v),
    at: f.at,
  };
}
