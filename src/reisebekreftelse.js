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
 * Delsteg 3: sammenligning av oppdaget vei mot faktisk reise (`veibekreftelse`).
 * Delsteg 4: reisesøket (`bekreft`) — opsjonsbekreftelse og veibekreftelse adskilt.
 */
import { metresBetween } from './haversine.js';
import { tripGQL } from './api/queries.js';

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

/**
 * Plattform (quay) → samlestopp (StopPlace-ID), fra opsjonenes tilgangspunkter.
 * Én definisjon, brukt av utvelgelsen og sammenligningen. Plattformnøkkelen i
 * `vei.tilgang` er aldri selv en StopPlace-ID.
 */
export function samlestoppAvPlattform(resultat) {
  const m = new Map();
  for (const o of (resultat && resultat.opsjoner) || []) for (const t of o.accessPoints || []) if (t.quayId && (t.parentId || t.stopPlaceId)) m.set(t.quayId, t.parentId || t.stopPlaceId);
  return m;
}

/* ------------------------------------------------------------ delsteg 2 */

/** Budsjett for reisesøk per bekreftelse (ett aliasert kall). Startverdi. */
export const BEKREFT_MAKS = 10;
/** Nesten-dublett: destinasjonene innen så mange meter (sammen med vilkårene i NÆR_DUBLETT_REGEL). Startverdi. */
export const NÆR_DUBLETT_M = 300;
/**
 * NESTEN-DUBLETT (4d delsteg 2.1): en vei er nesten-dublett av en valgt vei
 * bare når ALLE vilkår holder — samme linjeretning, samme område, samme
 * tilgangspunkt (samlestopp-/StopPlace-ID, ikke plattform) og destinasjoner
 * innen NÆR_DUBLETT_M. En vei fra et annet tilgangspunkt er aldri dublett:
 * alternative tilgangspunkter er nettopp mangfoldet utforskningen skal bevare.
 */
export const NÆR_DUBLETT_REGEL = 'samme linjeretning, område og tilgangspunkt (samlestopp); destinasjon innen 300 m';

/**
 * Prioriteringsrekkefølgen for bredde — sammenlignes ETTER TUR, aldri summert.
 * Hver dimensjon spør: tilfører kandidaten en ny verdi utover det som alt er valgt?
 */
export const BREDDE = Object.freeze(['område', 'linjeretning', 'transportform', 'tilgangspunkt', 'knutepunkt', 'avstandsbånd']);
/*
 * IDENTITET ER IKKE DEKNING (4d delsteg 2.2 og 2.3). En dimensjon som alltid er
 * unik for kandidaten, sier ingenting om nettverket — den gjør bare hver
 * kandidat «ny», og utvelgelsen faller da i realiteten tilbake på identitet.
 *   vei-ID       unik per vei                                       (ut i 2.2)
 *   destinasjon  = opsjonens ID; én kandidat per opsjon, valgte      (ut i 2.3)
 *                opsjoner hoppes over → alltid ny (målt: alle ti
 *                kjøringer i docs/trinn-4-implementeringsplan.md)
 * Begge bevares i `dimensjoner` og i svaret, for identitet og sporbarhet.
 * BREDDE inneholder bare dimensjoner som kan uttrykke ny dekning.
 */

/**
 * AVSTANDSBÅND (4d delsteg 2.2): geografisk rekkevidde fra brukerens
 * utgangspunkt (`opsjon.origin`) til destinasjonen, i LUFTLINJE — det finnes
 * ingen reisetid før reisesøket. Doblingsbånd fra 0,5 km: én stabil regel som
 * gjelder fra bygd til storby, og grensene faller ikke sammen med områdebåndene
 * (5/15/50/150 km), så de skiller rekkevidder innenfor et område. Beskrivende
 * dekning — ikke en preferanse for korte eller lange reiser. Startverdi.
 */
