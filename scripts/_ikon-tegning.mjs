/**
 * Tegningen, som en funksjon av hvor mange stopp den har.
 *
 * Reisestripa er appens egen signatur: en skinne med stopp, og én fylt
 * prikk for «her er du». Strekningen bak deg er lysere enn den foran —
 * samme språk som `.js-done` på skjermen, og det er det som gjør ikonet til
 * «underveis» framfor «en strek med prikker».
 *
 * TO UTGAVER AV SAMME TEGNING, ikke to tegninger:
 *
 *   any       innholdet spenner 84 % av flaten
 *   maskable  66 %, regnet — ikke gjettet, og ikke 78 som første utkast sa.
 *
 * REGNESTYKKET SOM FØRSTE UTKAST TOK FEIL AV: ytterprikkene har radius
 * 0,055·S og sitter PÅ endepunktene, så formen er bredere enn spennet.
 * Halvbredden er halv·spenn + stoppR, høyden stoppR, og kravet er
 * √(w² + h²) ≤ 0,4·S. Med spenn 0,78 ga prøven 105 % av sonen: utenfor,
 * og usett, siden ingen ser maskable uten en Android med rund maske.
 * 0,74 er grensen; 0,66 gir margin.
 *
 * Bakgrunnen går helt ut i kanten i begge. Et maskable-ikon med
 * gjennomsiktige hjørner viser maskens egen farge gjennom — og da får du et
 * gullsymbol i en hvit sirkel på en app som ellers er nesten svart.
 */

export const GULL = '#f5b840';
export const BAKGRUNN = '#0a0806';

/**
 * @param {number} stopp  antall stopp på skinna
 * @param {number} spenn  hvor stor del av flaten innholdet dekker (0–1)
 */
/**
 * Hvor prøven skal måle, regnet av tegningen selv.
 *
 * Prikkene stikker ut over skinna. Raden som krysser BARE prikkene ligger
 * mellom skinnas kant og prikkens. Et magisk tall her ville vært to steder
 * som måtte være enige om samme geometri.
 */
export function målerad(h) {
  const skinneHalv = h * 0.022 / 2;
  const stoppR = h * 0.055;
  return Math.round(h / 2 - (skinneHalv + stoppR) / 2 - skinneHalv / 2);
}

/** Spennet for hver av de to utgavene. Ett navn, ikke to tall i to filer. */
export const SPENN_ANY = 0.84;
export const SPENN_MASKABLE = 0.66;

/** Antall stopp er et MÅLERESULTAT: sju smelter til fem på 60 px. */
export const STOPP = 5;

export function ikonSvg(stopp = STOPP, spenn = SPENN_ANY) {
  const S = 512, C = S / 2;
  const halv = (S * spenn) / 2;
  const x0 = C - halv, x1 = C + halv;

  // «Du» står der strekningen bak er litt kortere enn den foran — du er
  // underveis, ikke framme. To femdeler inn leser som nettopp det.
  const duIdx = Math.max(1, Math.round((stopp - 1) * 0.4));
  const steg = (x1 - x0) / (stopp - 1);
  const duX = x0 + duIdx * steg;

  /* TALLENE ER MÅLT PÅ 60 PIKSLER, ikke valgt på 512.
   *
   * Første utkast hadde stoppR = 0,030·S. På en hjemskjerm er ikonet ~60 px,
   * og da blir prikken 3,6 piksler bred mot en skinne på 1,7 — den stakk ut
   * knapt én piksel i hver ende og forsvant i skinna. Prøven talte én
   * sammenhængende flekk for både tre, fem og sju stopp.
   *
   * En tegning som bare leses på 512 er en tegning for en designfil. */
  const skinneBredde = Math.round(S * 0.022);
  const stoppR = Math.round(S * 0.055);
  const duR = Math.round(S * 0.088);

  const prikker = [];
  for (let i = 0; i < stopp; i++) {
    if (i === duIdx) continue;
    const x = x0 + i * steg;
    const bak = i < duIdx;
    prikker.push(
      `<circle cx="${x.toFixed(1)}" cy="${C}" r="${stoppR}" fill="${GULL}"`
      + ` fill-opacity="${bak ? 0.85 : 0.3}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" fill="${BAKGRUNN}"/>
  <line x1="${x0.toFixed(1)}" y1="${C}" x2="${duX.toFixed(1)}" y2="${C}"
        stroke="${GULL}" stroke-opacity="0.85" stroke-width="${skinneBredde}" stroke-linecap="round"/>
  <line x1="${duX.toFixed(1)}" y1="${C}" x2="${x1.toFixed(1)}" y2="${C}"
        stroke="${GULL}" stroke-opacity="0.3" stroke-width="${skinneBredde}" stroke-linecap="round"/>
  ${prikker.join('\n  ')}
  <circle cx="${duX.toFixed(1)}" cy="${C}" r="${duR}" fill="${GULL}"/>
</svg>`;
}
