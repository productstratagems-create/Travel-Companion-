/**
 * Sitter du på noe? — dommen auto-reise manglet.
 *
 * «Du er ved» rangeres av `rankStops`: ved stoppet, mot/fra stoppet, vane,
 * avstand. Det er bygget for en som GÅR. For en som sitter på et kjøretøy
 * bytter «nærmeste stopp» hvert halve minutt, og appen hadde ingen måte å si
 * «du er på 3 mot Kolsås» — selv om den kan bli med på en reise.
 *
 * KILDEN LÅ I HVERT TAVLESVAR. `serviceJourney.estimatedCalls` gir hvert
 * stopp på turen med koordinater og forventet tid, og `forventetPos.js`
 * regner ut hvor en avgang SKAL være nå. Følger én avgangs forventede
 * posisjon sporet ditt over tid, sitter du sannsynligvis på den.
 *
 * TID, IKKE BARE GEOMETRI. To linjer i samme gate skilles av rutetidene; en
 * bil i bussfart fire minutter bak bussen skilles av klokka.
 *
 * Et TILBUD, aldri en handling. Samme regel som `autoJumpDest`: å bli flyttet
 * feil koster mer enn trykket det sparer.
 *
 * EN BLADMODUL. Den importerer bare `haversine.js`. Forventede posisjoner
 * samples av kallestedet og sendes inn, så dommen kan prøves uten DOM,
 * nettverk eller `state`.
 *
 * Tallene under er valgt av resonnement og IKKE målt på en ekte tur. Samme
 * forbehold som `AKSELERASJON_MS2` og `PICK_MARGIN_M`. Reiseloggen
 * (`ombord`-hendelser) er bygget for å måle dem.
 */
import { metresBetween } from '../haversine.js';

export const OMBORD_KINDS = ['ombord', 'ombord-tvil', 'vet-ikke'];

/**
 * Under dette går du. 5 m/s er 18 km/t — godt over rask gange (2 m/s) og
 * jogging (3 m/s), og under en buss i bytrafikk mellom stopp. En buss som
 * står ved et stopp er under terskelen; da tier dommen til den kjører igjen,
 * og det er riktig: stillestående sier ingenting om hva du står i.
 */
export const OMBORD_MIN_FART_MS = 5;

/** Minst så mange brukbare fikser … */
export const OMBORD_MIN_FIKSER = 3;
/** … over minst så lang tid. Tre fikser i samme sekund er ett punkt. */
export const OMBORD_MIN_SPENN_MS = 20_000;

/**
 * Hvor langt fra forventet posisjon en fiks kan være og fortsatt telle.
 *
 * Romslig med vilje. Forventet posisjon er interpolert mellom stopp; på en
 * kurve uten linjeform skjærer den hjørnet. Og en buss forsinket et halvt
 * minutt i forhold til `expectedDepartureTime` er 150 m unna i 5 m/s.
 *
 * Også grensen for hvilke fikser som er BEVIS: en fiks med `acc` større enn
 * dette kan ikke skille en kandidat fra en annen, og teller verken for eller
 * imot.
 */
export const OMBORD_MAKS_AVVIK_M = 150;

/**
 * Er du i fart — raskere enn noen som går?
 *
 * ÉN TERSKEL FOR TO SKJERMDELER. Tilbudet «ser ut som du er på» og
 * overskriften «du er ved» under det spør samme spørsmål. Med hvert sitt
 * tall kunne de svart hvert sitt — «du går mot den» rett under «ser ut som
 * du er på 31», som var nøyaktig det v1.198.0 viste.
 */
export function iFart(fartMS) {
  return Number.isFinite(fartMS) && fartMS >= OMBORD_MIN_FART_MS;
}

const _ok = f => f && Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.at);

/** Er fiksen presis nok til å være bevis? Ukjent `acc` regnes som ja. */
const _brukbar = f => _ok(f) && !(Number.isFinite(f.acc) && f.acc > OMBORD_MAKS_AVVIK_M);

/**
 * Følger kandidatens forventede posisjon disse fiksene?
 * Fiksens egen `acc` trekkes fra: en fiks på ±40 m 160 m unna kan være 120.
 */
