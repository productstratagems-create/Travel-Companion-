/**
 * Opsjonskontrakten (docs/opsjonsmodell.md) bundet til eksemplene i
 * tests/fixtures/opsjonseksempler.js.
 */
import { describe, it, expect } from 'vitest';
import {
  opsjonsId, nyOpsjon, slåSammen, samle, scopeFor, avvik, erGyldig,
  bekreftelse, tilgjengelighet, gjelderFor, velgForBekreftelse,
  OPSJONSTYPER, BEKREFTELSE, TILGJENGELIGHET, SCOPE,
} from '../src/opsjonsmodell.js';
import * as E from './fixtures/opsjonseksempler.js';

describe('opsjonskontrakten: eksemplene', () => {
  it('alle eksempler er gyldige', () => {
    for (const [n, o] of Object.entries(E.ALLE)) expect([n, avvik(o)]).toEqual([n, []]);
  });
  it('1: et reisemål med to tilgangspunkter — én opsjon, to modi bevart', () => {
    const o = E.skiToTilganger;
    expect(o.type).toBe('destination');
    expect(o.accessPoints.map(t => t.mode).sort()).toEqual(['bus', 'rail']);
    expect(o.accessPoints.find(t => t.mode === 'bus').quayId).toBe('NSR:Quay:illustrativ-buss');
  });
  it('2: en retning har flere destinasjoner, og er ikke definert som linjeretning', () => {
    expect(E.retningKolsås.destinations).toHaveLength(2);
    expect(E.retningSørover.type).toBe('direction');
    expect(E.retningSørover.id).not.toMatch(/Line/);
  });
  it('3: et oppdaget tilbud er ikke bekreftet og ikke «tilgjengelig nå»', () => {
    expect(bekreftelse(E.togFraHauketo, E.DAG)).toBe('not_checked');
    expect(tilgjengelighet(E.togFraHauketo, E.DAG)).toBe('not_assessed');
  });
  it('4: forbindelse via knutepunkt beholder understoppene under samlestoppet', () => {
    const r = E.viaHelsfyr.realisations[0];
    expect(r.legs[0].to).toEqual({ parentId: E.STOPP.helsfyr.id, stopPlaceId: 'NSR:StopPlace:6071' });
    expect(r.legs[1].from.parentId).toBe(E.STOPP.helsfyr.id);
    expect(E.viaHelsfyr.hubs).toEqual([E.STOPP.helsfyr.id]);
  });
  it('5: nasjonal, bekreftet, men bare tilgjengelig senere', () => {
    expect(E.trondheimNatt.scope).toBe('national');
    expect(bekreftelse(E.trondheimNatt, E.NATT)).toBe('confirmed');
    expect(tilgjengelighet(E.trondheimNatt, E.NATT)).toBe('later');
  });
  it('6: samme opsjon funnet langs to stier blir én opsjon med begge stiene', () => {
    const [o, ...rest] = samle([E.skiViaBuss, E.skiViaTog]);
    expect(rest).toHaveLength(0);
    expect(o.provenance).toHaveLength(2);
    expect(o.accessPoints).toHaveLength(2);
    expect(erGyldig(o)).toBe(true);
  });
});

describe('opsjonskontrakten: identitet', () => {
  it('ny rute eller nytt tilgangspunkt gir ikke ny opsjon', () => {
    expect(E.skiViaBuss.id).toBe(E.skiViaTog.id);
  });
  it('ulike handlinger slås ikke sammen', () => {
    const ider = Object.values(E.ALLE).map(o => o.id);
    expect(new Set(ider).size).toBe(ider.length - 2); // skiToTilganger, skiViaBuss og skiViaTog er samme reisemål
    expect(() => slåSammen(E.skiViaBuss, E.togFraHauketo)).toThrow(/ulike opsjoner/);
    // Samme stopp, men tilbud ≠ reisemål ≠ forbindelse.
    expect(opsjonsId('destination', { destinasjon: 'X' })).not.toBe(opsjonsId('connection', { fra: 'A', til: 'X' }));
    expect(opsjonsId('transport_offer', { tilgang: 'A', modus: 'bus', linje: 'L' }))
      .not.toBe(opsjonsId('transport_offer', { tilgang: 'A', modus: 'rail', linje: 'L' }));
  });
  it('identiteten avhenger ikke av oppdagelsessituasjon eller rekkevidde', () => {
    const a = nyOpsjon({ type: 'destination', nøkkel: { destinasjon: 'X' }, origin: { lat: 59.9, lon: 10.7 }, destinations: [{ id: 'X', lat: 59.91, lon: 10.7 }], provenance: [{ discoverer: 'a' }] });
    const b = nyOpsjon({ type: 'destination', nøkkel: { destinasjon: 'X' }, origin: { lat: 63.4, lon: 10.4 }, destinations: [{ id: 'X', lat: 59.91, lon: 10.7 }], provenance: [{ discoverer: 'b' }] });
    expect(a.scope).not.toBe(b.scope);
    expect(a.id).toBe(b.id);
  });
  it('type og nøkkel er påkrevd', () => {
    expect(opsjonsId('destination', {})).toBe(null);
    expect(opsjonsId('direction', { basis: 'linje', nøkkel: 'x' })).toBe(null);
    expect(opsjonsId('ukjent', { destinasjon: 'X' })).toBe(null);
  });
});

