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
      const tynt = r.natt.døgntilbud.utløst ? 1 : 0; // + døgnoppslag ved tynt tilbud (4c)
      expect(r.rapport.kall).toEqual({ oppdagelse: 4 + tynt, gang: 1, bekreftelse: 0 }); // geokoder, ledd 1, stoppinfo, ledd 2
      expect(kall.length).toBe(5 + tynt);
      expect(kall.filter(k => k.navn === 'ledd 2').length).toBe(1); // ett kall uansett antall knutepunkter
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
    expect((await kjør('ranheim_dag', { klokke })).kall.length).toBe(5);
    const p = O.ranheim_dag.scenario.posisjon;
    expect((await kjør('ranheim_dag', { klokke }, { posisjon: { lat: p.lat + 0.003, lon: p.lon } })).kall.length).toBe(5); // ~330 m
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

/* ------------------------------------------------------------------ 4b */
const syntetisk = svar => ({ scenario: { posisjon: { lat: 60, lon: 10 }, tid: '2026-11-24T12:00:00+01:00' }, opptak: Object.fromEntries(Object.entries(svar).map(([k, v]) => [k, { forespørsel: {}, svar: v }])) });
const sted = (id, lat = 60.01, lon = 10.01) => ({ id, name: id, latitude: lat, longitude: lon });
/** Ringlinje: linje R i to retninger fra A, begge innom X. */
const RING = syntetisk({
  geokoder: { features: [{ properties: { id: 'NSR:StopPlace:1', name: 'A', category: ['onstreetBus'] }, geometry: { coordinates: [10, 60] } }] },
  'gangtid tilgang': { data: { g0: { tripPatterns: [{ duration: 60, walkDistance: 50 }] } } },
  'ledd 1': { data: { s0: { estimatedCalls: ['med klokka', 'mot klokka'].map((r, i) => ({ quay: { id: 'Q:A' }, expectedDepartureTime: `2026-11-24T12:0${i}:00+01:00`, destinationDisplay: { frontText: r }, serviceJourney: { id: 'SJ' + i, line: { id: 'L:R', publicCode: 'R', transportMode: 'bus' }, estimatedCalls: [{ quay: { id: 'Q:A', stopPlace: sted('NSR:StopPlace:1', 60, 10) } }, { quay: { id: 'Q:X', stopPlace: sted('NSR:StopPlace:X') } }] } })) } } },
  stoppinfo: { data: { stopPlaces: [{ id: 'NSR:StopPlace:X', name: 'X', parent: null, quays: [{ lines: [{ id: 'L:R', transportMode: 'bus' }] }] }] } },
});

describe('4b: veier og retninger bevares', () => {
  it('ringlinje: to retninger til samme destinasjon er én opsjon, men to inspiserbare veier', async () => {
    const a = avspiller(RING);
    const r = await utforsk(RING.scenario, { hent: a.hent });
    const x = r.opsjoner.find(o => o.id === 'destination:NSR:StopPlace:X');
    expect(x).toBeTruthy();
    const veier = r.veier.filter(v => v.opsjon === x.id);
    expect(new Set(veier.map(v => v.directionId))).toEqual(new Set(['L:R>med klokka', 'L:R>mot klokka']));
    expect(Object.keys(r.grupper.linjeretning).sort()).toEqual(['L:R>med klokka', 'L:R>mot klokka']);
  });
  it('ledd 2 tar ikke bort noen vei fra ledd 1', async () => {
    const en = await kjør('mortensrud_dag', {}, { parametre: { ledd: 1 } });
    _tømCache();
    const to = await kjør('mortensrud_dag');
    const ider = new Set(to.r.veier.map(v => v.id));
    expect(en.r.veier.length).toBeGreaterThan(0);
    for (const v of en.r.veier) expect(ider.has(v.id)).toBe(true);
    expect(to.r.veier.filter(v => v.ledd === 2).every(v => v.knute && v.inn)).toBe(true);
  });
  it('en vei bærer grunnlaget: planlagt stoppsekvens eller avgang i søkevinduet — aldri «bekreftet»', async () => {
    const { r } = await kjør('nesttun_dag');
    expect(new Set(r.veier.map(v => v.grunnlag))).toEqual(new Set(['planlagt stoppsekvens', 'avgang i søkevinduet']));
    expect(r.veier.filter(v => v.stoppliste === 'plan').every(v => v.grunnlag === 'planlagt stoppsekvens')).toBe(true);
    for (const o of r.opsjoner) expect(o.confirmations).toEqual([]);
  });
});

