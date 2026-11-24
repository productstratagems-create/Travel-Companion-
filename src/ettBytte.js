/**
 * ETT BYTTE (eksperiment, docs/auto-tavle-logikk.md «Ett bytte»).
 *
 * Fra nettverksutforskerens resultat (src/nettverksutforsker.js) til én rad per
 * himmelretning: hvilke områder du når med ETT bytte, spredt over så mange
 * retninger som mulig. Ren: ingen DOM, intet nett, ingen relevansscore.
 *
 * Bare veier med to ledd i ordinært søkevindu. Bytter er IKKE tidskontrollert
 * (ledd 2 regnes fra nå) og ikke sjekket mot reisesøket — raden sier det.
 * Lett å rulle tilbake: se src/views/ettBytteVisning.js (ETT_BYTTE).
 */
import { metresBetween } from './haversine.js';

/** Himmelretningene i rekkefølge med klokka, og navnene på skjermen. */
export const RETNINGER = Object.freeze(['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV']);
export const RETNING_NAVN = Object.freeze({ N: 'nord', NØ: 'nordøst', Ø: 'øst', SØ: 'sørøst', S: 'sør', SV: 'sørvest', V: 'vest', NV: 'nordvest' });
/** Høyst så mange eksempelsteder per rad. */
export const EKSEMPLER = 3;

/**
 * STEDSTYPER (forslag 2): hvordan du kommer til stedet, lest fra linja som når
 * det (ut-linjas transportmiddel). Ikke hva stedet ER — et sted toget når, er
 * en togstasjon; en kai båten når, er en kai. Flyplass skilles ikke ut (det
 * ville kreve gjetting på navn). Når flere linjer når samme sted, vinner den
 * første i STEDSTYPE_REKKE: toget sier mer om reisen enn bussen.
 */
export const STEDSTYPE_REKKE = Object.freeze(['rail', 'water', 'metro', 'tram', 'coach', 'bus']);
/** Typene som telles på kortet: de som inviterer til en reise ut. Buss er standarden og telles ikke. */
export const STEDSTYPE_TELLES = Object.freeze({ rail: ['togstasjon', 'togstasjoner'], water: ['kai', 'kaier'] });
export const velgStedstype = moduser => STEDSTYPE_REKKE.find(m => moduser.has(m)) || null;
/** «3 togstasjoner · 1 kai» for et sett punkter med `type`. Tomt når ingen av dem er tog eller båt. */
export function stedstypeTelling(punkter) {
  // «13 tog» leses som avganger; det er steder, så: «13 togstasjoner», «1 kai».
  return Object.entries(STEDSTYPE_TELLES).map(([m, ord]) => [ord, punkter.filter(p => p.type === m).length])
    .filter(([, n]) => n > 0).map(([[en, flere], n]) => n + ' ' + (n === 1 ? en : flere)).join(' · ');
}

/**
 * KOMMUNER, IKKE STOPP (forslag 3). Entur gir kommunen (geocoderens
 * `locality`), ikke tettstedet — derfor «kommuner», sagt rett ut. `kommuneAv`
 * er stopp-id → kommune. Kommunen du står i (`hjemme`) telles ikke: den er
 * ikke en retning ut. Lengst unna først, som punktene.
 * null når for få av stedene har kommune (KOMMUNE_DEKNING): da står stoppene
 * som før, heller enn en telling som later som den er hel.
 */
export const KOMMUNE_DEKNING = 0.8;
export function kommunerI(punkter, kommuneAv, hjemme = null) {
  if (!punkter || !punkter.length || !kommuneAv) return null;
  const med = punkter.filter(p => kommuneAv.get(p.id));
  if (med.length / punkter.length < KOMMUNE_DEKNING) return null;
  const navn = [];
  for (const p of med) { const k = kommuneAv.get(p.id); if (k !== hjemme && !navn.includes(k)) navn.push(k); }
  return navn;
}

/**
 * HVOR OFTE DET GÅR (forslag 4), fra avgangene utforskeren alt har hentet
 * (`grupper.linjeretning[dir].avgangerVed[stopp]`, høyst perLinje per skilt).
 * Medianen av avstanden mellom avgangene, rundet: «ca. hvert 5. min», «ca.
 * hver 2. time». Færre enn to ulike avganger gir ingen tekst.
 */
/** Avganger nærmere enn dette er samme tur (to plattformer ved samme stopp, sett: «hvert minutt» for trikk 17). */
export const SAMME_TUR_MIN = 2;
/** Minutter mellom avgangene (median), eller null med færre enn to ulike avganger. */
export function frekvensMin(tider) {
  const ms = [...new Set((tider || []).map(t => Date.parse(t)).filter(Number.isFinite))].sort((a, b) => a - b);
  const ulike = []; for (const t of ms) if (!ulike.length || t - ulike[ulike.length - 1] >= SAMME_TUR_MIN * 60000) ulike.push(t);
  if (ulike.length < 2) return ulike.length ? Infinity : null;
  const gap = ulike.slice(1).map((t, i) => (t - ulike[i]) / 60000).sort((a, b) => a - b);
  return gap[Math.floor((gap.length - 1) / 2)];
}
/**
 * Lesbart, ikke presist — et anslag fra to–tre avganger, derfor «ca.»: under
 * 10 min eksakt, under 30 til nærmeste 5, under 60 til nærmeste 15, derfra hele
 * timer. Én avgang gir INGEN tekst: med høyst perLinje avganger per skilt sier
 * én avgang ikke at linja går sjelden (sett: buss 74 ved Oslo bussterminal,
 * hvert 10. min, merket «sjelden»).
 */
