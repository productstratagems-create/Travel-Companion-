/**
 * PROBEN FOR MÅLOMRÅDENES NAVN (v1.218.214). Bestilt: «Ja, legg inn proben»
 * — etter spørsmålet om hva Entur og Kartverket kan gi for å navngi
 * målområder. Ingen av feltene kan prøves fra sandkassen, så appen spør og
 * LOGGER svaret (AGENTS.md: «spør som probe … sies høyt»). Ingenting på
 * skjermen bruker svarene ennå; et felt som mangler gir en logglinje, ikke
 * en tom knapp. Én gang per stopp per økt.
 *
 *   Entur reiseplanlegger: stopPlace.weighting / transportMode /
 *     transportSubmode / tariffZones, og destinationDisplay.via
 *   Entur geokoder (reverse): borough / locality / county / category
 *   Kartverket stedsnavn (punkt): skrivemåte + navneobjekttype
 *   Kartverket kommuneinfo (punkt): kommunenavn / fylkesnavn
 */
import config from '../config.js';
import { enturFetch } from './http.js';

const _hent = (url) => fetch(url, { signal: AbortSignal.timeout(8000) });

export function jpProbeGql(ider) {
  return '{ ' + ider.map((id, i) => 's' + i + ': stopPlace(id:"' + id + '"){ name weighting transportMode transportSubmode tariffZones{id name}'
    + ' estimatedCalls(numberOfDepartures:6){ destinationDisplay{frontText via} serviceJourney{line{publicCode name}} } }').join(' ') + ' }';
}
export const geokoderUrl = ll => config.api.geocoderReverse + '?point.lat=' + ll.lat + '&point.lon=' + ll.lon + '&size=1&layers=venue,address';
export const stedsnavnUrl = ll => 'https://ws.geonorge.no/stedsnavn/v1/punkt?nord=' + ll.lat + '&ost=' + ll.lon + '&koordsys=4258&radius=1000&utkoordsys=4258&treffPerSide=10';
export const kommuneUrl = ll => 'https://ws.geonorge.no/kommuneinfo/v1/punkt?nord=' + ll.lat + '&ost=' + ll.lon + '&koordsys=4258';

/** Lesere av svarene — rene; et felt som mangler sies ved navn. */
export function lesJp(j) {
  if (!j) return 'intet svar';
  const feil = j.errors && j.errors.length ? ' · FEIL: ' + j.errors.map(e => e.message).join('; ').slice(0, 200) : '';
  const sp = Object.values((j && j.data) || {}).filter(Boolean);
  return sp.map(s => s.name + ' [weighting=' + (s.weighting ?? '∅') + ' modus=' + (s.transportMode ?? '∅') + '/' + (s.transportSubmode ?? '∅')
    + ' soner=' + ((s.tariffZones || []).map(z => z.name || z.id).join(',') || '∅') + ' via='
    + ([...new Set((s.estimatedCalls || []).flatMap(c => (c.destinationDisplay && c.destinationDisplay.via) || []))].join(',') || '∅')
    + ' linjer=' + ([...new Set((s.estimatedCalls || []).map(c => c.serviceJourney && c.serviceJourney.line && (c.serviceJourney.line.publicCode + ' ' + c.serviceJourney.line.name)))].join(' | ') || '∅') + ']').join(' ; ') + feil;
}
export function lesGeokoder(j) {
  const p = j && j.features && j.features[0] && j.features[0].properties;
  if (!p) return 'ingen treff';
  return 'bydel=' + (p.borough || '∅') + ' kommune=' + (p.locality || '∅') + ' fylke=' + (p.county || '∅') + ' kategori=' + ((p.category || []).join(',') || '∅') + ' felt=' + Object.keys(p).join(',');
}
export function lesStedsnavn(j) {
  const n = (j && (j.navn || j.stedsnavn)) || [];
  if (!n.length) return 'ingen treff' + (j ? ' felt=' + Object.keys(j).join(',') : '');
  return n.slice(0, 8).map(x => ((x.stedsnavn && x.stedsnavn[0] && x.stedsnavn[0].skrivemåte) || x.skrivemåte || '?') + '(' + (x.navneobjekttype || '?') + (x.meterFraPunkt != null ? ' ' + Math.round(x.meterFraPunkt) + 'm' : '') + ')').join(', ');
}
export function lesKommune(j) {
  if (!j) return 'intet svar';
  return 'kommune=' + (j.kommunenavn || '∅') + ' fylke=' + (j.fylkesnavn || '∅') + ' felt=' + Object.keys(j).join(',');
}

const _spurt = new Set();
/**
 * @param stoppId   stoppet ditt
 * @param områder   [{ tekst, fjern: { id, name, lat, lon } }]
 * @param logg      (tekst) → void
 */
export async function omrProbe(stoppId, områder, logg, deps = {}) {
  if (!stoppId || _spurt.has(stoppId)) return;
  _spurt.add(stoppId);
  const jp = deps.jp || (q => enturFetch(config.api.journeyPlanner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }));
  const hent = deps.hent || _hent;
  const spør = async (navn, p, les) => {
    try { const r = await p; if (!r.ok) return logg('probe ' + navn + ': HTTP ' + r.status); logg('probe ' + navn + ': ' + les(await r.json())); }
    catch (e) { logg('probe ' + navn + ': ' + ((e && e.name === 'TimeoutError') ? 'tidsavbrudd' : (e && e.message) || 'feil')); }
  };
  const ider = [stoppId, ...områder.map(o => o.fjern && o.fjern.id).filter(Boolean)].slice(0, 4);
  const jobber = [spør('entur-stopp', jp(jpProbeGql(ider)), lesJp)];
  områder.forEach(o => {
    const f = o.fjern;
    if (!f || !Number.isFinite(f.lat)) return logg('probe ' + o.tekst + ': intet fjernt stopp');
    const t = ' «' + o.tekst + '» ved ' + f.name;
    jobber.push(spør('geokoder' + t, hent(geokoderUrl(f)), lesGeokoder));
    jobber.push(spør('stedsnavn' + t, hent(stedsnavnUrl(f)), lesStedsnavn));
    jobber.push(spør('kommune' + t, hent(kommuneUrl(f)), lesKommune));
  });
  await Promise.all(jobber);
}
export function _resetOmrProbe() { _spurt.clear(); }
