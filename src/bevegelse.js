/**
 * STÅR STILLE ELLER BEVEGER SEG? (#809 steg 3, v1.218.331)
 *
 * Ren inferens over et tidsstemplet GPS-spor: `stationary` | `moving` | `unknown`. `moving` betyr BARE «grunnlag for
 * bevegelse» — ikke «går» (skille gange/kjøretøy kommer senere). `unknown` er et fullgodt svar: for lite, for gammelt, for
 * støyete eller motstridende grunnlag. Ingen enkeltmåling avgjør noe.
 *
 * ISOLERT: ingen konsument leser denne ennå (ikke `auto.js`, `geo.js`, `pickStop` eller rangering). Ren: ingen state, DOM, nett,
 * ingen lagring. Hysteresen får det FORRIGE RESULTATET inn som parameter (`forrige`) — modulen husker ingenting selv.
 *
 * EKTE GPS ER IKKE VALIDERT. Tersklene under er HYPOTESER kalibrert mot en seedet simulering (tests/bevegelseSimulering.test.js)
 * med konstruert støy, ikke mot opptak fra telefoner. Målefrekvens, støyfordeling i bykløfter, strupet bakgrunnsmodus,
 * tunneler og stillestående busser er ikke målt.
 *
 * METODE (flere signaler sammen):
 *  1. Rens: sorter på tid, fjern duplikater og fikser uten brukbar nøyaktighet (acc > BEVEGELSE_MAKS_ACC_M), ta siste VINDU_MAKS_MS.
 *  2. Robust netto forflytning D: median av alle par (tidlig halvdel → sen halvdel) — tåler enkeltstående utliggere.
 *  3. Støy: σ = rms(acc) med gulv SIGMA_GULV_M (rapportert nøyaktighet er ofte optimistisk). σD = SIGMA_FAKTOR·σ/√k (k = punkter per halvdel).
 *  4. z = |D|/σD. Fart vD = |D|/Δt (Δt = tid mellom halvdelenes tyngdepunkt). Rettlinjethet = |D| / banelengde.
 *  5. moving: z ≥ Z_OPP, vD ≥ V_OPP. stationary: z ≤ Z_NED, og gange ved V_OPP kan UTELUKKES ((|D| + Z_OPP·σD)/Δt ≤ V_OPP).
 *     Kalman-farten (`fartMS`) er IKKE bevis for ro: simuleringen viser at den ligger over 1 m/s for en som står stille i
 *     over halvparten av tiden. Den brukes bare som veto mot «moving» når den er nær null. Mellom (dødsone) beholdes `forrige`; uten forrige: unknown.
 *     Ro krever STRENGERE evidens enn «ikke bevegelse» (gange må kunne utelukkes, noe som krever langt spenn og lav støy) — det er
 *     den asymmetrien, pluss dødsonen, som gir hysterese; en egen minste-spenn-regel for moving → stationary var overflødig og er fjernet. Motstridende (zigzag med stor
 *     median-steglengde og liten forflytning, eller Kalman mot forflytning) ⇒ unknown.
 *
 * `confidence` er IKKE en sannsynlighet: det er styrken på datagrunnlaget, = min(dataFaktor, margin), avrundet til 0,05.
 *   dataFaktor = min(1, n/FULL_FIKSER) · min(1, spennS/FULL_SPENN_S). margin = hvor langt statistikken er fra sin beslutningsterskel
 *   (0 ved terskel, 1 ved 2× terskel). `unknown` ⇒ 0.
 */
import { STILL_MS } from './trail.js';
import { metresBetween } from './haversine.js';

export const BEVEGELSE_TILSTANDER = Object.freeze(['stationary', 'moving', 'unknown']);
/* HYPOTESER — kalibrert mot simulering, ikke målt på ekte turer. Se docs/brukerkontekst.md. */
export const BEVEGELSE_MAKS_ACC_M = 50;     // fikser mer unøyaktige enn dette teller ikke som evidens
export const SIGMA_GULV_M = 5;              // rapportert acc under dette regnes som dette
export const SIGMA_FAKTOR = 1.5;            // σD = faktor · σ / √k (median av par er mindre effektiv enn snitt)
export const MIN_FIKSER = 4;                // brukbare fikser (≥ 2 per halvdel)
export const MIN_SPENN_MS = 8_000;          // spennet de brukbare fiksene dekker
export const VINDU_MAKS_MS = 60_000;        // eldre fikser teller ikke
export const UTLØP_MS = 60_000;             // siste fiks eldre enn dette ⇒ unknown (samme tall som KONTEKST_UTLØP_MS, men uten import)
export const Z_OPP = 3.5;                   // stasjonær → moving krever z ≥ dette
export const Z_NED = 2;                     // moving → stationary krever z ≤ dette (dødsone mellom)
export const V_OPP = 0.5;                   // m/s: lavere forflytningsfart regnes ikke som bevegelse
export const MAKS_STEG_FAKTOR = 3;          // median-steg > faktor·σ OG lav rettlinjethet ⇒ urolig ⇒ unknown
export const MIN_RETTLINJET = 0.5;
export const FULL_FIKSER = 8;
export const FULL_SPENN_S = 20;

const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rund05 = x => Math.round(x * 20) / 20;
const unknown = (reason, ekstra = {}) => ({ state: 'unknown', speedMps: null, confidence: 0, windowSeconds: 0, evidenceCount: 0, reason, ...ekstra });

