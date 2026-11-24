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
import { nyOpsjon, nyOppdagelse, samle, avvik, tilgangsId } from './opsjonsmodell.js';

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
  /** Høyst så mange knutepunkter i ledd 2 — ett kall uansett (målt 0,4–1,1 s for 15). Startverdi. */
  knuteMaks: 15,
  /**
   * TYNT TILBUD (4c): færre enn så mange ulike linjeretninger i hele ledd 1
   * utløser ett døgnoppslag. Samlet, ikke per tilgangspunkt (et tomt stopp i
   * byen dekkes av naboene). Målt: Tretten 2, natt 3, Ranheim 7, Mortensrud 13.
   */
  tyntLR: 5,
  /** Utvidet vindu: horisonten × dette («dobles én gang»). */
  utvidelse: 2,
  /** Døgnoppslaget: vindu og tak (høyst 1 avgang per linjeretning). */
  døgnMin: 1440,
  døgnAvgangerMaks: 100,
  /** Fyll ledig plass under knuteMaks når fase 1 er tom for nye linjer (4b.1). */
  knuteFyll: true,
  /** Nettverksledd. To er utgangspunktet; tre er ikke implementert. */
  ledd: 2,
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

/** Grunnlaget for en vei: planlagt stoppsekvens går foran, ellers vinduet. */
export function grunnlagFor(vei) {
  if (vei.vindu === 'senere') return 'rutetilbud senere i døgnet';
  if (vei.stoppliste === 'plan') return 'planlagt stoppsekvens';
  return vei.vindu === 'utvidet' ? 'avgang i utvidet søkevindu' : 'avgang i søkevinduet';
}
/** Ledd 2 regnes fra nå; en inngang fra det utvidede vinduet er derfor ikke tidskontrollert. */
export const TIDSFORSKYVNING = 'inn fra utvidet vindu; ledd 2 regnet fra nå — ikke tidskontrollert';

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
  let ledd1Svarte = false;
  if (brukt.length) {
    const q = medPlan => '{' + brukt.map((s, i) => somAlias('s' + i, medPlanlagteStopp(boardGQL(s.id, P.avgangerMaks, tid, true, horisontFor(s.moduser, P.horisontMin), null, P.perLinje), medPlan))).join(' ') + '}';
    let j = await spør('ledd 1', 'oppdagelse', gql(q(true)));
    if (j && j.errors && !j.data) {
      notater.push('serviceJourney.quays avvist — turer uten sanntidsstoppliste får ingen stopp videre');
      j = await spør('ledd 1 uten planlagte stopp', 'oppdagelse', gql(q(false)));
    }
    ledd1Svarte = !!(j && j.data);
    brukt.forEach((s, i) => {
      const sp = j && j.data && j.data['s' + i];
      if (!sp) { ikkeUndersøkt.push({ hva: `avganger fra ${s.name}`, grunn: j ? 'mangler i svaret' : 'ledd 1 svarte ikke' }); return; }
      for (const c of sp.estimatedCalls || []) {
        const sj = c.serviceJourney || {}, line = sj.line || {};
        const { videre, kilde } = stoppVidere(sj, c.quay && c.quay.id);
        avganger.push({
          fra: s, quayId: c.quay && c.quay.id, tid: c.expectedDepartureTime, lineId: line.id, kode: line.publicCode, mode: line.transportMode,
          retning: c.destinationDisplay && c.destinationDisplay.frontText,
          videre, stoppliste: kilde, vindu: 'ordinært',
        });
      }
    });
  }

  /* C0. TYNT TILBUD (4c): ett døgnoppslag når hele ledd 1 har få linjeretninger.
   * Skiller «ikke noe tilbud» fra «tilbud, men ikke i vinduet». Hver linjeretning
   * som ikke er i ledd 1 plasseres etter sin TIDLIGSTE avgang etter `tid`:
   * innen horisonten → 'ordinært' (falt bare utenfor ledd 1s tak),
   * innen horisont × utvidelse → 'utvidet' (med i nettverket som ledd 1),
   * ellers → 'senere' (registreres, men åpner ingen knutepunkter). */
  const lrLedd1 = new Set(avganger.map(a => linjeretning(a.lineId, a.retning)));
  const senere = [];
  const døgntilbud = { utløst: false, ulikeLR: lrLedd1.size, grense: P.tyntLR };
  // Et ledd 1 som feilet er ukjent, ikke tynt: da utløses ingen døgnoppslag.
  if (brukt.length && ledd1Svarte && lrLedd1.size < P.tyntLR) {
    Object.assign(døgntilbud, { utløst: true, linjeretningerIDøgnet: 0, iVindu: lrLedd1.size, iUtvidet: 0, senere: 0, førsteNesteAvgang: null, begrenset: false, begrensetFra: [] });
    const q = '{' + brukt.map((s, i) => somAlias('s' + i, medPlanlagteStopp(boardGQL(s.id, P.døgnAvgangerMaks, tid, true, P.døgnMin, null, 1)))).join(' ') + '}';
    const j = await spør('døgnoppslag', 'oppdagelse', gql(q));
    if (!j || !j.data) { døgntilbud.feil = true; ikkeUndersøkt.push({ hva: 'døgntilbud', grunn: 'døgnoppslaget svarte ikke — tilbud senere i døgnet er ikke undersøkt' }); }
    const nesteAv = new Map(); // `${stopp}|${dir}` → tidligste avgang etter tid
    brukt.forEach((s, i) => {
      const sp = j && j.data && j.data['s' + i];
      if (!sp) { if (j && j.data) ikkeUndersøkt.push({ hva: `døgntilbud fra ${s.name}`, grunn: 'mangler i svaret' }); return; }
      const kall = sp.estimatedCalls || [];
      if (kall.length >= P.døgnAvgangerMaks) {
        døgntilbud.begrenset = true; døgntilbud.begrensetFra.push(s.name);
        ikkeUndersøkt.push({ hva: `døgntilbud fra ${s.name}`, grunn: `svaret nådde taket på ${P.døgnAvgangerMaks} avganger — døgnet kan være ufullstendig; fravær er ikke bevis` });
      }
      for (const c of kall) {
        const t = Date.parse(c.expectedDepartureTime);
        if (!(t >= +tid)) continue;
        const line = (c.serviceJourney && c.serviceJourney.line) || {};
        const dir = linjeretning(line.id, c.destinationDisplay && c.destinationDisplay.frontText);
        const k = `${s.id}|${dir}`;
        if (!nesteAv.has(k) || t < nesteAv.get(k).t) nesteAv.set(k, { t, s, c, dir });
      }
    });
    const dirsIDøgnet = new Set(lrLedd1);
    for (const { t, s, c, dir } of [...nesteAv.values()].sort((a, b) => a.t - b.t || (a.dir < b.dir ? -1 : 1))) {
      dirsIDøgnet.add(dir);
      if (lrLedd1.has(dir)) continue;
      const sj = c.serviceJourney || {}, line = sj.line || {};
      const { videre, kilde } = stoppVidere(sj, c.quay && c.quay.id);
      const d = (t - +tid) / 60000;
      const a = { fra: s, quayId: c.quay && c.quay.id, tid: c.expectedDepartureTime, lineId: line.id, kode: line.publicCode, mode: line.transportMode, retning: c.destinationDisplay && c.destinationDisplay.frontText, videre, stoppliste: kilde };
      const h = horisontFor(s.moduser, P.horisontMin);
      // Innenfor vinduet, men utenfor ledd 1s tak: ordinært — det ER i søkevinduet.
      if (d <= h) avganger.push({ ...a, vindu: 'ordinært' });
      else if (d <= h * P.utvidelse) avganger.push({ ...a, vindu: 'utvidet' });
      else senere.push({ ...a, vindu: 'senere', nesteAvgang: c.expectedDepartureTime });
    }
    døgntilbud.linjeretningerIDøgnet = dirsIDøgnet.size;
    døgntilbud.iVindu = new Set(avganger.filter(a => a.vindu === 'ordinært').map(a => linjeretning(a.lineId, a.retning))).size;
    døgntilbud.iUtvidet = new Set(avganger.filter(a => a.vindu === 'utvidet').map(a => linjeretning(a.lineId, a.retning))).size;
    døgntilbud.senere = new Set(senere.map(a => linjeretning(a.lineId, a.retning))).size;
    døgntilbud.førsteNesteAvgang = [...avganger.filter(a => a.vindu === 'utvidet'), ...senere].map(a => a.tid).sort()[0] || null;
  }

  /* samlestopp for stoppene videre (parent som probe, med fallback) */
  const videreIder = [...new Set([...avganger, ...senere].flatMap(a => a.videre.map(v => v.id)))];
  const info = new Map();
  if (videreIder.length) {
    const q = f => `{stopPlaces(ids:${JSON.stringify(videreIder)}){id name ${f} quays{lines{id transportMode}}}}`;
    // Samlestoppets quays inkluderer søskenstoppenes (målt: Helsfyr 17 mot understoppets 11, med T-bane).
    let j = await spør('stoppinfo', 'oppdagelse', gql(q('parent{id name latitude longitude quays{lines{id transportMode}}}')));
    if (j && j.errors && !j.data) {
      notater.push('stopPlaces.parent avvist — deduplisering på understopp');
      j = await spør('stoppinfo uten parent', 'oppdagelse', gql(q('')));
    }
    for (const s of (j && j.data && j.data.stopPlaces) || []) if (s) info.set(s.id, s);
    if (!j) ikkeUndersøkt.push({ hva: 'samlestopp for stopp videre', grunn: 'stoppinfo svarte ikke; deduplisering på understopp' });
  }
  const samleAv = id => { const s = info.get(id); return (s && s.parent && s.parent.id) || id; };
  const samleSted = v => { const s = info.get(v.id); const p = s && s.parent; return p ? { id: p.id, name: p.name, lat: p.latitude, lon: p.longitude } : { id: v.id, name: v.name, lat: v.lat, lon: v.lon }; };

  /* kandidatopsjoner, nettverksveier og grupperingsindeks.
   * En OPSJON er hva du kan gjøre; en VEI er én konkret nettverksvei dit
   * (tilgang → [linjeretning inn → knutepunkt →] linjeretning → destinasjon).
   * Sammenslåing av opsjoner (samle) kan slå sammen stier med samme linje i
   * hver sin retning (ringlinjer); `veier` beholder alle, med grunnlaget. */
  const kand = [], veiMap = new Map();
  const lr = {}, omr = {}, tilb = {};
  const leggTil = (m, k, v) => { (m[k] = m[k] || new Set()).add(v); };
  const nyLR = (a, dir, ledd, knute) => {
    lr[dir] = lr[dir] || { lineId: a.lineId, kode: a.kode, modus: a.mode, retning: a.retning, tilgang: new Set(), knuter: new Set(), ledd: new Set(), destinasjoner: new Set(), stoppliste: new Set(), vindu: new Set(), avgangerVed: {} };
    lr[dir].stoppliste.add(a.stoppliste); lr[dir].ledd.add(ledd); lr[dir].vindu.add(a.vindu || 'ordinært');
    // Avgangstidene vi alt har fått, per stopp, i det ordinære vinduet (tillegg, «ett bytte» forslag 4:
    // hvor ofte det går). Høyst perLinje per linje og skilt; ingen ny spørring.
    if (a.tid && (a.vindu || 'ordinært') === 'ordinært' && a.fra && a.fra.id) {
      const t = lr[dir].avgangerVed[a.fra.id] = lr[dir].avgangerVed[a.fra.id] || [];
      if (!t.includes(a.tid)) { t.push(a.tid); t.sort(); }
    }
    if (knute) lr[dir].knuter.add(knute); else lr[dir].tilgang.add(a.fra.id);
    return lr[dir];
  };
  const apAv = a => ({ parentId: a.fra.id, stopPlaceId: a.fra.id, quayId: a.quayId, mode: a.mode, lineId: a.lineId, distanceM: a.fra.luftM, walkMin: a.fra.gangMin });
  /** Legg en destinasjon via én vei. Gir opsjons-id. */
  const destinasjon = (sted, ap, sti, dir, vei) => {
    const o = nyOpsjon({ type: 'destination', nøkkel: { destinasjon: sted.id }, label: sted.name, intent: 'reise til et sted', origin: pos, destinations: [sted], hubs: sti.hubs, accessPoints: [ap], discovery: disc, provenance: [sti] });
    kand.push(o);
    lr[dir].destinasjoner.add(o.id);
    const område = områdeFor(pos, sted, P.områdeBåndKm);
    if (område) { omr[område] = omr[område] || { destinasjoner: new Set(), linjeretninger: new Set() }; omr[område].destinasjoner.add(o.id); omr[område].linjeretninger.add(dir); }
    const id = [vei.tilgang, vei.inn || '', vei.knute || '', dir, sted.id].join('#');
    if (!veiMap.has(id)) veiMap.set(id, { id, opsjon: o.id, ledd: vei.ledd, tilgang: vei.tilgang, inn: vei.inn || null, knute: vei.knute || null, directionId: dir, stoppliste: vei.stoppliste, avgang: vei.avgang, område, vindu: vei.vindu, grunnlag: grunnlagFor(vei),
      ...(vei.nesteAvgang ? { nesteAvgang: vei.nesteAvgang } : {}), ...(vei.tidsforskyvning ? { tidsforskyvning: vei.tidsforskyvning } : {}) });
    return o.id;
  };

  /* ledd 1 (ordinært og utvidet vindu) og døgnets senere tilbud */
  for (const a of [...avganger, ...senere]) {
    const dir = linjeretning(a.lineId, a.retning);
    const ap = apAv(a);
    const sen = a.vindu === 'senere';
    const sti = { discoverer: sen ? 'nettverksutforsker:døgn' : 'nettverksutforsker:ledd1', oppdagelse: oppdagelse.id, accessPoint: ap, lineId: a.lineId, directionId: dir, hubs: [], stoppliste: a.stoppliste, vindu: a.vindu, ...(sen ? { nesteAvgang: a.nesteAvgang } : {}) };
    const tilbud = nyOpsjon({ type: 'transport_offer', nøkkel: { tilgang: a.fra.id, modus: a.mode, linje: a.lineId }, label: `${a.mode} ${a.kode || ''} fra ${a.fra.name}`.trim(), intent: 'bruke et tilbud i nærheten', origin: pos, accessPoints: [ap], discovery: disc, provenance: [sti], timetable: sen ? 'not_now' : 'running' });
    kand.push(tilbud);
    nyLR(a, dir, 1, null);
    leggTil(tilb, tilbud.id, dir);
    for (const v of a.videre) {
      const sted = samleSted(v);
      if (sted.id === samleAv(a.fra.id)) continue;
      destinasjon(sted, ap, sti, dir, { ledd: 1, tilgang: tilgangsId(ap), stoppliste: a.stoppliste, avgang: a.tid, vindu: a.vindu, nesteAvgang: a.nesteAvgang });
    }
  }

  /* C. knutepunkter: samlestopp ledd 1 når, vurdert etter hva de kan tilføre */
  const kjent = {
    linjer: new Set(avganger.map(a => a.lineId)), modi: new Set(avganger.map(a => a.mode)),
    lr: new Set(Object.keys(lr).filter(d => [...lr[d].vindu].some(v => v !== 'senere'))),
    områder: new Set([...veiMap.values()].filter(v => v.vindu !== 'senere').map(v => v.område).filter(Boolean)),
    dest: new Set([...veiMap.values()].filter(v => v.vindu !== 'senere').map(v => v.opsjon)),
  };
  // Knutepunktkandidater bare blant stopp ordinært/utvidet ledd 1 når — senere tilbud åpner ingen knutepunkter.
  const nåbare = new Set(avganger.flatMap(a => a.videre.map(v => samleAv(v.id))));
  const tilgangSamle = new Set(brukt.map(t => samleAv(t.id)));
  const kn = new Map();
  for (const [id, s] of info) {
    const pid = samleAv(id);
    if (tilgangSamle.has(pid) || !nåbare.has(pid)) continue;
    const p = s.parent;
    const e = kn.get(pid) || { id: pid, navn: (p && p.name) || s.name, lat: p ? p.latitude : null, lon: p ? p.longitude : null, linjer: new Map(), inn: new Map() };
    for (const q of ((p && p.quays) || s.quays || [])) for (const l of q.lines || []) e.linjer.set(l.id, l.transportMode);
    kn.set(pid, e);
  }
  for (const a of avganger) for (const v of a.videre) {
    const e = kn.get(samleAv(v.id));
    if (e) { const dir = linjeretning(a.lineId, a.retning); if (!e.inn.has(dir)) e.inn.set(dir, a); }
  }
  const vurdert = [...kn.values()].map(e => {
    const linjer = [...e.linjer.keys()], moduser = [...new Set(e.linjer.values())];
    return { e, id: e.id, navn: e.navn, linjer: linjer.length, nyeLinjer: linjer.filter(l => !kjent.linjer.has(l)).length, moduser, nyeModi: moduser.filter(m => !kjent.modi.has(m)), inn: [...e.inn.keys()].sort() };
  });
  // Marginalt forhåndsvalg (uten kall): hver gang det knutepunktet med flest linjer
  // som verken ledd 1 eller allerede valgte knutepunkter dekker. Ikke størrelse:
  // et stort knutepunkt med de samme linjene som et valgt gir 0.
  const dekket = new Set(kjent.linjer), valgtAv = new Map();
  let plass = P.knuteMaks, rekkefølge = 0;
  const igjen = new Set(vurdert.filter(k => k.nyeLinjer > 0));
  while (plass > 0 && igjen.size) {
    let best = null, bestN = 0;
    for (const k of igjen) {
      const n = [...k.e.linjer.keys()].filter(l => !dekket.has(l)).length;
      if (n > bestN || (n === bestN && n > 0 && (k.nyeModi.length > best.nyeModi.length || (k.nyeModi.length === best.nyeModi.length && k.id < best.id)))) { best = k; bestN = n; }
    }
    if (!best) break;
    best.status = 'spurt'; best.rekkefølge = ++rekkefølge; best.marginaleLinjer = bestN;
    best.grunn = `${bestN} linjer ikke dekket av ledd 1 eller tidligere valgte knutepunkter${best.nyeModi.length ? ', nye transportmidler: ' + best.nyeModi.join('/') : ''}`;
    for (const l of best.e.linjer.keys()) { if (!dekket.has(l)) valgtAv.set(l, best.navn); dekket.add(l); }
    best.fase = 1;
    igjen.delete(best); plass--;
  }
  // Fase 2 — UTFYLLING (4b.1): ledd 2 er ett kall uansett, så ledig plass under
  // knuteMaks koster ingenting. Kandidater med linjer utover ledd 1, som fase 1
  // regnet som dekket av valgte knutepunkter, tas etter tur: flest linjer utover
  // ledd 1, så id. Samme linje gjennom et annet knutepunkt kan gå i andre retninger
  // (målt: Tretten +8 linjeretninger). Ingen vekter; geografisk utslag ble målt og
  // valgt bort (docs/trinn-4-implementeringsplan.md, 4b.1).
  if (P.knuteFyll) {
    const fyll = [...igjen].sort((a, b) => b.nyeLinjer - a.nyeLinjer || (a.id < b.id ? -1 : 1));
    for (const k of fyll) {
      if (plass <= 0) break;
      k.status = 'spurt'; k.fase = 2; k.rekkefølge = ++rekkefølge; k.marginaleLinjer = 0;
      k.grunn = `utfylling: ledig kapasitet; linjene var dekket (${[...new Set([...k.e.linjer.keys()].map(l => valgtAv.get(l)).filter(Boolean))].sort().join(', ')}), men kan gå andre veier herfra`;
      igjen.delete(k); plass--;
    }
  }
  for (const k of vurdert) {
    if (k.status) continue;
    k.status = 'ikke spurt';
    if (!k.nyeLinjer) k.grunn = 'bare linjer som alt er sett i ledd 1';
    else if ([...k.e.linjer.keys()].every(l => dekket.has(l))) k.grunn = `linjene dekkes av valgte knutepunkter (${[...new Set([...k.e.linjer.keys()].map(l => valgtAv.get(l)).filter(Boolean))].sort().join(', ')})`;
    else { k.grunn = `utenfor knuteMaks ${P.knuteMaks}`; ikkeUndersøkt.push({ hva: `knutepunkt ${k.navn}`, grunn: k.grunn }); }
  }
  vurdert.sort((a, b) => (a.rekkefølge || 1e9) - (b.rekkefølge || 1e9) || b.nyeLinjer - a.nyeLinjer || (a.id < b.id ? -1 : 1));
  const spurt = vurdert.filter(k => k.status === 'spurt');

  /* D. ledd 2 fra knutepunktene, i én spørring */
  const avganger2 = [];
  if (P.ledd >= 2 && spurt.length) {
    const q = '{' + spurt.map((k, i) => somAlias('s' + i, medPlanlagteStopp(boardGQL(k.id, P.avgangerMaks, tid, true, horisontFor(k.moduser, P.horisontMin), null, P.perLinje)))).join(' ') + '}';
    const j = await spør('ledd 2', 'oppdagelse', gql(q));
    spurt.forEach((k, i) => {
      const sp = j && j.data && j.data['s' + i];
      k.horisontMin = horisontFor(k.moduser, P.horisontMin);
      if (!sp) { k.status = 'spurt, uten svar'; ikkeUndersøkt.push({ hva: `ledd 2 fra ${k.navn}`, grunn: j ? 'mangler i svaret' : 'ledd 2 svarte ikke' }); return; }
      const iVindu = new Set();
      for (const c of sp.estimatedCalls || []) {
        const sj = c.serviceJourney || {}, line = sj.line || {};
        const { videre, kilde } = stoppVidere(sj, c.quay && c.quay.id);
        iVindu.add(line.id);
        avganger2.push({ knute: k, quayId: c.quay && c.quay.id, tid: c.expectedDepartureTime, lineId: line.id, kode: line.publicCode, mode: line.transportMode, retning: c.destinationDisplay && c.destinationDisplay.frontText, videre, stoppliste: kilde });
      }
      // Tre nivåer holdes adskilt: i rutetabellen (quays.lines), i søkevinduet (avganger), bekreftet (reisesøk, ikke her).
      k.iRutetabellIkkeIVindu = [...k.e.linjer.keys()].filter(l => !iVindu.has(l) && !kjent.linjer.has(l)).sort();
    });
  } else if (P.ledd >= 2 && !spurt.length && vurdert.length) {
    ikkeUndersøkt.push({ hva: 'ledd 2', grunn: 'ingen knutepunkt med linjer utover ledd 1' });
  }
  for (const b of avganger2) {
    const k = b.knute;
    const dir = linjeretning(b.lineId, b.retning);
    nyLR({ ...b, fra: { id: k.id }, vindu: 'ordinært' }, dir, 2, k.id);
    for (const [inn, a] of k.e.inn) {
      const ap = apAv(a);
      const forskj = a.vindu === 'utvidet' ? TIDSFORSKYVNING : undefined;
      const sti = { discoverer: 'nettverksutforsker:ledd2', oppdagelse: oppdagelse.id, accessPoint: ap, lineId: b.lineId, directionId: dir, inn, hubs: [k.id], stoppliste: b.stoppliste, vindu: forskj ? 'utvidet' : 'ordinært', ...(forskj ? { tidsforskyvning: forskj } : {}) };
      for (const v of b.videre) {
        const sted = samleSted(v);
        if (sted.id === k.id || tilgangSamle.has(sted.id)) continue;
        // En vei som begynner i det utvidede vinduet er utvidet hele veien — ikke «ordinær» fordi ledd 2 er det.
        destinasjon(sted, ap, sti, dir, { ledd: 2, tilgang: tilgangsId(ap), inn, knute: k.id, stoppliste: b.stoppliste, avgang: b.tid, vindu: forskj ? 'utvidet' : 'ordinært', tidsforskyvning: forskj });
      }
    }
  }
  // Marginalt bidrag per knutepunkt, i vurderingsrekkefølge (måling, ikke kutt: alt som er hentet brukes).
  const sett = { lr: new Set(kjent.lr), områder: new Set(kjent.områder), modi: new Set(kjent.modi), dest: new Set(kjent.dest) };
  const veier = [...veiMap.values()];
  const veierNå = veier.filter(v => v.vindu !== 'senere');
  for (const k of spurt) {
    const mine = veier.filter(v => v.knute === k.id);
    const lrs = new Set(mine.map(v => v.directionId)), oms = new Set(mine.map(v => v.område).filter(Boolean)), ds = new Set(mine.map(v => v.opsjon));
    const modi = new Set(avganger2.filter(b => b.knute === k).map(b => b.mode));
    k.bidrag = {
      linjeretninger: lrs.size, nyeLinjeretninger: [...lrs].filter(x => !sett.lr.has(x)).length,
      områder: oms.size, nyeOmråder: [...oms].filter(x => !sett.områder.has(x)).length,
      nyeTransportmidler: [...modi].filter(x => !sett.modi.has(x)),
      destinasjoner: ds.size, nyeDestinasjoner: [...ds].filter(x => !sett.dest.has(x)).length,
      alternativeVeier: [...ds].filter(x => kjent.dest.has(x)).length,
    };
    k.duplikat = k.bidrag.nyeLinjeretninger === 0 && k.bidrag.nyeOmråder === 0 && k.bidrag.nyeDestinasjoner === 0;
    lrs.forEach(x => sett.lr.add(x)); oms.forEach(x => sett.områder.add(x)); modi.forEach(x => sett.modi.add(x)); ds.forEach(x => sett.dest.add(x));
  }
  const knutepunkter = { vurdert: vurdert.map(({ e, ...k }) => k), spurt: spurt.map(k => k.id) };

  const tilListe = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([a, b]) => [a, b instanceof Set ? [...b].sort() : b]))]));
  const grupper = { linjeretning: tilListe(lr) };
  grupper.område = tilListe(omr);
  grupper.tilbud = Object.fromEntries(Object.entries(tilb).map(([k, v]) => [k, { linjeretninger: [...v].sort() }]));

  const opsjoner = samle(kand);
  // not_now på OPSJONSNIVÅ, etter sammenslåing, på tvers av alle veier og tilgangspunkter:
  // én vei i ordinært eller utvidet vindu er nok til at opsjonen ikke er «senere».
  const vinduPer = new Map();
  for (const v of veier) (vinduPer.get(v.opsjon) || vinduPer.set(v.opsjon, new Set()).get(v.opsjon)).add(v.vindu);
  for (const o of opsjoner) {
    const vs = o.type === 'transport_offer' ? new Set(o.provenance.map(p => p.vindu)) : vinduPer.get(o.id);
    if (!vs) continue;
    if ([...vs].every(x => x === 'senere')) o.timetable = 'not_now';
    else if (o.type === 'transport_offer') o.timetable = 'running';
  }
  const ugyldige = opsjoner.filter(o => avvik(o).length);
  if (ugyldige.length) notater.push(`${ugyldige.length} opsjoner bryter kontrakten`);
  for (const [dir, g] of Object.entries(grupper.linjeretning)) if (g.stoppliste.length === 1 && g.stoppliste[0] === 'mangler') ikkeUndersøkt.push({ hva: `stopp videre på ${g.modus} ${g.kode} mot ${g.retning}`, grunn: 'Entur ga ingen stoppliste for turen' });
  if (!veierNå.length && senere.length) ikkeUndersøkt.push({ hva: 'muligheter i søkevinduet', grunn: `ingen i vinduet — tilbud finnes senere i døgnet, første avgang ${døgntilbud.førsteNesteAvgang}` });
  else if (!opsjoner.length) ikkeUndersøkt.push({ hva: 'muligheter', grunn: døgntilbud.utløst && !døgntilbud.feil && !døgntilbud.begrenset
    ? 'ingen i søkehorisonten eller døgnoppslaget — det betyr ikke at ingen finnes'
    : 'ingen ble oppdaget i søkehorisonten — det betyr ikke at ingen finnes' });

  const teller = t => kall.filter(k => k.type === t).length;
  const resultat = {
    oppdagelse: { ...oppdagelse, kall },
    tilgang: tilgang.map(({ lat, lon, ...t }) => ({ ...t, lat, lon })),
    kanter: [],
    knutepunkter,
    opsjoner, veier, grupper, ikkeUndersøkt, natt: { døgntilbud },
    rapport: {
      kall: { oppdagelse: teller('oppdagelse'), gang: teller('gang'), bekreftelse: 0 },
      feiledeKall: kall.filter(k => k.feil.length).map(k => `${k.navn}: ${k.feil.join(' | ')}`),
      ms: klokke() - t0, cachetreff: false,
      kandidater: { opsjoner: opsjoner.length, destinasjoner: opsjoner.filter(o => o.type === 'destination' && o.timetable !== 'not_now').length, tilbud: opsjoner.filter(o => o.type === 'transport_offer' && o.timetable !== 'not_now').length,
        senere: { destinasjoner: opsjoner.filter(o => o.type === 'destination' && o.timetable === 'not_now').length, tilbud: opsjoner.filter(o => o.type === 'transport_offer' && o.timetable === 'not_now').length } },
      vindu: Object.fromEntries(['ordinært', 'utvidet', 'senere'].map(w => { const vs = veier.filter(v => v.vindu === w); return [w, { veier: vs.length, linjeretninger: new Set(vs.map(v => v.directionId)).size, områder: new Set(vs.map(v => v.område).filter(Boolean)).size }]; })),
      tidsforskjøvet: veier.filter(v => v.tidsforskyvning).length,
      knutepunkter: { vurdert: vurdert.length, spurt: spurt.length, fase1: spurt.filter(k => k.fase === 1).length, fase2: spurt.filter(k => k.fase === 2).length, duplikater: spurt.filter(k => k.duplikat).length, ikkeSpurt: vurdert.length - spurt.length },
      veier: { totalt: veier.length, ledd1: veier.filter(v => v.ledd === 1).length, ledd2: veier.filter(v => v.ledd === 2).length, planlagt: veier.filter(v => v.stoppliste === 'plan').length },
      // BREDDE (søkevinduet): ordinært + utvidet. Senere tilbud står i `vindu.senere`.
      struktur: { linjeretninger: Object.values(grupper.linjeretning).filter(g => g.vindu.some(w => w !== 'senere')).length, medPlanlagtStoppliste: Object.values(grupper.linjeretning).filter(g => g.stoppliste.includes('plan') && g.vindu.some(w => w !== 'senere')).length, områder: new Set(veierNå.map(v => v.område).filter(Boolean)).size, tilgangspunkter: brukt.length },
      ikkeUndersøkt: ikkeUndersøkt.length, notater,
    },
  };
  _cache.push({ par: parNøkkel(P), tid, pos, lagret: nå, resultat });
  if (_cache.length > 8) _cache.shift();
  return resultat;
}
