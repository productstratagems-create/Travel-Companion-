/**
 * BRUKERPROFIL (v1.218.29) — ett fast konsept for reisemønsteret ditt.
 *
 * Bestilt: «Reisemønster tar utgangspunkt i: holdeplasser innen gangavstand
 * fra hjem, fra jobb, reisevaner ukedager og helg, per del av døgnet (morgen,
 * midt på dagen, ettermiddag, kveld, natt). Reiser beskrives som hjem→jobb,
 * jobb→hjem, hjem↔sentrum i helg. Data fra appen populerer profilen;
 * spørsmål i grensesnittet validerer og kompletterer den. Profilen brukes for
 * best mulig reiseforslag i auto-reise.»
 *
 * TO LAG, ÉN PROFIL:
 *   avledet  — regnet ut av reisehistorikken (`t.smartHist`) hver gang, aldri
 *              lagret. Svakt: et forslag å spørre om.
 *   sagt     — det du har svart (`t.profil`, nivå 1 «det du har sagt», til du
 *              sletter). Vinner alltid over det avledede.
 * `profil()` slår dem sammen. Ingen andre steder skal skrive ned hjem eller jobb.
 *
 * Hjem og jobb lagres som HOLDEPLASS (navn, id, koordinat for holdeplassen),
 * ikke som adresse eller eget punkt — valgt av brukeren.
 *
 * Ren der det betyr noe: `avledProfil`, `slåSammen`, `reiserI`, `nesteSpørsmål`
 * tar alt inn som argument, så reglene prøves uten lager og DOM.
 */
import { storage } from './storage.js';
import { VANE_MIN_TURER } from './api/smart.js';
import { CENTRE, AT_CENTRE_KM, kmTo } from './api/centre.js';

const KEY = 't.profil';

/* ── DØGNDELENE, én definisjon ─────────────────────────────────────────
 * Grensene på partall fordi historikken lagres i totimersbøtter (bucket =
 * timen/2). Valgt: 06 / 10 / 14 / 18 / 22. */
export const DØGNDELER = [
  { id: 'morgen', navn: 'morgen', fra: 6, til: 10 },
  { id: 'midt', navn: 'midt på dagen', fra: 10, til: 14 },
  { id: 'ettermiddag', navn: 'ettermiddag', fra: 14, til: 18 },
  { id: 'kveld', navn: 'kveld', fra: 18, til: 22 },
  { id: 'natt', navn: 'natt', fra: 22, til: 6 },
];
export const DAGTYPER = [{ id: 'ukedag', navn: 'hverdager' }, { id: 'helg', navn: 'helg' }];

/** Døgndelen en time hører til. */
export function delAvTime(t) {
  const h = ((t % 24) + 24) % 24;
  return (DØGNDELER.find(d => d.fra < d.til ? h >= d.fra && h < d.til : h >= d.fra || h < d.til)).id;
}
/** Døgndelen en totimersbøtte hører til (bøttene deler aldri en grense). */
export const delAvBøtte = b => delAvTime(b * 2);
export function dagtypeAv(ms) { const d = new Date(ms).getDay(); return d === 0 || d === 6 ? 'helg' : 'ukedag'; }

/* ── REISETYPENE ───────────────────────────────────────────────────────── */
export const REISETYPER = {
  'hjem-jobb': 'hjem → jobb',
  'jobb-hjem': 'jobb → hjem',
  'hjem-sentrum': 'hjem → sentrum',
  'sentrum-hjem': 'sentrum → hjem',
};

const nk = s => String(s || '').trim().toLowerCase();
/** Samme holdeplass: id når begge har en, ellers navnet. */
export function sammeSted(a, b) {
  if (!a || !b) return false;
  if (a.stopId && b.stopId) return a.stopId === b.stopId;
  return nk(a.navn) === nk(b.navn);
}
function iSentrum(p) {
  return !!p && Number.isFinite(p.lat) && kmTo(p, CENTRE) <= AT_CENTRE_KM;
}
/** Hva slags sted et punkt er i profilen: hjem, jobb, sentrum eller null. */
export function stedType(p, prof) {
  if (!p) return null;
  if (prof.hjem && (sammeSted(p, prof.hjem) || (prof.hjem.nær || []).some(n => sammeSted(p, n)))) return 'hjem';
  if (prof.jobb && (sammeSted(p, prof.jobb) || (prof.jobb.nær || []).some(n => sammeSted(p, n)))) return 'jobb';
  if (iSentrum(p)) return 'sentrum';
  return null;
}
export function reiseType(fra, til, prof) {
  const a = stedType(fra, prof), b = stedType(til, prof);
  const t = a && b && a !== b ? a + '-' + b : null;
  return t && REISETYPER[t] ? t : null;
}

