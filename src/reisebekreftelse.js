/**
 * REISEBEKREFTELSEN (plangrunnlaget steg 2, trinn 4d). Overgangen fra
 * oppdagede nettverksmuligheter til bekreftede reiser — uten å blande hva
 * systemet vet, hva det har undersøkt og hva det har verifisert.
 * Plan: docs/trinn-4-implementeringsplan.md, «Revidert 4d-forslag».
 *
 * Tre representasjoner holdes adskilt:
 *   oppdaget vei       resultat.veier[] fra src/nettverksutforsker.js (lag 1)
 *   opsjonsbekreftelse en konkret reise til opsjonens destinasjon finnes
 *   veibekreftelse     den konkrete reisen følger faktisk den oppdagede veien
 *
 * Overleveringen fra utforskeren er DATA: denne modulen importerer ikke
 * nettverksutforsker.js (tests/arkitektur.test.js). Ingen relevans, ingen
 * presentasjon, ingen endring av opsjonsidentitet.
 *
 * Delsteg 1: bekreftelsesgrensen (`grunnlag`).
 * Delsteg 2: representativ utvelgelse (`velgRepresentativt`).
 */
import { metresBetween } from './haversine.js';

/** Gyldige vinduer fra utforskeren. Alt annet er ukjent tidsstatus. */
const VINDUER = new Set(['ordinært', 'utvidet', 'senere']);

/** Grunner for at en vei holdes utenfor bekreftelsen. Én navngitt definisjon. */
export const UTENFOR = Object.freeze({
  senere: 'rutetilbud senere i døgnet (not_now)',
  flereLedd: 'flere ledd uten tidsmessig kontroll av overgangen',
  ukjentTid: 'ukjent tidsstatus',
  manglerAvgang: 'mangler avgangstid',
  ingenVeier: 'ingen oppdagede veier',
});

const gyldigTid = t => typeof t === 'string' && Number.isFinite(Date.parse(t));

/**
 * Er veien direkte? Ett ledd, uten knutepunkt og uten inngang. Mangler noe av
 * dette, er det ikke «direkte» — og heller ikke «flere ledd»: det er ukjent.
 */
function leddtype(vei) {
  if (vei.ledd === 1 && vei.knute == null && vei.inn == null) return 'direkte';
  if (vei.ledd === 2 && vei.knute && vei.inn) return 'flere';
  return null;
}

/**
 * TILLATELSESREGELEN (hvitliste) for én vei. Alt som ikke er eksplisitt
 * tillatt, er utenfor med grunn. 4c regner ledd 2 fra NÅ bak enhver inngang,
 * så `vindu: 'ordinært'` beviser ikke at en overgang rekkes: flerleddsveier
 * slippes inn bare når hver overgang er tidsmessig kontrollert (lag 2, som
 * ikke finnes ennå — `vei.tidskobling.status === 'kontrollert'`).
 *
 * @returns {{ tillatt: true } | { tillatt: false, grunn: string }}
 */
export function tillatt(vei, opsjon) {
  if (!vei || !VINDUER.has(vei.vindu)) return { tillatt: false, grunn: UTENFOR.ukjentTid };
  if (vei.vindu === 'senere' || (opsjon && opsjon.timetable === 'not_now')) return { tillatt: false, grunn: UTENFOR.senere };
  const type = leddtype(vei);
  if (type === null) return { tillatt: false, grunn: UTENFOR.ukjentTid };
  if (type === 'flere' && !(vei.tidskobling && vei.tidskobling.status === 'kontrollert')) return { tillatt: false, grunn: UTENFOR.flereLedd };
  if (!gyldigTid(vei.avgang)) return { tillatt: false, grunn: UTENFOR.manglerAvgang };
  return { tillatt: true };
}

/**
 * BEKREFTELSESGRUNNLAGET: hvilke opsjoner kan sendes til reisesøk, og via
 * hvilke veier. Anvendes FØR utvelgelsen. Endrer ikke `resultat`.
 *
 * En opsjon er kandidat når minst én av dens veier er tillatt; veiene som ikke
 * er det, står per vei med grunn. Opsjoner uten noen tillatt vei står i
 * `utenfor` — fortsatt oppdaget, ikke irrelevante.
 *
 * @returns {{
 *   kandidater: { opsjon: string, veier: string[], utenforVeier: { vei: string, grunn: string }[] }[],
 *   utenfor: { opsjon: string, grunn: string, veier: { vei: string, grunn: string }[] }[],
 *   tellinger: { veier: number, tillatteVeier: number, utenforPerGrunn: Record<string, number> },
 * }}
 */
