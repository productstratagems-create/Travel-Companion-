/**
 * Sanntidsposisjoner som en STRØM, med polling som fallback.
 *
 * `fetchVehiclePositions` spør hvert tiende sekund. Mellom to spørringer vet
 * appen ingenting, så kjøretøyet på kartet står stille i ti sekunder og
 * hopper på det ellevte. Entur tilbyr de samme posisjonene som en
 * GraphQL-abonnement over WebSocket, og da kommer de når de skjer.
 *
 * TRE TING SOM IKKE KAN SJEKKES HERFRA, og de er grunnen til at fallbacken
 * ikke er en sikkerhetsmargin men den forventede stien:
 *
 *  1. EN NETTLESER KAN IKKE SETTE HTTP-HODER PÅ EN WEBSOCKET. Enturs doku-
 *     mentasjon sier at `ET-Client-Name` skal ligge på den første
 *     forespørselen. Fra en nettleser finnes det ikke noe sted å legge den
 *     — `WebSocket(url, protocols)` tar ingen hoder. Det eneste appen kan
 *     gjøre er å sende navnet i `connection_init`-nyttelasten og som
 *     spørringsparameter, og håpe at én av dem leses. Begge er gjetninger.
 *  2. OM ABONNEMENTSFELTET HETER `vehicles`. Spørringen gjør det; at
 *     abonnementet gjør det samme er en antakelse.
 *  3. OM TJENESTEN I DET HELE TATT SVARER HER. Sandkassen når ikke
 *     api.entur.io.
 *
 * Så dette er bygd for å MISLYKKES BILLIG: én socket per økt, en frist på
 * første melding, og ved minste problem faller den ned til polling for
 * resten av økta. Verste utfall er én mislykket socket.
 *
 * ÉN NAVNGITT TILSTAND, som `liveness.js` og `seksjon.js` — skjermen og
 * loggen avleder ordene sine av `kind`, de bærer dem ikke.
 */
import config from '../config.js';
import { ET_CLIENT_NAME } from './http.js';
import { logMsg } from '../ui/log.js';

/**
 *   av          ikke forsøkt ennå
 *   kobler      socket åpnet, venter på første melding
 *   på          meldinger kommer
 *   falt-ned    prøvd og mislyktes — polling gjelder resten av økta
 */
export const KINDS = ['av', 'kobler', 'på', 'falt-ned'];

/**
 * Hvor lenge «kobler» får vare.
 *
 * En socket som åpner og så tier er verre enn en som feiler: den ser
 * vellykket ut. Uten denne fristen ville appen sluttet å polle og så ikke
 * fått noe som helst — stillhet lest som «alt er i orden», som er nettopp
 * det regel 4 forbyr.
 *
 * Femten sekunder er halvannen pollesyklus: lenge nok til at en treg
 * oppkobling rekker det, kort nok til at en leser ikke merker fallbacken.
 */
export const FØRSTE_SVAR_MS = 15_000;

/** graphql-ws, de fire meldingstypene denne koden bruker. */
const INIT = 'connection_init';
const ACK = 'connection_ack';
const SUBSCRIBE = 'subscribe';
const NEXT = 'next';

export function strømURL(lineRef) {
  const u = config.api.vehiclesStream;
  if (!u) return null;
  // Navnet to steder, fordi ingen av dem er bekreftet. Se punkt 1 over.
  return u + (u.includes('?') ? '&' : '?')
    + 'clientName=' + encodeURIComponent(ET_CLIENT_NAME);
}

/** Samme felter som `vehiclesGQL`, som et abonnement. */
export function strømQuery(lineRef, rikt) {
  return 'subscription{vehicles(lineRef:"' + lineRef + '"){'
    + 'vehicleId lastUpdated bearing speed '
    + 'location{latitude longitude} '
    + 'line{lineRef} '
    + (rikt ? 'occupancyStatus delay ' : '')
    + 'serviceJourney{id}'
    + '}}';
}

let _kind = 'av';
let _sock = null;
let _frist = null;
let _lineRef = null;

/** Hva strømmen gjør akkurat nå. */
export function strømTilstand() { return _kind; }

/** For prøvene: glem alt, inkludert at den falt ned. */
export function _resetStrøm() {
  if (_sock) { try { _sock.close(); } catch (_) { /* allerede borte */ } }
  _sock = null; _kind = 'av'; _lineRef = null;
  if (_frist) { clearTimeout(_frist); _frist = null; }
}

