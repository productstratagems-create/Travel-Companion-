/**
 * «ER DETTE RIKTIG STED?» (v1.218.197, onboarding steg 1). Bestilt: «har
 * appen satt bruker på riktig sted? Dersom bruker er uenig må bruker kunne
 * sette rett sted.» Linja øverst på Auto-tavle, og panelet bak «ikke riktig?».
 * Stedet du velger settes som `walkFromLL` — samme mekanisme som «gå fra» i
 * innstillinger, og prikken tegnes allerede som «satt av deg».
 */
import { esc } from './fmt.js';

/** Linja. Ren. */
export function herLinjeHtml({ kind, navn, acc, flyttet }) {
  const n = esc(navn || 'ukjent sted');
  if (kind === 'manuell') {
    return '<div class="her-linje her-manuell"><span class="her-tekst">📍 Du har valgt: <b>' + n + '</b></span>'
      + (flyttet ? '<span class="her-merk">du ser ut til å være et annet sted</span>' : '')
      + '<button type="button" class="her-knapp" data-her="gps">↺ bruk GPS igjen</button>'
      + '<button type="button" class="her-knapp her-stille" data-her="velg">endre</button></div>';
  }
  if (kind === 'ukjent') {
    return '<div class="her-linje her-ukjent"><span class="her-tekst">Hvor er du?</span>'
      + '<button type="button" class="her-knapp" data-her="velg">🔍 velg sted</button></div>';
  }
  if (kind === 'spørsmål') {
    return '<div class="her-linje her-spørsmål"><span class="her-tekst">◌ Er du her? <b>' + n + '</b>'
      + (Number.isFinite(acc) ? ' <small>(±' + Math.round(acc) + ' m)</small>' : '') + '</span>'
      + '<button type="button" class="her-knapp" data-her="ja">ja</button>'
      + '<button type="button" class="her-knapp" data-her="velg">nei, velg sted</button></div>';
  }
  return '<div class="her-linje"><span class="her-tekst">● Du er her: <b>' + n + '</b></span>'
    + '<button type="button" class="her-knapp her-stille" data-her="velg">ikke riktig? ›</button></div>';
}

/** Panelet. Ren. `nære`: [{ id, name, distM }]. */
export function stedPanelHtml(nære, manuell) {
  return '<div class="her-panel">'
    + '<div class="set-label">hvor er du?</div>'
    + '<input id="her-sok" class="her-sok" type="search" autocomplete="off" placeholder="adresse, sted eller stopp">'
    + '<div id="her-sugg" class="sugg-list" hidden></div>'
    + ((nære || []).length ? '<div class="set-label">i nærheten</div>' + nære.slice(0, 5).map((s, i) =>
      '<button type="button" class="nearby-btn her-nær" data-her-i="' + i + '"><span class="nearby-name">' + esc(s.name)
      + '</span><span class="nearby-dist">' + (Number.isFinite(s.distM) ? s.distM + ' m' : '') + '</span></button>').join('') : '')
    + '<button type="button" class="her-knapp" data-her="kart">📍 trykk i kartet der du er</button>'
    + (manuell ? '<button type="button" class="her-knapp" data-her="gps">↺ bruk GPS igjen</button>' : '')
    + '<button type="button" class="her-knapp her-stille" data-her="lukk">avbryt</button>'
    + '</div>';
}

/** Har du flyttet deg langt fra der du valgte stedet? Da spør vi om GPS igjen. */
export const MANUELL_FLYTT_M = 300;
