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
/** En reiseetappes linje i kortenes skrivemåte (som linjeTekst): «T-bane 3», «tog R14», «300». */
const etappeLinje = l => {
  const k = (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || (l.line && l.line.publicCode) || '?';
  return (l.mode === 'metro' ? 'T-bane ' : l.mode === 'tram' ? 'trikk ' : l.mode === 'rail' ? 'tog ' : l.mode === 'water' ? 'båt ' : '') + k;
};
const klokke = iso => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' }).replace(':', '.');
export function reiseSammendrag(mønstre, knuteNavn, knuteNavnene = null, linjepar = null) {
  const m = (mønstre || []).filter(p => p && (p.legs || []).length)
    .sort((a, b) => Date.parse(a.legs[a.legs.length - 1].expectedEndTime) - Date.parse(b.legs[b.legs.length - 1].expectedEndTime))[0];
  if (!m) return { utfall: 'ingen', tekst: 'fant ingen reise nå' };
  const reise = m.legs.filter(l => l.mode !== 'foot');
  const fremme = klokke(m.legs[m.legs.length - 1].expectedEndTime);
  const bytter = reise.slice(0, -1).map(l => l.toPlace && l.toPlace.name).filter(Boolean);
  if (!reise.length) return { utfall: 'funnet', fremme, tekst: 'fremme ' + fremme + ' · til fots' };
  if (!bytter.length) return { utfall: 'funnet', fremme, tekst: 'fremme ' + fremme + ' · uten bytte' };
  // Våre knutepunkt: kortets (i fasettene kan et kort ha flere).
  const våre = new Set([knuteNavn, ...(knuteNavnene || [])].filter(Boolean));
  const vår = bytter.some(b => våre.has(b));
  // Linjeparet (ett bytte): er Enturs to linjer et par kortet har observert på det byttestedet?
  // Observert kombinasjon ≠ bekreftet reise; dette er stedet der de to møtes.
  if (vår && linjepar && reise.length === 2) {
    const [a, b] = reise.map(etappeLinje), bytte = bytter[0];
    const samme = linjepar.some(p => p.inn === a && p.ut === b && p.knuteNavn === bytte);
    return { utfall: 'funnet', linjer: samme ? 'samme' : 'andre', fremme,
      tekst: 'fremme ' + fremme + ' · bytt på ' + bytte + (samme ? ' · samme linjer som kortet' : ', med andre linjer (' + a + ' → ' + b + ')') };
  }
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
 * SE ETTER (fasetter): de samme oppdagede veiene, gruppert etter det de har
 * til felles. Én gruppe = ett kort, i samme form som retningsradene, så kort,
 * kart, frekvens, stedstyper, ytterpunkt og «sjekk denne» gjenbrukes.
 *   retning    himmelretning (dagens oppførsel: ETT knutepunkt per retning)
 *   knute      knutepunktet du bytter på
 *   linje      linja inn ELLER ut (en vei hører til begge linjenes grupper)
 *   transport  transportmiddelet ut fra byttet
 *   kommune    stedets kommune (bare når kommunedata finnes, forslag 3)
 * Distinkt enhet: REISERUTE = linje inn → knutepunkt → linje ut.
 * Rekkefølgen er en synlig regel: retning med klokka; ellers flest steder først.
 */
export const FASETTER = Object.freeze(['retning', 'knute', 'linje', 'transport', 'kommune']);
export const FASETT_NAVN = Object.freeze({ retning: 'retning', knute: 'knutepunkt', linje: 'linje', transport: 'transport', kommune: 'kommune' });
const MODUS_NAVN = { rail: 'tog', water: 'båt', metro: 'T-bane', tram: 'trikk', coach: 'ekspressbuss', bus: 'buss' };
const linjeNavn = l => (MODUS_NAVN[l.modus] || 'linje') + ' ' + l.kode;

const linjeIdAv = dir => (typeof dir === 'string' ? dir.slice(0, dir.indexOf('>')) : null);
/** Veiene «ett bytte» bygger på: to ledd, ordinært vindu, et reelt bytte (samme linje videre er å bli sittende). */
export function ettByttVeier(resultat) {
  return ((resultat && resultat.veier) || []).filter(v => v.ledd === 2 && v.vindu === 'ordinært' && v.knute && v.inn
    && typeof v.område === 'string' && linjeIdAv(v.inn) !== linjeIdAv(v.directionId));
}

/** Ett kort av en mengde veier (kan spenne flere knutepunkt). `meta`: retning-nøkkel, tittel, undertittel. */
function radAv(resultat, posisjon, veier, meta) {
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const knNavn = new Map((((resultat && resultat.knutepunkter) || {}).vurdert || []).map(k => [k.id, k.navn]));
  const dest = new Set(), moduser = new Map(), inn = new Map(), ut = new Map(), innDir = new Map(), utPar = new Map(), perKnute = new Map(), par = new Map();
  for (const v of veier) {
    dest.add(v.opsjon);
    const li = linje(resultat, v.inn), lu = linje(resultat, v.directionId);
    (moduser.get(v.opsjon) || moduser.set(v.opsjon, new Set()).get(v.opsjon)).add(lu.modus);
    inn.set(li.kode + '|' + li.modus, li); ut.set(lu.kode + '|' + lu.modus, lu);
    (innDir.get(linjeTekst(li)) || innDir.set(linjeTekst(li), new Set()).get(linjeTekst(li))).add(v.inn);
    (utPar.get(linjeTekst(lu)) || utPar.set(linjeTekst(lu), []).get(linjeTekst(lu))).push([v.directionId, v.knute]);
    (perKnute.get(v.knute) || perKnute.set(v.knute, new Set()).get(v.knute)).add(v.opsjon);
    // Linjeparet: linje inn → knutepunkt → linje ut, med stedene det når. Førsteklasses, ikke bare en telling.
    const pk = linjeTekst(li) + '|' + v.knute + '|' + linjeTekst(lu);
    (par.get(pk) || par.set(pk, { inn: linjeTekst(li), knute: v.knute, ut: linjeTekst(lu), steder: new Set() }).get(pk)).steder.add(v.opsjon);
  }
  const steder = [...dest].map(id => opsjoner.get(id)).filter(o => o && o.destinations && o.destinations[0])
    .map(o => ({ id: o.destinations[0].id, type: velgStedstype(moduser.get(o.id) || new Set()), navn: o.label || o.destinations[0].name, lat: o.destinations[0].lat, lon: o.destinations[0].lon, m: posisjon ? metresBetween(posisjon, o.destinations[0]) : 0 }))
    .sort((a, b) => b.m - a.m || (a.navn < b.navn ? -1 : 1));
  const navn = []; for (const x of steder) if (navn.length < EKSEMPLER && !navn.includes(x.navn)) navn.push(x.navn);
  // Knutepunktene, flest steder først. Hvert knutepunkt er selv et sted ledd 1 når; koordinatene står der.
  const sted = o => o && o.destinations && o.destinations[0];
  const knuterDetalj = [...perKnute.entries()].sort(([ka, a], [kb, b]) => b.size - a.size || (ka < kb ? -1 : 1)).map(([id, ops]) => {
    const kd = sted(opsjoner.get('destination:' + id));
    return { id, navn: knNavn.get(id) || id, ll: kd && Number.isFinite(kd.lat) ? { lat: kd.lat, lon: kd.lon } : null, steder: [...ops].map(o => sted(opsjoner.get(o))).filter(Boolean).map(d => d.id).sort() };
  });
  const knute = knuterDetalj[0].id;
  const kNavn = new Map(knuterDetalj.map(k => [k.id, k.navn]));
  const linjepar = [...par.values()].map(p => ({ inn: p.inn, knute: p.knute, knuteNavn: kNavn.get(p.knute) || p.knute, ut: p.ut, steder: p.steder.size }))
    .sort((a, b) => b.steder - a.steder || (a.inn + a.ut + a.knute < b.inn + b.ut + b.knute ? -1 : 1));
  const punkter = steder.filter(x => Number.isFinite(x.lat)).map(({ id, navn: n, lat, lon, type, m }) => ({ id, navn: n, lat, lon, type, m }));   // m: avstand fra deg, så kort og steder kan rangeres fra nær til langt (v1.218.320)
  return {
    retning: meta.retning, retningNavn: meta.tittel, undertittel: meta.undertittel || null, fasett: meta.fasett,
    knute, knuteNavn: knuterDetalj[0].navn, knuterDetalj, linjepar, reiseruter: linjepar.length,
    inn: [...inn.values()].map(linjeTekst).sort(), ut: [...ut.values()].map(linjeTekst).sort(),
    eksempler: navn, antallSteder: dest.size, sjekket: false,
    // For kartet (src/views/ettBytteVisning.js): knutepunktet og stedene, lengst unna først.
    knuteLL: knuterDetalj[0].ll,
    punkter,
    ytterpunkt: ytterpunkt(punkter, posisjon),
    typer: stedstypeTelling(punkter),
    // Hvor ofte (forslag 4): ut-linjene ved sitt knutepunkt, inn-linjene ved stoppet du går til.
    frekvens: {
      inn: Object.fromEntries([...innDir].map(([t, dirs]) => [t, frekvensVed(resultat, dirs, null)]).filter(([, f]) => f)),
      ut: Object.fromEntries([...utPar].map(([t, par]) => [t, frekvensPar(resultat, par)]).filter(([, f]) => f)),
    },
  };
}
/** Ut-frekvens når linja kan gå fra flere knutepunkt i gruppen: hver (linjeretning, knute) for seg, oftest vinner. */
function frekvensPar(resultat, par) {
  const lr = (resultat.grupper && resultat.grupper.linjeretning) || {};
  const m = par.map(([d, k]) => frekvensMin(((lr[d] && lr[d].avgangerVed) || {})[k] || [])).filter(x => x != null).sort((a, b) => a - b)[0];
  return frekvensTekst(m == null ? null : m);
}

 /**
 * LINJEPARENE (tracer del A): kortet kan vise linjer inn og ut som to lister bare
 * når HVER kombinasjon av en inn-linje og en annen ut-linje er observert. Ellers
 * antyder listene par nettverket ikke har vist oss (målt: 18–70 % i fasettene
 * linje og transport), og kortet skal vise parene i stedet. Samme linje inn og ut
 * («74 → 74») er ikke et bytte og telles ikke. Én regel, avgjort av dataene.
 */
export function listerHolder(rad) {
  const obs = new Set((rad.linjepar || []).map(p => p.inn + '|' + p.ut));
  return rad.inn.every(i => rad.ut.every(u => u === i || obs.has(i + '|' + u)));
}

const GRUNNLAG = 'mulig med ett bytte — ikke sjekket mot reisesøket, og byttet er ikke tidskontrollert';
/**
 * TIDSVINDUET (v1.218.310). Spurt: «Hva er tidsperspektivet for reisene i
 * "ett bytte"?» Avgangstavlene hentes fra NÅ, med et vindu per transportmiddel
 * (`horisontMin`: 60 min buss/T-bane, 180 min tog/ekspressbuss/båt) — også
 * fra knutepunktene, ikke fra når du er framme der. Overskriften sier det.
 * Minste og største vindu blant tilgangsstoppene og knutepunktene som ble
 * spurt. Null når svaret ikke har dem. Ren.
 */
export function vinduTekst(resultat) {
  const k = ((resultat && resultat.knutepunkter && resultat.knutepunkter.vurdert) || []).filter(x => x.status === 'spurt').map(x => x.horisontMin);
  const alle = [...((resultat && resultat.tilgangHorisontMin) || []), ...k].filter(m => Number.isFinite(m) && m > 0);
  if (!alle.length) return null;
  const lo = Math.min(...alle), hi = Math.max(...alle);
  const t = m => (m % 60 === 0 ? String(m / 60) : (m / 60).toFixed(1).replace('.', ','));
  if (hi < 60) return 'avganger fra nå og ' + (lo === hi ? hi : lo + '–' + hi) + ' min fram';
  if (lo === hi) return 'avganger fra nå og ' + t(hi) + (hi === 60 ? ' time' : ' timer') + ' fram';
  return 'avganger fra nå og ' + (lo < 60 ? lo + ' min' : t(lo)) + '–' + t(hi) + ' timer fram';
}
const grunnlagFor = resultat => (v => v ? 'mulig med ett bytte · ' + v + ' — ikke sjekket mot reisesøket, og byttet er ikke tidskontrollert' : GRUNNLAG)(vinduTekst(resultat));

/**
 * Kortene for én fasett. `kommuneAv` (stopp-id → kommune) trengs for «kommune».
 * @returns {{ rader: object[], ingen: boolean, grunnlag: string, fasett: string }}
 */
export function ettByttePer(resultat, posisjon, fasett = 'retning', { kommuneAv = null, behold = null } = {}) {
  // `behold(opsjonId)`: hvilke steder som er med (hvor langt, v1.218.308). Avgjøres av presentasjonen.
  const veier = ettByttVeier(resultat).filter(v => !behold || behold(v.opsjon));
  const opsjoner = new Map(((resultat && resultat.opsjoner) || []).map(o => [o.id, o]));
  const knNavn = new Map((((resultat && resultat.knutepunkter) || {}).vurdert || []).map(k => [k.id, k.navn]));
  const rader = [];
  if (fasett === 'retning') {
    // Dagens oppførsel: per retning ETT knutepunkt — det som når flest ulike områder (så flest steder, så id).
    const per = new Map();
    for (const v of veier) {
      const sektor = v.område.split('|')[0];
      if (!RETNINGER.includes(sektor)) continue; // sentrum («•») er ingen retning
      const s = per.get(sektor) || per.set(sektor, new Map()).get(sektor);
      const g = s.get(v.knute) || s.set(v.knute, { områder: new Set(), dest: new Set(), veier: [] }).get(v.knute);
      g.områder.add(v.område); g.dest.add(v.opsjon); g.veier.push(v);
    }
    for (const sektor of RETNINGER) {
      const s = per.get(sektor);
      if (!s) continue;
      const [knute, g] = [...s.entries()].sort(([ka, a], [kb, b]) => b.områder.size - a.områder.size || b.dest.size - a.dest.size || (ka < kb ? -1 : 1))[0];
      rader.push(radAv(resultat, posisjon, g.veier, { retning: sektor, tittel: RETNING_NAVN[sektor], fasett, undertittel: 'via ' + (knNavn.get(knute) || knute) }));
    }
    return { rader, ingen: rader.length === 0, grunnlag: grunnlagFor(resultat), fasett };
  }
  // Nøkkel(er) per vei for fasetten, med tittel.
  const nøkler = v => {
    if (fasett === 'knute') return [['knute:' + v.knute, knNavn.get(v.knute) || v.knute]];
    if (fasett === 'linje') {
      const li = linje(resultat, v.inn), lu = linje(resultat, v.directionId);
      return [['linje:' + linjeIdAv(v.inn), linjeNavn(li)], ['linje:' + linjeIdAv(v.directionId), linjeNavn(lu)]];
    }
    if (fasett === 'transport') { const m = linje(resultat, v.directionId).modus; return [['transport:' + m, MODUS_NAVN[m] || 'annet']]; }
    if (fasett === 'kommune') {
      const o = opsjoner.get(v.opsjon), d = o && o.destinations && o.destinations[0], k = d && kommuneAv && kommuneAv.get(d.id);
      return k ? [['kommune:' + k, k]] : [];
    }
    return [];
  };
  const grupper = new Map();
  for (const v of veier) for (const [n, tittel] of nøkler(v)) (grupper.get(n) || grupper.set(n, { tittel, veier: [] }).get(n)).veier.push(v);
  for (const [n, g] of grupper) {
    const r = radAv(resultat, posisjon, g.veier, { retning: n, tittel: g.tittel, fasett });
    const andre = r.knuterDetalj.slice(1).map(k => k.navn);
    r.undertittel = fasett === 'knute'
      ? r.reiseruter + (r.reiseruter === 1 ? ' reiserute' : ' reiseruter')
      : 'via ' + r.knuteNavn + (andre.length ? (andre.length <= 2 ? ', ' + andre.join(', ') : ', ' + andre[0] + ' +' + (andre.length - 1)) : '') + ' · ' + r.reiseruter + (r.reiseruter === 1 ? ' reiserute' : ' reiseruter');
    rader.push(r);
  }
  rader.sort((a, b) => b.antallSteder - a.antallSteder || (a.retningNavn < b.retningNavn ? -1 : 1));
  return { rader, ingen: rader.length === 0, grunnlag: grunnlagFor(resultat), fasett };
}

/** Rader per himmelretning (dagens kort). Uendret oppførsel: `ettByttePer(…, 'retning')`. */
export function ettByttePerRetning(resultat, posisjon) {
  return ettByttePer(resultat, posisjon, 'retning');
}
