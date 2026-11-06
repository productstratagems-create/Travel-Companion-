/**
 * Låsen på reisen du sitter på.
 *
 * Rapportert: «Nå svitsjer den mellom stasjoner på en busslinje og en
 * tbanelinje under samme reise, det er ulogisk og gir ikke mening for et
 * menneske i tid og rom.»
 *
 * Tre grunner, lest i koden. Dommen (`ombord`) hadde ingen hukommelse og ble
 * regnet på nytt hvert sekund. Farten falt ved hvert stopp, dommen ble
 * `vet-ikke`, og «du er ved» falt tilbake til nærmeste stopp, som kunne være
 * T-banen. Og kandidatene kom fra tavla for stoppet som vises, så turen du
 * satt på kunne forsvinne når overskriften byttet stopp.
 *
 * Et menneske på en buss er på bussen til det går av. Låsen er det:
 *   LÅSES   når én tur følger deg (`ombord`), eller tvilen er avgjort av
 *           stoppene du har passert.
 *   HOLDES  gjennom stopp ved holdeplass og rødt lys, i inntil LÅS_STOPP_MS.
 *   SLIPPES når sporet går bort fra turen (du gikk av), turen er ved
 *           endestasjonen, eller du har stått stille for lenge.
 * En annen tur tar over bare etter at låsen er sluppet. Det er hysteresen.
 *
 * En bladmodul: ombord.js og haversine. Tersklene er valgt av resonnement og
 * ikke målt på en ekte tur. Reiseloggen (`ombord`, handling «låst» og
 * «sluppet») er bygget for å måle dem.
 */
import { metresBetween } from '../haversine.js';
import { iFart, nesteStopp, OMBORD_MAKS_AVVIK_M } from './ombord.js';

/** Så lenge du kan stå stille og fortsatt sitte på. Holdeplass, rødt lys, kø. */
export const LÅS_STOPP_MS = 3 * 60_000;
/** Så lenge sporet må gå bort fra turen før låsen slippes … */
export const LÅS_BRUDD_MS = 60_000;
/** … og med minst så mange fikser. Én dårlig fiks er ikke at du gikk av. */
export const LÅS_BRUDD_FIKSER = 3;

const _ok = f => f && Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.at);

/** Fiksene der du var et annet sted enn turen skulle være. */
export function avvik(k, spor) {
  const ved = new Map(((k && k.forventet) || []).filter(Boolean).map(p => [p.at, p]));
  return (spor || []).filter(_ok).filter(f => {
    const p = ved.get(f.at);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return false;
    const acc = Number.isFinite(f.acc) ? f.acc : 0;
    return metresBetween(f, p) - acc > OMBORD_MAKS_AVVIK_M;
  });
}

/**
 * Den siste sammenhengende rekka av fikser bort fra turen, som slutter i
 * den siste fiksen. Tom når den siste fiksen er på turen.
 */
export function sisteAvviksrekke(k, spor) {
  const fikser = (spor || []).filter(_ok);
  const bort = new Set(avvik(k, fikser));
  const ut = [];
  for (let i = fikser.length - 1; i >= 0 && bort.has(fikser[i]); i--) ut.unshift(fikser[i]);
  return ut;
}

/**
 * @param {object|null} lås {k, kilde: 'sikker'|'gjettet'|'valgt', stilleFra}
 * @param {{låstK?:object|null, vinner?:object|null, fartMS?:number|null, spor?:Array, nå:number}} o
 *   låstK   den låste turen, med forventet posisjon regnet ut på nytt mot sporet
 *   vinner  turen dommen peker på nå (én som følger deg, eller tvil avgjort)
 * @returns {{lås:object|null, hendelse:string|null}}
 */
export function oppdaterLås(lås, o) {
  const { låstK = null, vinner = null, vinnerKilde = 'sikker', fartMS = null, spor = [], nå } = o || {};
  if (lås) {
    const k = låstK || lås.k;
    /* ET GJETT KAN BYTTES når bevisene sier noe annet: en annen tur følger
     * deg alene (`sikker`), eller vinner på passerte stopp. Et valg du har
     * gjort selv (`valgt`), og en sikker lås, holdes. */
    if (lås.kilde === 'gjettet' && vinner && vinner.nøkkel !== k.nøkkel && vinnerKilde === 'sikker'
      && nesteStopp(vinner, nå)) {
      return { lås: { k: vinner, kilde: 'sikker', stilleFra: null }, hendelse: 'byttet' };
    }
    if (!nesteStopp(k, nå)) return { lås: null, hendelse: 'sluppet:ende' };
    // SAMMENHENGENDE, ikke summert. Funnet av funksjonsrutene (v1.216.2):
    // regelen telte alle avvikende fikser i sporet. To korte opphold ved
    // stopp som ligger tett ble til sammen «over 60 s og 3 fikser bort», og
    // låsen slapp på tog, buss, ekspressbuss og T-bane midt i turen. Nå
    // teller bare den siste sammenhengende rekka av avvik, fram til nå.
    const rekke = sisteAvviksrekke(k, spor);
    if (rekke.length >= LÅS_BRUDD_FIKSER && rekke[rekke.length - 1].at - rekke[0].at >= LÅS_BRUDD_MS) {
      return { lås: null, hendelse: 'sluppet:brudd' };
    }
    const stilleFra = iFart(fartMS) ? null : (lås.stilleFra != null ? lås.stilleFra : nå);
    if (stilleFra != null && nå - stilleFra > LÅS_STOPP_MS) return { lås: null, hendelse: 'sluppet:stille' };
    return { lås: { k, kilde: lås.kilde || 'sikker', stilleFra }, hendelse: null };
  }
  if (vinner && nesteStopp(vinner, nå)) {
    return { lås: { k: vinner, kilde: vinnerKilde, stilleFra: null }, hendelse: vinnerKilde === 'gjettet' ? 'gjettet' : 'låst' };
  }
  return { lås: null, hendelse: null };
}