/* ── AVLEDET AV HISTORIKKEN ────────────────────────────────────────────── */

/**
 * @param {Array} hist  `t.smartHist`: {fromName, fromStopId, toName, toStopId, toLat, toLon, bucket, isWeekend, count}
 * @param {{nei?:{hjem?:string[], jobb?:string[]}}} [o]  steder du har sagt nei til
 */
export function avledProfil(hist, o = {}) {
  const h = Array.isArray(hist) ? hist.filter(e => e && e.count > 0) : [];
  const nei = o.nei || {};
  const avvist = (rolle, s) => (nei[rolle] || []).some(x => sammeSted(s, x));
  const poeng = new Map();   // nøkkel → {sted, hjem, jobb}
  const sted = (navn, stopId, lat, lon) => {
    const k = stopId || nk(navn);
    if (!k) return null;
    const p = poeng.get(k) || { sted: { navn, stopId: stopId || null, lat: null, lon: null }, hjem: 0, jobb: 0 };
    if (Number.isFinite(lat) && p.sted.lat == null) { p.sted.lat = lat; p.sted.lon = lon; }
    poeng.set(k, p);
    return p;
  };
  h.forEach(e => {
    const del = delAvBøtte(e.bucket);
    const fra = sted(e.fromName, e.fromStopId, null, null);
    const til = sted(e.toName, e.toStopId, e.toLat, e.toLon);
    // HJEM: der hverdagsmorgenen starter, og der kvelden og natta ender.
    if (fra && !e.isWeekend && del === 'morgen') fra.hjem += e.count;
    if (til && (del === 'kveld' || del === 'natt')) til.hjem += e.count;
    // JOBB: der hverdagsmorgenen ender, og der hverdagsettermiddagen starter.
    if (til && !e.isWeekend && del === 'morgen') til.jobb += e.count;
    if (fra && !e.isWeekend && del === 'ettermiddag') fra.jobb += e.count;
  });
  const beste = (rolle, unntatt) => [...poeng.values()]
    .filter(p => p[rolle] >= VANE_MIN_TURER && !avvist(rolle, p.sted) && !(unntatt && sammeSted(p.sted, unntatt)))
    .sort((a, b) => b[rolle] - a[rolle])[0];
  const hj = beste('hjem', null);
  const hjem = hj ? { ...hj.sted, kilde: 'avledet', turer: hj.hjem } : null;
  const jb = beste('jobb', hjem);
  const jobb = jb ? { ...jb.sted, kilde: 'avledet', turer: jb.jobb } : null;
  return { hjem, jobb };
}

/* ── VANENE: dagtype × døgndel × reisetype ───────────────────────────── */

/**
 * Reisene i historikken, klassifisert med profilen, telt per celle.
 * @returns {{[celle:string]: {[type:string]: number}}}  celle = 'ukedag|morgen'
 */
export function vaneMatrise(hist, prof) {
  const ut = {};
  // Historikken lagrer koordinat bare for MÅLET. Et startsted får koordinaten
  // fra en annen reise som endte der — ellers ble «sentrum → hjem» aldri
  // kjent igjen (prøvd: Jernbanetorget → Mortensrud lørdag kveld).
  const ll = new Map();
  (hist || []).forEach(e => { if (e && Number.isFinite(e.toLat)) {
    if (e.toStopId) ll.set(e.toStopId, [e.toLat, e.toLon]);
    ll.set(nk(e.toName), [e.toLat, e.toLon]);
  } });
  (hist || []).forEach(e => {
    if (!e || !(e.count > 0)) return;
    const k = ll.get(e.fromStopId) || ll.get(nk(e.fromName)) || [null, null];
    const type = reiseType({ navn: e.fromName, stopId: e.fromStopId, lat: k[0], lon: k[1] },
      { navn: e.toName, stopId: e.toStopId, lat: e.toLat, lon: e.toLon }, prof);
    if (!type) return;
    const celle = (e.isWeekend ? 'helg' : 'ukedag') + '|' + delAvBøtte(e.bucket);
    ut[celle] = ut[celle] || {};
    ut[celle][type] = (ut[celle][type] || 0) + e.count;
  });
  return ut;
}