describe('4b: knutepunkter etter marginal nettverksdekning', () => {
  it('alle kandidater rapporteres med status og grunn; høyst knuteMaks spørres', async () => {
    for (const n of SCENARIOER) {
      const { r } = await kjør(n);
      expect(r.knutepunkter.vurdert.every(k => k.status && k.grunn)).toBe(true);
      expect(r.knutepunkter.spurt.length).toBeLessThanOrEqual(PARAMETRE.knuteMaks);
      expect(r.rapport.knutepunkter.vurdert).toBe(r.knutepunkter.vurdert.length);
    }
  });
  it('linjene leses på samlestoppet: søskenstoppenes linjer er med', async () => {
    const info = O.mortensrud_dag.opptak.stoppinfo.svar.data.stopPlaces.filter(Boolean);
    const modi = qs => new Set((qs || []).flatMap(q => q.lines.map(l => l.transportMode)));
    const { r } = await kjør('mortensrud_dag');
    const vurdert = new Map(r.knutepunkter.vurdert.map(k => [k.id, k]));
    // understopp som mangler et transportmiddel samlestoppet har, og der samlestoppet er vurdert
    const søsken = info.filter(s => s.parent && vurdert.has(s.parent.id) && [...modi(s.parent.quays)].some(m => !modi(s.quays).has(m)));
    expect(søsken.length).toBeGreaterThan(0);
    for (const s of søsken) expect(new Set(vurdert.get(s.parent.id).moduser)).toEqual(modi(s.parent.quays));
  });
  it('forhåndsvalget er marginalt: hvert spurt knutepunkt tilførte linjer da det ble valgt', async () => {
    for (const n of SCENARIOER) {
      const { r } = await kjør(n);
      const spurt = r.knutepunkter.vurdert.filter(k => k.status === 'spurt' || k.status === 'spurt, uten svar');
      expect(spurt.filter(k => k.fase === 1).every(k => k.marginaleLinjer > 0)).toBe(true);
      expect(spurt.map(k => k.rekkefølge)).toEqual(spurt.map((_, i) => i + 1));
      // fase 2 kommer bare etter at fase 1 er tom for nye linjer
      const f = spurt.map(k => k.fase);
      expect(f).toEqual([...f].sort());
    }
  });
  it('Tretten: sentrumsstoppene i Lillehammer med de samme linjene spørres ikke hver for seg', async () => {
    const { r } = await kjør('tretten_dag');
    const dekket = r.knutepunkter.vurdert.filter(k => /dekkes av valgte knutepunkter \(Lillehammer skysstasjon\)/.test(k.grunn));
    expect(dekket.length).toBeGreaterThan(0);
    expect(r.rapport.knutepunkter.fase1).toBeLessThan(6);
  });
});