describe('opsjonskontrakten: rekkevidde er metadata', () => {
  it('avledes, og kan være ukjent', () => {
    expect(scopeFor(E.MORTENSRUD_POS, E.STOPP.helsfyr)).toBe('local');
    expect(scopeFor(E.MORTENSRUD_POS, E.STOPP.trondheimS)).toBe('national');
    expect(scopeFor(E.MORTENSRUD_POS, null)).toBe('unknown');
    expect(SCOPE).toContain('unknown');
  });
  it('inngår ikke i utvelgelsen til bekreftelse', () => {
    const k = Object.values(E.ALLE);
    const uten = k.map(o => ({ ...o, scope: 'unknown' }));
    expect(velgForBekreftelse(k, 3).valgt.map(o => o.id)).toEqual(velgForBekreftelse(uten, 3).valgt.map(o => o.id));
  });
});

describe('opsjonskontrakten: bekreftelse og tilgjengelighet', () => {
  it('statusene er adskilte begreper', () => {
    expect(BEKREFTELSE).toEqual(['not_checked', 'checking', 'confirmed', 'not_feasible', 'unknown']);
    expect(TILGJENGELIGHET).toEqual(['now', 'later', 'in_timetable_not_now', 'not_assessed']);
    expect(OPSJONSTYPER).toEqual(['destination', 'direction', 'transport_offer', 'connection']);
  });
  it('en bekreftelse gjelder ikke et annet reisetidspunkt', () => {
    const c = E.trondheimNatt.confirmations[0];
    expect(gjelderFor(c, E.NATT)).toBe(true);
    expect(gjelderFor(c, '2026-11-24T02:30:00+01:00')).toBe(false);
    expect(bekreftelse(E.trondheimNatt, E.DAG)).toBe('not_checked');
  });
  it('en bekreftelse gjelder ikke når svaret er gammelt', () => {
    const c = E.trondheimNatt.confirmations[0];
    expect(gjelderFor(c, E.NATT, '2026-11-24T01:40:00+01:00')).toBe(false);
  });
  it('bekreftet med avgang straks gir «nå»', () => {
    const o = { ...E.togFraHauketo, confirmations: [{ state: 'confirmed', searchedAt: E.DAG, request: { travelTime: E.DAG }, firstDeparture: '2026-11-23T12:09:00+01:00' }] };
    expect(tilgjengelighet(o, E.DAG)).toBe('now');
  });
  it('ikke gjennomførbar gir aldri «nå»', () => {
    const o = { ...E.togFraHauketo, confirmations: [{ state: 'not_feasible', searchedAt: E.DAG, request: { travelTime: E.DAG } }] };
    expect(bekreftelse(o, E.DAG)).toBe('not_feasible');
    expect(tilgjengelighet(o, E.DAG)).toBe('not_assessed');
  });
  it('i rutetilbudet, men ikke nå', () => {
    expect(tilgjengelighet({ ...E.trondheimNatt, confirmations: [] }, E.NATT)).toBe('in_timetable_not_now');
  });
  it('lagret tilgjengelighet og bekreftelse uten forespørsel er ugyldig', () => {
    expect(avvik({ ...E.togFraHauketo, availability: 'now' })).toContain('tilgjengelighet skal avledes, ikke lagres');
    expect(erGyldig({ ...E.togFraHauketo, confirmations: [{ state: 'confirmed', searchedAt: E.DAG }] })).toBe(false);
  });
});

describe('opsjonskontrakten: sammenslåing forkaster ingenting', () => {
  it('stier, tilgangspunkter, plattformer og bekreftelser beholdes', () => {
    const m = slåSammen(E.skiViaBuss, { ...E.skiViaTog, confirmations: E.trondheimNatt.confirmations });
    expect(m.provenance).toHaveLength(2);
    expect(m.accessPoints.map(t => t.quayId)).toContain('NSR:Quay:illustrativ-buss');
    expect(m.confirmations).toHaveLength(1);
  });
  it('idempotent: å slå sammen med seg selv dobler ikke', () => {
    const m = slåSammen(E.skiToTilganger, E.skiToTilganger);
    expect(m.provenance).toHaveLength(2);
    expect(m.accessPoints).toHaveLength(2);
  });
});

describe('utvelgelse til bekreftelse', () => {
  const k = Object.values(E.ALLE).filter((o, i, a) => a.findIndex(x => x.id === o.id) === i);
  it('er uavhengig av rekkefølgen kandidatene kom i', () => {
    const a = velgForBekreftelse(k, 3).valgt.map(o => o.id);
    const b = velgForBekreftelse([...k].reverse(), 3).valgt.map(o => o.id);
    const c = velgForBekreftelse([k[3], k[0], k[5], k[1], k[4], k[2], ...k.slice(6)], 3).valgt.map(o => o.id);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
  it('likeverdige kandidater i samme gruppe velges likt uansett rekkefølge', () => {
    const lik = ['A', 'B', 'C', 'D'].map(x => nyOpsjon({ type: 'destination', nøkkel: { destinasjon: x }, provenance: [{ discoverer: 't' }] }));
    const a = velgForBekreftelse(lik, 2).valgt.map(o => o.id);
    expect(velgForBekreftelse([...lik].reverse(), 2).valgt.map(o => o.id)).toEqual(a);
    expect(a).toEqual(['destination:A', 'destination:B']);
  });
  it('sprer over modus/knutepunkt før den tar to fra samme gruppe', () => {
    const v = velgForBekreftelse(k, 3).valgt;
    const modi = v.map(o => o.accessPoints[0]?.mode || o.realisations[0]?.legs[0]?.mode || 'ukjent');
    expect(new Set(modi).size).toBeGreaterThan(1);
  });
  it('de som ikke fikk budsjett beholdes og rapporteres', () => {
    const { valgt, utenfor } = velgForBekreftelse(k, 2);
    expect(valgt).toHaveLength(2);
    expect(valgt.length + utenfor.length).toBe(k.length);
    for (const o of utenfor) expect(bekreftelse(o, E.DAG)).toBe('not_checked');
  });
});
