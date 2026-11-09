/**
 * NESTE REISE (v1.218.22) — hva appen tror er din neste reise, uten reiserute.
 *
 * Bestilt: «auto-reise informerer om hva den tror er brukers neste reise, det
 * trenger ikke være detaljert reiserute, men bruke det du har av konsepter og
 * modeller sammenholdt med brukers reisedata og indikere fuzzy tid og retning
 * for neste reise. Legg til brukers mulighet til å validere hypotesene.»
 *
 * Bygger på det som finnes: `destRanking(at)` (api/smart.js) — reisene dine
 * per to-timersbøtte og hverdag/helg — spurt framover time for time. Første
 * tidsrom der en vane er sterk nok, blir hypotesen. Tiden er bøtta (fuzzy, to
 * timer), retningen er kompassretningen fra der du er. Ingen hypotese når
 * vanen er for svak: «vet ikke» er en annen setning enn et gjett.
 *
 * Ren: rangering og svar sendes inn, så regelen prøves uten lager og DOM.
 */
import { VANE_MIN_TURER } from './api/smart.js';
import { metresBetween } from './haversine.js';

/** Så langt fram appen ser. */
export const NESTE_TIMER = 24;
/** Det du har sagt veier dobbelt så tungt som én reise (som linjesvar). */
export const NESTE_SVAR_VEKT = 2;
/** Står du nærmere enn dette, er stedet ikke neste reise. */
export const ALLEREDE_DER_M = 400;

const RETNING = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];

export function retningOrd(her, mål) {
  if (!her || !mål || !Number.isFinite(mål.toLat) || !Number.isFinite(mål.toLon)) return null;
  const nord = mål.toLat - her.lat;
  const øst = (mål.toLon - her.lon) * Math.cos(her.lat * Math.PI / 180);
  if (!nord && !øst) return null;
  const grader = (Math.atan2(øst, nord) * 180 / Math.PI + 360) % 360;
  return RETNING[Math.round(grader / 45) % 8];
}

const toSiffer = n => String(n).padStart(2, '0');
function delAvDag(time) {
  return time < 10 ? 'tidlig' : time < 12 ? 'formiddag' : time < 18 ? 'ettermiddag' : time < 22 ? 'kveld' : 'natt';
}

/** «nå», «i ettermiddag, mellom 14 og 16», «i morgen tidlig, mellom 06 og 08». */
export function tidsvindu(nå, fra, til) {
  if (fra <= nå && nå < til) return 'nå';
  const a = new Date(fra), b = new Date(til), n = new Date(nå);
  const iMorgen = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1).getTime();
  const del = delAvDag(a.getHours());
  const dag = fra >= iMorgen
    ? 'i morgen ' + del
    : (del === 'tidlig' ? 'i dag tidlig' : 'i ' + del);
  return dag + ', mellom ' + toSiffer(a.getHours()) + ' og ' + toSiffer(b.getHours() || 24);
}

/**
 * @param {{nå:number, her?:{lat,lon}|null, rangering:(at:number)=>Array,
 *   svar?:(h:{toName,bucket,helg})=>number}} o
 * @returns {null|{toName,toLat,toLon,fra,til,bucket,helg,antall,retning,tekst}}
 */
export function nesteReise(o) {
  const { nå, her = null, rangering, svar = () => 0 } = o || {};
  if (!Number.isFinite(nå) || typeof rangering !== 'function') return null;
  for (let h = 0; h < NESTE_TIMER; h++) {
    const at = nå + h * 3600_000;
    const d = new Date(at);
    const bucket = Math.floor(d.getHours() / 2);
    const helg = d.getDay() === 0 || d.getDay() === 6;
    const kand = (rangering(at) || [])
      // Rett tidsbøtte og rett slags dag — et nabotidsrom er ikke «da».
      .filter(r => r && r.toName && r.diff === 0 && r.ukedag)
      .filter(r => !(her && Number.isFinite(r.toLat) && metresBetween(her, { lat: r.toLat, lon: r.toLon }) < ALLEREDE_DER_M))
      .map(r => {
        const n = svar({ toName: r.toName, bucket, helg }) || 0;
        return { r, n, justert: (r.count || 0) + NESTE_SVAR_VEKT * n };
      })
      .filter(x => x.justert >= VANE_MIN_TURER)
      .sort((a, b) => b.justert - a.justert);
    if (!kand.length) continue;
    const { r, n } = kand[0];
    const fra = new Date(d.getFullYear(), d.getMonth(), d.getDate(), bucket * 2).getTime();
    const til = fra + 2 * 3600_000;
    return { toName: r.toName, toLat: r.toLat ?? null, toLon: r.toLon ?? null, fra, til, bucket, helg,
      antall: r.count || 0, sagt: n, retning: retningOrd(her, r), tekst: tidsvindu(nå, fra, til) };
  }
  return null;
}