/** Rens og vindu. Ren. → fikser sortert på tid, uten duplikater, med brukbar nøyaktighet. */
export function renset(spor, nå) {
  const sett = new Map();
  for (const f of spor || []) {
    if (!f || !Number.isFinite(f.lat) || !Number.isFinite(f.lon) || !Number.isFinite(f.at)) continue;
    if (f.at > nå) continue;                                   // fremtidig tidsstempel er ikke en måling
    if (!Number.isFinite(f.acc) || f.acc > BEVEGELSE_MAKS_ACC_M) continue;
    sett.set(f.at, f);                                         // duplikat på samme tid: siste vinner
  }
  const l = [...sett.values()].sort((a, b) => a.at - b.at);
  const siste = l.length ? l[l.length - 1].at : null;
  return siste == null ? [] : l.filter(f => siste - f.at <= VINDU_MAKS_MS);
}

/**
 * @param {{spor:Array<{lat,lon,at,acc}>, fartMS?:number|null, nå?:number, forrige?:{state:string}|null}} o
 * @returns {{state, speedMps:number|null, confidence:number, windowSeconds:number, evidenceCount:number, reason:string}}
 */
export function inferBevegelse(o) {
  const c = o || {};
  const nå = Number.isFinite(c.nå) ? c.nå : Date.now();
  const l = renset(c.spor, nå), n = l.length;
  if (n === 0) return unknown('ingen-spor');
  const siste = l[n - 1];
  const spennMs = siste.at - l[0].at;
  const felles = { windowSeconds: Math.round(spennMs / 1000), evidenceCount: n };
  if (nå - siste.at >= UTLØP_MS) return unknown('gammel', felles);               // GPS-avbrudd/gammel posisjon: tilstanden utløper
  if (n < MIN_FIKSER) return unknown('for-faa-fikser', felles);
  if (spennMs < MIN_SPENN_MS) return unknown('for-kort-spenn', felles);

  // Lokale meter fra første fiks.
  const mLat = 111_320, mLon = 111_320 * Math.cos(l[0].lat * Math.PI / 180);
  const p = l.map(f => ({ e: (f.lon - l[0].lon) * mLon, n: (f.lat - l[0].lat) * mLat, at: f.at, acc: f.acc }));
  const k = n >> 1;                                              // punkter per halvdel (midtpunkt utelates ved oddetall)
  const første = p.slice(0, k), andre = p.slice(n - k);
  const dE = [], dN = [];
  for (const a of første) for (const b of andre) { dE.push(b.e - a.e); dN.push(b.n - a.n); }
  const D = Math.hypot(median(dE), median(dN));
  const snitt = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  const dt = (snitt(andre.map(x => x.at)) - snitt(første.map(x => x.at))) / 1000;
  if (!(dt > 0)) return unknown('for-kort-spenn', felles);
  const sigma = Math.max(SIGMA_GULV_M, Math.sqrt(snitt(l.map(f => f.acc * f.acc))));
  const sigmaD = SIGMA_FAKTOR * sigma / Math.sqrt(k);
  const z = D / sigmaD, vD = D / dt;
  const kalman = Number.isFinite(c.fartMS) && c.fartMS >= 0 ? c.fartMS : null;
  const speedMps = Math.round(vD * 10) / 10;   // OBSERVERT forflytningsfart over vinduet — ikke sann hastighet (Kalman-farten er for urolig i ro, se docs)
  // Urolig: lange steg uten retning (tilfeldige hopp), ikke en rett strek.
  let bane = 0; for (let i = 1; i < n; i++) bane += metresBetween(l[i - 1], l[i]);
  const steg = []; for (let i = 1; i < n; i++) steg.push(metresBetween(l[i - 1], l[i]));
  const rett = bane > 0 ? D / bane : 1, midtSteg = median(steg);   // MEDIAN-steg: ett løgnaktig hopp skal ikke velte et ellers rolig spor
  const ut = (state, margin, reason) => {
    const data = Math.min(1, n / FULL_FIKSER) * Math.min(1, spennMs / 1000 / FULL_SPENN_S);
    return { state, speedMps, confidence: state === 'unknown' ? 0 : rund05(Math.max(0, Math.min(data, margin))), ...felles, reason };
  };
  if (midtSteg > MAKS_STEG_FAKTOR * sigma && rett < MIN_RETTLINJET) return unknown('urolig', { ...felles, speedMps });

  const forrige = c.forrige && c.forrige.state;
  const moving = z >= Z_OPP && vD >= V_OPP;
  const utelukkerGange = (D + Z_OPP * sigmaD) / dt <= V_OPP;   // Kalman-fart brukes IKKE som bevis for ro: den ligger ofte over 1 m/s for en som står stille
  const stillEv = z <= Z_NED && utelukkerGange;
  if (moving) {
    if (kalman != null && kalman <= STILL_MS * 0.5) return unknown('motstridende', { ...felles, speedMps });   // forflytning sier bevegelse, filteret sier ro
    return ut('moving', Math.min(1, (z - Z_OPP) / Z_OPP), 'forflytning');
  }
  if (stillEv) {
    return ut('stationary', Math.min(1, (Z_NED - z) / Z_NED + 0.5), 'ro');
  }
  // Dødsone/inkonklusivt: behold forrige (hysterese), ellers unknown.
  if (forrige === 'moving' || forrige === 'stationary') return ut(forrige, 0.25, 'dødsone');
  return unknown('inkonklusiv', { ...felles, speedMps });
}