/**
 * Faller ned til polling, for resten av økta.
 *
 * «For resten av økta» og ikke «for alltid»: en ny innlasting prøver igjen,
 * så den dagen Entur åpner for dette begynner det å virke uten at noen rører
 * koden. Samme form, og samme begrunnelse, som `_perLineRejected` og
 * `_shapeUnsupported`.
 */
function faltNed(hvorfor) {
  if (_kind === 'falt-ned') return;
  _kind = 'falt-ned';
  if (_frist) { clearTimeout(_frist); _frist = null; }
  if (_sock) { try { _sock.close(); } catch (_) { /* allerede borte */ } _sock = null; }
  logMsg('sanntidsstrøm: ' + hvorfor + ' — faller til polling', 'err');
}

/**
 * Åpne strømmen for én linje.
 *
 * @param {string} lineRef
 * @param {function(Array)} onVehicles kalles med den rå kjøretøylista
 * @param {object} [seam] for prøvene: { WS, nå }
 * @returns {boolean} om et forsøk ble gjort
 */
export function åpneStrøm(lineRef, onVehicles, seam) {
  /* `'WS' in seam` OG IKKE `seam.WS ||`.
   *
   * Med `||` falt `{ WS: null }` — som betyr «det finnes ingen WebSocket
   * her» — gjennom til den globale, og prøven for en nettleser uten
   * WebSocket testet jsdom sin egen i stedet. Et sømargument som ikke kan
   * uttrykke «ingenting» er ikke en søm. */
  const WS = seam && 'WS' in seam
    ? seam.WS
    : (typeof WebSocket !== 'undefined' ? WebSocket : null);
  if (!WS || !lineRef) return false;
  if (_kind === 'falt-ned') return false;
  if (_lineRef === lineRef && (_kind === 'kobler' || _kind === 'på')) return false;

  const url = strømURL(lineRef);
  if (!url) return false;

  // Linjeskifte: den gamle socketen har ingenting å si oss lenger, og to
  // åpne strømmer ville skrevet i hverandres luke.
  if (_sock) { try { _sock.close(); } catch (_) { /* allerede borte */ } }
  if (_frist) clearTimeout(_frist);

  _lineRef = lineRef;
  _kind = 'kobler';

  let sock;
  try {
    sock = new WS(url, 'graphql-transport-ws');
  } catch (_) {
    faltNed('kunne ikke åpne');
    return true;
  }
  _sock = sock;

  const id = 'v1';
  const send = (o) => { try { sock.send(JSON.stringify(o)); } catch (_) { faltNed('kunne ikke sende'); } };

  sock.onopen = () => send({ type: INIT, payload: { 'Et-Client-Name': ET_CLIENT_NAME } });

  sock.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch (_) { return; }
    if (!m || !m.type) return;
    if (m.type === ACK) {
      send({ type: SUBSCRIBE, id, payload: { query: strømQuery(lineRef, true) } });
      return;
    }
    if (m.type === NEXT) {
      const liste = m.payload && m.payload.data && m.payload.data.vehicles;
      if (!Array.isArray(liste)) return;
      if (_kind !== 'på') {
        _kind = 'på';
        if (_frist) { clearTimeout(_frist); _frist = null; }
        logMsg('sanntidsstrøm: på, for ' + lineRef, 'ok');
      }
      onVehicles(liste);
      return;
    }
    // `error` og `complete` betyr begge at dette abonnementet er over. Et
    // ukjent felt kommer hit, ikke som en socket-feil.
    if (m.type === 'error' || m.type === 'complete') faltNed('avslått av tjenesten');
  };

  sock.onerror = () => faltNed('feil på socketen');
  sock.onclose = () => { if (_kind !== 'falt-ned') faltNed('lukket'); };

  /* EN SOCKET SOM ÅPNER OG SÅ TIER ER VERRE ENN EN SOM FEILER. */
  _frist = setTimeout(() => {
    if (_kind !== 'på') faltNed('ingen melding på ' + (FØRSTE_SVAR_MS / 1000) + ' s');
  }, FØRSTE_SVAR_MS);

  return true;
}

/**
 * Skal polleren stå over denne runden?
 *
 * Bare når strømmen faktisk LEVERER. «kobler» teller ikke: da vet vi ennå
 * ingenting, og å slutte å polle på et håp er hvordan skjermen blir tom.
 */
export function strømLeverer(lineRef) {
  return _kind === 'på' && _lineRef === lineRef;
}
