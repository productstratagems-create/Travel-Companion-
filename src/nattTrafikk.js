/**
 * NATT: SISTE AVGANG, OG NÅR DET GÅR IGJEN (v1.218.38).
 *
 * Bestilt som del av «det som er proven» i oversikten: kl. 00:15 er det
 * avgjørende om dette er siste T-bane 3, og om en retning er ferdig for natta.
 * Lista henter 90 minutter fram (BOARD_WINDOW_MINS), og at en avgang er den
 * siste I VINDUET sier ikke at den er den siste i natt — det kan være et
 * vanlig hull. Så appen spør én gang til, fra vinduets slutt, etter første
 * avgang per linje og retning (`fetchArrBoard`), og bare om natta.
 *
 * PROBE: oppslaget kan ikke prøves mot Entur herfra. Svarer det ikke, står
 * ingenting — «siste» er en påstand appen bare gjør når den har sett hullet.
 *
 * Ren: tider og svar inn, dom ut.
 */

/** Natt er fra NATT_FRA til NATT_TIL (lokal tid). */
export const NATT_FRA = 21;
export const NATT_TIL = 5;
/** Et hull så langt etter en avgang gjør den til «siste i natt». */
export const NATT_PAUSE_MIN = 120;

export function erNatt(ms) {
  const h = new Date(ms).getHours();
  return h >= NATT_FRA || h < NATT_TIL;
}

/** Nøkkelen en rad og en avgang deler: linje og retning. */
export function radNøkkel(linjeId, retning) {
  return String(linjeId || '') + '|' + String(retning || '').trim().toLowerCase();
}

/**
 * Første avgang per linje og retning i svaret etter vinduet.
 * @param {Array<{ln:{id,publicCode}, dest:string, depTs:number, cancelled?:boolean}>} departures
 * @returns {Map<string, {depTs:number, kode:string, dest:string, ln:object}>}
 */
export function nesteEtter(departures) {
  const m = new Map();
  (departures || []).filter(d => d && !d.cancelled && Number.isFinite(d.depTs)).forEach(d => {
    const k = radNøkkel(d.ln && (d.ln.id || d.ln.publicCode), d.dest);
    const før = m.get(k);
    if (!før || d.depTs < før.depTs) m.set(k, { depTs: d.depTs, kode: (d.ln && d.ln.publicCode) || '', dest: d.dest, ln: d.ln });
  });
  return m;
}

/**
 * Dommen for én rad: er den siste avgangen i vinduet den siste i natt?
 * @param {number} sisteMs  radens siste avgang i vinduet
 * @param {{depTs:number}|undefined} neste  første avgang etter vinduet, om noen
 * @param {boolean} spurt  om oppslaget etter vinduet faktisk har svart
 * @returns {{siste:number, neste:number|null}|null}
 */
export function sisteDom(sisteMs, neste, spurt) {
  if (!spurt || !Number.isFinite(sisteMs)) return null;
  // Ikke i svaret er IKKE «ingen flere»: svaret har et tak, og fraværet kan
  // være det. Påstanden gjøres bare når neste avgang er sett (sett i proben).
  if (!neste) return null;
  return neste.depTs - sisteMs >= NATT_PAUSE_MIN * 60000 ? { siste: sisteMs, neste: neste.depTs } : null;
}

/**
 * Retninger som har avgang ETTER vinduet, men ingen i det: ferdige for natta.
 * @param {Map} etter  fra `nesteEtter`
 * @param {Set<string>} iLista  nøklene til radene som står i lista
 */
export function ferdigeRetninger(etter, iLista) {
  return [...etter.entries()].filter(([k]) => !iLista.has(k))
    .map(([, v]) => v).sort((a, b) => a.depTs - b.depTs);
}
