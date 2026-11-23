/**
 * NETTVERKSUTFORSKEREN (plangrunnlaget steg 2, trinn 4). Finner ulike måter
 * brukeren kan komme seg ut i kollektivnettverket på — ikke flest mulig
 * destinasjoner. Plan: docs/trinn-4-implementeringsplan.md.
 *
 * Ansvar: tilgangspunkter (med luftlinje, gangavstand og gangtid adskilt),
 * nettverket i høyst to ledd, kandidatopsjoner etter kontrakten
 * (src/opsjonsmodell.js), grupperingsindeks (linjeretning, område, tilbud),
 * og en eksplisitt liste over hva som IKKE ble undersøkt.
 *
 * Ikke ansvar: relevans, rangering, presentasjon, snarveier, reisebekreftelse
 * (src/reisebekreftelse.js), fly. Håndhevet i tests/arkitektur.test.js.
 *
 * Nettet injiseres: `utforsk(ktx, { hent })`, der `hent(navn, forespørsel)`
 * gjør kallet og gir JSON. Testene spiller av opptak (tests/fixtures/entur/).
 *
 * Linjeretning er IKKE `lineId`: `lineId` er identiteten til en faktisk linje
 * i modellen (tilgangsId, stiId). Linjeretningen bæres som `directionId` på
 * stien og som nøkkel i `grupper.linjeretning`.
 */
import { metresBetween } from './haversine.js';
import { boardGQL } from './api/queries.js';
import { STOP_MODE } from './api/stopCats.js';
import { nyOpsjon, nyOppdagelse, samle, avvik } from './opsjonsmodell.js';

/**
 * STARTVERDIER — ikke produktregler. Alle kan overstyres per kall og
 * rapporteres i resultatet (`oppdagelse.parametre`).
 */
export const PARAMETRE = Object.freeze({
  /** Søkeheuristikk for tilgangspunkter (luftlinje). Ikke «nær». */
  søkTilgangM: 1500,
  tilgangMaks: 15,
  /**
   * Gangtid i minutter, per bruk — ingen universell «nær».
   *   ordinær     tilgangspunkt du går til uten å tenke over det
   *   alternativ  lengre gange godtas når stoppet gir et transportmiddel de
   *               ordinære ikke har (Ranheim stasjon: 8 min til tog)
   *   knutepunkt  brukes i 4b/4e
   */
  gangMin: { ordinær: 10, alternativ: 15, knutepunkt: 20 },
  /**
   * Uten målt gangtid: bare stopp innenfor dette (luftlinje) regnes som
   * ordinære. Eget faktum, ikke tavlas VIKTIG_GANG_M (src/api/stops.js, som
   * heller ikke kan importeres her uten å dra inn ui/). Startverdi.
   */
  gangUkjentLuftM: 400,
  /** Søkehorisont i minutter per transportmiddel; et stopp får det største av sine. */
  horisontMin: { standard: 60, rail: 180, coach: 180, water: 180, taxi: 120 },
  perLinje: 2,
  avgangerMaks: 60,
  /** Områder: 8 kompassretninger × avstandsbånd (km). Startverdi (3.5 §9). */
  områdeBåndKm: [5, 15, 50, 150],
  cache: { flyttM: 200, gyldigMs: 10 * 60_000 },
});

const STASJON = new Set(['railStation', 'metroStation', 'ferryStop', 'harbourPort']);
const SEKTOR = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
const JP = 'https://api.entur.io/journey-planner/v3/graphql';
const GEO = 'https://api.entur.io/geocoder/v1/reverse';

/** En byggers `{stopPlace(…)}` → `alias: stopPlace(…)`, for å samle i én spørring. */
export const somAlias = (alias, q) => alias + ': ' + q.trim().replace(/^\{\s*/, '').replace(/\}\s*$/, '');
const gql = q => ({ url: JP, method: 'POST', body: JSON.stringify({ query: q }) });

