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
  };
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