describe('4b.1: utfylling av ledig kapasitet', () => {
  it('fyller opp til knuteMaks når fase 1 er tom — Tretten og natt — uten flere kall', async () => {
    for (const n of ['tretten_dag', 'mortensrud_natt']) {
      const { r, kall } = await kjør(n);
      const kandidater = r.knutepunkter.vurdert.filter(k => k.nyeLinjer > 0).length;
      expect(r.knutepunkter.spurt.length).toBe(Math.min(PARAMETRE.knuteMaks, kandidater));
      expect(r.rapport.knutepunkter.fase2).toBeGreaterThan(0);
      expect(kall.filter(k => k.navn === 'ledd 2').length).toBe(1);
    }
  });
  it('byene: fase 1 bruker alle plassene, utfyllingen endrer ingenting', async () => {
    for (const n of ['mortensrud_dag', 'nesttun_dag', 'ranheim_dag']) {
      const { r } = await kjør(n);
      expect(r.rapport.knutepunkter.fase2).toBe(0);
    }
  });
  it('rekkefølgen i fase 2 er deterministisk: flest linjer utover ledd 1, så id', async () => {
    const { r } = await kjør('tretten_dag');
    const f2 = r.knutepunkter.vurdert.filter(k => k.fase === 2);
    const sortert = [...f2].sort((a, b) => b.nyeLinjer - a.nyeLinjer || (a.id < b.id ? -1 : 1));
    expect(f2.map(k => k.id)).toEqual(sortert.map(k => k.id));
    expect(f2.every(k => /^utfylling: ledig kapasitet/.test(k.grunn))).toBe(true);
  });
  it('bredde går ikke ned med utfylling, og veiene beholdes', async () => {
    for (const n of SCENARIOER) {
      const uten = (await kjør(n, {}, { parametre: { knuteFyll: false } })).r; _tømCache();
      const med = (await kjør(n)).r; _tømCache();
      const m = x => ({ lr: Object.keys(x.grupper.linjeretning).length, omr: Object.keys(x.grupper.område).length, dest: x.rapport.kandidater.destinasjoner });
      expect(m(med).lr).toBeGreaterThanOrEqual(m(uten).lr);
      expect(m(med).omr).toBeGreaterThanOrEqual(m(uten).omr);
      expect(m(med).dest).toBeGreaterThanOrEqual(m(uten).dest);
      const ider = new Set(med.veier.map(v => v.id));
      expect(uten.veier.every(v => ider.has(v.id))).toBe(true);
    }
  });
  it('Tretten: utfyllingen gir nye linjeretninger', async () => {
    const uten = (await kjør('tretten_dag', {}, { parametre: { knuteFyll: false } })).r; _tømCache();
    const med = (await kjør('tretten_dag')).r;
    expect(Object.keys(med.grupper.linjeretning).length).toBeGreaterThan(Object.keys(uten.grupper.linjeretning).length);
  });
  it('bidrag per spurt knutepunkt: nye linjeretninger, områder, destinasjoner, alternative veier', async () => {
    const { r } = await kjør('mortensrud_dag');
    const spurt = r.knutepunkter.vurdert.filter(k => k.status === 'spurt');
    for (const k of spurt) expect(Object.keys(k.bidrag).sort()).toEqual(['alternativeVeier', 'destinasjoner', 'linjeretninger', 'nyeDestinasjoner', 'nyeLinjeretninger', 'nyeOmråder', 'nyeTransportmidler', 'områder']);
    expect(spurt.reduce((s, k) => s + k.bidrag.nyeOmråder, 0)).toBeGreaterThan(5);
  });
  it('tre nivåer: i rutetabellen men ikke i vinduet rapporteres per knutepunkt', async () => {
    const { r } = await kjør('mortensrud_natt');
    const k = r.knutepunkter.vurdert.filter(x => x.status === 'spurt');
    expect(k.length).toBeGreaterThan(0);
    expect(k.every(x => Array.isArray(x.iRutetabellIkkeIVindu))).toBe(true);
    expect(k.some(x => x.iRutetabellIkkeIVindu.length > 0)).toBe(true);
  });
  it('natt: knutepunkter som ikke tilfører noe er merket duplikat — ikke skjult', async () => {
    const { r } = await kjør('mortensrud_natt');
    expect(r.rapport.knutepunkter.duplikater).toBeGreaterThan(0);
    expect(r.knutepunkter.vurdert.find(k => k.duplikat)).toBeTruthy();
  });
  it('ledd 2 feiler: ledd 1 står, og det sies', async () => {
    const { r } = await kjør('ranheim_dag', { kast: ['ledd 2'] });
    expect(r.veier.every(v => v.ledd === 1)).toBe(true);
    expect(r.veier.length).toBeGreaterThan(0);
    expect(r.ikkeUndersøkt.some(x => /ledd 2 svarte ikke/.test(x.grunn))).toBe(true);
  });
  it('to ledd er grensen; ledd 2 bygger ikke et tredje', async () => {
    const { r } = await kjør('ranheim_dag');
    expect(Math.max(...r.veier.map(v => v.ledd))).toBe(2);
    expect(r.veier.every(v => !v.knute || r.knutepunkter.spurt.includes(v.knute))).toBe(true);
  });
});