/** Den oftest gående av et sett frekvenstekster (for «går ofte»-linja på kortet). */
export function oftest(tekster) {
  const min = f => { const n = parseInt(f.replace(/\D/g, ''), 10) || 1; return /time/.test(f) ? 60 * n : n; };
  return (tekster || []).filter(Boolean).sort((a, b) => min(a) - min(b))[0] || null;
}
export function frekvensTekst(minutter) {
  if (minutter == null || minutter === Infinity) return null;
  const m = minutter < 10 ? Math.max(2, Math.round(minutter)) : minutter < 30 ? Math.round(minutter / 5) * 5 : minutter < 52.5 ? Math.round(minutter / 15) * 15 : null;
  if (m != null && m < 60) return 'ca. hvert ' + m + '. min';
  const t = Math.max(1, Math.round(minutter / 60));
  return t === 1 ? 'ca. hver time' : 'ca. hver ' + t + '. time';
}

/**
 * SJEKK DENNE (forslag 5): ett reisesøk for ett sted, oppsummert i radens språk.
 * Mønsteret som er fremme først. «bytt på X» er Enturs bytte; er knutepunktet
 * vårt ikke blant byttene, sies det («Entur foreslår via X») — det er nyttig,
 * ikke en feil. Tidene skrives i norsk tid.
 * @returns {{ utfall: 'funnet'|'annen vei'|'ingen', tekst: string, fremme?: string }}
 */
const klokke = iso => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).replace(':', '.');
export function reiseSammendrag(mønstre, knuteNavn) {
  const m = (mønstre || []).filter(p => p && (p.legs || []).length)
    .sort((a, b) => Date.parse(a.legs[a.legs.length - 1].expectedEndTime) - Date.parse(b.legs[b.legs.length - 1].expectedEndTime))[0];
  if (!m) return { utfall: 'ingen', tekst: 'fant ingen reise nå' };
  const reise = m.legs.filter(l => l.mode !== 'foot');
  const fremme = klokke(m.legs[m.legs.length - 1].expectedEndTime);
  const bytter = reise.slice(0, -1).map(l => l.toPlace && l.toPlace.name).filter(Boolean);
  if (!reise.length) return { utfall: 'funnet', fremme, tekst: 'fremme ' + fremme + ' · til fots' };
  if (!bytter.length) return { utfall: 'funnet', fremme, tekst: 'fremme ' + fremme + ' · uten bytte' };
  const vår = knuteNavn && bytter.includes(knuteNavn);
  return vår
    ? { utfall: 'funnet', fremme, tekst: 'fremme ' + fremme + ' · bytt på ' + bytter.join(' og ') }
    : { utfall: 'annen vei', fremme, tekst: 'fremme ' + fremme + ' · Entur foreslår via ' + bytter.join(' og ') };
}

/**
 * LENGST DU KOMMER (forslag 1): det fjerneste stedet i retningen, med avstand
 * i hele km. `punkter` er sortert lengst unna først (ettByttePerRetning), så
 * det er det første. null uten steder eller posisjon.
 */
export function ytterpunkt(punkter, posisjon) {
  const p = punkter && punkter[0];
  if (!p || !posisjon) return null;
  return { navn: p.navn, lat: p.lat, lon: p.lon, km: Math.round(metresBetween(posisjon, p) / 1000) };
}

const linje = (resultat, dir) => {
  const g = resultat.grupper && resultat.grupper.linjeretning && resultat.grupper.linjeretning[dir];
  return g ? { kode: g.kode || '?', modus: g.modus || null } : { kode: '?', modus: null };
};
/**
 * Hvor ofte linja går: hver linjeretning (skilt) for seg, ved `stopp` (ut, ved
 * knutepunktet) eller ved hvert tilgangsstopp (inn). Tider fra to skilt eller
 * to stopp er ikke en frekvens. Den som går oftest, vinner.
 */
function frekvensVed(resultat, dirs, stopp) {
  const lr = (resultat.grupper && resultat.grupper.linjeretning) || {};
  const kandidater = [];
  for (const d of dirs) for (const [sp, t] of Object.entries((lr[d] && lr[d].avgangerVed) || {})) if (!stopp || sp === stopp) kandidater.push(frekvensMin(t));
  const best = kandidater.filter(m => m != null).sort((a, b) => a - b)[0];
  return frekvensTekst(best == null ? null : best);
}
const linjeTekst = l => `${l.modus === 'metro' ? 'T-bane ' : l.modus === 'tram' ? 'trikk ' : l.modus === 'rail' ? 'tog ' : l.modus === 'water' ? 'båt ' : ''}${l.kode}`;