export function grunnlag(resultat) {
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const perOpsjon = new Map();
  const utenforPerGrunn = {};
  let tillatte = 0, alle = 0;
  for (const v of (resultat && resultat.veier) || []) {
    alle++;
    const o = opsjoner.get(v.opsjon);
    const t = tillatt(v, o);
    const p = perOpsjon.get(v.opsjon) || { tillatte: [], utenfor: [] };
    if (t.tillatt) { p.tillatte.push(v.id); tillatte++; }
    else { p.utenfor.push({ vei: v.id, grunn: t.grunn }); utenforPerGrunn[t.grunn] = (utenforPerGrunn[t.grunn] || 0) + 1; }
    perOpsjon.set(v.opsjon, p);
  }
  const kandidater = [], utenfor = [];
  const etterVei = (a, b) => (a.vei < b.vei ? -1 : a.vei > b.vei ? 1 : 0);
  for (const p of perOpsjon.values()) p.utenfor.sort(etterVei);
  for (const o of opsjoner.values()) {
    if (o.type !== 'destination') continue; // bare destinasjoner har veier å søke til
    const p = perOpsjon.get(o.id);
    if (!p) { utenfor.push({ opsjon: o.id, grunn: UTENFOR.ingenVeier, veier: [] }); continue; }
    if (p.tillatte.length) kandidater.push({ opsjon: o.id, veier: p.tillatte.sort(), utenforVeier: p.utenfor });
    else {
      const grunner = [...new Set(p.utenfor.map(x => x.grunn))].sort();
      utenfor.push({ opsjon: o.id, grunn: grunner.join('; '), veier: p.utenfor });
    }
  }
  const etterId = (a, b) => (a.opsjon < b.opsjon ? -1 : a.opsjon > b.opsjon ? 1 : 0);
  return { kandidater: kandidater.sort(etterId), utenfor: utenfor.sort(etterId), tellinger: { veier: alle, tillatteVeier: tillatte, utenforPerGrunn } };
}

/* ------------------------------------------------------------ delsteg 2 */

/** Budsjett for reisesøk per bekreftelse (ett aliasert kall). Startverdi. */
export const BEKREFT_MAKS = 10;
/** Nesten-dublett: samme linjeretning og område, destinasjonene innen så mange meter. Startverdi. */
export const NÆR_DUBLETT_M = 300;

/**
 * Prioriteringsrekkefølgen for bredde — sammenlignes ETTER TUR, aldri summert.
 * Hver dimensjon spør: tilfører kandidaten en ny verdi utover det som alt er valgt?
 */
export const BREDDE = Object.freeze(['område', 'linjeretning', 'destinasjon', 'transportform', 'tilgangspunkt', 'knutepunkt', 'vei']);

/** Dimensjonsverdiene for én tillatt vei — alt hentet fra oppdagelsesresultatet, ingenting gjettet. */
function dimensjoner(vei, opsjon, samleAvQuay) {
  const [quay, modus] = String(vei.tilgang || '').split('|');
  return {
    område: vei.område || null,
    linjeretning: vei.directionId || null,
    destinasjon: vei.opsjon,
    transportform: modus || null,
    tilgangspunkt: samleAvQuay.get(quay) || quay || null,
    knutepunkt: vei.knute || 'direkte',
    vei: vei.id,
  };
}

/**
 * REPRESENTATIV UTVELGELSE til reisesøk: fordeler budsjettet for BREDDE, ikke
 * for hva brukeren vil foretrekke (det er relevansvurderingen, senere).
 *
 * Mottar oppdagelsesresultatet og bruker `grunnlag()` — den ene, autoritative
 * grensen — for å finne tillatte veier. Ingen tillatelsesregler gjentas her.
 *
 * Grådig: hver runde velges den (opsjon, vei) som tilfører nye verdier i
 * BREDDE-rekkefølgen, sammenlignet dimensjon for dimensjon (leksikografisk);
 * likt hele veien → id. Høyst én vei per opsjon (ingen dupliserte opsjoner);
 * opsjonens andre tillatte veier bevares som alternative veier.
 *
 * Nesten-dubletter (samme linjeretning og område som en valgt, destinasjon
 * innen NÆR_DUBLETT_M) utsettes så lenge noe annet gjenstår — de fjernes ikke.
 *
 * Endrer verken resultatet eller grunnlaget. Alt som ikke velges står med grunn.
 */