/* ------------------------------------------------------------------ 4c */
const tilbudAv = (r, re) => r.opsjoner.filter(o => o.type === 'transport_offer' && re.test(o.label));
describe('4c: tynt tilbud og døgnoppslag', () => {
  it('utløses bare ved tynt ledd 1 (samlet): Tretten og natt ja, byene nei', async () => {
    const ut = {};
    for (const n of SCENARIOER) ut[n] = (await kjør(n)).r.natt.døgntilbud;
    expect(ut.tretten_dag.utløst).toBe(true);
    expect(ut.mortensrud_natt.utløst).toBe(true);
    for (const n of ['mortensrud_dag', 'nesttun_dag', 'ranheim_dag']) expect(ut[n]).toEqual({ utløst: false, ulikeLR: ut[n].ulikeLR, grense: PARAMETRE.tyntLR });
  });
  it('grensen er konfigurerbar: under, på og over (Ranheim har 7 linjeretninger i ledd 1)', async () => {
    const lr = (await kjør('ranheim_dag')).r.natt.døgntilbud.ulikeLR; _tømCache();
    expect(lr).toBe(7);
    const utløst = async t => { _tømCache(); const a = avspiller(O.ranheim_dag, { endre: (n, s) => s }); const r = await utforsk({ ...O.ranheim_dag.scenario, parametre: { tyntLR: t } }, { hent: async (n, q) => (n === 'døgnoppslag' ? { data: {} } : a.hent(n, q)) }); return r.natt.døgntilbud.utløst; };
    expect(await utløst(7)).toBe(false); // på grensen: «færre enn»
    expect(await utløst(6)).toBe(false); // under
    expect(await utløst(8)).toBe(true);  // over
  });
  it('byene er identiske med og uten regelen (tyntLR 0)', async () => {
    for (const n of ['mortensrud_dag', 'nesttun_dag', 'ranheim_dag']) {
      const med = (await kjør(n)).r; _tømCache();
      const uten = (await kjør(n, {}, { parametre: { tyntLR: 0 } })).r; _tømCache();
      expect(med.veier.map(v => v.id)).toEqual(uten.veier.map(v => v.id));
      expect(med.rapport.struktur).toEqual(uten.rapport.struktur);
      expect(med.rapport.kall).toEqual(uten.rapport.kall);
    }
  });
  it('Tretten: taxi 5035 og 142 mot Lillehammer i utvidet vindu; 142 mot Otta/Ringebu og taxi 5030/5031 senere med not_now', async () => {
    const { r } = await kjør('tretten_dag');
    const lr = r.grupper.linjeretning;
    const finn = re => Object.values(lr).filter(g => re.test(`${g.kode}>${g.retning}`));
    expect(finn(/^5035>Årnes/).every(g => g.vindu.includes('utvidet'))).toBe(true);
    expect(finn(/^142>Lillehammer$/).some(g => g.vindu.includes('utvidet'))).toBe(true);
    for (const re of [/^142>Ringebu/, /^5030>/, /^5031>/]) expect(finn(re).length && finn(re).every(g => g.vindu.includes('senere'))).toBeTruthy();
    for (const o of tilbudAv(r, /^taxi 503[01] /)) {
      expect(o.timetable).toBe('not_now');
      expect(tilgjengelighet(o, O.tretten_dag.scenario.tid)).toBe('in_timetable_not_now');
      expect(o.provenance.every(p => p.vindu === 'senere' && p.nesteAvgang)).toBe(true);
    }
  });
  it('natt: 70N og T-bane 3 senere i døgnet; døgntilbudet sier at tilbud finnes', async () => {
    const { r } = await kjør('mortensrud_natt');
    const d = r.natt.døgntilbud;
    expect(d.senere).toBeGreaterThan(0);
    expect(d.førsteNesteAvgang).toBeTruthy();
    expect(tilbudAv(r, /^bus 70N /).every(o => o.timetable === 'not_now')).toBe(true);
    expect(tilbudAv(r, /^metro 3 /).every(o => o.timetable === 'not_now')).toBe(true);
    expect(tilbudAv(r, /^bus 70N /).length).toBeGreaterThan(0);
  });
  it('nesteAvgang er den tidligste etter søketidspunktet, uavhengig av rekkefølgen i svaret', async () => {
    const snu = (n, s) => { if (n === 'døgnoppslag') for (const sp of Object.values(s.data)) sp.estimatedCalls.reverse(); return s; };
    const a = (await kjør('tretten_dag')).r; _tømCache();
    const b = (await kjør('tretten_dag', { endre: snu })).r;
    const neste = r => Object.fromEntries(r.opsjoner.filter(o => o.type === 'transport_offer' && o.timetable === 'not_now').map(o => [o.id, o.provenance.map(p => p.nesteAvgang).sort()]));
    expect(neste(b)).toEqual(neste(a));
    const tid = Date.parse(O.tretten_dag.scenario.tid);
    for (const v of Object.values(neste(a)).flat()) expect(Date.parse(v)).toBeGreaterThanOrEqual(tid);
  });
  it('senere veier åpner aldri knutepunkter', async () => {
    for (const n of ['tretten_dag', 'mortensrud_natt']) {
      const { r } = await kjør(n);
      const senereLR = new Set(Object.entries(r.grupper.linjeretning).filter(([, g]) => g.vindu.length === 1 && g.vindu[0] === 'senere').map(([k]) => k));
      expect(senereLR.size).toBeGreaterThan(0);
      for (const k of r.knutepunkter.vurdert) for (const inn of k.inn) expect(senereLR.has(inn)).toBe(false);
      expect(r.veier.filter(v => v.vindu === 'senere').every(v => v.ledd === 1 && !v.knute)).toBe(true);
    }
  });
  it('vindu og grunnlag holdes adskilt; utvidet er aldri «avgang i søkevinduet»', async () => {
    const { r } = await kjør('tretten_dag');
    for (const v of r.veier) {
      if (v.vindu === 'senere') expect(v.grunnlag).toBe('rutetilbud senere i døgnet');
      if (v.vindu === 'utvidet') expect(['avgang i utvidet søkevindu', 'planlagt stoppsekvens']).toContain(v.grunnlag);
      if (v.vindu === 'ordinært') expect(['avgang i søkevinduet', 'planlagt stoppsekvens']).toContain(v.grunnlag);
    }
    expect(r.veier.some(v => v.vindu === 'utvidet')).toBe(true);
  });
  it('not_now på opsjonsnivå: én vei i ordinært eller utvidet vindu holder opsjonen ute av not_now', async () => {
    for (const n of ['tretten_dag', 'mortensrud_natt']) {
      const { r } = await kjør(n);
      const per = new Map(); for (const v of r.veier) (per.get(v.opsjon) || per.set(v.opsjon, new Set()).get(v.opsjon)).add(v.vindu);
      for (const o of r.opsjoner) {
        const vs = o.type === 'transport_offer' ? new Set(o.provenance.map(p => p.vindu)) : per.get(o.id);
        expect(o.timetable === 'not_now').toBe([...vs].every(x => x === 'senere'));
      }
    }
  });
  it('ingen bekreftelse, ingen «nå»', async () => {
    for (const n of ['tretten_dag', 'mortensrud_natt']) {
      const { r } = await kjør(n);
      for (const o of r.opsjoner) { expect(o.confirmations).toEqual([]); expect(tilgjengelighet(o, O[n].scenario.tid)).not.toBe('now'); }
    }
  });
  it('senere tilbud blåser ikke opp bredden', async () => {
    const { r } = await kjør('tretten_dag');
    const nå = r.veier.filter(v => v.vindu !== 'senere');
    expect(r.rapport.struktur.områder).toBe(new Set(nå.map(v => v.område).filter(Boolean)).size);
    expect(r.rapport.struktur.linjeretninger).toBe(Object.values(r.grupper.linjeretning).filter(g => g.vindu.some(w => w !== 'senere')).length);
    expect(r.rapport.kandidater.senere.destinasjoner).toBeGreaterThan(0);
    expect(r.rapport.kandidater.destinasjoner + r.rapport.kandidater.senere.destinasjoner).toBe(r.opsjoner.filter(o => o.type === 'destination').length);
  });
  it('tidsforskyvningen skjules ikke: ledd 2 fra en utvidet inngang er merket', async () => {
    const { r } = await kjør('tretten_dag');
    const utv = new Set(Object.entries(r.grupper.linjeretning).filter(([, g]) => g.vindu.includes('utvidet')).map(([k]) => k));
    const fra = r.veier.filter(v => v.ledd === 2 && utv.has(v.inn));
    expect(fra.length).toBeGreaterThan(0);
    // merket hvis og bare hvis inngangen ikke finnes i ordinært vindu
    const ordinærInn = new Set(r.veier.filter(w => w.ledd === 1 && w.vindu === 'ordinært').map(w => w.directionId));
    for (const v of r.veier.filter(v => v.ledd === 2)) expect(!!v.tidsforskyvning).toBe(!ordinærInn.has(v.inn));
    for (const v of fra) { expect(v.tidsforskyvning).toMatch(/ikke tidskontrollert/); expect(v.vindu).toBe('utvidet'); }
    expect(r.veier.filter(v => v.vindu === 'ordinært').every(v => !v.tidsforskyvning)).toBe(true);
    expect(r.rapport.tidsforskjøvet).toBe(r.veier.filter(v => v.tidsforskyvning).length);
  });
  it('døgnoppslaget feiler: sagt eksplisitt, ledd 1 og 2 står', async () => {
    const { r } = await kjør('tretten_dag', { kast: ['døgnoppslag'] });
    expect(r.ikkeUndersøkt.some(x => x.hva === 'døgntilbud' && /svarte ikke/.test(x.grunn))).toBe(true);
    expect(r.veier.some(v => v.ledd === 1)).toBe(true);
    expect(r.veier.some(v => v.vindu === 'senere')).toBe(false);
  });
  it('begrenset døgnsvar rapporteres; fravær er ikke bevis', async () => {
    const { r } = await kjør('tretten_dag', {}, { parametre: { døgnAvgangerMaks: 3 } });
    expect(r.natt.døgntilbud.begrenset).toBe(true);
    expect(r.ikkeUndersøkt.some(x => /taket på 3 avganger/.test(x.grunn) && /fravær er ikke bevis/.test(x.grunn))).toBe(true);
  });
  it('ingen i vinduet, men senere: sies som «tilbud finnes senere», aldri «ingen muligheter»', async () => {
    const grense = Date.parse(O.tretten_dag.scenario.tid) + 2 * 60 * 60_000;
    const tom = (n, s) => {
      if (n === 'ledd 1') for (const sp of Object.values(s.data)) sp.estimatedCalls = [];
      if (n === 'døgnoppslag') for (const sp of Object.values(s.data)) sp.estimatedCalls = sp.estimatedCalls.filter(c => Date.parse(c.expectedDepartureTime) > grense);
      return s;
    };
    const { r } = await kjør('tretten_dag', { endre: tom });
    expect(r.ikkeUndersøkt.some(x => x.hva === 'muligheter i søkevinduet' && /tilbud finnes senere i døgnet/.test(x.grunn))).toBe(true);
    expect(r.ikkeUndersøkt.some(x => x.hva === 'muligheter')).toBe(false);
  });
  it('ledd 1 som feiler er ukjent, ikke tynt: intet døgnoppslag', async () => {
    const { r, kall } = await kjør('tretten_dag', { kast: ['ledd 1'] });
    expect(kall.some(k => k.navn === 'døgnoppslag')).toBe(false);
    expect(r.natt.døgntilbud.utløst).toBe(false);
  });
});

