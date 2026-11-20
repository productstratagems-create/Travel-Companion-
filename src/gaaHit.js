/**
 * «GÅ HIT FOR Å KOMME DIT» (v1.218.143). Bestilt: «Inne i bykjerner er appen
 * lite hjelpsom før bruker har stått på transportmiddelet. Bruker trenger
 * bedre støtte i å finne rett holdeplass for rett transportmiddel for rett
 * destinasjon.»
 *
 * Kortene i Auto-reise leste bare avgangene fra stoppet på skjermen og
 * knutepunktet rundt det. Går ingenting derfra til målet, fantes ikke målet;
 * står et bedre stopp 400 m unna, sa ingen det. Et reisesøk fra der du står
 * svarer på begge — her tolket, rent.
 */
import { decodePolyline } from './ui/polyline.js';

export const GÅHIT_MAKS_MÅL = 2;
export const GÅHIT_FLYTT_M = 100;
export const GÅHIT_ALDER_MS = 2 * 60_000;

const tid = (o, f) => Date.parse((o && (o['expected' + f] || o['aimed' + f])) || '');

/**
 * Beste reiseforslag → hva du gjør: gå til hvilket stopp og spor, ta hvilken
 * linje når, framme når. Null når forslaget er å gå hele veien, eller ingen.
 */
export function gåHitFor(mønstre, nå) {
  const t = (mønstre || []).find(p => (p.legs || []).some(l => l.mode && l.mode !== 'foot'
    && tid(l, 'StartTime') >= nå));
  if (!t) return null;
  const legs = t.legs;
  const i = legs.findIndex(l => l.mode && l.mode !== 'foot');
  const kol = legs[i];
  const gang = legs.slice(0, i).filter(l => l.mode === 'foot');
  const gangMs = gang.reduce((s, l) => s + Math.max(0, tid(l, 'EndTime') - tid(l, 'StartTime')), 0);
  const gangM = gang.reduce((s, l) => s + ((l.pointsOnLink && l.pointsOnLink.length) || 0), 0);
  const fra = kol.fromPlace || {};
  const fec = kol.fromEstimatedCall || {};
  const linje = kol.serviceJourney && kol.serviceJourney.line;
  const siste = legs[legs.length - 1];
  const punkter = gang.flatMap(l => (l.pointsOnLink && l.pointsOnLink.points) ? decodePolyline(l.pointsOnLink.points) : []);
  return {
    stoppNavn: fra.name || '',
    stoppId: (fra.quay && fra.quay.stopPlace && fra.quay.stopPlace.id) || null,
    lat: fra.latitude, lon: fra.longitude,
    spor: (fec.quay && fec.quay.publicCode) || null,
    linje: (linje && linje.publicCode) || '',
    farge: (linje && linje.presentation && linje.presentation.colour) || null,
    modus: kol.mode,
    mot: (fec.destinationDisplay && fec.destinationDisplay.frontText) || '',
    går: tid(kol, 'StartTime'),
    framme: tid(siste, 'EndTime'),
    gangMin: Math.max(0, Math.round(gangMs / 60_000)),
    gangM: Math.round(gangM),
    gangPunkter: punkter,
    bytter: legs.filter(l => l.mode && l.mode !== 'foot').length - 1,
    // ALLE LINJENE, i rekkefølge (v1.218.178): «73 → 81», ikke «73 mot Holmlia».
    linjer: legs.filter(l => l.mode && l.mode !== 'foot')
      .map(l => (l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || (l.line && l.line.publicCode) || '')
      .filter(Boolean),
  };
}

/**
 * HVA REISEN ER, I ORD (v1.218.178). Rapportert: «73 mot Holmlia stasjon ·
 * 1 bytte» for en reise til Jernbanetorget. «Mot» er skiltet på bussen, ikke
 * målet ditt — og leses som en reise et annet sted. Rådet er alltid en reise
 * til målet du har lagt inn, så teksten sier målet. Én tekst for Rute og
 * Auto-reise. Ren.
 */
export function rådReiseTekst(råd, mål, klokke) {
  const linjer = (råd.linjer && råd.linjer.length) ? råd.linjer : (råd.linje ? [råd.linje] : []);
  const hva = [linjer.join(' → '), mål ? 'til ' + mål : ''].filter(Boolean).join(' ');
  return [hva, 'går ' + klokke(råd.går), råd.bytter > 0 ? råd.bytter + ' bytte' : ''].filter(Boolean).join(' · ');
}

/** Er rådet et ANNET stopp enn de du alt ser (stoppet og knutepunktet)? */
export function annetStopp(råd, nærIds) {
  return !!(råd && råd.stoppId && !(nærIds || []).includes(råd.stoppId));
}

/** Må søket gjøres på nytt: annet mål, flyttet deg, eller for gammelt. */
export function trengerNyttSøk(forrige, pos, nå, avstand) {
  if (!forrige) return true;
  if (nå - forrige.at > GÅHIT_ALDER_MS) return true;
  return avstand(forrige.pos, pos) > GÅHIT_FLYTT_M;
}

/**
 * GJELDER RÅDET HER? (v1.218.148). Rapportert med testposisjonen: kortet
 * viste et søk fra Bergen mens skjermen sto i Oslo. Et råd gjelder bare når
 * søket ble gjort nær der du er nå, og når stoppet skjermen viser også er
 * nær — ellers er skjermen og rådet om to forskjellige steder. Rent.
 */
export const GÅHIT_SKJERM_M = 2000;
export function rådGjelder(post, pos, stopp, avstand) {
  if (!post || !post.råd || !post.pos || !pos) return false;
  if (avstand(post.pos, pos) > GÅHIT_FLYTT_M) return false;
  if (stopp && Number.isFinite(stopp.lat) && avstand(pos, stopp) > GÅHIT_SKJERM_M) return false;
  return true;
}

/** Hvilke mål det søkes for: de mest brukte med kjent stopp, maks to. */
export function gåHitMål(freq) {
  return (freq || []).filter(p => p && p.stopId && p.name)
    .sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)).slice(0, GÅHIT_MAKS_MÅL);
}

