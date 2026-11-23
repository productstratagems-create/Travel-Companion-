import { haver, NEAR_STOP_MAX_M, NEAR_SIZE } from '../geo.js';
import config from '../config.js';
import { enturFetch } from './http.js';
import { logMsg } from '../ui/log.js';
import { CAT_MODE, STOP_MODE, TRANSIT_CATS } from './stopCats.js';


let _cache = null;

/** Drop it, so an explicit refresh really asks again. See entur.js. */
export function _resetNearbyCache() {
  _cache = null;
}

export function fetchNearbyStops(lat, lon) {
  const now = Date.now();
  if (_cache && now - _cache.ts < 120000 && haver(lat, lon, _cache.lat, _cache.lon) < 100)
    return Promise.resolve(_cache.stops);

  const url = config.api.geocoderReverse
    + '?point.lat=' + lat
    + '&point.lon=' + lon
    // ONE definition of nearby, shared with geo.js. This said 0.8 while
    // geo.js said 0.85 — two circles for one idea, and the map quietly saw a
    // smaller one than the list beside it.
    + '&boundary.circle.radius=' + (NEAR_STOP_MAX_M / 1000)
    + '&size=' + NEAR_SIZE
    + '&layers=venue';

  return enturFetch(url)
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => {
      const seen = new Set();
      const stops = [];
      ((json && json.features) || []).forEach(f => {
        const cats = f.properties.category || [];
        const fLat = f.geometry.coordinates[1];
        const fLon = f.geometry.coordinates[0];
        const name = f.properties.name || f.properties.label || '';
        if (!fLat || !name) return;
        const baseId = f.properties.id || f.properties.gid || '';
        const dist = Math.round(haver(lat, lon, fLat, fLon));
        // Emit one entry per distinct transit mode served by this place
        const modesAdded = new Set();
        cats.forEach(cat => {
          // STOP_MODE, not CAT_MODE. The narrow table has no `tramStop` and
          // no `railStation`, so Bybanen and every railway station were
          // dropped here without a trace — part of what was reported as stops
          // the app cannot find in Bergen.
          const mode = STOP_MODE[cat];
          if (!mode || modesAdded.has(mode)) return;
          modesAdded.add(mode);
          const uid = baseId + '|' + mode;
          if (seen.has(uid)) return;
          seen.add(uid);
          stops.push({ id: uid, name, lat: fLat, lon: fLon, mode, dist });
        });
      });
      _cache = { ts: now, lat, lon, stops };
      return stops;
    });
}

/* LINJER PER HOLDEPLASS (v1.218.6). Geokoderen sier hvor en holdeplass er,
 * ikke hva som går der. Kartet trenger det siste for å vise bare holdeplasser
 * som gir en linje ingen nærmere har. Én spørring for alle, husket per id. */
const _linjer = new Map();
export function _resetStoppLinjer() { _linjer.clear(); _info.clear(); _hentet.clear(); _utenAvganger = false; }

/* VIKTIGHET (v1.218.10). Bestilt: «Vi trenger et system for å rangere
 * stoppesteder (uavhengig av transportmiddel) … flere transportmidler og
 * ruter/linjer på topp, og med kriterier som kan skille nr. 2 fra nr. 3.»
 *
 * Kriteriene, i rekkefølge — hver skiller bare der de foregående står likt:
 *   1. transportmidler   T-bane + buss slår buss alene, uansett antall linjer
 *   2. linjer            flere ulike linjer
 *   3. plattformer       plattformer med linjer — flere retninger og bytter
 * Linjene er ukjente til spørringen har svart: da teller geokoderens
 * transportmidler, med 0 linjer og 0 plattformer, så et ukjent stopp aldri
 * går foran et kjent med like mange transportmidler. */
const _info = new Map();
export function stoppInfo(id) { return _info.get(id); }
export function viktighet(s, info) {
  if (info) return info;
  return { moduser: ((s && s.modes) || []).slice(), linjer: 0, plattformer: 0 };
}
/** <0 når a er viktigst. */
/* TILBUDET NÅ OG VEKT PÅ TRANSPORTMIDDEL (v1.218.240). Evaluert: «antall
 * linjer ≠ tilbud» — en nattlinje talte like mye som en linje hvert femte
 * minutt, og én sjelden båt pluss buss slo et busstopp med 20 linjer. Bestilt
 * at dette styrer «nærmeste stopp» i Auto-reise og Auto-tavle.
 * Kriteriene nå, i rekkefølge:
 *   1. beste transportmiddel   tog/T-bane > trikk > buss/båt (MODUS_VEKT)
 *   2. avganger neste time     tilbudet nå (null = ukjent, teller som 0)
 *   3. linjer, 4. plattformer  som før */