describe('4c: nesteAvgang (syntetisk)', () => {
  it('velger tidligste avgang etter søketidspunktet når svaret har dem i omvendt rekkefølge', async () => {
    const kallTil = (dir, t) => ({ quay: { id: 'Q:A' }, expectedDepartureTime: t, destinationDisplay: { frontText: dir }, serviceJourney: { id: 'SJ' + t, line: { id: 'L:S', publicCode: 'S', transportMode: 'bus' }, estimatedCalls: [{ quay: { id: 'Q:A', stopPlace: sted('NSR:StopPlace:1', 60, 10) } }, { quay: { id: 'Q:Y', stopPlace: sted('NSR:StopPlace:Y') } }] } });
    const F = syntetisk({
      geokoder: RING.opptak.geokoder.svar, 'gangtid tilgang': RING.opptak['gangtid tilgang'].svar,
      'ledd 1': { data: { s0: { estimatedCalls: [kallTil('Nær', '2026-11-24T12:10:00+01:00')].map(c => ({ ...c, serviceJourney: { ...c.serviceJourney, line: { id: 'L:N', publicCode: 'N', transportMode: 'bus' } } })) } } },
      døgnoppslag: { data: { s0: { estimatedCalls: [kallTil('Fjern', '2026-11-24T18:00:00+01:00'), kallTil('Fjern', '2026-11-24T16:00:00+01:00'), kallTil('Fjern', '2026-11-24T11:00:00+01:00')] } } },
      stoppinfo: { data: { stopPlaces: [{ id: 'NSR:StopPlace:Y', name: 'Y', parent: null, quays: [] }] } },
      'ledd 2': { data: {} },
    });
    const a = avspiller(F);
    const r = await utforsk({ ...F.scenario, parametre: { ledd: 1 } }, { hent: a.hent });
    const o = r.opsjoner.find(x => x.type === 'transport_offer' && x.timetable === 'not_now');
    expect(o.provenance.map(p => p.nesteAvgang)).toEqual(['2026-11-24T16:00:00+01:00']); // ikke 18:00 (først i svaret), ikke 11:00 (før søket)
  });
});