/**
 * ÉN HENTING FOR BEGGE SKJERMER (v1.218.173). Auto-reise og Rute spør det
 * samme spørsmålet — «hvilket stopp fra der jeg står» — og skal få samme svar,
 * med samme regler for når det spørres på nytt. Avhengighetene sendes inn, så
 * regelen kan prøves uten nett. Returnerer posten, eller null når intet søk.
 */
export function startGåHitSøk(cache, mål, pos, nå, { hent, tillat, avstand }) {
  if (!pos || !mål || !mål.id) return null;
  const f = cache.get(mål.id);
  if (f && f.henter) return null;
  if (!trengerNyttSøk(f, pos, nå, avstand)) return null;
  if (tillat && !tillat(nå)) return null;
  // Et nytt søk arver aldri rådet fra et annet sted (v1.218.148).
  const post = { pos: { lat: pos.lat, lon: pos.lon }, at: nå, råd: undefined, henter: true, navn: mål.navn };
  cache.set(mål.id, post);
  Promise.resolve().then(() => hent(pos, mål.til, nå))
    .then(mønstre => { post.råd = gåHitFor(mønstre, Date.now()); post.henter = false; })
    .catch(() => { post.henter = false; post.feil = true; });
  return post;
}

/**
 * HVA RUTE SKAL SI (v1.218.173). Ren. Fem tilstander, fordi «leter», «fant
 * ikke», «ingen reise» og «ditt stopp er best» ikke er samme setning:
 *   'leter' | 'feil' | 'ingen' | 'ditt' | 'annet'
 */
export function ruteRåd(post, pos, dir, avstand) {
  if (!post) return { kind: 'leter' };
  if (post.henter) return { kind: 'leter' };
  if (post.feil) return { kind: 'feil' };
  if (!post.råd) return { kind: 'ingen' };
  if (!rådGjelder(post, pos, null, avstand)) return { kind: 'leter' };
  const egen = dir && dir.stopId;
  return { kind: post.råd.stoppId && egen && post.råd.stoppId === egen ? 'ditt' : 'annet', råd: post.råd };
}

/**
 * RUTA MED ET ANNET FRA-STOPP — bare når brukeren trykker (v1.218.173).
 * Ren: lager den nye ruta, endrer ikke den gamle. Mål, via og resten står.
 */
export function ruteMedStopp(dir, råd) {
  return { ...dir, from: råd.stoppNavn, stopId: råd.stoppId || null, geo: råd.stoppId ? null : råd.stoppNavn,
    _fromLat: Number.isFinite(råd.lat) ? råd.lat : null, _fromLon: Number.isFinite(råd.lon) ? råd.lon : null };
}

/** Hva Rute søker mot: målets stopp, ellers koordinatene. Null uten noen. */
export function ruteMål(dir) {
  if (!dir) return null;
  if (dir.toStopId) return { id: dir.toStopId, til: dir.toStopId, navn: dir.to };
  if (Number.isFinite(dir._toLat)) return { id: dir._toLat + ',' + dir._toLon, til: { lat: dir._toLat, lon: dir._toLon }, navn: dir.to };
  return null;
}

/**
 * ER RÅDET BEDRE? (v1.218.175). Rapportert: «bedre herfra: 18 min å gå til
 * Ljabru hovedgård» mot 12 min til rutas eget stopp. «Annet stopp» ble lest
 * som «bedre» uten at noe ble sammenlignet. Nå avgjør framme-tiden. Ren.
 *   'bedre'  rådet er framme minst BEDRE_MIN før ditt eget alternativ
 *   'likt'   innen BEDRE_MIN
 *   'ditt'   ditt stopp er framme like tidlig eller før
 *   'ukjent' ingen kjent framme-tid fra ditt stopp — aldri «bedre»
 */
export const BEDRE_MIN = 3;
export function rådMotEget(råd, egen) {
  if (!råd || !Number.isFinite(råd.framme)) return 'ukjent';
  if (!egen || !Number.isFinite(egen.framme)) return 'ukjent';
  const vinst = (egen.framme - råd.framme) / 60_000;
  if (vinst >= BEDRE_MIN) return 'bedre';
  if (vinst > 0) return 'likt';
  return 'ditt';
}
