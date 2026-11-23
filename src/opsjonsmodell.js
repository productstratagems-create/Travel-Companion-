/**
 * OPSJONSMODELLEN (plangrunnlaget steg 2, trinn 1). Felles representasjon og
 * identitet for en reisemulighet — en *handlingsmulighet*, ikke bare et
 * reisemål. Kontrakten står i docs/opsjonsmodell.md; testene i
 * tests/opsjonsmodell.test.js binder den.
 *
 * Rene funksjoner. Ingen API, ingen presentasjon, ingen kjennskap til de
 * personlige reiseoppgavene (håndhevet i tests/arkitektur.test.js).
 *
 * Fire begreper holdes adskilt og blandes aldri i én statusvariabel:
 *   oppdagelse      — hvem fant den, fra hvor, når (`discovery[]`)
 *   bekreftelse     — hva sa et konkret reisesøk (`confirmations[]`)
 *   tilgjengelighet — avledet for et bestemt tidspunkt (`tilgjengelighet()`)
 *   rekkevidde      — beskrivende metadata (`scope`), aldri del av id/filter
 */
import { metresBetween } from './haversine.js';

export const OPSJONSTYPER = ['destination', 'direction', 'transport_offer', 'connection'];
export const RETNINGSBASIS = ['line', 'geographic', 'network'];
export const BEKREFTELSE = ['not_checked', 'checking', 'confirmed', 'not_feasible', 'unknown'];
export const TILGJENGELIGHET = ['now', 'later', 'in_timetable_not_now', 'not_assessed'];
export const SCOPE = ['local', 'regional', 'national', 'unknown'];

/**
 * Rekkeviddeheuristikk [Hypotese]: luftlinje fra startpunktet. Foreløpig —
 * ikke en produktdefinisjon. Administrative grenser kan erstatte den.
 */
export const SCOPE_GRENSER_M = { local: 15000, regional: 120000 };

/** En bekreftelse gjelder bare reisetidspunktet den ble søkt for (± dette). */
export const BEKREFTELSE_TOLERANSE_MS = 60 * 1000;
/** … og bare så lenge svaret er ferskt. */
export const BEKREFTELSE_GYLDIG_MS = 3 * 60 * 1000;
/** «Nå» betyr første avgang innen dette etter reisetidspunktet. */
export const NÅ_HORISONT_MS = 60 * 60 * 1000;

/** Samlestoppets id — understoppet når Entur ikke oppgir parent. */
export const samlestopp = s => (s && (s.parentId || s.stopPlaceId || s.id)) || null;

/**
 * Opsjonens identitet: HVA handlingen er. Aldri avhengig av rute,
 * tilgangspunkt, tidspunkt, oppdagelsessituasjon eller rekkevidde.
 *   destination      destinasjonens samlestopp (eller et navngitt område)
 *   direction        basis + nøkkel (linje>retning, sektor, knutepunkt …)
 *   transport_offer  tilgangens samlestopp + modus + linje
 *   connection       fra-samlestopp → via … → til-samlestopp
 */
export function opsjonsId(type, k) {
  if (!OPSJONSTYPER.includes(type) || !k) return null;
  if (type === 'destination') return k.destinasjon ? `destination:${k.destinasjon}` : null;
  if (type === 'direction') return RETNINGSBASIS.includes(k.basis) && k.nøkkel ? `direction:${k.basis}:${k.nøkkel}` : null;
  if (type === 'transport_offer') return k.tilgang && k.modus && k.linje ? `transport_offer:${k.tilgang}:${k.modus}:${k.linje}` : null;
  if (type === 'connection') return k.fra && k.til ? `connection:${[k.fra, ...(k.via || []), k.til].join('>')}` : null;
  return null;
}

/** Tilgangspunkt — understopp/plattform og modus beholdes ved siden av samlestoppet. */
export function tilgangspunkt(t) {
  return {
    parentId: t.parentId || null,
    stopPlaceId: t.stopPlaceId || null,
    quayId: t.quayId || null,
    name: t.name || null,
    mode: t.mode || null,
    lineId: t.lineId || null,
    distanceM: t.distanceM ?? null,
    walkMin: t.walkMin ?? null,
  };
}
export const tilgangsId = t => [t.quayId || t.stopPlaceId || t.parentId, t.mode || '', t.lineId || ''].join('|');