/** Område for et punkt sett fra posisjonen: kompassretning og avstandsbånd. */
export function områdeFor(pos, p, båndKm = PARAMETRE.områdeBåndKm) {
  if (!p || !Number.isFinite(p.lat)) return null;
  const km = metresBetween(pos, p) / 1000;
  const i = båndKm.findIndex(b => km < b);
  const bånd = i < 0 ? `${båndKm[båndKm.length - 1]}+` : `${i ? båndKm[i - 1] : 0}–${båndKm[i]}`;
  if (km < 1) return `•|${bånd}`;
  const r = d => d * Math.PI / 180;
  const y = Math.sin(r(p.lon - pos.lon)) * Math.cos(r(p.lat));
  const x = Math.cos(r(pos.lat)) * Math.sin(r(p.lat)) - Math.sin(r(pos.lat)) * Math.cos(r(p.lat)) * Math.cos(r(p.lon - pos.lon));
  const grader = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return `${SEKTOR[Math.floor(((grader + 22.5) % 360) / 45)]}|${bånd}`;
}

/** Linjeretningens id: linje + skiltet retning. Ikke en linje-id. */
export const linjeretning = (lineId, retning) => `${lineId}>${retning || '?'}`;

/**
 * PLANLAGT STOPPLISTE SOM PROBE. Enkelte operatører (målt: Skyss linje 20,
 * 16E, 70, 610 ved Nesttun 2026-11-24) gir turen uten `estimatedCalls`; da
 * har den ingen stopp videre, og en hel linjeretning ser tom ut.
 * `serviceJourney.quays` ga den planlagte rekkefølgen for de samme turene.
 * Lagt til byggerens tekst her, så boardGQL og tavla er uendret.
 */
export function medPlanlagteStopp(q, på = true) {
  return på ? q.replace('serviceJourney{id ', 'serviceJourney{id quays{id stopPlace{id name latitude longitude}} ') : q;
}
const stedAv = x => ({ id: x.stopPlace.id, name: x.stopPlace.name, lat: x.stopPlace.latitude, lon: x.stopPlace.longitude });
/** Stoppene etter påstigningen: sanntid først, ellers planlagt. */
export function stoppVidere(sj, quayId) {
  const kall = (sj && sj.estimatedCalls) || [];
  const k = kall.findIndex(x => x.quay && x.quay.id === quayId);
  if (k >= 0 && kall.length) return { videre: kall.slice(k + 1).filter(x => x.quay && x.quay.stopPlace).map(x => stedAv(x.quay)), kilde: 'sanntid' };
  const plan = (sj && sj.quays) || [];
  const p = plan.findIndex(x => x && x.id === quayId);
  if (p >= 0) return { videre: plan.slice(p + 1).filter(x => x && x.stopPlace).map(stedAv), kilde: 'plan' };
  return { videre: [], kilde: 'mangler' };
}

/** Søkehorisont for et stopp: det største av transportmidlenes. */
export function horisontFor(moduser, h = PARAMETRE.horisontMin) {
  return Math.max(h.standard, ...(moduser || []).map(m => h[m] || h.standard));
}

/**
 * Tilgangspunkter: romslig søk (luftlinje) → målt gangtid → klassifisering.
 * Gangtiden beholdes også for stopp som ikke tas med videre.
 */
export function klassifiserTilgang(kandidater, P = PARAMETRE) {
  const ordinære = kandidater.filter(k => (k.gangMin != null ? k.gangMin <= P.gangMin.ordinær : k.luftM <= P.gangUkjentLuftM));
  const ordModi = new Set(ordinære.flatMap(k => k.moduser));
  return kandidater.map(k => {
    if (ordinære.includes(k)) return { ...k, rolle: 'ordinær', grunn: k.gangMin != null ? `gangtid ${k.gangMin} min` : `gangtid ukjent, ${k.luftM} m i luftlinje` };
    if (k.gangMin == null) return { ...k, rolle: 'utenfor', grunn: 'gangtid ukjent og for langt til å anta' };
    const nye = k.moduser.filter(m => !ordModi.has(m));
    if (k.gangMin <= P.gangMin.alternativ && nye.length) return { ...k, rolle: 'alternativ', grunn: `gangtid ${k.gangMin} min, gir ${nye.join('/')}` };
    return { ...k, rolle: 'utenfor', grunn: k.gangMin > P.gangMin.alternativ ? `gangtid ${k.gangMin} min over ${P.gangMin.alternativ}` : `gangtid ${k.gangMin} min, ingen nye transportmidler` };
  });
}