export const AVSTANDSBÅND_KM = Object.freeze([0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]);
const km = x => String(x).replace('.', ',');
/** Båndet for en avstand fra `origin` til `sted`; ukjent → null (aldri et eget bånd). */
export function avstandsbånd(origin, sted) {
  if (!origin || !sted || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lon) || !Number.isFinite(sted.lat) || !Number.isFinite(sted.lon)) return null;
  const d = metresBetween(origin, sted) / 1000;
  if (!Number.isFinite(d)) return null;
  const i = AVSTANDSBÅND_KM.findIndex(g => d < g);
  if (i < 0) return `${km(AVSTANDSBÅND_KM[AVSTANDSBÅND_KM.length - 1])}+`;
  return i === 0 ? `<${km(AVSTANDSBÅND_KM[0])}` : `${km(AVSTANDSBÅND_KM[i - 1])}–${km(AVSTANDSBÅND_KM[i])}`;
}

/** Dimensjonsverdiene for én tillatt vei — alt hentet fra oppdagelsesresultatet, ingenting gjettet. */
function dimensjoner(vei, opsjon, samleAvQuay) {
  const [quay, modus] = String(vei.tilgang || '').split('|');
  return {
    område: vei.område || null,
    linjeretning: vei.directionId || null,
    destinasjon: vei.opsjon, // identitet, ikke i BREDDE (2.3)
    transportform: modus || null,
    // Samlestopp (StopPlace-ID fra opsjonens accessPoints.parentId), aldri plattformnøkkelen:
    // ulike plattformer ved samme StopPlace er samme tilgangspunkt. Ukjent → null (kan ikke likestilles).
    tilgangspunkt: samleAvQuay.get(quay) || null,
    knutepunkt: vei.knute || 'direkte',
    avstandsbånd: avstandsbånd(opsjon.origin, (opsjon.destinations || [])[0]),
    vei: vei.id, // identitet, ikke i BREDDE
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
 * Nesten-dubletter (NÆR_DUBLETT_REGEL, vurdert per vei) utsettes så lenge noe
 * annet gjenstår — de fjernes ikke, og står i `utsatteVeier`.
 *
 * Endrer verken resultatet eller grunnlaget. Alt som ikke velges står med grunn.
 */
export function velgRepresentativt(resultat, n = BEKREFT_MAKS) {
  const g = grunnlag(resultat);
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const veier = new Map(((resultat && resultat.veier) || []).map(v => [v.id, v]));
  const samleAvQuay = samlestoppAvPlattform(resultat);

  const kand = [];
  for (const k of g.kandidater) for (const id of k.veier) {
    const v = veier.get(id), o = opsjoner.get(k.opsjon);
    if (!v || !o) continue;
    kand.push({ opsjon: k.opsjon, vei: id, d: dimensjoner(v, o, samleAvQuay), sted: (o.destinations || [])[0] || null, nøkkel: `${k.opsjon}#${id}` });
  }
  const sett = Object.fromEntries(BREDDE.map(b => [b, new Set()]));
  const valgt = [], valgteOpsjoner = new Set();
  const nyhet = c => BREDDE.map(b => (c.d[b] != null && !sett[b].has(c.d[b]) ? 1 : 0));
  /** Per vei: gir sammenligningen som gjør veien til nesten-dublett, eller null. */
  const nærDublettAv = c => {
    for (const s of valgt) {
      if (s.d.linjeretning !== c.d.linjeretning || s.d.område !== c.d.område) continue;
      if (c.d.tilgangspunkt == null || s.d.tilgangspunkt !== c.d.tilgangspunkt) continue;
      if (!(s.sted && c.sted && Number.isFinite(s.sted.lat) && Number.isFinite(c.sted.lat))) continue;
      const m = metresBetween(s.sted, c.sted);
      if (m <= NÆR_DUBLETT_M) return { vei: c.vei, opsjon: c.opsjon, sammenlignetMed: { vei: s.vei, opsjon: s.opsjon }, tilgangspunkt: c.d.tilgangspunkt, avstandM: Math.round(m), regel: NÆR_DUBLETT_REGEL };
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
      if (dub) { if (!utsatt.has(c.nøkkel)) utsatt.set(c.nøkkel, dub); if (!bestDub || bedre(kandidat, bestDub)) bestDub = kandidat; continue; }
      if (!best || bedre(kandidat, best)) best = kandidat;
    }
    const vinner = best || bestDub;
    if (!vinner) break;
    const c = vinner.c;
    valgt.push({ ...c, rekkefølge: valgt.length + 1, nytt: Object.fromEntries(BREDDE.map((b, i) => [b, vinner.n[i] === 1])), nærDublett: !best, ...(!best ? { dublettAv: utsatt.get(c.nøkkel) } : {}) });
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
    // «utsatt som dublett» bare når HVER vei til opsjonen var dublett; ellers tapte den på budsjett.
    const dubs = k.veier.map(id => utsatt.get(`${k.opsjon}#${id}`));
    const dub = dubs.every(Boolean) ? dubs[0] : null;
    ikkeValgt.push({ opsjon: k.opsjon, veier: k.veier, grunn: dub ? `budsjett (nær dublett av ${dub.sammenlignetMed.opsjon}, utsatt)` : 'budsjett' });
  }
  return {
    valgt: valgt.map(({ opsjon, vei, d, rekkefølge, nytt, nærDublett, dublettAv }) => ({ opsjon, vei, rekkefølge, dimensjoner: d, nytt, nærDublett, ...(dublettAv ? { dublettAv } : {}) })),
    ikkeValgt, alternativeVeier,
    // Sporbarhet: hver vei som ble utsatt som nesten-dublett, med hva den ble sammenlignet med og hvorfor.
    utsatteVeier: [...utsatt.values()].sort((a, b) => (a.vei < b.vei ? -1 : a.vei > b.vei ? 1 : 0)),
    grunnlag: g,
    budsjett: { maks: n, brukt: valgt.length, kandidater: g.kandidater.length },
  };
}

/* ------------------------------------------------------------ delsteg 3 */
/*
 * SAMMENLIGNING AV OPPDAGET VEI MOT FAKTISK REISE. Ren funksjon; ingen reisesøk.
 * Tre nivåer holdes adskilt i svaret:
 *   funnet     den oppdagede veien og dens signatur (hva vi fant)
 *   undersøkt  hvilke mønstre og etapper som ble sammenlignet, med verdier (hva vi undersøkte)
 *   påstand    utfallet med begrunnelse (hva undersøkelsen gir grunnlag for å hevde)
 * Treverdilogikk per sjekk: true = samsvar dokumentert, false = motstrid
 * dokumentert, null = utilstrekkelige data. «fulgt» krever at ALLE nødvendige
 * sjekker er true; manglende data blir aldri samsvar. Samme destinasjon er
 * ikke bevis på samme vei. Opsjonsbekreftelse hører til reisesøket, ikke hit.
 */

const linjeAv = dir => (typeof dir === 'string' && dir.includes('>') ? dir.slice(0, dir.indexOf('>')) || null : null);
const retningAv = dir => (typeof dir === 'string' && dir.includes('>') ? dir.slice(dir.indexOf('>') + 1) || null : null);

/** FUNNET: den oppdagede veiens etapper på samlestoppnivå. Ukjent → null + `mangler`. */
export function oppdagetSignatur(vei, resultat) {
  const opsjon = ((resultat && resultat.opsjoner) || []).find(o => o.id === (vei && vei.opsjon));
  const mangler = [];
  const quay = vei && typeof vei.tilgang === 'string' ? vei.tilgang.split('|')[0] : null;
  const tilgang = (quay && samlestoppAvPlattform(resultat).get(quay)) || null;
  if (!tilgang) mangler.push('tilgangens samlestopp (plattformen finnes ikke i opsjonens tilgangspunkter)');
  const dest = (opsjon && opsjon.destinations && opsjon.destinations[0] && opsjon.destinations[0].id) || null;
  if (!dest) mangler.push('destinasjonens samlestopp');
  const etapper = [];
  if (vei && vei.ledd === 1 && vei.knute == null && vei.inn == null) {
    etapper.push({ linje: linjeAv(vei.directionId), retning: retningAv(vei.directionId), påstigning: tilgang, avstigning: dest });
  } else if (vei && vei.ledd === 2 && vei.knute && vei.inn) {
    etapper.push({ linje: linjeAv(vei.inn), retning: retningAv(vei.inn), påstigning: tilgang, avstigning: vei.knute });
    etapper.push({ linje: linjeAv(vei.directionId), retning: retningAv(vei.directionId), påstigning: vei.knute, avstigning: dest });
  } else mangler.push('ukjent leddtype');
  etapper.forEach((e, i) => { if (!e.linje) mangler.push(`linje-ID i etappe ${i + 1}`); });
  return { opsjon: vei ? vei.opsjon : null, vei: vei ? vei.id : null, etapper, knuter: vei && vei.knute ? [vei.knute] : [], mangler };
}

const stedAvPlass = p => {
  const sp = p && p.quay && p.quay.stopPlace;
  if (!sp || !sp.id) return { id: null, parent: undefined };
  // parent: undefined = ikke spurt; null = stoppet har ingen parent; ellers id.
  return { id: sp.id, parent: !('parent' in sp) ? undefined : (sp.parent && sp.parent.id) || null };
};

/** Det faktiske mønsterets kollektivetapper (gange hoppes over). */
export function faktiskSignatur(mønster) {
  const legs = ((mønster && mønster.legs) || []).filter(l => l && l.mode !== 'foot');
  const mangler = [];
  const etapper = legs.map((l, i) => {
    const linje = (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.id) || (l.line && l.line.id) || null;
    if (!linje) mangler.push(`linje-ID i etappe ${i + 1}`);
    const e = { linje, retning: (l.fromEstimatedCall && l.fromEstimatedCall.destinationDisplay && l.fromEstimatedCall.destinationDisplay.frontText) || null, påstigning: stedAvPlass(l.fromPlace), avstigning: stedAvPlass(l.toPlace) };
    if (!e.påstigning.id) mangler.push(`påstigningens StopPlace-ID i etappe ${i + 1}`);
    if (!e.avstigning.id) mangler.push(`avstigningens StopPlace-ID i etappe ${i + 1}`);
    return e;
  });
  return { etapper, mangler };
}

/**
 * Samme samlestopp? true/false/null. Samsvar når det oppdagede samlestoppet er
 * stoppet selv eller dets parent (plattformer og understopp under samme
 * StopPlace er samme sted). Motstrid bare når parent er KJENT. Er parent ikke
 * spurt og id-ene ulike, kan stoppet være et understopp: null, ikke false.
 */
export function sammeStopp(oppdaget, faktisk) {
  if (!oppdaget || !faktisk || !faktisk.id) return null;
  if (faktisk.id === oppdaget || (faktisk.parent && faktisk.parent === oppdaget)) return true;
  if (faktisk.parent === undefined) return null;
  return false;
}
const sammeVerdi = (a, b) => (a == null || b == null ? null : a === b);

/** UNDERSØKT for ett mønster: alle sjekker med verdier, og utfallet for mønsteret. */
export function sammenlign(oppdaget, mønster, indeks = 0) {
  const f = faktiskSignatur(mønster);
  const sjekker = [];
  const sjekk = (etappe, felt, o, fa, samsvar, nødvendig = true) => sjekker.push({ etappe, felt, oppdaget: o, faktisk: fa, samsvar, nødvendig });
  const nO = oppdaget.etapper.length, nF = f.etapper.length;
  sjekk(null, 'antall kollektivetapper', nO, nF, nO && nF ? nO === nF : null);
  if (nO && nF && nO === nF) {
    oppdaget.etapper.forEach((e, i) => {
      const a = f.etapper[i];
      sjekk(i + 1, 'linje-ID', e.linje, a.linje, sammeVerdi(e.linje, a.linje));
      sjekk(i + 1, 'påstigning (samlestopp)', e.påstigning, a.påstigning, sammeStopp(e.påstigning, a.påstigning));
      sjekk(i + 1, 'avstigning (samlestopp)', e.avstigning, a.avstigning, sammeStopp(e.avstigning, a.avstigning));
      if (i > 0) { // overgangen: forrige avstigning og denne påstigningen er begge knutepunktet
        const knute = oppdaget.etapper[i - 1].avstigning;
        const av = sammeStopp(knute, f.etapper[i - 1].avstigning), på = sammeStopp(knute, a.påstigning);
        sjekk(i + 1, 'overgang ved knutepunkt', knute, { avstigning: f.etapper[i - 1].avstigning, påstigning: a.påstigning }, av === false || på === false ? false : av === true && på === true ? true : null);
      }
      sjekk(i + 1, 'retning (supplerende)', e.retning, a.retning, sammeVerdi(e.retning, a.retning), false);
    });
  }
  const nødvendige = sjekker.filter(x => x.nødvendig);
  const utfall = nødvendige.some(x => x.samsvar === false) ? 'ikke fulgt'
    : nødvendige.length && nødvendige.every(x => x.samsvar === true) ? 'fulgt' : 'ukjent';
  const merknader = sjekker.filter(x => !x.nødvendig && x.samsvar === false).map(x => `retningstekst avviker i etappe ${x.etappe} (supplerende; påvirker ikke utfallet)`);
  const begrunnelse = utfall === 'fulgt' ? 'alle nødvendige sjekker har dokumentert samsvar'
    : utfall === 'ikke fulgt' ? `motstrid: ${nødvendige.filter(x => x.samsvar === false).map(x => (x.etappe ? `etappe ${x.etappe} ${x.felt}` : x.felt)).join(', ')}`
    : `utilstrekkelige data: ${nødvendige.filter(x => x.samsvar === null).map(x => (x.etappe ? `etappe ${x.etappe} ${x.felt}` : x.felt)).join(', ')}`;
  return { mønster: indeks, sjekker, utfall, begrunnelse, merknader, mangler: f.mangler };
}

/**
 * VEIBEKREFTELSE: sammenligner én oppdaget vei med de undersøkte mønstrene.
 * Svaret skiller funnet / undersøkt / påstand. «ikke fulgt» gjelder bare de
 * undersøkte mønstrene — veien er ikke dermed umulig, og opsjonen finnes.
 */
export function veibekreftelse(vei, resultat, mønstre) {
  const funnet = oppdagetSignatur(vei, resultat);
  const liste = Array.isArray(mønstre) ? mønstre : [];
  const per = liste.map((m, i) => sammenlign(funnet, m, i));
  let påstand;
  const fulgt = per.find(x => x.utfall === 'fulgt');
  if (!liste.length) påstand = { utfall: 'ukjent', mønster: null, begrunnelse: 'ingen mønstre å sammenligne' };
  else if (fulgt) påstand = { utfall: 'fulgt', mønster: fulgt.mønster, begrunnelse: `mønster ${fulgt.mønster} følger den oppdagede veien: ${fulgt.begrunnelse}` };
  else if (per.every(x => x.utfall === 'ikke fulgt')) påstand = { utfall: 'ikke fulgt', mønster: null, begrunnelse: `ikke fulgt i de ${per.length} undersøkte mønstrene — det betyr ikke at veien er umulig eller ikke finnes` };
  else påstand = { utfall: 'ukjent', mønster: null, begrunnelse: `ingen av de ${per.length} mønstrene kunne fastslås som fulgt; minst ett mangler data til en sikker sammenligning` };
  return {
    opsjon: funnet.opsjon, vei: funnet.vei,
    funnet,
    undersøkt: { antallMønstre: liste.length, mønstre: per },
    påstand,
  };
}

/* ------------------------------------------------------------ delsteg 4 */
/*
 * REISESØKET. Kobler utvalget (delsteg 2) til faktiske reisemønstre og fører dem
 * til den rene sammenligningen (delsteg 3). To svar per kandidat, aldri slått sammen:
 *   opsjonsbekreftelse  fant reisesøket en reise til opsjonens destinasjon for tidspunktet?
 *                       (kontrakten i src/opsjonsmodell.js: state, request, searchedAt, firstDeparture)
 *   veibekreftelse      følger reisen den konkrete oppdagede veien? (veibekreftelse(), uendret)
 * Ett aliasert kall. Nettet injiseres (`hent`); opptak spilles av i testene.
 */

/** Høyst så mange reisemønstre undersøkes per kandidat (4d-planen). */
export const BEKREFT_MØNSTRE = 3;
/** Navnet på kallet (opptak og telling). */
export const REISESØK = 'reisesøk';
const JP = 'https://api.entur.io/journey-planner/v3/graphql';

/**
 * PARENT SOM PROBE. tripGQL spør `quay{id stopPlace{id}}`; samlestoppet krever
 * `parent`. Legges til i bekreftelsens egen spørring — tripGQL er uendret.
 * Avvises feltet, spørres det uten (reserven): parent blir da `undefined`
 * («ikke spurt»), og sammenligningen gir null der ID-ene ikke er like.
 */
export function medParent(q, på = true) {
  return på ? q.split('quay{id stopPlace{id}}').join('quay{id stopPlace{id parent{id}}}') : q;
}

/** Én kandidats reisesøk, som alias. Fra posisjonen (gangdelen inngår), uten fly. */
export function reisesøkGql(posisjon, destinasjon, tid, alias) {
  const q = tripGQL({ lat: posisjon.lat, lon: posisjon.lon }, destinasjon, null, BEKREFT_MØNSTRE, 1.3, +new Date(tid), true, true, true, false, false, false, false, true);
  return alias + ': ' + q.trim().replace(/^\{\s*/, '').replace(/\}\s*$/, '');
}

const førsteAvgang = mønstre => mønstre.map(p => ((p.legs || []).find(l => l && l.mode !== 'foot') || (p.legs || [])[0] || {}).expectedStartTime).filter(t => typeof t === 'string').sort()[0] || null;

/** Hva vår egen mekanisme har kontrollert av tid for en vei med flere ledd. */
export const TIDSKOBLING_IKKE_KONTROLLERT = 'ikke kontrollert av oss — strukturelt samsvar med et mønster Entur returnerte; overgangen er ikke tidskontrollert av reisebekreftelsen';

/**
 * Strukturell sammenligning av én ØVRIG oppdaget vei mot mønstrene som alt er
 * hentet for opsjonen. Bruker veibekreftelse() uendret. Påstår ingen
 * tidsmessig verifisering: for flere ledd står `tidskobling` eksplisitt som
 * ikke kontrollert. `grense` viser hvorfor veien ikke selv var kandidat.
 */
function strukturellVei(v, resultat, mønstre, ob) {
  const vb = veibekreftelse(v, resultat, mønstre);
  if (!mønstre.length) vb.påstand = { utfall: 'ukjent', mønster: null, begrunnelse: `ingen mønstre å sammenligne (${ob.grunn})` };
  const t = tillatt(v, null);
  return {
    vei: v.id, ledd: v.ledd, vindu: v.vindu,
    grense: t.tillatt ? 'tillatt (ikke valgt: samme opsjon undersøkes via en annen vei)' : t.grunn,
    tidskobling: v.ledd === 1 ? 'ikke relevant (én etappe)' : TIDSKOBLING_IKKE_KONTROLLERT,
    veibekreftelse: vb,
  };
}

/**
 * Reisesøk for de valgte kandidatene. `utvalg` er svaret fra velgRepresentativt.
 * Endrer ikke `resultat`. Feil og tomme svar gir `unknown` med grunn — aldri
 * `not_feasible`, og aldri «fulgt».
 */
export async function bekreft(utvalg, resultat, ktx, { hent, klokke = () => Date.now() }) {
  const valgt = (utvalg && utvalg.valgt) || [];
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const veier = new Map(((resultat && resultat.veier) || []).map(v => [v.id, v]));
  const pos = ktx.posisjon, tid = new Date(ktx.tid).toISOString();
  const t0 = klokke(), kall = [], notater = [];
  const rapport = { kall: 0, ms: 0, parent: 'ikke spurt', opsjon: {}, vei: {} };
  if (!valgt.length) return { bekreftelser: [], rapport: { ...rapport, ms: 0 }, notater };

  const mål = valgt.map(v => ({ ...v, dest: (((opsjoner.get(v.opsjon) || {}).destinations || [])[0] || {}).id || null }));
  const spørring = medP => '{' + mål.map((m, i) => (m.dest ? (medP ? medParent : x => x)(reisesøkGql(pos, m.dest, tid, 't' + i)) : '')).filter(Boolean).join(' ') + '}';
  const spør = async (navn, q) => {
    try { const j = await hent(navn, { url: JP, method: 'POST', body: JSON.stringify({ query: q }) }); kall.push({ navn, feil: (j && j.errors || []).map(e => e.message).slice(0, 2) }); return j; }
    catch (e) { kall.push({ navn, feil: [String(e && e.message || e)] }); return null; }
  };
  let j = await spør(REISESØK, spørring(true));
  rapport.parent = 'spurt';
  if (j && j.errors && !j.data && JSON.stringify(j.errors).includes('parent')) {
    notater.push('stopPlace.parent avvist i reisesøket — reserve uten parent; understopp med annen ID gir «ukjent»');
    rapport.parent = 'avvist (reserve)';
    j = await spør(REISESØK + ' uten parent', spørring(false));
  }
  const searchedAt = new Date(klokke()).toISOString();
  const veierPerOpsjon = new Map();
  for (const v of (resultat && resultat.veier) || []) (veierPerOpsjon.get(v.opsjon) || veierPerOpsjon.set(v.opsjon, []).get(v.opsjon)).push(v);
  for (const l of veierPerOpsjon.values()) l.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const bekreftelser = mål.map((m, i) => {
    const request = { from: { lat: pos.lat, lon: pos.lon }, to: m.dest, modes: 'som tavla (uten fly)', travelTime: tid, mønstre: BEKREFT_MØNSTRE };
    const base = { state: 'unknown', request, searchedAt, vei: m.vei };
    let ob, mønstre = [];
    if (!m.dest) ob = { ...base, grunn: 'destinasjonen mangler samlestopp-ID' };
    else if (!j) ob = { ...base, grunn: 'reisesøket svarte ikke' };
    else {
      const t = j.data && j.data['t' + i];
      if (!t) ob = { ...base, grunn: j.errors ? `feil i svaret: ${j.errors.map(e => e.message)[0]}` : 'mangler i svaret' };
      else {
        mønstre = (t.tripPatterns || []).slice(0, BEKREFT_MØNSTRE);
        ob = mønstre.length
          ? { ...base, state: 'confirmed', firstDeparture: førsteAvgang(mønstre), antallMønstre: mønstre.length }
          : { ...base, grunn: 'ingen reise i søket (ikke bevis for at ingen finnes)' };
      }
    }
    const vb = veibekreftelse(veier.get(m.vei) || { id: m.vei, opsjon: m.opsjon }, resultat, mønstre);
    if (!mønstre.length) vb.påstand = { utfall: 'ukjent', mønster: null, begrunnelse: `ingen mønstre å sammenligne (${ob.grunn})` };
    // ALTERNATIV B: de SAMME returnerte mønstrene sammenlignes strukturelt også mot opsjonens
    // øvrige oppdagede veier — også flerleddsveier, som grensen holder utenfor KANDIDATENE.
    // Ingen nye kall; grensen og utvelgelsen er uendret.
    const øvrige = (veierPerOpsjon.get(m.opsjon) || []).filter(v => v.id !== m.vei).map(v => strukturellVei(v, resultat, mønstre, ob));
    return { opsjon: m.opsjon, vei: m.vei, opsjonsbekreftelse: ob, veibekreftelse: vb, øvrigeVeier: øvrige };
  });
  for (const b of bekreftelser) {
    rapport.opsjon[b.opsjonsbekreftelse.state] = (rapport.opsjon[b.opsjonsbekreftelse.state] || 0) + 1;
    rapport.vei[b.veibekreftelse.påstand.utfall] = (rapport.vei[b.veibekreftelse.påstand.utfall] || 0) + 1;
  }
  const øv = bekreftelser.flatMap(b => b.øvrigeVeier);
  rapport.strukturelt = {
    sammenlignet: øv.length, flerledd: øv.filter(x => x.ledd === 2).length,
    fulgt: øv.filter(x => x.veibekreftelse.påstand.utfall === 'fulgt').length,
    flerleddFulgt: øv.filter(x => x.ledd === 2 && x.veibekreftelse.påstand.utfall === 'fulgt').length,
    ikkeFulgt: øv.filter(x => x.veibekreftelse.påstand.utfall === 'ikke fulgt').length,
    ukjent: øv.filter(x => x.veibekreftelse.påstand.utfall === 'ukjent').length,
  };
  rapport.kall = kall.length; rapport.ms = klokke() - t0; rapport.feiledeKall = kall.filter(k => k.feil.length).map(k => `${k.navn}: ${k.feil.join(' | ')}`);
  return { bekreftelser, rapport, notater };
}