// Alle Enturs TransportMode (v1.218.279, lest fra skjemaet): taxi = bestillingstransport, som buss.
export const MODUS_VEKT = { rail: 4, metro: 4, monorail: 4, tram: 3, bus: 2, coach: 2, trolleybus: 2, taxi: 2, water: 2, air: 1, cableway: 1, funicular: 1, lift: 1, snowAndIce: 1, carpool: 1 };
export function modusVekt(moduser) {
  return Math.max(0, ...(moduser || []).map(m => MODUS_VEKT[m] || 1));
}
export function sammenlignViktighet(a, b) {
  return (modusVekt(b.moduser) - modusVekt(a.moduser))
    || ((b.avgangerNå || 0) - (a.avgangerNå || 0))
    // Få avganger (v1.218.253): på bygda er neste time ofte 0 for alle — da
    // avgjør døgnet.
    || ((b.avgangerDøgn || 0) - (a.avgangerDøgn || 0))
    || (b.linjer - a.linjer) || (b.plattformer - a.plattformer);
}
/** Flere stopp i én klynge samlet: union av linjer og transportmidler, sum av avganger og plattformer. */
export function samletInfo(ids) {
  const deler = (ids || []).map(id => ({ id, info: _info.get(id), linjer: _linjer.get(id) })).filter(d => d.info);
  if (!deler.length) return undefined;
  const linjer = new Set(), moduser = [];
  let avgangerNå = null, plattformer = 0;
  deler.forEach(d => {
    (d.linjer || []).forEach(l => linjer.add(l));
    d.info.moduser.forEach(m => { if (!moduser.includes(m)) moduser.push(m); });
    plattformer += d.info.plattformer;
    if (d.info.avgangerNå != null) avgangerNå = (avgangerNå || 0) + d.info.avgangerNå;
  });
  return { moduser, linjer: linjer.size, plattformer, avgangerNå };
}
/* NÆR OG VIKTIG (v1.218.11). Bestilt: «Bruk dette rangeringssystemet i å
 * bestemme hvordan kartene skal se ut og hvilket innhold som skal være
 * prioritert … og for å velge til hvilken holdeplass du skal tegne opp
 * gangrute.» Valgt: viktigste innen gangavstand.
 *
 * Innen VIKTIG_GANG_M (fem minutter) avgjør viktigheten — Mortensrud T foran
 * busslomma nærmere. Utenfor avgjør avstanden, og alt innenfor kommer først.
 * ÉN regel: «du er ved» (og dermed gangruten), navnelappene i auto-reise og
 * utvalget på Tavla-kartet leser alle denne. */
export const VIKTIG_GANG_M = 400;
/**
 * BÅNDET SKALERER MED STEDET (v1.218.253). 400 m er riktig i byen; på bygda,
 * der nærmeste stopp er 1,8 km unna, ville tilbudet aldri telle. Båndet er
 * minst VIKTIG_GANG_M, og ellers halvannen gang avstanden til nærmeste stopp.
 */
export function båndFor(nærmesteM) {
  return Number.isFinite(nærmesteM) ? Math.max(VIKTIG_GANG_M, Math.round(nærmesteM * 1.5)) : VIKTIG_GANG_M;
}
export function nærViktigFørst(viktigAv, avstandAv = s => s.distM, bånd = VIKTIG_GANG_M) {
  // BÅNDET (v1.218.252): hvor langt «viktighet avgjør» rekker. 400 m for
  // «hvor er jeg nå»; et fast stopp velges for hele morgenen, og rangeres over
  // hele stopplista. Samme sammenligning — ett konsept.
  const d = s => { const v = avstandAv(s); return v == null ? Infinity : v; };
  return (a, b) => {
    // «Innenfor før utenfor» trengs ikke som eget ledd: et stopp innenfor er
    // alltid nærmere enn et utenfor, så avstanden under gir den rekkefølgen.
    // (Mutasjonstesten viste at leddet ikke kunne feile.)
    const ia = d(a) <= bånd, ib = d(b) <= bånd;
    return (ia && ib && viktigAv ? sammenlignViktighet(viktighet(a, viktigAv(a)), viktighet(b, viktigAv(b))) : 0)
      || (d(a) - d(b));
  };
}

/** Svar → Map(id → {moduser, linjer, plattformer}). */
export function infoFraSvar(j) {
  const m = new Map();
  ((j && j.data && j.data.stopPlaces) || []).forEach(sp => {
    if (!sp || !sp.id) return;
    const linjer = new Set(), moduser = [];
    let plattformer = 0;
    // Tilbudet nå (v1.218.240): kall neste time, når svaret har dem.
    // Neste time teller; døgnet skiller stopp med få avganger (v1.218.253).
    const kall = Array.isArray(sp.estimatedCalls) ? sp.estimatedCalls : null;
    const t0 = Date.now(), tid = c => Date.parse((c && (c.expectedDepartureTime || c.aimedDepartureTime)) || '');
    const avgangerNå = kall ? kall.filter(c => { const t = tid(c); return !Number.isFinite(t) || t <= t0 + 3600_000; }).length : null;
    const avgangerDøgn = kall ? kall.length : null;
    (sp.quays || []).forEach(q => {
      const ls = (q && q.lines) || [];
      if (ls.length) plattformer++;
      ls.forEach(l => { if (!l || !l.id) return; linjer.add(l.id); if (l.transportMode && !moduser.includes(l.transportMode)) moduser.push(l.transportMode); });
    });
    m.set(sp.id, { moduser, linjer: linjer.size, plattformer, avgangerNå, avgangerDøgn });
  });
  return m;
}

