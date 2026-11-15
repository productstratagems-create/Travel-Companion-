/**
 * HVA SLAGS DAG ER DET (v1.218.54) — én definisjon.
 *
 * `getDay() === 0 || getDay() === 6` sto skrevet fem steder (profil, neste
 * reise, vanene to ganger, mønsteret), og ingen av dem kjente helligdagene:
 * 17. mai, 2. påskedag og julaften var «hverdag», og appen foreslo jobbreisen.
 * En fridag oppfører seg som helg, så `erHelgLik` er det de fleste spør om.
 *
 * Bladmodul: ingen importer. Lokal tid (telefonens), som resten av appen.
 */

/** Påskedag (gregoriansk, Meeus/Jones/Butcher). Måned 0-basert. */
export function påskedag(år) {
  const a = år % 19, b = Math.floor(år / 100), c = år % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mnd = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(år, mnd - 1, dag);
}

const nøkkel = d => d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
const _cache = new Map();

/** Norske helligdager i året, som nøkler «år-måned-dag». */
export function helligdager(år) {
  if (_cache.has(år)) return _cache.get(år);
  const p = påskedag(år);
  const fra = n => new Date(p.getFullYear(), p.getMonth(), p.getDate() + n);
  const s = new Set([
    new Date(år, 0, 1), fra(-3), fra(-2), p, fra(1), new Date(år, 4, 1), new Date(år, 4, 17),
    fra(39), fra(49), fra(50), new Date(år, 11, 25), new Date(år, 11, 26),
  ].map(nøkkel));
  _cache.set(år, s);
  return s;
}

/** @returns {'ukedag'|'helg'|'fridag'} */
export function dagtype(ms) {
  const d = new Date(ms);
  if (helligdager(d.getFullYear()).has(nøkkel(d))) return 'fridag';
  // Julaften og nyttårsaften: fri fra kl. 12.
  if (d.getMonth() === 11 && (d.getDate() === 24 || d.getDate() === 31) && d.getHours() >= 12) return 'fridag';
  const w = d.getDay();
  return w === 0 || w === 6 ? 'helg' : 'ukedag';
}

/** Oppfører dagen seg som helg (helg eller fridag)? */
export const erHelgLik = ms => dagtype(ms) !== 'ukedag';