/* ── DET DU HAR SAGT ──────────────────────────────────────────────────── */

const TOM = () => ({ hjem: null, jobb: null, nei: { hjem: [], jobb: [] }, reiser: {} });
export function lesSagt() {
  try {
    const v = JSON.parse(storage.get(KEY) || 'null');
    if (!v || typeof v !== 'object') return TOM();
    return { ...TOM(), ...v, nei: { hjem: [], jobb: [], ...(v.nei || {}) }, reiser: v.reiser || {} };
  } catch { return TOM(); }
}
function skrivSagt(v) { try { storage.set(KEY, JSON.stringify(v)); } catch { /* fullt */ } }

/** «Ja, dette er hjem/jobb.» `nær` er holdeplassene innen gangavstand. */
export function settSted(rolle, s, nær) {
  const v = lesSagt();
  v[rolle] = { navn: s.navn, stopId: s.stopId || null, lat: s.lat ?? null, lon: s.lon ?? null, kilde: 'bekreftet',
    // Geokoderen gir én rad per transportmiddel («NSR:StopPlace:5687|metro»).
    // Holdeplassen er id-en før «|», og hver holdeplass står én gang.
    nær: [...new Map((nær || []).map(n => {
      const id = String(n.stopId || n.id || '').split('|')[0] || null;
      return [id || nk(n.navn || n.name), { navn: n.navn || n.name, stopId: id }];
    })).values()].slice(0, 12) };
  v.nei[rolle] = v.nei[rolle].filter(x => !sammeSted(x, s));
  skrivSagt(v);
}
/** «Nei, det er ikke hjem/jobb.» Huskes, så appen ikke spør igjen. */
export function avvisSted(rolle, s) {
  const v = lesSagt();
  if (v[rolle] && sammeSted(v[rolle], s)) v[rolle] = null;
  if (!v.nei[rolle].some(x => sammeSted(x, s))) v.nei[rolle].push({ navn: s.navn, stopId: s.stopId || null });
  skrivSagt(v);
}
/** Svar på «reiser du hjem → jobb hverdager om morgenen?». */
export function svarReise(celle, type, ja) {
  const v = lesSagt();
  v.reiser[celle + '|' + type] = ja ? 'ja' : 'nei';
  skrivSagt(v);
}
export function glemProfil() { try { storage.set(KEY, ''); } catch { /* */ } }

/* ── SAMMENSLÅTT ──────────────────────────────────────────────────────── */

/** Det sagte vinner; det avledede fyller hull. */
export function slåSammen(sagt, avledet) {
  const s = sagt || TOM();
  return {
    hjem: s.hjem || (avledet && avledet.hjem) || null,
    jobb: s.jobb || (avledet && avledet.jobb) || null,
    nei: s.nei, reiser: s.reiser || {},
  };
}

export function profil(hist) {
  const sagt = lesSagt();
  return slåSammen(sagt, avledProfil(hist, { nei: sagt.nei }));
}

/**
 * Reisene profilen venter i en celle, sterkest først. Bekreftet («ja») står
 * alltid; «nei» aldri; ellers når historikken har nok turer.
 * @returns {Array<{type, kilde:'bekreftet'|'avledet', turer:number}>}
 */
export function reiserI(prof, matrise, dagtype, del) {
  const celle = dagtype + '|' + del;
  const tall = (matrise && matrise[celle]) || {};
  return Object.keys(REISETYPER).map(type => {
    const svar = prof.reiser[celle + '|' + type];
    const turer = tall[type] || 0;
    if (svar === 'nei') return null;
    if (svar === 'ja') return { type, kilde: 'bekreftet', turer };
    return turer >= VANE_MIN_TURER ? { type, kilde: 'avledet', turer } : null;
  }).filter(Boolean).sort((a, b) => (b.kilde === 'bekreftet') - (a.kilde === 'bekreftet') || b.turer - a.turer);
}

/**
 * Det ene spørsmålet som er mest verdt å stille nå, eller null.
 * Rekkefølge: hjem, jobb, så vanene i cellen du er i, så de andre.
 * `hoppOver` er nøklene du har sagt «senere» til denne økta.
 */
