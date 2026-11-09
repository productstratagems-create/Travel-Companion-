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

const _kall = k => ((k && k.call && k.call.serviceJourney && k.call.serviceJourney.estimatedCalls) || [])
  .map(c => { const q = c.quay || {}, sp = q.stopPlace || {};
    return { lat: Number.isFinite(q.latitude) ? q.latitude : sp.latitude, lon: Number.isFinite(q.longitude) ? q.longitude : sp.longitude }; })
  .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

/**
 * Korteste avstand i meter fra en fiks til strekningen mellom turens stopp.
 *
 * Rapportert: låsen slapp når T-banen, bussen eller trikken forlot en
 * stasjon. Avviket ble målt mot turens forventede PUNKT i tid. Sto bussen et
 * minutt ekstra, lå punktet 300–600 m foran deg på samme linje, og det så ut
 * som at du hadde gått av. Mot ruta er forsinkelse ikke avvik: du er på
 * strekningen, uansett hvor langt bak rutetiden.
 *
 * Rette linjer mellom stoppene. Det er grovt i svinger, derfor
 * OMBORD_MAKS_AVVIK_M (150 m) og fartskravet i `oppdaterLås`.
 */
export function avstandTilRute(kall, f) {
  if (!f || !Array.isArray(kall) || !kall.length) return Infinity;
  const kx = 111320 * Math.cos(f.lat * Math.PI / 180), ky = 110540;
  const xy = p => [(p.lon - f.lon) * kx, (p.lat - f.lat) * ky];
  let best = Infinity;
  for (let i = 0; i < kall.length; i++) {
    const [ax, ay] = xy(kall[i]);
    if (i === kall.length - 1) { best = Math.min(best, Math.hypot(ax, ay)); break; }
    const [bx, by] = xy(kall[i + 1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/**
 * Den siste sammenhengende rekka av fikser bort fra turen, som slutter i
 * den siste fiksen. Tom når den siste fiksen er på turen.
 */
/* RUTA: den ekte traséen når den er kjent, ellers rette streker mellom stoppene.
 * Rapportert (v1.218.21): «På T-banelinje 3 begynner appen å tro at bruker
 * plutselig er på tilstøtende busslinjer.» Målt mot Enturs trasé: 131 av 595
 * punkter på linje 3 ligger >150 m fra de rette strekene, ved Brynseng 300 m.
 * Du satt PÅ T-banen og så ut til å være utenfor ruta — og et gjett kunne da
 * byttes til en buss som gikk i nærheten. */
export function rutePunkter(k) {
  const f = k && k.form;
  if (Array.isArray(f) && f.length >= 2) return f.map(([lat, lon]) => ({ lat, lon }));
  return _kall(k);
}

export function sisteAvviksrekke(k, spor) {
  const fikser = (spor || []).filter(_ok);
  // Fra RUTA, ikke fra punktet i rutetiden (v1.217.1). Se `avstandTilRute`.
  const kall = rutePunkter(k);
  const bort = new Set(kall.length >= 2
    ? fikser.filter(f => avstandTilRute(kall, f) - (Number.isFinite(f.acc) ? f.acc : 0) > OMBORD_MAKS_AVVIK_M)
    : avvik(k, fikser));
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
  const { låstK = null, vinner = null, vinnerKilde = 'sikker', fartMS = null, spor = [], lang = null, nå } = o || {};
  /* BRUDDET LESER DET LANGE SPORET når det finnes. Det korte er 12 fikser,
   * omtrent 12 s i appen, og kunne aldri spenne over LÅS_BRUDD_MS (60 s):
   * bruddet var i praksis av. Funnet da en mutant overlevde. */
  const bruddSpor = Array.isArray(lang) && lang.length >= LÅS_BRUDD_FIKSER ? lang : spor;
  if (lås) {
    const k = låstK || lås.k;
    /* ET GJETT KAN BYTTES når bevisene sier noe annet: en annen tur følger
     * deg alene (`sikker`), eller vinner på passerte stopp. Et valg du har
     * gjort selv (`valgt`), og en sikker lås, holdes. */
    // OG BARE NÅR GJETTET IKKE LENGER STEMMER: en linje som går ut fra samme
    // stasjon samtidig, tar ikke over så lenge du er på din egen rute.
    const utenfor = sisteAvviksrekke(k, spor).length > 0;
    if (lås.kilde === 'gjettet' && vinner && vinner.nøkkel !== k.nøkkel && vinnerKilde === 'sikker'
      && utenfor && nesteStopp(vinner, nå)) {
      return { lås: { k: vinner, kilde: 'sikker', stilleFra: null }, hendelse: 'byttet' };
    }
    if (!nesteStopp(k, nå)) return { lås: null, hendelse: 'sluppet:ende' };
    // SAMMENHENGENDE, ikke summert. Funnet av funksjonsrutene (v1.216.2):
    // regelen telte alle avvikende fikser i sporet. To korte opphold ved
    // stopp som ligger tett ble til sammen «over 60 s og 3 fikser bort», og
    // låsen slapp på tog, buss, ekspressbuss og T-bane midt i turen. Nå
    // teller bare den siste sammenhengende rekka av avvik, fram til nå.
    // OG I GANGFART. Utenfor ruta i kjørefart, for eksempel der rette linjer
    // mellom stoppene skjærer en sving, er ikke at du gikk av.
    const rekke = sisteAvviksrekke(k, bruddSpor);
    if (rekke.length >= LÅS_BRUDD_FIKSER && rekke[rekke.length - 1].at - rekke[0].at >= LÅS_BRUDD_MS
      && !iFart(fartMS)) {
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
