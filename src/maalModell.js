/**
 * Hvor du mest sannsynlig skal, akkurat nå.
 *
 * Bestilt: «den bør foreslå hvor bruker mest sannsynlig ønsker å reise basert
 * på brukers gjeldende posisjon, tidspunkt på døgnet, hvilke dag i uken det er
 * og registrert reisemønster. Også: lag deg en modell for hva som er vanlig
 * mønster for folk flest som jobber i uken og har fri i helgene; at folk bor i
 * utkanten og reiser mot sentrum for jobb: et generelt mønster som kan
 * sammenholdes med registrert reisemønster.»
 *
 * To kilder, blandet etter hvor mye appen vet om deg akkurat nå:
 *   DITT MØNSTER  reisehistorikken (`smart.js`): mål × to-timers tidsbolk ×
 *                 hverdag eller helg × hvor du reiste fra. Samme poeng som
 *                 `destRanking`, og dobbelt når turen startet der du er.
 *   DET VANLIGE   folk flest: hverdagsmorgen mot sentrum (jobb), hverdags-
 *                 ettermiddag bort fra sentrum (hjem), helg-dagtid svakt mot
 *                 sentrum (fritid), ellers nøytralt.
 * Vekten på ditt mønster er n / (n + BLANDING_K), der n er turene dine i
 * denne tidsbolken og dagtypen. Med få turer styrer det vanlige, med mange
 * ditt eget.
 *
 * Ren og uten DOM. Tidspunktene i det vanlige mønsteret er valgt av
 * resonnement, ikke målt på befolkningsdata.
 */
import { CENTRE, AT_CENTRE_KM, MIN_GAIN_KM, kmTo } from './api/centre.js';
import { stopKey } from './stopId.js';

export const BLANDING_K = 5;

/** Det vanlige mønsteret: hvilken vei, og hvor sterkt (0–1). */
export function vanligMønster(nå) {
  const d = new Date(nå), h = d.getHours(), helg = d.getDay() === 0 || d.getDay() === 6;
  if (!helg && h >= 6 && h < 10) return { mot: 'sentrum', styrke: 1, tekst: 'hverdagsmorgen: mot sentrum' };
  if (!helg && h >= 14 && h < 19) return { mot: 'ut', styrke: 1, tekst: 'hverdagsettermiddag: hjemover' };
  if (helg && h >= 10 && h < 18) return { mot: 'sentrum', styrke: 0.4, tekst: 'helg: mot sentrum' };
  return { mot: null, styrke: 0, tekst: '' };
}

/** 1 når målet passer med det vanlige mønsteret, 0 når det går imot, ½ ellers. */
export function passerMønster(mål, her, m) {
  if (!m.mot || !mål || !her) return 0.5;
  const fraHer = kmTo(her, CENTRE), fraMål = kmTo(mål, CENTRE);
  if (fraHer == null || fraMål == null || fraHer < AT_CENTRE_KM) return 0.5;
  const nærmere = fraMål <= fraHer - MIN_GAIN_KM, lenger = fraMål >= fraHer + MIN_GAIN_KM;
  if (!nærmere && !lenger) return 0.5;
  const ja = m.mot === 'sentrum' ? nærmere : lenger;
  return 0.5 + (ja ? 0.5 : -0.5) * m.styrke;
}

const _dagNavn = ['søndager', 'mandager', 'tirsdager', 'onsdager', 'torsdager', 'fredager', 'lørdager'];

/**
 * @param {Array<{name, id?, lat?, lon?}>} kort stedene som kan vises
 * @param {{nå:number, her?:{lat,lon,name?,id?}, hist?:Array}} o
 * @returns {Array<{kort, p:number, eget:number, vanlig:number, grunn:string}>} høyest p først
 */
export function rangerMål(kort, o) {
  const c = o || {};
  const d = new Date(c.nå), bøtte = Math.floor(d.getHours() / 2), helg = d.getDay() === 0 || d.getDay() === 6;
  const herKey = c.her && stopKey(c.her.name);
  const poeng = new Map();
  let n = 0;
  (c.hist || []).forEach(e => {
    const diff = Math.abs((e.bucket ?? 99) - bøtte);
    if (diff > 2 || e.isWeekend !== helg) return;
    if (diff <= 1) n += e.count || 0;
    const fraHer = (c.her && ((e.fromStopId && e.fromStopId === c.her.id) || (herKey && stopKey(e.fromName) === herKey))) ? 2 : 1;
    const p = (e.count || 0) * (diff === 0 ? 3 : diff === 1 ? 2 : 1) * fraHer;
    const k = stopKey(e.toName);
    if (k) poeng.set(k, (poeng.get(k) || 0) + p);
  });
  const maks = Math.max(0, ...poeng.values());
  const vekt = n / (n + BLANDING_K);
  const m = vanligMønster(c.nå);
  return (kort || []).map(x => {
    const eget = maks ? (poeng.get(stopKey(x.name)) || 0) / maks : 0;
    const vanlig = passerMønster(x, c.her, m);
    const p = vekt * eget + (1 - vekt) * vanlig;
    const grunn = eget > 0 && vekt * eget >= (1 - vekt) * Math.abs(vanlig - 0.5)
      ? 'du pleier hit ' + _dagNavn[d.getDay()] + ' rundt nå'
      : (vanlig > 0.5 ? m.tekst : '');
    return { kort: x, p, eget, vanlig, grunn };
  }).sort((a, b) => b.p - a.p);
}
