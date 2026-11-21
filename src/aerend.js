/**
 * HVORFOR FØR HVOR (v1.218.207, onboarding steg 2a). Bestilt: «for forbruker
 * så er "hvor" egentlig underordnet "hvorfor" — altså hvilket ærend det er
 * denne reisen egentlig dreier seg om.»
 *
 * Et ærend har ikke ett mål: «apotek» har flere likeverdige svar. Her er
 * ærendene, i rekkefølge etter tid på døgnet, og regelen for hvilke steder
 * som vises: åpne først, så nærmest — aldri én dom. Ren.
 */
export const ÆREND = [
  { id: 'mat',    tekst: 'handle mat', emoji: '🛒', kategorier: 'commercial.supermarket,commercial.convenience' },
  { id: 'apotek', tekst: 'apotek',     emoji: '💊', kategorier: 'healthcare.pharmacy' },
  { id: 'kafe',   tekst: 'kaffe',      emoji: '☕', kategorier: 'catering.cafe,catering.bakery' },
  { id: 'spise',  tekst: 'spise',      emoji: '🍽', kategorier: 'catering.restaurant,catering.fast_food' },
];
/** Rekkefølgen etter tid på døgnet: det sannsynlige først, alt tilgjengelig. */
export function ærendNå(nå = new Date()) {
  const h = nå.getHours();
  const først = h < 10 ? ['kafe', 'mat'] : h < 14 ? ['spise', 'kafe'] : h < 21 ? ['mat', 'spise'] : ['mat', 'apotek'];
  const rang = e => { const i = først.indexOf(e.id); return i < 0 ? 9 : i; };
  return [...ÆREND].sort((a, b) => rang(a) - rang(b));
}
/** Hvor langt vi leter: gangavstand først (1,5 km ≈ 20 min). */
export const ÆREND_RADIUS_M = 1500;
export const ÆREND_MAKS = 4;
/**
 * Stedene som vises for et ærend: åpne før stengte, så nærmest; ukjente
 * åpningstider mellom de to. Høyst ÆREND_MAKS — likeverdige valg, ingen
 * «beste». Ren.
 */
export function ærendSteder(steder, maks = ÆREND_MAKS) {
  const åpen = p => (p.hours && p.hours.isOpen === true ? 0 : p.hours && p.hours.isOpen === false ? 2 : 1);
  return [...(steder || [])].filter(p => p && Number.isFinite(p.lat))
    .sort((a, b) => åpen(a) - åpen(b) || (a.dist || 0) - (b.dist || 0)).slice(0, maks);
}