/** En realisering er én konkret måte å utføre handlingen på. */
export const realisasjonsId = r => [
  r.accessPoint ? tilgangsId(r.accessPoint) : '',
  r.departure || '',
  (r.legs || []).map(l => `${l.mode || ''}:${l.lineId || ''}`).join(','),
  (r.hubs || []).join(','),
  r.destination || '',
].join('#');

/** En oppdagelsesvei (proveniens). */
export const stiId = p => [p.discoverer, p.accessPoint ? tilgangsId(p.accessPoint) : '', p.lineId || '', (p.hubs || []).join(','), p.oppdagelse || ''].join('#');

/** Rekkevidde som beskrivende metadata. `unknown` når grunnlaget mangler. */
export function scopeFor(fra, til) {
  if (!fra || !til || !Number.isFinite(fra.lat) || !Number.isFinite(til.lat)) return 'unknown';
  const m = metresBetween(fra, til);
  if (!Number.isFinite(m)) return 'unknown';
  if (m < SCOPE_GRENSER_M.local) return 'local';
  if (m < SCOPE_GRENSER_M.regional) return 'regional';
  return 'national';
}

/** Oppdagelsessituasjonen — egen identitet, knyttet til posisjon, tid og tilgang. */
export function nyOppdagelse({ posisjon, tid, tilgangspunkter = [] }) {
  const t = new Date(tid).toISOString();
  return {
    id: `oppdagelse:${posisjon.lat.toFixed(4)},${posisjon.lon.toFixed(4)}@${t}`,
    posisjon, tid: t,
    tilgangspunkter: tilgangspunkter.map(tilgangspunkt),
  };
}

const unikPå = (arr, nøkkel) => {
  const sett = new Map();
  for (const x of arr) if (!sett.has(nøkkel(x))) sett.set(nøkkel(x), x);
  return [...sett.values()];
};

/** Lag en opsjon. Rekkevidde avledes; status starter «ikke undersøkt». */
export function nyOpsjon(o) {
  const id = opsjonsId(o.type, o.nøkkel);
  const opsjon = {
    id, type: o.type, nøkkel: o.nøkkel,
    label: o.label || null,
    intent: o.intent || null,
    origin: o.origin || null,
    destinations: o.destinations || [],
    area: o.area || null,
    hubs: o.hubs || [],
    accessPoints: unikPå((o.accessPoints || []).map(tilgangspunkt), tilgangsId),
    realisations: unikPå(o.realisations || [], realisasjonsId),
    discovery: o.discovery || [],
    provenance: unikPå(o.provenance || [], stiId),
    confirmations: o.confirmations || [],
    timetable: o.timetable || null, // 'running' | 'not_now' | null (fra rutetilbudet)
  };
  opsjon.scope = scopeFor(o.origin, o.destinations && o.destinations[0]);
  return opsjon;
}

/**
 * Slå sammen to forekomster av SAMME opsjon. Ingenting forkastes:
 * tilgangspunkter, realiseringer, stier, oppdagelser og bekreftelser forenes.
 */
export function slåSammen(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.id !== b.id) throw new Error(`ulike opsjoner: ${a.id} ≠ ${b.id}`);
  return {
    ...a,
    label: a.label || b.label,
    destinations: unikPå([...a.destinations, ...b.destinations], d => d.id),
    hubs: [...new Set([...a.hubs, ...b.hubs])],
    accessPoints: unikPå([...a.accessPoints, ...b.accessPoints], tilgangsId),
    realisations: unikPå([...a.realisations, ...b.realisations], realisasjonsId),
    discovery: unikPå([...a.discovery, ...b.discovery], d => `${d.oppdagelse}|${d.source}`),
    provenance: unikPå([...a.provenance, ...b.provenance], stiId),
    confirmations: [...a.confirmations, ...b.confirmations],
    timetable: a.timetable === 'running' || b.timetable === 'running' ? 'running' : (a.timetable || b.timetable),
  };
}

/** Samle en liste kandidater til én opsjon per id. */
export function samle(kandidater) {
  const m = new Map();
  for (const k of kandidater) m.set(k.id, slåSammen(m.get(k.id), k));
  return [...m.values()];
}

/** Gjelder bekreftelsen for dette reisetidspunktet, sett fra `nå`? */
export function gjelderFor(bekreftelse, reisetid, nå = reisetid) {
  if (!bekreftelse || !bekreftelse.request) return false;
  const ønsket = Date.parse(bekreftelse.request.travelTime);
  const søkt = Date.parse(bekreftelse.searchedAt);
  return Math.abs(ønsket - +new Date(reisetid)) <= BEKREFTELSE_TOLERANSE_MS
    && +new Date(nå) - søkt <= BEKREFTELSE_GYLDIG_MS;
}