/** Svar → Map(id → [linje-id …]), alle plattformene slått sammen. */
export function linjerFraSvar(j) {
  const m = new Map();
  ((j && j.data && j.data.stopPlaces) || []).forEach(sp => {
    if (!sp || !sp.id) return;
    const ids = [];
    (sp.quays || []).forEach(q => (q && q.lines || []).forEach(l => { if (l && l.id && !ids.includes(l.id)) ids.push(l.id); }));
    m.set(sp.id, ids);
  });
  return m;
}

/** @returns {Promise<Map|null>} `null` når vi ikke fikk svar — da skjules ingenting. */
/** Tilbudet endrer seg over døgnet: et svar gjelder så lenge (v1.218.240). */
export const STOPP_INFO_MS = 10 * 60_000;
const _hentet = new Map();
let _utenAvganger = false;   // proben avvist: spør som før, uten avganger
/** Mangler eller er utdatert — skal hentes. */
export function stoppInfoUtdatert(id, nå = Date.now()) {
  const t = _hentet.get(id);
  return t == null || nå - t > STOPP_INFO_MS;
}
/** Døgnet, så stopp med få avganger skilles; høyst så mange kall per stopp. */
export const STOPP_VINDU_S = 86400, STOPP_KALL_MAKS = 50;
/** Stopp per spørring, og spørringer samtidig (v1.218.253): et knutepunkt
 *  med 100 stopp i nærheten ble ett enormt svar. */
export const STOPP_BIT = 20, STOPP_SAMTIDIG = 3;
/** Del i biter. Ren. */
export function iBiter(xs, n) { const ut = []; for (let i = 0; i < (xs || []).length; i += n) ut.push(xs.slice(i, i + n)); return ut; }
export function stoppInfoGql(ids, medAvganger) {
  return '{ stopPlaces(ids:' + JSON.stringify(ids) + ') { id quays { lines { id transportMode } }'
    + (medAvganger ? ' estimatedCalls(timeRange: ' + STOPP_VINDU_S + ', numberOfDepartures: ' + STOPP_KALL_MAKS + ') { expectedDepartureTime aimedDepartureTime }' : '') + ' } }';
}
export function fetchStoppLinjer(ids, nå = Date.now()) {
  const nye = [...new Set((ids || []).filter(id => id && stoppInfoUtdatert(id, nå)))];
  if (!nye.length) return Promise.resolve(_linjer);
  /* AVGANGENE SOM PROBE (v1.218.240): `estimatedCalls` på stopPlaces kan ikke
   * prøves herfra. Avviser Entur det, spørres det som før — uten avganger,
   * rangert på linjer — og det sies i loggen. */
  const spør = med => enturFetch(config.api.journeyPlanner, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: stoppInfoGql(nye, med) }),
  }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  const med = !_utenAvganger;
  const biter = iBiter(nye, STOPP_BIT);
  if (biter.length > 1) {
    // Høyst STOPP_SAMTIDIG om gangen; hver bit som før, enkeltvis.
    let i = 0, ok = false;
    const neste = () => (i < biter.length ? fetchStoppLinjer(biter[i++], nå).then(m => { if (m) ok = true; return neste(); }) : Promise.resolve());
    return Promise.all(Array.from({ length: Math.min(STOPP_SAMTIDIG, biter.length) }, neste)).then(() => (ok ? _linjer : null));
  }
  return spør(med)
    .then(j => {
      if (med && j && j.errors && j.errors.length && !(j.data && j.data.stopPlaces)) {
        _utenAvganger = true;
        try { logMsg('stoppinfo: avganger neste time avvist (' + String(j.errors[0].message).slice(0, 80) + ') — rangerer på linjer', 'warn'); } catch { /* */ }
        return spør(false);
      }
      return j;
    })
    .then(j => {
      linjerFraSvar(j).forEach((v, k) => _linjer.set(k, v));
      infoFraSvar(j).forEach((v, k) => _info.set(k, v));
      nye.forEach(id => _hentet.set(id, nå));
      return _linjer;
    })
    .catch(() => null);
}
export function stoppLinjer(id) { return _linjer.get(id); }

/**
 * RETNING I RANGERINGEN (v1.218.241; felles fra v1.218.242). Når en retning
 * gjelder — et retningsvalg i Auto-tavle, eller ruta selv i Rute — teller
 * avgangene den veien (`telling`: id → antall neste time) i stedet for alle.
 * Et stopp uten tall teller 0: vi vet ikke at noe går din vei. Uten telling:
 * som før.
 */
export function retningsViktig(viktigAv, telling, idAv = s => s.id) {
  if (!telling) return viktigAv;
  return s => { const i = viktigAv(s); return i ? { ...i, avgangerNå: telling.get(idAv(s)) || 0 } : i; };
}