/**
 * Rader per himmelretning. Per retning velges ETT knutepunkt: det som når flest
 * ulike områder i den retningen (så flest destinasjoner, så id). Linjene inn og
 * ut slås sammen per linje, så plattform- og skiltvarianter blir ett valg.
 * @returns {{ rader: object[], ingen: boolean, grunnlag: string }}
 */
export function ettByttePerRetning(resultat, posisjon) {
  const linjeId = dir => (typeof dir === 'string' ? dir.slice(0, dir.indexOf('>')) : null);
  // Et bytte er å skifte linje: samme linje inn og ut (FB10 videre som FB10) er å bli sittende.
  const veier = ((resultat && resultat.veier) || []).filter(v => v.ledd === 2 && v.vindu === 'ordinært' && v.knute && v.inn
    && typeof v.område === 'string' && linjeId(v.inn) !== linjeId(v.directionId));
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const knNavn = new Map((((resultat && resultat.knutepunkter) || {}).vurdert || []).map(k => [k.id, k.navn]));
  const per = new Map(); // sektor → knute → { områder, dest, inn, ut }
  for (const v of veier) {
    const sektor = v.område.split('|')[0];
    if (!RETNINGER.includes(sektor)) continue; // sentrum («•») er ingen retning
    const s = per.get(sektor) || per.set(sektor, new Map()).get(sektor);
    const g = s.get(v.knute) || s.set(v.knute, { områder: new Set(), dest: new Set(), inn: new Map(), ut: new Map(), moduser: new Map(), innDir: new Map(), utDir: new Map() }).get(v.knute);
    g.områder.add(v.område); g.dest.add(v.opsjon);
    const li = linje(resultat, v.inn), lu = linje(resultat, v.directionId);
    (g.moduser.get(v.opsjon) || g.moduser.set(v.opsjon, new Set()).get(v.opsjon)).add(lu.modus);
    g.inn.set(li.kode + '|' + li.modus, li); g.ut.set(lu.kode + '|' + lu.modus, lu);
    (g.innDir.get(linjeTekst(li)) || g.innDir.set(linjeTekst(li), new Set()).get(linjeTekst(li))).add(v.inn);
    (g.utDir.get(linjeTekst(lu)) || g.utDir.set(linjeTekst(lu), new Set()).get(linjeTekst(lu))).add(v.directionId);
  }
  const rader = [];
  for (const sektor of RETNINGER) {
    const s = per.get(sektor);
    if (!s) continue;
    const [knute, g] = [...s.entries()].sort(([ka, a], [kb, b]) => b.områder.size - a.områder.size || b.dest.size - a.dest.size || (ka < kb ? -1 : 1))[0];
    const steder = [...g.dest].map(id => opsjoner.get(id)).filter(o => o && o.destinations && o.destinations[0])
      .map(o => ({ id: o.destinations[0].id, type: velgStedstype(g.moduser.get(o.id) || new Set()), navn: o.label || o.destinations[0].name, lat: o.destinations[0].lat, lon: o.destinations[0].lon, m: posisjon ? metresBetween(posisjon, o.destinations[0]) : 0 }))
      .sort((a, b) => b.m - a.m || (a.navn < b.navn ? -1 : 1));
    const navn = []; for (const x of steder) if (navn.length < EKSEMPLER && !navn.includes(x.navn)) navn.push(x.navn);
    // Knutepunktet er selv et sted ledd 1 når; koordinatene står der. Mangler de, tegnes ingen knute.
    const ko = opsjoner.get('destination:' + knute), kd = ko && ko.destinations && ko.destinations[0];
    const punkter = steder.filter(x => Number.isFinite(x.lat)).map(({ id, navn: n, lat, lon, type }) => ({ id, navn: n, lat, lon, type }));
    rader.push({
      retning: sektor, retningNavn: RETNING_NAVN[sektor], knute, knuteNavn: knNavn.get(knute) || knute,
      inn: [...g.inn.values()].map(linjeTekst).sort(), ut: [...g.ut.values()].map(linjeTekst).sort(),
      eksempler: navn, antallSteder: g.dest.size, sjekket: false,
      // For kartet (src/views/ettBytteVisning.js): knutepunktet og stedene, lengst unna først.
      knuteLL: kd && Number.isFinite(kd.lat) ? { lat: kd.lat, lon: kd.lon } : null,
      punkter,
      ytterpunkt: ytterpunkt(punkter, posisjon),
      typer: stedstypeTelling(punkter),
      // Hvor ofte (forslag 4): ut-linjene ved knutepunktet, inn-linjene ved stoppet du går til.
      frekvens: {
        inn: Object.fromEntries([...g.innDir].map(([t, dirs]) => [t, frekvensVed(resultat, dirs, null)]).filter(([, f]) => f)),
        ut: Object.fromEntries([...g.utDir].map(([t, dirs]) => [t, frekvensVed(resultat, dirs, knute)]).filter(([, f]) => f)),
      },
    });
  }
  return { rader, ingen: rader.length === 0, grunnlag: 'mulig med ett bytte — ikke sjekket mot reisesøket, og byttet er ikke tidskontrollert' };
}