/** Bekreftelsesstatus for et reisetidspunkt. Ingen gyldig → «ikke undersøkt». */
export function bekreftelse(opsjon, reisetid, nå = reisetid) {
  const g = (opsjon.confirmations || []).filter(c => gjelderFor(c, reisetid, nå));
  return g.length ? g[g.length - 1].state : 'not_checked';
}

/** Tidsmessig tilgjengelighet for et reisetidspunkt — avledet, aldri lagret alene. */
export function tilgjengelighet(opsjon, reisetid, nå = reisetid) {
  const g = (opsjon.confirmations || []).filter(c => gjelderFor(c, reisetid, nå) && c.state === 'confirmed');
  if (g.length) {
    const første = Date.parse(g[g.length - 1].firstDeparture);
    return første - +new Date(reisetid) <= NÅ_HORISONT_MS ? 'now' : 'later';
  }
  if (opsjon.timetable === 'not_now') return 'in_timetable_not_now';
  return 'not_assessed';
}

/** Kontraktens invarianter. Gir en liste avvik (tom = gyldig). */
export function avvik(o) {
  const f = [];
  if (!OPSJONSTYPER.includes(o.type)) f.push('ukjent type');
  if (!o.id || o.id !== opsjonsId(o.type, o.nøkkel)) f.push('id er ikke avledet av type og nøkkel');
  if (!SCOPE.includes(o.scope)) f.push('ugyldig scope');
  if (!o.provenance || !o.provenance.length) f.push('mangler proveniens');
  for (const t of o.accessPoints || []) if (!(t.quayId || t.stopPlaceId || t.parentId)) f.push('tilgangspunkt uten stopp');
  for (const c of o.confirmations || []) {
    if (!BEKREFTELSE.includes(c.state)) f.push(`ugyldig bekreftelse ${c.state}`);
    if (!c.request || !c.request.travelTime || !c.searchedAt) f.push('bekreftelse uten forespørsel/tidspunkt');
    if (c.state === 'confirmed' && !c.firstDeparture) f.push('bekreftet uten avgangstid');
  }
  if ('availability' in o) f.push('tilgjengelighet skal avledes, ikke lagres');
  return f;
}
export const erGyldig = o => avvik(o).length === 0;

/** Rangordning av transportmidler for spredning i utvalget (ikke for relevans). */
const MODUS_ORDEN = ['rail', 'metro', 'water', 'tram', 'air', 'coach', 'bus', 'taxi'];
const hovedModus = o => {
  const m = new Set([...o.accessPoints, ...o.provenance.map(p => p.accessPoint || {})].map(t => t.mode).filter(Boolean)
    .concat(o.realisations.flatMap(r => (r.legs || []).map(l => l.mode))));
  return MODUS_ORDEN.find(x => m.has(x)) || [...m].sort()[0] || 'ukjent';
};
const førsteKnute = o => [...o.hubs].sort()[0] || 'direkte';
const avstand = o => (o.origin && o.destinations[0] && Number.isFinite(o.destinations[0].lat))
  ? metresBetween(o.origin, o.destinations[0]) : 0;

/**
 * Utvelgelse til bekreftelse — et eget steg, adskilt fra oppdagelsen.
 * Deterministisk og uavhengig av rekkefølgen kandidatene kom i:
 *   1. grupper på (hovedmodus, første knutepunkt)
 *   2. i hver gruppe: lengst unna først (spredning i rekkevidde), så id
 *   3. ta én fra hver gruppe etter tur (round-robin) til budsjettet er brukt
 * Returnerer også dem som IKKE fikk budsjett — de forkastes ikke.
 */
export function velgForBekreftelse(kandidater, n) {
  const grupper = new Map();
  for (const o of [...kandidater].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const k = `${hovedModus(o)}|${førsteKnute(o)}`;
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(o);
  }
  const køer = [...grupper.keys()].sort().map(k => grupper.get(k).sort((a, b) => avstand(b) - avstand(a) || (a.id < b.id ? -1 : 1)));
  const valgt = [];
  while (valgt.length < n && køer.some(q => q.length)) {
    for (const q of køer) if (q.length && valgt.length < n) valgt.push(q.shift());
  }
  const ider = new Set(valgt.map(o => o.id));
  return { valgt, utenfor: kandidater.filter(o => !ider.has(o.id)) };
}
