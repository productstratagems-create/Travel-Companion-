/**
 * BRUKERKONTEKST (#809 steg 2, v1.218.330) — det appen VET om brukeren akkurat nå, i én struktur.
 *
 * DATAGRUNNLAG, IKKE FUNKSJONALITET: modulen samler signaler som finnes fra før og har INGEN konsument.
 * Ingen rangering, anbefaling eller visning leser den ennå. Den er ren (ingen state.js, geo.js, DOM, nett) og
 * kortlivet: den lagres aldri, og en utløpt eller ubrukelig posisjon gir en TOM kontekst (alt `unknown`).
 *
 * REGLER
 *  - `unknown` er ikke «nei». I særdeleshet er ombord-svaret `vet-ikke` → `transit.state: 'unknown'`, ALDRI «ikke ombord»
 *    (det avgjøres først når appen kan si det, steg 4).
 *  - Posisjonskvalitetene holdes adskilt: `position.kind` er `posState().kind` uendret (avslatt, utilgjengelig, tidsavbrudd,
 *    leter, ikke-spurt, unoyaktig, gammel …) — de slås ikke sammen til én generell status. `available` følger `posState().usable`
 *    (også `unoyaktig` er brukbar i posState: posisjonen holdes mens nye fikser forkastes) og utløpet under.
 *  - `movement.state` er ALLTID 'unknown' i steg 2: bare den OBSERVERTE farten bæres med. Bevegelsesinferens kommer i steg 3.
 *  - `stopRelation` er 'unknown' til steg 5.
 *
 * UTLØP: `KONTEKST_UTLØP_MS` = 60 s er en FORELØPIG, UMÅLT grense (samme tall som POS_STALE_MS, posisjonsporten) — ikke en
 * empirisk validert verdi. Den er en navngitt konstant slik at den kan justeres når ekte turer er målt (#395).
 */
import { POS_STALE_MS } from './position.js';

export const KONTEKST_UTLØP_MS = POS_STALE_MS;   // FORELØPIG, ikke målt
/** `ombord().kind` → transit.state. `vet-ikke` er `unknown`, ikke «ikke ombord». */
export const TRANSIT_AV_OMBORD = Object.freeze({ ombord: 'onboard', 'ombord-tvil': 'uncertain', 'vet-ikke': 'unknown' });

const posisjonTom = kind => ({ available: false, lat: null, lon: null, accuracyM: null, observedAt: null, ageMs: null, kind, usable: false });
const bunn = (position, nå, expiresAt = null) => ({
  position,
  movement: { state: 'unknown', fartMS: null, confidence: null },
  transit: { state: 'unknown', confidence: null },
  stopRelation: { state: 'unknown', stopId: null },
  updatedAt: nå, expiresAt,
});

/**
 * @param {{pos?:{lat,lon,at,acc}|null, posTilstand?:{kind,usable}|null, fartMS?:number|null,
 *          ombord?:{kind:string}|null, nå?:number, utløpMs?:number}} o
 *   `posTilstand` er svaret fra `posState()` (kalleren kjører den) — kvaliteten avgjøres der, ikke her.
 * @returns userContext (se toppen). Aldri null.
 */
export function byggUserContext(o) {
  const c = o || {};
  const nå = Number.isFinite(c.nå) ? c.nå : Date.now();
  const utløp = Number.isFinite(c.utløpMs) ? c.utløpMs : KONTEKST_UTLØP_MS;
  const kind = (c.posTilstand && c.posTilstand.kind) || 'ukjent';
  const p = c.pos;
  // Ingen brukbar posisjon, eller ingen å bygge på: tom kontekst, med årsaken bevart.
  if (!c.posTilstand || !c.posTilstand.usable || !p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !Number.isFinite(p.at)) {
    return bunn(posisjonTom(kind), nå);
  }
  const ageMs = Math.max(0, nå - p.at), expiresAt = p.at + utløp;
  // Utløpt: ingen foreldet tilstand lever videre. Årsaken beholdes (`gammel` forblir `gammel`); bare uten annen årsak heter den `utløpt`.
  if (nå >= expiresAt) return bunn(posisjonTom(kind === 'ok' ? 'utløpt' : kind), nå);
  const ctx = bunn({
    available: true, lat: p.lat, lon: p.lon, accuracyM: Number.isFinite(p.acc) ? Math.round(p.acc) : null,
    observedAt: p.at, ageMs, kind, usable: true,
  }, nå, expiresAt);
  ctx.movement.fartMS = Number.isFinite(c.fartMS) && c.fartMS >= 0 ? c.fartMS : null;   // OBSERVERT fart, ingen tolkning
  ctx.transit.state = TRANSIT_AV_OMBORD[c.ombord && c.ombord.kind] || 'unknown';
  return ctx;
}
/** Gyldig akkurat nå? Utløpet selv (`nå === expiresAt`) er utløpt. Tom kontekst er aldri gyldig. */
export const userContextGyldig = (ctx, nå = Date.now()) => !!(ctx && ctx.position && ctx.position.available && Number.isFinite(ctx.expiresAt) && nå < ctx.expiresAt);
