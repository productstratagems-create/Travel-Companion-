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
 */

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