/* ------------------------------------------------------------------ cache */
const _cache = [];
export function _tømCache() { _cache.length = 0; }
const parNøkkel = P => JSON.stringify(P);

/**
 * Utforsk fra en posisjon. `ktx = { posisjon:{lat,lon}, tid, parametre? }`.
 * `hent(navn, {url, method, body})` → Promise<JSON>. `klokke()` → ms (cache).
 */
export async function utforsk(ktx, { hent, klokke = () => Date.now() }) {
  const P = { ...PARAMETRE, ...(ktx.parametre || {}) };
  const pos = ktx.posisjon, tid = new Date(ktx.tid);
  const nå = klokke();
  const treff = _cache.find(c => c.par === parNøkkel(P) && +c.tid === +tid
    && metresBetween(c.pos, pos) <= P.cache.flyttM && nå - c.lagret <= P.cache.gyldigMs);
  if (treff) return { ...treff.resultat, rapport: { ...treff.resultat.rapport, cachetreff: true } };

  const kall = [], ikkeUndersøkt = [], notater = [];
  const t0 = klokke();
  const spør = async (navn, type, req) => {
    const t = klokke();
    try {
      const j = await hent(navn, req);
      kall.push({ navn, type, ms: klokke() - t, feil: (j && j.errors || []).map(e => e.message).slice(0, 2) });
      return j;
    } catch (e) {
      kall.push({ navn, type, ms: klokke() - t, feil: [String(e && e.message || e)] });
      return null;
    }
  };

  /* A. tilgangspunkter: romslig søk */
  const geo = await spør('geokoder', 'oppdagelse', { url: `${GEO}?point.lat=${pos.lat}&point.lon=${pos.lon}&boundary.circle.radius=${P.søkTilgangM / 1000}&size=100&layers=venue`, method: 'GET' });
  if (!geo) ikkeUndersøkt.push({ hva: 'tilgangspunkter', grunn: 'geokoderen svarte ikke' });
  const funnet = ((geo && geo.features) || []).map(f => {
    const cats = f.properties.category || [];
    const [lon, lat] = f.geometry.coordinates;
    return {
      id: f.properties.id, name: f.properties.name, lat, lon, kategorier: cats,
      stasjon: cats.some(c => STASJON.has(c)),
      moduser: [...new Set(cats.map(c => STOP_MODE[c]).filter(Boolean))],
      luftM: Math.round(metresBetween(pos, { lat, lon })),
    };
  }).filter(s => /^NSR:StopPlace:/.test(s.id) && s.moduser.length && s.luftM <= P.søkTilgangM)
    .sort((a, b) => (b.stasjon - a.stasjon) || a.luftM - b.luftM || (a.id < b.id ? -1 : 1));
  const kandidater = funnet.slice(0, P.tilgangMaks);
  for (const s of funnet.slice(P.tilgangMaks)) ikkeUndersøkt.push({ hva: `tilgangspunkt ${s.name}`, grunn: `utenfor tilgangMaks ${P.tilgangMaks}` });

  /* gangtid: ett aliasert reisesøk til alle kandidatene */
  if (kandidater.length) {
    const q = '{' + kandidater.map((s, i) => `g${i}: trip(from:{coordinates:{latitude:${pos.lat},longitude:${pos.lon}}} to:{place:"${s.id}"} dateTime:"${tid.toISOString()}" walkSpeed:1.3 modes:{directMode:foot,transportModes:[]}){tripPatterns{duration walkDistance}}`).join(' ') + '}';
    const j = await spør('gangtid tilgang', 'gang', gql(q));
    kandidater.forEach((s, i) => {
      const p = j && j.data && j.data['g' + i] && j.data['g' + i].tripPatterns && j.data['g' + i].tripPatterns[0];
      s.gangM = p ? Math.round(p.walkDistance) : null;
      s.gangMin = p ? Math.round(p.duration / 60) : null;
      s.gangKilde = p ? 'reisesøk' : 'ukjent';
    });
    if (!j) ikkeUndersøkt.push({ hva: 'gangtid til tilgangspunkter', grunn: 'reisesøket svarte ikke; luftlinje brukt som heuristikk' });
  }
  const tilgang = klassifiserTilgang(kandidater, P);
  const brukt = tilgang.filter(t => t.rolle !== 'utenfor');
  for (const t of tilgang.filter(x => x.rolle === 'utenfor')) ikkeUndersøkt.push({ hva: `tilgangspunkt ${t.name}`, grunn: t.grunn });

  const oppdagelse = { ...nyOppdagelse({ posisjon: pos, tid, tilgangspunkter: brukt.map(t => ({ parentId: t.id, stopPlaceId: t.id, name: t.name, mode: t.moduser[0], distanceM: t.luftM, walkMin: t.gangMin })) }), parametre: P };
  const disc = [{ oppdagelse: oppdagelse.id, source: 'nettverksutforsker', at: oppdagelse.tid }];

  /* B. ledd 1: alle brukte tilgangspunkter i én spørring */
  const avganger = [];
  if (brukt.length) {
    const q = medPlan => '{' + brukt.map((s, i) => somAlias('s' + i, medPlanlagteStopp(boardGQL(s.id, P.avgangerMaks, tid, true, horisontFor(s.moduser, P.horisontMin), null, P.perLinje), medPlan))).join(' ') + '}';
    let j = await spør('ledd 1', 'oppdagelse', gql(q(true)));
    if (j && j.errors && !j.data) {
      notater.push('serviceJourney.quays avvist — turer uten sanntidsstoppliste får ingen stopp videre');
      j = await spør('ledd 1 uten planlagte stopp', 'oppdagelse', gql(q(false)));
    }
    brukt.forEach((s, i) => {
      const sp = j && j.data && j.data['s' + i];
      if (!sp) { ikkeUndersøkt.push({ hva: `avganger fra ${s.name}`, grunn: j ? 'mangler i svaret' : 'ledd 1 svarte ikke' }); return; }
      for (const c of sp.estimatedCalls || []) {
        const sj = c.serviceJourney || {}, line = sj.line || {};
        const { videre, kilde } = stoppVidere(sj, c.quay && c.quay.id);
        avganger.push({
          fra: s, quayId: c.quay && c.quay.id, tid: c.expectedDepartureTime, lineId: line.id, kode: line.publicCode, mode: line.transportMode,
          retning: c.destinationDisplay && c.destinationDisplay.frontText,
          videre, stoppliste: kilde,
        });
      }
    });
  }

  /* samlestopp for stoppene videre (parent som probe, med fallback) */
  const videreIder = [...new Set(avganger.flatMap(a => a.videre.map(v => v.id)))];
  const info = new Map();
  if (videreIder.length) {
    const q = f => `{stopPlaces(ids:${JSON.stringify(videreIder)}){id name ${f} quays{lines{id transportMode}}}}`;
    let j = await spør('stoppinfo', 'oppdagelse', gql(q('parent{id name latitude longitude}')));
    if (j && j.errors && !j.data) {
      notater.push('stopPlaces.parent avvist — deduplisering på understopp');
      j = await spør('stoppinfo uten parent', 'oppdagelse', gql(q('')));
    }
    for (const s of (j && j.data && j.data.stopPlaces) || []) if (s) info.set(s.id, s);
    if (!j) ikkeUndersøkt.push({ hva: 'samlestopp for stopp videre', grunn: 'stoppinfo svarte ikke; deduplisering på understopp' });
  }
  const samleAv = id => { const s = info.get(id); return (s && s.parent && s.parent.id) || id; };
  const samleSted = v => { const s = info.get(v.id); const p = s && s.parent; return p ? { id: p.id, name: p.name, lat: p.latitude, lon: p.longitude } : { id: v.id, name: v.name, lat: v.lat, lon: v.lon }; };

  /* kandidatopsjoner + grupperingsindeks */
  const kand = [];
  const grupper = { linjeretning: {}, område: {}, tilbud: {} };
  const leggTil = (m, k, v) => { (m[k] = m[k] || new Set()).add(v); };
  const lr = {}, omr = {}, tilb = {};
  for (const a of avganger) {
    const dir = linjeretning(a.lineId, a.retning);
    const ap = { parentId: a.fra.id, stopPlaceId: a.fra.id, quayId: a.quayId, mode: a.mode, lineId: a.lineId, distanceM: a.fra.luftM, walkMin: a.fra.gangMin };
    const sti = { discoverer: 'nettverksutforsker:ledd1', oppdagelse: oppdagelse.id, accessPoint: ap, lineId: a.lineId, directionId: dir, hubs: [] };
    const tilbud = nyOpsjon({ type: 'transport_offer', nøkkel: { tilgang: a.fra.id, modus: a.mode, linje: a.lineId }, label: `${a.mode} ${a.kode || ''} fra ${a.fra.name}`.trim(), intent: 'bruke et tilbud i nærheten', origin: pos, accessPoints: [ap], discovery: disc, provenance: [sti], timetable: 'running' });
    kand.push(tilbud);
    lr[dir] = lr[dir] || { lineId: a.lineId, kode: a.kode, modus: a.mode, retning: a.retning, tilgang: new Set(), knute: null, destinasjoner: new Set(), stoppliste: new Set() };
    lr[dir].stoppliste.add(a.stoppliste);
    lr[dir].tilgang.add(a.fra.id);
    leggTil(tilb, tilbud.id, dir);
    for (const v of a.videre) {
      const sted = samleSted(v);
      if (sted.id === samleAv(a.fra.id)) continue;
      const o = nyOpsjon({ type: 'destination', nøkkel: { destinasjon: sted.id }, label: sted.name, intent: 'reise til et sted', origin: pos, destinations: [sted], accessPoints: [ap], discovery: disc, provenance: [sti] });
      kand.push(o);
      lr[dir].destinasjoner.add(o.id);
      const område = områdeFor(pos, sted, P.områdeBåndKm);
      if (område) { omr[område] = omr[område] || { destinasjoner: new Set(), linjeretninger: new Set() }; omr[område].destinasjoner.add(o.id); omr[område].linjeretninger.add(dir); }
    }
  }
  const tilListe = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b instanceof Set ? [...b].sort() : b]))]));
  grupper.linjeretning = tilListe(lr);
  grupper.område = tilListe(omr);
  grupper.tilbud = Object.fromEntries(Object.entries(tilb).map(([k, v]) => [k, { linjeretninger: [...v].sort() }]));

  const opsjoner = samle(kand);
  const ugyldige = opsjoner.filter(o => avvik(o).length);
  if (ugyldige.length) notater.push(`${ugyldige.length} opsjoner bryter kontrakten`);
  for (const [dir, g] of Object.entries(grupper.linjeretning)) if (g.stoppliste.length === 1 && g.stoppliste[0] === 'mangler') ikkeUndersøkt.push({ hva: `stopp videre på ${g.modus} ${g.kode} mot ${g.retning}`, grunn: 'Entur ga ingen stoppliste for turen' });
  if (!opsjoner.length) ikkeUndersøkt.push({ hva: 'muligheter', grunn: 'ingen ble oppdaget i søkehorisonten — det betyr ikke at ingen finnes' });

  const teller = t => kall.filter(k => k.type === t).length;
  const resultat = {
    oppdagelse: { ...oppdagelse, kall },
    tilgang: tilgang.map(({ lat, lon, ...t }) => ({ ...t, lat, lon })),
    kanter: [],
    knutepunkter: { valgt: [], vurdert: [] },
    opsjoner, grupper, ikkeUndersøkt, natt: null,
    rapport: {
      kall: { oppdagelse: teller('oppdagelse'), gang: teller('gang'), bekreftelse: 0 },
      feiledeKall: kall.filter(k => k.feil.length).map(k => `${k.navn}: ${k.feil.join(' | ')}`),
      ms: klokke() - t0, cachetreff: false,
      kandidater: { opsjoner: opsjoner.length, destinasjoner: opsjoner.filter(o => o.type === 'destination').length, tilbud: opsjoner.filter(o => o.type === 'transport_offer').length },
      struktur: { linjeretninger: Object.keys(grupper.linjeretning).length, medPlanlagtStoppliste: Object.values(grupper.linjeretning).filter(g => g.stoppliste.includes('plan')).length, områder: Object.keys(grupper.område).length, tilgangspunkter: brukt.length },
      ikkeUndersøkt: ikkeUndersøkt.length, notater,
    },
  };
  _cache.push({ par: parNøkkel(P), tid, pos, lagret: nå, resultat });
  if (_cache.length > 8) _cache.shift();
  return resultat;
}