function _følger(k, fikser) {
  const ved = new Map(((k && k.forventet) || []).filter(Boolean).map(p => [p.at, p]));
  return fikser.every(f => {
    const p = ved.get(f.at);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
    const acc = Number.isFinite(f.acc) ? f.acc : 0;
    return metresBetween(f, p) - acc <= OMBORD_MAKS_AVVIK_M;
  });
}

/**
 * @param {{spor:Array<{lat,lon,at,acc}>, fartMS:number|null,
 *          kandidater:Array<{nøkkel,linje,front,call,forventet:Array<{at,lat,lon}>}>}} o
 * @returns {{kind:string, grunn:string|null, kandidater:Array}}
 */
export function ombord(o) {
  const c = o || {};
  const vetIkke = grunn => ({ kind: 'vet-ikke', grunn, kandidater: [] });

  // «Ingen fart» og «går» er to setninger (AGENTS.md regel 4). Den første
  // betyr at filteret ikke har noe å si; den andre at det har svart.
  if (!Number.isFinite(c.fartMS)) return vetIkke('ingen-fart');
  if (!iFart(c.fartMS)) return vetIkke('går');

  const fikser = (Array.isArray(c.spor) ? c.spor : []).filter(_brukbar);
  if (fikser.length < OMBORD_MIN_FIKSER
    || fikser[fikser.length - 1].at - fikser[0].at < OMBORD_MIN_SPENN_MS) {
    return vetIkke('kort-spor');
  }

  const treff = (Array.isArray(c.kandidater) ? c.kandidater : [])
    .filter(k => k && k.nøkkel && _følger(k, fikser));
  if (!treff.length) return vetIkke('ingen-følger');
  // To eller flere som følger deg like godt: to linjer på samme trasé til
  // samme tid. Appen velger ikke for deg.
  return { kind: treff.length === 1 ? 'ombord' : 'ombord-tvil', grunn: null, kandidater: treff };
}

/* ── REISEN DU BLIR MED PÅ ──────────────────────────────────────────── */

const _tid = c => (c && (c.expectedDepartureTime || c.aimedDepartureTime
  || c.expectedArrivalTime || c.aimedArrivalTime)) || null;

/**
 * Formen `joinJourney(meta, toIdx)` tar, bygget av et kall fra tavla.
 *
 * STARTER VED STOPPET DU SIST PASSERTE. `joinJourney` setter reisen fra
 * `calls[0]`; bygget av hele turen ville du «gått på» ved endeholdeplassen
 * for en halvtime siden, og «fra Nydalen · avg 06:50» ville stått på en
 * skjerm du åpnet 07:00 på Sinsen.
 *
 * @returns {object|null}
 */
export function reiseMeta(call, nå) {
  const sj = call && call.serviceJourney;
  const alle = (sj && Array.isArray(sj.estimatedCalls)) ? sj.estimatedCalls : [];
  if (!alle.length) return null;
  const t = Number.isFinite(nå) ? nå : Date.now();
  const ms = c => { const v = _tid(c); const n = v ? new Date(v).getTime() : NaN; return n; };
  let fra = 0;
  alle.forEach((c, i) => { if (ms(c) <= t) fra = i; });
  const calls = alle.slice(fra).map(c => {
    const q = c.quay || {};
    const sp = q.stopPlace || {};
    return {
      name: sp.name || '',
      lat: Number.isFinite(q.latitude) ? q.latitude : (Number.isFinite(sp.latitude) ? sp.latitude : null),
      lon: Number.isFinite(q.longitude) ? q.longitude : (Number.isFinite(sp.longitude) ? sp.longitude : null),
      quay: q.publicCode || null,
      aimed: c.aimedDepartureTime || c.aimedArrivalTime || null,
      expected: c.expectedDepartureTime || c.expectedArrivalTime || null,
    };
  });
  const line = sj.line || {};
  const farge = line.presentation && line.presentation.colour;
  return {
    journeyId: sj.id || null,
    lineCode: line.publicCode || '?',
    lineBg: farge ? '#' + farge : '#7c2d12',
    mode: line.transportMode || 'bus',
    dest: (call.destinationDisplay && call.destinationDisplay.frontText) || '',
    calls,
  };
}
