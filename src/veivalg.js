/**
 * VEIVALGET (v1.218.204). Rapportert med skjermbilde: to gangruter fra
 * adressen — én til hovedstoppet, én til alternativet — som går hver sin vei
 * og krysser hverandre lenger fram. «Rart at ikke appen foreslår det jeg har
 * ringet rundt som stedet veivalget må tas, heller enn å foreslå to ulike
 * stier ut fra adressen.»
 *
 * Rutene hentes hver for seg, så fram til der de møtes er de to likeverdige
 * veier til samme punkt. Valget tas der de skilles. Her: finn møtepunktet,
 * bruk én felles stamme (den korteste) fram dit, og to grener derfra. Ren.
 */
import { metresBetween } from './haversine.js';

const ll = p => (Array.isArray(p) ? { lat: p[0], lon: p[1] } : p);
const lengde = pts => pts.slice(1).reduce((s, p, i) => s + metresBetween(ll(pts[i]), ll(p)), 0);

/** Så nær må rutene komme for å regnes som møtt. */
export const MØTES_M = 12;
/** Møtepunkt nærmere starten enn dette er bare der du står — ingen stamme. */
export const STAMME_MIN_M = 30;

/**
 * @param a, b  rutene ([lat, lon]-punkter), begge fra der du står
 * @returns { stamme, a, b, veivalg: [lat, lon] } — eller null når rutene ikke
 *   møtes (eller møtes ved starten): da tegnes de som før.
 */
/** Punkt hver `steg` meter langs ruta, knekkpunktene med. Ren. */
export const TETT_M = 5;
export function tett(pts, steg = TETT_M) {
  const ut = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = ll(pts[i - 1]), b = ll(pts[i]);
    const d = metresBetween(a, b), n = Math.floor(d / steg);
    for (let k = 1; k < n; k++) ut.push([a.lat + (b.lat - a.lat) * k / n, a.lon + (b.lon - a.lon) * k / n]);
    ut.push(pts[i]);
  }
  return ut;
}

export function felles(a0, b0) {
  if (!a0 || !b0 || a0.length < 2 || b0.length < 2) return null;
  // TETT FØRST (v1.218.206). Rapportert igjen med skjermbilde: to stier fra
  // døra langs samme gate. Bare knekkpunktene ble sammenlignet, og en rute som
  // går RETT FRAM gjennom krysset har ikke noe knekkpunkt der — så ingen
  // møtte noe. Fiksturen hadde delt knekkpunkter og så det aldri.
  const a = tett(a0), b = tett(b0);
  // SISTE møte: der de skilles for godt. Første møte etter starten kunne vært
  // en kryssing midt i et felles strekk.
  let best = null;
  for (let i = a.length - 1; i >= 0 && !best; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      if (metresBetween(ll(a[i]), ll(b[j])) <= MØTES_M) { best = { i, j }; break; }
    }
  }
  if (!best) return null;
  // DER DE BEGYNNER Å GLI FRA HVERANDRE (v1.218.206): siste møte innen
  // MØTES_M ligger noen meter forbi krysset når rutene skilles i spiss vinkel.
  // Avstanden der de følges (medianen) + 2 m avgjør hvor de faktisk skilles.
  const nærmest = i => { let m = Infinity, jm = 0; for (let j = 0; j < b.length; j++) { const d = metresBetween(ll(a[i]), ll(b[j])); if (d < m) { m = d; jm = j; } } return { d: m, j: jm }; };
  const avst = [];
  for (let i = 0; i <= best.i; i++) avst.push(nærmest(i).d);
  // Bare den siste sammenhengende strekningen der de ligger tett.
  let start = best.i; while (start > 0 && avst[start - 1] <= MØTES_M) start--;
  const tettStrekk = avst.slice(start, best.i + 1).sort((x, y) => x - y);
  const median = tettStrekk[Math.floor(tettStrekk.length / 2)];
  let i2 = best.i;
  while (i2 > 0 && avst[i2] > median + 2) i2--;
  best = { i: i2, j: nærmest(i2).j };
  const stammeA = a.slice(0, best.i + 1), stammeB = b.slice(0, best.j + 1);
  if (lengde(stammeA) < STAMME_MIN_M || lengde(stammeB) < STAMME_MIN_M) return null;
  // Er møtet ved målet for den ene, er det ingen gaffel — samme mål.
  if (best.i >= a.length - 1 || best.j >= b.length - 1) return null;
  const stamme = lengde(stammeA) <= lengde(stammeB) ? stammeA : stammeB;
  return { stamme, a: a.slice(best.i), b: b.slice(best.j), veivalg: a[best.i] };
}

/**
 * GANGTREET (v1.218.208). Rapportert for tredje gang med skjermbilde: to
 * stier ut fra prikken. «Ikke lag flere veier ut fra brukers pos enn
 * nødvendig.» `felles` virket — men bare to av gangrutene gikk gjennom den;
 * GÅ HIT og en umålt rute ble tegnet hver for seg fra prikken. Nå: ALLE
 * gangruter fra deg går hit, og ut kommer ett tre. Den første ruta (til
 * hovedstoppet) er stammen og tegnes hel; hver av de andre blir en gren fra
 * veivalget der den skilles fra stammen. Møtes de ikke, grener ruta fra
 * punktet på stammen nærmest den — aldri en ny linje fra prikken, med mindre
 * den skilles fra stammen allerede ved døra (innen STAMME_MIN_M). Ren.
 *
 * @param ruter  [[lat, lon]…]-lister; tomme/korte hoppes over
 * @returns { linjer: [pts…], veivalg: [[lat, lon]…] }
 */
/** Ligger ruta lenger enn dette fra stammen overalt, er den en egen vei. */
export const SKILT_M = 40;
export function gangTre(ruter) {
  const r = (ruter || []).filter(p => Array.isArray(p) && p.length >= 2);
  if (!r.length) return { linjer: [], veivalg: [] };
  const stamme = r[0], linjer = [stamme], veivalg = [];
  const st = tett(stamme);
  for (const ru of r.slice(1)) {
    const g = felles(stamme, ru);
    if (g) { linjer.push(g.b); veivalg.push(g.veivalg); continue; }
    // Møtes ikke: finn punktet på ruta som ligger nærmest stammen (forbi
    // døra), og gren derfra — fra stammens nærmeste punkt.
    const t = tett(ru);
    let best = null, langsRu = 0;
    for (let j = 0; j < t.length; j++) {
      if (j) langsRu += metresBetween(ll(t[j - 1]), ll(t[j]));
      // Døra teller ikke: der er de alltid 0 m fra hverandre.
      if (langsRu < STAMME_MIN_M) continue;
      for (let i = 0; i < st.length; i++) {
        const d = metresBetween(ll(t[j]), ll(st[i]));
        if (!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && j > best.j)) best = { d, i, j };
      }
    }
    const langs = best ? lengde(st.slice(0, best.i + 1)) : 0;
    // Langt fra stammen hele veien (> SKILT_M): de går hver sin vei fra døra.
    if (!best || langs < STAMME_MIN_M || best.d > SKILT_M) { linjer.push(ru); continue; }
    linjer.push([st[best.i], ...t.slice(best.j)]);
  }
  return { linjer, veivalg };
}

/** Hvor mange av linjene som starter ved prikken (innen m meter). Ren. */
export function stierFraPrikken(linjer, prikk, m = 10) {
  return (linjer || []).filter(l => l && l.length && metresBetween(ll(l[0]), ll(prikk)) <= m).length;
}