export function velgRepresentativt(resultat, n = BEKREFT_MAKS) {
  const g = grunnlag(resultat);
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const veier = new Map(((resultat && resultat.veier) || []).map(v => [v.id, v]));
  const samleAvQuay = new Map();
  for (const o of opsjoner.values()) for (const t of o.accessPoints || []) if (t.quayId) samleAvQuay.set(t.quayId, t.parentId || t.stopPlaceId || t.quayId);

  const kand = [];
  for (const k of g.kandidater) for (const id of k.veier) {
    const v = veier.get(id), o = opsjoner.get(k.opsjon);
    if (!v || !o) continue;
    kand.push({ opsjon: k.opsjon, vei: id, d: dimensjoner(v, o, samleAvQuay), sted: (o.destinations || [])[0] || null, nøkkel: `${k.opsjon}#${id}` });
  }
  const sett = Object.fromEntries(BREDDE.map(b => [b, new Set()]));
  const valgt = [], valgteOpsjoner = new Set();
  const nyhet = c => BREDDE.map(b => (c.d[b] != null && !sett[b].has(c.d[b]) ? 1 : 0));
  const nærDublettAv = c => {
    for (const s of valgt) {
      if (s.d.linjeretning !== c.d.linjeretning || s.d.område !== c.d.område) continue;
      if (s.sted && c.sted && Number.isFinite(s.sted.lat) && Number.isFinite(c.sted.lat) && metresBetween(s.sted, c.sted) <= NÆR_DUBLETT_M) return s;
    }
    return null;
  };
  const bedre = (a, b) => { // leksikografisk på nyhet, så nøkkel (id)
    for (let i = 0; i < a.n.length; i++) if (a.n[i] !== b.n[i]) return a.n[i] > b.n[i];
    return a.c.nøkkel < b.c.nøkkel;
  };
  const utsatt = new Map();
  while (valgt.length < n) {
    let best = null, bestDub = null;
    for (const c of kand) {
      if (valgteOpsjoner.has(c.opsjon)) continue;
      const kandidat = { c, n: nyhet(c) };
      const dub = nærDublettAv(c);
      if (dub) { utsatt.set(c.nøkkel, dub); if (!bestDub || bedre(kandidat, bestDub)) bestDub = kandidat; continue; }
      if (!best || bedre(kandidat, best)) best = kandidat;
    }
    const vinner = best || bestDub;
    if (!vinner) break;
    const c = vinner.c;
    valgt.push({ ...c, rekkefølge: valgt.length + 1, nytt: Object.fromEntries(BREDDE.map((b, i) => [b, vinner.n[i] === 1])), nærDublett: !best });
    valgteOpsjoner.add(c.opsjon);
    for (const b of BREDDE) if (c.d[b] != null) sett[b].add(c.d[b]);
  }
  const valgtVei = new Map(valgt.map(v => [v.opsjon, v.vei]));
  const ikkeValgt = [], alternativeVeier = [];
  for (const k of g.kandidater) {
    if (valgtVei.has(k.opsjon)) {
      for (const id of k.veier) if (id !== valgtVei.get(k.opsjon)) alternativeVeier.push({ opsjon: k.opsjon, vei: id, grunn: `samme opsjon undersøkes via vei ${valgtVei.get(k.opsjon)}` });
      continue;
    }
    const dub = k.veier.map(id => utsatt.get(`${k.opsjon}#${id}`)).find(Boolean);
    ikkeValgt.push({ opsjon: k.opsjon, veier: k.veier, grunn: dub ? `budsjett (nær dublett av ${dub.opsjon}, utsatt)` : 'budsjett' });
  }
  return {
    valgt: valgt.map(({ opsjon, vei, d, rekkefølge, nytt, nærDublett }) => ({ opsjon, vei, rekkefølge, dimensjoner: d, nytt, nærDublett })),
    ikkeValgt, alternativeVeier,
    grunnlag: g,
    budsjett: { maks: n, brukt: valgt.length, kandidater: g.kandidater.length },
  };
}
