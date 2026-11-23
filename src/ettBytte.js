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
    const g = s.get(v.knute) || s.set(v.knute, { områder: new Set(), dest: new Set(), inn: new Map(), ut: new Map(), moduser: new Map() }).get(v.knute);
    g.områder.add(v.område); g.dest.add(v.opsjon);
    const li = linje(resultat, v.inn), lu = linje(resultat, v.directionId);
    (g.moduser.get(v.opsjon) || g.moduser.set(v.opsjon, new Set()).get(v.opsjon)).add(lu.modus);
    g.inn.set(li.kode + '|' + li.modus, li); g.ut.set(lu.kode + '|' + lu.modus, lu);
  }
  const rader = [];
  for (const sektor of RETNINGER) {
    const s = per.get(sektor);
    if (!s) continue;
    const [knute, g] = [...s.entries()].sort(([ka, a], [kb, b]) => b.områder.size - a.områder.size || b.dest.size - a.dest.size || (ka < kb ? -1 : 1))[0];
    const steder = [...g.dest].map(id => opsjoner.get(id)).filter(o => o && o.destinations && o.destinations[0])
      .map(o => ({ type: velgStedstype(g.moduser.get(o.id) || new Set()), navn: o.label || o.destinations[0].name, lat: o.destinations[0].lat, lon: o.destinations[0].lon, m: posisjon ? metresBetween(posisjon, o.destinations[0]) : 0 }))
      .sort((a, b) => b.m - a.m || (a.navn < b.navn ? -1 : 1));
    const navn = []; for (const x of steder) if (navn.length < EKSEMPLER && !navn.includes(x.navn)) navn.push(x.navn);
    // Knutepunktet er selv et sted ledd 1 når; koordinatene står der. Mangler de, tegnes ingen knute.
    const ko = opsjoner.get('destination:' + knute), kd = ko && ko.destinations && ko.destinations[0];
    const punkter = steder.filter(x => Number.isFinite(x.lat)).map(({ navn: n, lat, lon, type }) => ({ navn: n, lat, lon, type }));
    rader.push({
      retning: sektor, retningNavn: RETNING_NAVN[sektor], knute, knuteNavn: knNavn.get(knute) || knute,
      inn: [...g.inn.values()].map(linjeTekst).sort(), ut: [...g.ut.values()].map(linjeTekst).sort(),
      eksempler: navn, antallSteder: g.dest.size, sjekket: false,
      // For kartet (src/views/ettBytteVisning.js): knutepunktet og stedene, lengst unna først.
      knuteLL: kd && Number.isFinite(kd.lat) ? { lat: kd.lat, lon: kd.lon } : null,
      punkter,
      ytterpunkt: ytterpunkt(punkter, posisjon),
      typer: stedstypeTelling(punkter),
    });
  }
  return { rader, ingen: rader.length === 0, grunnlag: 'mulig med ett bytte — ikke sjekket mot reisesøket, og byttet er ikke tidskontrollert' };
}