export function nesteSpørsmål(prof, matrise, nå, hoppOver = new Set()) {
  const q = [];
  if (prof.hjem && prof.hjem.kilde === 'avledet') q.push({ nøkkel: 'hjem|' + (prof.hjem.stopId || nk(prof.hjem.navn)), art: 'sted', rolle: 'hjem', sted: prof.hjem,
    tekst: 'Bor du ved ' + prof.hjem.navn + '?' });
  if (prof.jobb && prof.jobb.kilde === 'avledet') q.push({ nøkkel: 'jobb|' + (prof.jobb.stopId || nk(prof.jobb.navn)), art: 'sted', rolle: 'jobb', sted: prof.jobb,
    tekst: 'Jobber eller studerer du ved ' + prof.jobb.navn + '?' });
  const her = dagtypeAv(nå) + '|' + delAvTime(new Date(nå).getHours());
  const celler = [her, ...Object.keys(matrise || {}).filter(c => c !== her)];
  celler.forEach(celle => {
    const [dt, del] = celle.split('|');
    reiserI(prof, matrise, dt, del).filter(r => r.kilde === 'avledet').forEach(r => q.push({
      nøkkel: 'reise|' + celle + '|' + r.type, art: 'reise', celle, type: r.type,
      tekst: 'Reiser du ' + REISETYPER[r.type] + ' ' + (dt === 'helg' ? 'i helgene' : 'på hverdager') + ', '
        + DØGNDELER.find(d => d.id === del).navn + '?',
    }));
  });
  return q.find(x => !hoppOver.has(x.nøkkel)) || null;
}

/**
 * Hvor profilen sier du skal NÅ: målet for den sterkeste reisen i cellen du
 * er i, fra der du står. Til auto-reise (neste reise og rangering av kortene).
 * @returns {{til:object, type:string, kilde:string}|null}
 */
export function målNå(prof, matrise, nå, her) {
  const reiser = reiserI(prof, matrise, dagtypeAv(nå), delAvTime(new Date(nå).getHours()));
  const fraType = her ? stedType(her, prof) : null;
  for (const r of reiser) {
    const [a, b] = r.type.split('-');
    if (fraType && fraType !== a) continue;
    const til = b === 'hjem' ? prof.hjem : b === 'jobb' ? prof.jobb : b === 'sentrum' ? { navn: 'sentrum', lat: CENTRE.lat, lon: CENTRE.lon } : null;
    if (til) return { til, type: r.type, kilde: r.kilde };
  }
  return null;
}

/**
 * Profilen som hypotese for «din vanlige reise» i auto-reise: reisen i
 * døgndelen du er i, eller den som starter innen `førMin`. Samme form som
 * `nesteReise` gir, pluss `treff(stopp)` — hjem og jobb treffes på alle
 * holdeplassene innen gangavstand, sentrum på avstand fra sentrum.
 */
export function hypoteseNå(prof, matrise, nå, her, førMin = 60) {
  const kandidater = [0, førMin * 60_000].map(dt => nå + dt);
  for (const t of kandidater) {
    const dt = new Date(t);
    const del = DØGNDELER.find(x => x.id === delAvTime(dt.getHours()));
    const m = målNå(prof, matrise, t, her);
    if (!m) continue;
    const start = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), del.fra).getTime()
      - (del.fra > del.til && dt.getHours() < del.til ? 24 * 3600_000 : 0);
    const slutt = start + (((del.til - del.fra) + 24) % 24) * 3600_000;
    const helg = dagtypeAv(t) === 'helg';
    const celle = (helg ? 'helg' : 'ukedag') + '|' + del.id;
    const til = m.til;
    const treff = til.navn === 'sentrum'
      ? st => Number.isFinite(st.lat) && kmTo(st, CENTRE) <= AT_CENTRE_KM
      : st => sammeSted({ navn: st.name || st.navn, stopId: st.id || st.stopId }, til)
        || (til.nær || []).some(n => sammeSted({ navn: st.name || st.navn, stopId: st.id || st.stopId }, n));
    return { toName: til.navn, fra: start, til: slutt, helg, bucket: Math.floor(dt.getHours() / 2),
      antall: (matrise[celle] && matrise[celle][m.type]) || 0, sagt: m.kilde === 'bekreftet' ? 1 : 0,
      tekst: (helg ? 'i helgene' : 'på hverdager') + ', ' + del.navn, retning: null,
      kilde: 'profil', celle, type: m.type, treff };
  }
  return null;
}
