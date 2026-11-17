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
import { sentrumFor, AT_CENTRE_KM, MIN_GAIN_KM, kmTo } from './api/centre.js';
import { erHelgLik } from './dagtype.js';
import { stopKey } from './stopId.js';

export const BLANDING_K = 5;

/**
 * Hvor mange reiser som må til før appen sier «du pleier» (v1.218.97).
 * Rapportert tirsdag 18:56 på Mortensrud: «dit du ofte skal treffer svært
 * dårlig». Én reise innenfor ±5 timer var nok til å si «du pleier hit
 * tirsdager rundt nå», mens profilen over sa «ingen faste reiser i kveld».
 * Nå kreves minst to reiser samme dagtype innenfor ±2 timer (nabobøttene).
 */
export const VANE_MIN = 2;
/** Et avkreftet mål (du sa «nei») teller så mye av det det ellers ville (v1.218.100). */
export const AVKREFTET_VEKT = 0.2;

/** Det vanlige mønsteret: hvilken vei, og hvor sterkt (0–1). */
export function vanligMønster(nå) {
  const d = new Date(nå), h = d.getHours(), helg = erHelgLik(nå);
  if (!helg && h >= 6 && h < 10) return { mot: 'sentrum', styrke: 1, tekst: 'hverdagsmorgen: mot sentrum' };
  if (!helg && h >= 14 && h < 19) return { mot: 'ut', styrke: 1, tekst: 'hverdagsettermiddag: hjemover' };
  if (helg && h >= 10 && h < 18) return { mot: 'sentrum', styrke: 0.4, tekst: 'helg: mot sentrum' };
  return { mot: null, styrke: 0, tekst: '' };
}

/** 1 når målet passer med det vanlige mønsteret, 0 når det går imot, ½ ellers. */
export function passerMønster(mål, her, m) {
  if (!m.mot || !mål || !her) return 0.5;
  // Byens sentrum (v1.218.41), ikke Oslos: i Bergen målte dette 300 km begge veier.
  const S = sentrumFor(her);
  if (!S) return 0.5;
  const fraHer = kmTo(her, S), fraMål = kmTo(mål, S);
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
  const d = new Date(c.nå), bøtte = Math.floor(d.getHours() / 2), helg = erHelgLik(c.nå);
  const herKey = c.her && stopKey(c.her.name);
  const poeng = new Map();
  const nær = new Map();   // reiser til målet i samme eller nabobøtte, samme dagtype
  let n = 0;
  (c.hist || []).forEach(e => {
    const diff = Math.abs((e.bucket ?? 99) - bøtte);
    if (diff > 2 || e.isWeekend !== helg) return;
    if (diff <= 1) n += e.count || 0;
    const fraHer = (c.her && ((e.fromStopId && e.fromStopId === c.her.id) || (herKey && stopKey(e.fromName) === herKey))) ? 2 : 1;
    const p = (e.count || 0) * (diff === 0 ? 3 : diff === 1 ? 2 : 1) * fraHer;
    const k = stopKey(e.toName);
    if (k) poeng.set(k, (poeng.get(k) || 0) + p);
    if (k && diff <= 1) nær.set(k, (nær.get(k) || 0) + (e.count || 0));
  });
  const maks = Math.max(0, ...poeng.values());
  const vekt = n / (n + BLANDING_K);
  const m = vanligMønster(c.nå);
  // PROFILEN FØRST (v1.218.54): sier den hvor du skal nå (hjem, jobb, sentrum
  // — ut fra dag, klokke og hvor du er), står det kortet øverst. Det faste
  // mønsteret over gjelder bare når profilen ikke vet. Samme svar som «din
  // vanlige reise», så de to ikke kan si hvert sitt.
  const pr = c.profil && typeof c.profil.treff === 'function' ? c.profil : null;
  return (kort || []).map(x => {
    const eget = maks ? (poeng.get(stopKey(x.name)) || 0) / maks : 0;
    const vanlig = passerMønster(x, c.her, m);
    const profilTreff = !!pr && pr.treff({ name: x.name, id: x.id, lat: x.lat, lon: x.lon });
    // Over alt det faste mønsteret kan gi (maks 1), så profilen alltid går foran.
    // DET DU HAR SAGT (v1.218.100): et «ja» i intervjuet eller på «din vanlige
    // reise» gjør målet til en vane nå; et «nei» tar den bort og senker kortet.
    const sagt = typeof c.svar === 'function' ? (c.svar({ toName: x.name, helg, bucket: bøtte }) || 0) : 0;
    const p0 = profilTreff ? 2 + eget : vekt * eget + (1 - vekt) * vanlig;
    const p = sagt < 0 ? p0 * AVKREFTET_VEKT : sagt > 0 && !profilTreff ? Math.max(p0, 1) : p0;
    const vane = sagt > 0 || (sagt === 0 && (nær.get(stopKey(x.name)) || 0) >= VANE_MIN);
    const grunn = profilTreff ? (pr.tekst || 'din vanlige reise')
      : sagt > 0 ? 'du har sagt at du pleier hit ' + _dagNavn[d.getDay()] + ' rundt nå'
      : vane
        ? 'du pleier hit ' + _dagNavn[d.getDay()] + ' rundt nå'
        : (vanlig > 0.5 ? m.tekst : '');
    return { kort: x, p, eget, vanlig, grunn, profil: profilTreff, vane: vane || profilTreff };
  }).sort((a, b) => b.p - a.p);
}

/**
 * Hvilken retningsgruppe som foldes sammen, eller null.
 *
 * Rapportert med skjermbilde på Mortensrud, helg kl. 11: «mot sentrum» gir
 * mening, men «fra sentrum» gir det ikke, gitt hvor du står. Gruppen i
 * motsatt retning av det vanlige mønsteret foldes sammen. Den slettes ikke:
 * kan vi ikke bevise at noe er irrelevant, foldes det, det kastes ikke.
 *
 * Ikke når du står i sentrum (da finnes ingen «fra»), ikke når mønsteret er
 * nøytralt, og ikke når DIN historikk har et mål i den retningen nå
 * (`egneSider`): ditt mønster slår det vanlige.
 *
 * @param {number} nå
 * @param {{lat,lon}|null} her
 * @param {Set<'mot'|'fra'>} egneSider retningene dine egne mål akkurat nå ligger i
 * @returns {'mot'|'fra'|null}
 */
export function foldetSide(nå, her, egneSider, sted) {
  const m = vanligMønster(nå);
  if (!m.mot || !her) return null;
  // DER MØNSTERET ALT ER OPPFYLT (v1.218.42). Rapportert: hverdag 17:34 på
  // Mortensrud, «mot sentrum» foldet — fordi ettermiddagen er «hjemover». Men
  // Mortensrud ER hjemme, og en reise derfra kl. 17:34 går bort fra hjemmet.
  // Står du hjemme om ettermiddagen, eller på jobb om morgenen, folder ikke
  // det faste mønsteret noe. `sted` er profilens svar (profil.js stedType).
  if ((m.mot === 'ut' && sted === 'hjem') || (m.mot === 'sentrum' && sted === 'jobb')) return null;
  const S = sentrumFor(her);
  const km = S ? kmTo(her, S) : null;
  if (km == null || km < AT_CENTRE_KM) return null;
  const motsatt = m.mot === 'sentrum' ? 'fra' : 'mot';
  return egneSider && egneSider.has(motsatt) ? null : motsatt;
}
