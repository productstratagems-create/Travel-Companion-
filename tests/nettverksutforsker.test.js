/**
 * Nettverksutforskeren, trinn 4a: tilgangspunkter, ledd 1, kandidatopsjoner,
 * grupperingsindeks, budsjett, cache og feil. Mot opptak fra Entur
 * (tests/fixtures/entur/), uten nett.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  utforsk, _tømCache, klassifiserTilgang, PARAMETRE, stoppVidere, medPlanlagteStopp, områdeFor, horisontFor, linjeretning,
} from '../src/nettverksutforsker.js';
import { OPSJONSTYPER, avvik, tilgjengelighet, bekreftelse } from '../src/opsjonsmodell.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const O = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n)]));
const kjør = async (n, valg = {}, ktx = {}) => {
  const a = avspiller(O[n], valg);
  const r = await utforsk({ ...O[n].scenario, ...ktx }, { hent: a.hent, klokke: valg.klokke });
  return { r, kall: a.kall };
};
beforeEach(() => _tømCache());

describe('opptakene', () => {
  it('koden spør det samme som da opptakene ble tatt (ellers: ta opp på nytt)', async () => {
    for (const n of SCENARIOER) {
      const { kall } = await kjør(n);
      for (const k of kall) expect([n, k.navn, k.req.body || k.req.url]).toEqual([n, k.navn, O[n].opptak[k.navn].forespørsel.body || O[n].opptak[k.navn].forespørsel.url]);
    }
  });
});

describe('tilgangspunkter: luftlinje, gangavstand og gangtid er adskilt', () => {
  it('Hauketo er ikke nær: 1 482 m i luftlinje, over 30 min å gå — gangtiden beholdes', async () => {
    const { r } = await kjør('mortensrud_dag');
    const h = r.tilgang.find(t => t.name === 'Hauketo stasjon');
    expect(h.luftM).toBe(1482);
    expect(h.gangMin).toBeGreaterThan(30);
    expect(h.gangM).toBeGreaterThan(h.luftM);
    expect(h.rolle).toBe('utenfor');
    expect(r.ikkeUndersøkt.some(x => x.hva === 'tilgangspunkt Hauketo stasjon')).toBe(true);
  });
  it('Ranheim stasjon: tog 8 min unna blir tilgangspunkt, og toget kommer med', async () => {
    const { r } = await kjør('ranheim_dag');
    expect(r.tilgang.find(t => t.name === 'Ranheim stasjon').rolle).toBe('ordinær');
    expect(Object.values(r.grupper.linjeretning).some(g => g.modus === 'rail')).toBe(true);
  });
  it('Midtun (Bybanen, «railStation» i geokoderen) 27 min unna er ikke tilgang', async () => {
    const { r } = await kjør('nesttun_dag');
    expect(r.tilgang.find(t => t.name === 'Midtun stasjon').rolle).toBe('utenfor');
  });
  it('alternativ tilgang: lengre gange godtas bare for et transportmiddel de nære ikke har', () => {
    const t = klassifiserTilgang([
      { id: 'a', moduser: ['bus'], luftM: 100, gangMin: 2 },
      { id: 'b', moduser: ['rail'], luftM: 900, gangMin: 13 },
      { id: 'c', moduser: ['bus'], luftM: 900, gangMin: 13 },
      { id: 'd', moduser: ['rail'], luftM: 1400, gangMin: 25 },
    ]);
    expect(t.map(x => x.rolle)).toEqual(['ordinær', 'alternativ', 'utenfor', 'utenfor']);
    expect(t[2].grunn).toMatch(/ingen nye transportmidler/);
  });
  it('grensene er parametre, ikke én universell «nær»', () => {
    const k = [{ id: 'b', moduser: ['rail'], luftM: 900, gangMin: 13 }];
    expect(klassifiserTilgang(k, { ...PARAMETRE, gangMin: { ...PARAMETRE.gangMin, ordinær: 15 } })[0].rolle).toBe('ordinær');
  });
  it('uten gangsvar: luftlinje som heuristikk, kilde «ukjent», og det står i ikkeUndersøkt', async () => {
    const { r } = await kjør('mortensrud_dag', { kast: ['gangtid tilgang'] });
    expect(r.tilgang.every(t => t.gangKilde === 'ukjent')).toBe(true);
    expect(r.tilgang.filter(t => t.rolle !== 'utenfor').every(t => t.luftM <= PARAMETRE.gangUkjentLuftM)).toBe(true);
    expect(r.ikkeUndersøkt.some(x => /gangtid/.test(x.hva))).toBe(true);
  });
});

describe('ledd 1: stopplister', () => {
  it('turer uten sanntidsstoppliste får planlagte stopp (Skyss ved Nesttun)', async () => {
    const { r } = await kjør('nesttun_dag');
    const plan = Object.values(r.grupper.linjeretning).filter(g => g.stoppliste.includes('plan'));
    expect(plan.length).toBeGreaterThan(5);
    expect(plan.every(g => g.destinasjoner.length > 0)).toBe(true);
  });
  it('stoppVidere: sanntid først, så plan, så «mangler»', () => {
    const q = (id, s) => ({ id, stopPlace: { id: s, name: s, latitude: 60, longitude: 5 } });
    expect(stoppVidere({ estimatedCalls: [{ quay: q('A', 'a') }, { quay: q('B', 'b') }] }, 'A')).toEqual({ videre: [{ id: 'b', name: 'b', lat: 60, lon: 5 }], kilde: 'sanntid' });
    expect(stoppVidere({ estimatedCalls: [], quays: [q('A', 'a'), q('B', 'b')] }, 'A').kilde).toBe('plan');
    expect(stoppVidere({ estimatedCalls: [], quays: [] }, 'A')).toEqual({ videre: [], kilde: 'mangler' });
  });
  it('avvist planfelt: spør uten, og sier det', async () => {
    let første = true;
    const { r, kall } = await kjør('mortensrud_dag', { endre: (n, s) => (n === 'ledd 1' && første ? (første = false, { errors: [{ message: 'Field quays undefined' }] }) : s) }, {});
    expect(kall.map(k => k.navn)).toContain('ledd 1 uten planlagte stopp');
    expect(r.rapport.notater.join(' ')).toMatch(/quays avvist/);
  });
  it('medPlanlagteStopp endrer bare utforskerens spørring', () => {
    expect(medPlanlagteStopp('serviceJourney{id line{id}}')).toContain('quays{id stopPlace');
    expect(medPlanlagteStopp('serviceJourney{id line{id}}', false)).toBe('serviceJourney{id line{id}}');
  });
});

describe('kandidater og identitet', () => {
  it('alle opsjoner følger kontrakten, og linjeretning/område er aldri opsjoner', async () => {
    for (const n of SCENARIOER) {
      const { r } = await kjør(n);
      expect(r.opsjoner.flatMap(avvik)).toEqual([]);
      expect(r.opsjoner.every(o => OPSJONSTYPER.includes(o.type))).toBe(true);
      expect(r.opsjoner.some(o => o.type === 'direction')).toBe(false);
    }
  });
  it('samme destinasjon fra flere tilgangspunkter er én opsjon med flere stier', async () => {
    const { r } = await kjør('mortensrud_dag');
    const d = r.opsjoner.filter(o => o.type === 'destination');
    expect(new Set(d.map(o => o.id)).size).toBe(d.length);
    const flere = d.filter(o => new Set(o.provenance.map(p => p.accessPoint.stopPlaceId)).size >= 2);
    expect(flere.length).toBeGreaterThan(0);
  });
  it('destinasjoner dedupliseres på samlestopp (parent)', async () => {
    const { r } = await kjør('mortensrud_dag');
    const info = O.mortensrud_dag.opptak.stoppinfo.svar.data.stopPlaces.filter(s => s && s.parent && s.parent.id !== s.id);
    expect(info.length).toBeGreaterThan(0);
    const ider = new Set(r.opsjoner.map(o => o.id));
    for (const s of info) expect(ider.has(`destination:${s.id}`)).toBe(false);
  });
  it('lineId er en linje; linjeretningen bæres som directionId', async () => {
    const { r } = await kjør('mortensrud_dag');
    const stier = r.opsjoner.flatMap(o => o.provenance);
    expect(stier.every(p => p.lineId && !p.lineId.includes('>'))).toBe(true);
    expect(stier.every(p => p.directionId === linjeretning(p.lineId, p.directionId.split('>').slice(1).join('>')))).toBe(true);
    expect(stier.every(p => p.directionId in r.grupper.linjeretning)).toBe(true);
  });
  it('gruppering: hver destinasjon ligger i en linjeretning og et område', async () => {
    const { r } = await kjør('ranheim_dag');
    const iLR = new Set(Object.values(r.grupper.linjeretning).flatMap(g => g.destinasjoner));
    const iOmr = new Set(Object.values(r.grupper.område).flatMap(g => g.destinasjoner));
    for (const o of r.opsjoner.filter(x => x.type === 'destination')) { expect(iLR.has(o.id)).toBe(true); expect(iOmr.has(o.id)).toBe(true); }
  });
  it('oppdaget er ikke bekreftet: ingen opsjon er «tilgjengelig nå»', async () => {
    const { r } = await kjør('mortensrud_dag');
    for (const o of r.opsjoner) { expect(bekreftelse(o, O.mortensrud_dag.scenario.tid)).toBe('not_checked'); expect(tilgjengelighet(o, O.mortensrud_dag.scenario.tid)).not.toBe('now'); }
  });
  it('proveniens peker til oppdagelsessituasjonen, og parametrene rapporteres', async () => {
    const { r } = await kjør('tretten_dag');
    expect(r.opsjoner.every(o => o.provenance.every(p => p.oppdagelse === r.oppdagelse.id))).toBe(true);
    expect(r.oppdagelse.parametre.horisontMin.rail).toBe(180);
  });
});

describe('hjelpere', () => {
  it('område: sektor og bånd, sentrum «•»', () => {
    const p = { lat: 59.8487, lon: 10.8291 };
    expect(områdeFor(p, { lat: 59.9127, lon: 10.8011 })).toBe('N|5–15');
    expect(områdeFor(p, { lat: 63.43, lon: 10.4 })).toBe('N|150+');
    expect(områdeFor(p, { lat: 59.849, lon: 10.83 })).toBe('•|0–5');
  });
  it('horisont: det største av stoppets transportmidler', () => {
    expect(horisontFor(['bus'])).toBe(60);
    expect(horisontFor(['bus', 'rail'])).toBe(180);
    expect(horisontFor(['taxi'])).toBe(120);
  });
});

describe('budsjett, feil og cache', () => {
  it('oppdagelse og gang telles hver for seg; ingen bekreftelse i utforskeren', async () => {
    for (const n of SCENARIOER) {
      const { r, kall } = await kjør(n);
      expect(r.rapport.kall).toEqual({ oppdagelse: 3, gang: 1, bekreftelse: 0 });
      expect(kall.length).toBe(4);
    }
  });
  it('ledd 1 feiler helt: tomt resultat, men aldri «ingen muligheter»', async () => {
    const { r } = await kjør('mortensrud_dag', { kast: ['ledd 1'] });
    expect(r.opsjoner).toEqual([]);
    expect(r.ikkeUndersøkt.some(x => /betyr ikke at ingen finnes/.test(x.grunn))).toBe(true);
    expect(r.ikkeUndersøkt.some(x => /ledd 1 svarte ikke/.test(x.grunn))).toBe(true);
    expect(r.rapport.feiledeKall.length).toBe(1);
  });
  it('ett alias mangler: resten brukes, og det manglende står i ikkeUndersøkt', async () => {
    const { r } = await kjør('mortensrud_dag', { endre: (n, s) => { if (n === 'ledd 1') delete s.data.s0; return s; } });
    expect(r.opsjoner.length).toBeGreaterThan(0);
    expect(r.ikkeUndersøkt.some(x => x.hva === 'avganger fra Mortensrud' && /mangler/.test(x.grunn))).toBe(true);
  });
  it('geokoderen feiler: ingen tilgang, sagt eksplisitt', async () => {
    const { r } = await kjør('tretten_dag', { kast: ['geokoder'] });
    expect(r.tilgang).toEqual([]);
    expect(r.ikkeUndersøkt[0]).toEqual({ hva: 'tilgangspunkter', grunn: 'geokoderen svarte ikke' });
  });
  it('cache: samme sted og tid innen 200 m og 10 min gir ingen nye kall', async () => {
    let t = 0; const klokke = () => t;
    await kjør('ranheim_dag', { klokke });
    t = 9 * 60_000;
    const p = O.ranheim_dag.scenario.posisjon;
    const b = await kjør('ranheim_dag', { klokke }, { posisjon: { lat: p.lat + 0.001, lon: p.lon } }); // ~110 m
    expect(b.kall.length).toBe(0);
    expect(b.r.rapport.cachetreff).toBe(true);
  });
  it('cache: utløpt eller flyttet gir nye kall', async () => {
    let t = 0; const klokke = () => t;
    await kjør('ranheim_dag', { klokke });
    t = 11 * 60_000;
    expect((await kjør('ranheim_dag', { klokke })).kall.length).toBe(4);
    const p = O.ranheim_dag.scenario.posisjon;
    expect((await kjør('ranheim_dag', { klokke }, { posisjon: { lat: p.lat + 0.003, lon: p.lon } })).kall.length).toBe(4); // ~330 m
  });
});

describe('tetthet: storby, mellomby og bygd', () => {
  it('alle steder gir gyldige resultater med struktur, også natt og bygd', async () => {
    const tall = {};
    for (const n of SCENARIOER) {
      const { r } = await kjør(n);
      tall[n] = r.rapport.struktur;
      expect(r.rapport.struktur.tilgangspunkter).toBeGreaterThan(0);
      expect(r.rapport.struktur.linjeretninger).toBeGreaterThan(0);
    }
    expect(tall.tretten_dag.linjeretninger).toBeLessThan(tall.mortensrud_dag.linjeretninger);
    expect(tall.mortensrud_natt.linjeretninger).toBeLessThan(tall.mortensrud_dag.linjeretninger);
  });
});
