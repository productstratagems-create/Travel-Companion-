/**
 * ETT BYTTE (eksperiment) — limet mellom Auto-tavla og src/ettBytte.js.
 *
 * Hurtigvalget «ett bytte» viser hvilke områder du når med ett bytte, én rad
 * per himmelretning. Henter med nettverksutforskeren bare når valget trykkes
 * (utforskerens egen cache: 10 min / 200 m).
 *
 * TILBAKERULLING: sett ETT_BYTTE = false — eller fjern denne filen,
 * src/ettBytte.js, src/style/ettBytte.css og linjene merket
 * «ETT BYTTE (eksperiment)» i src/views/auto.js.
 */
import { utforsk } from '../nettverksutforsker.js';
import { ettByttePer, ettByttVeier, kommunerI, oftest, reiseSammendrag, FASETTER, FASETT_NAVN, listerHolder } from '../ettBytte.js';
import { reisesøkGql } from '../reisebekreftelse.js';
import { reiseRader } from '../reiseTil.js';
import { enturFetch } from '../api/http.js';
import { hentStedsinfo, hentHerInfo, KOMMUNE_BIT } from '../api/kommuner.js';
import { rekkeviddeFor, tellRekkevidde } from '../rekkevidde.js';
import { metresBetween } from '../haversine.js';
import { hentOpplevelser, hentGang, hentBerikelse, gangHeleVeienGql, parseGangHeleVeien } from '../api/opplevelserKilder.js';
import { velgVisning, grunnlag, gangFraStopp, kortData, søkTekst, INNGANGER } from '../opplevelser.js';
import { storage } from '../storage.js';
import '../style/ettBytte.css';

export const ETT_BYTTE = true;
export const ETT_BYTTE_VALG = 'bytte';
export const ETT_BYTTE_TEKST = 'ett bytte';
/** Høyst så mange linjer ut vises per rad; resten telles. */
export const UT_VIST = 4;

const hentFraEntur = (_navn, req) => enturFetch(req.url, {
  method: req.method, body: req.body, headers: req.body ? { 'Content-Type': 'application/json' } : {},
}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

let _tilstand = null; // { nøkkel, status: 'henter' | 'ok' | 'feil', svar, kommuner? }

/* KOMMUNER (forslag 3) og FYLKER (hvor langt, v1.218.308): src/api/kommuner.js. */
export { KOMMUNE_BIT };
/** Høyst så mange kommuner nevnes ved navn på kortet. */
export const EKSEMPLER_KOMMUNER = 3;
/** Kommuner vises i stedet for stopp først når retningen når så mange andre kommuner. */
export const KOMMUNER_MIN = 2;
/** Stopp-id → kommune og fylke, og der du står. Feiler stille: da står stoppene som før. */
export async function hentKommunerFraEntur(ider, pos) {
  const { kommuneAv, fylkeAv } = await hentStedsinfo(ider);
  const her = await hentHerInfo(pos);
  return { kommuneAv, fylkeAv, hjemme: her.kommune, hjemFylke: her.fylke };
}
/** Valgt retningskort ('NØ' …) eller null: kartet viser da den retningen. */
let _valgt = null;
/* SE ETTER: fasetten kortene grupperes etter (huskes ikke etter omlasting). */
let _fasett = 'retning';
let _visAlle = false;
/** Høyst så mange grupper vises før «vis alle» (retning har høyst 8 og foldes aldri). */
export const GRUPPER_VIST = 10;
export const valgtFasett = () => _fasett;
/** Bytt fasett: valgt kort og «vis alle» nullstilles, kartet går tilbake til oversikten. */
export function velgFasett(f) {
  if (!FASETTER.includes(f) || f === _fasett) return;
  _fasett = f; _valgt = null; _visAlle = false;
  if (_rerender) _rerender();
}
/** Kortene for gjeldende fasett, regnet én gang per svar og fasett (kommune: når kommunene er kommet). */
function aktuelle(t = _tilstand) {
  if (!t || !t.res) return t && t.svar;
  const f = _fasett === 'kommune' && !(t.kommuner && t.kommuner.kommuneAv) ? 'retning' : _fasett;
  const n = f + (f === 'kommune' ? '#k' : '');
  t.perFasett = t.perFasett || {};
  const nr = n + (_rekkevidde ? '@' + _rekkevidde + (t.kommuner ? '+k' : '') : '');
  const dom = _rekkevidde ? _dommer(t) : null;
  return t.perFasett[nr] || (t.perFasett[nr] = ettByttePer(t.res, t.pos, f, { kommuneAv: t.kommuner && t.kommuner.kommuneAv,
    behold: _rekkevidde ? (id => (dom.get(_destAv(t).get(id)) || {}).r === _rekkevidde) : null }));
}

/* HVOR LANGT (v1.218.308): valgt rekkevidde, eller null (alt). Settes av Auto-tavla. */
let _rekkevidde = null;
export function settRekkevidde(r) { if (r === _rekkevidde) return; _rekkevidde = r; _valgt = null; _visAlle = false; }
/** Opsjon-id → stedets id (samme id kommunene er hentet for). */
function _destAv(t) {
  if (!t._dest) t._dest = new Map(((t.res && t.res.opsjoner) || []).filter(o => o.destinations && o.destinations[0]).map(o => [o.id, o.destinations[0].id]));
  return t._dest;
}
/** Steds-id → rekkevidde-dom, for stedene ett bytte når. Kommunene teller når de er kommet; før det luftlinje (anslått). */
function _dommer(t) {
  const k = t.kommuner || null;
  const nøkkel = k ? 'k' : '-';
  if (t._dom && t._dom.n === nøkkel) return t._dom.m;
  const her = { lat: t.pos.lat, lon: t.pos.lon, kommune: k && k.hjemme, fylke: k && k.hjemFylke };
  const m = new Map();
  for (const o of (t.res && t.res.opsjoner) || []) {
    const d = o.destinations && o.destinations[0];
    if (!d) continue;
    m.set(d.id, rekkeviddeFor(her, { lat: d.lat, lon: d.lon, kommune: k && k.kommuneAv && k.kommuneAv.get(d.id), fylke: k && k.fylkeAv && k.fylkeAv.get(d.id) }));
  }
  t._dom = { n: nøkkel, m };
  return m;
}
/** Tallene for raden «hvor langt»: stedene ett bytte når, per rekkevidde. Null før svaret. */
export function ettBytteRekkevidde() {
  const t = _tilstand;
  if (!t || t.status !== 'ok' || !t.res) return null;
  const m = _dommer(t), dest = _destAv(t);
  const ider = new Set(ettByttVeier(t.res).map(v => dest.get(v.opsjon)).filter(Boolean));
  return tellRekkevidde([...ider].map(id => m.get(id)).filter(Boolean));
}
let _rerender = null;
let _hent = null;
/* SJEKK DENNE (forslag 5): reisesøk per sted, bare på trykk. stedId → { status, tekst, tid }. */
const _sjekk = new Map();
export const SJEKK_GYLDIG_MS = 10 * 60_000;
/** Høyst så mange steder står i lista under det valgte kortet. */
export const SJEKK_STEDER = 8;
export function _nullstillEttBytte() { _tilstand = null; _valgt = null; _fasett = 'retning'; _visAlle = false; _rerender = null; _hent = null; _sjekk.clear(); _rekkevidde = null; _oppl.clear(); _valgtOppl = null; _bildeEl.clear(); _kø.length = 0; _forhBerik.clear(); }
export const sjekkStatus = id => _sjekk.get(id) || null;
/** Tester: glem ett steds svar. */
export const _nullstillSjekk = id => _sjekk.delete(id);

/**
 * Sjekk ett sted: ett reisesøk fra posisjonen (samme spørring som
 * reisebekreftelsen, `reisesøkGql`). Svaret caches i SJEKK_GYLDIG_MS.
 */
export function sjekkSted(stedId, { nå = Date.now(), stille = false } = {}) {
  const t = _tilstand;
  if (!t || !t.svar || !_hent) return;
  const sv = aktuelle(t);
  const gammel = _sjekk.get(stedId);
  if (gammel && (gammel.status === 'henter' || nå - gammel.tid < SJEKK_GYLDIG_MS)) return;
  // Knutepunktet å sammenligne med: det valgte kortets, ellers første kort med stedet.
  const rad = (sv.rader.find(r => r.retning === _valgt && r.punkter.some(p => p.id === stedId)) || sv.rader.find(r => r.punkter.some(p => p.id === stedId)));
  const [lat, lon] = t.nøkkel.split(',').map(Number);
  // Startpunkt og søketidspunkt lagres på oppslaget (v1.218.314): opplevelseskortet kontrollerer dem (`grunnlag`).
  const fra = { lat: t.pos ? t.pos.lat : lat, lon: t.pos ? t.pos.lon : lon };
  const s = { status: 'henter', tid: nå, søkt: nå, fra };
  _sjekk.set(stedId, s);
  const q = '{' + reisesøkGql(fra, stedId, new Date(nå).toISOString(), 'eb') + '}';
  _hent('ett bytte: sjekk', { url: 'https://api.entur.io/journey-planner/v3/graphql', method: 'POST', body: JSON.stringify({ query: q }) })
    .then(j => { const rs = reiseSammendrag(j && j.data && j.data.eb && j.data.eb.tripPatterns, rad && rad.knuteNavn, rad && rad.knuterDetalj && rad.knuterDetalj.map(k => k.navn), rad && rad.linjepar); s.status = 'ok'; s.tekst = rs.tekst; s.utfall = rs.utfall; s.linjer = rs.linjer; s.tps = (j && j.data && j.data.eb && j.data.eb.tripPatterns) || [];
      // Ingen kollektivreise i søket: spør Entur om gange hele veien (ett kall, bare da).
      if (!reiseRader(s.tps, nå, null).some(x => x.type === 'kollektiv')) {
        _hent('ett bytte: gange', { url: 'https://api.entur.io/journey-planner/v3/graphql', method: 'POST', body: JSON.stringify({ query: gangHeleVeienGql(fra, stedId, new Date(nå).toISOString()) }) })
          .then(g => { s.gangHele = parseGangHeleVeien(g); if (_rerender) _rerender(); }).catch(() => {});
      } })
    .catch(() => { s.status = 'feil'; s.tekst = 'fikk ikke svar — prøv igjen'; s.tid = 0; })
    .finally(() => { if (_rerender) _rerender(); });
  if (_rerender && !stille) _rerender();
}

/**
 * REISENE SOM RADER (v1.218.305). Bestilt: «Hver enkelt reise under seksjonen
 * bør listes som de andre reiseforslagene under Auto-tavle.» Første reise per
 * sted fra reisesøket, som en rad av samme slag som kombinasjonsradene
 * (`reiseRader`). Går Entur en annen vei enn kortet, står det på raden. Ren.
 */
export function sjekkReise(stedId, nå = Date.now()) {
  const s = _sjekk.get(stedId);
  if (!s || s.status !== 'ok') return null;
  const r = reiseRader(s.tps, nå, null).find(x => x.type === 'kollektiv');
  if (!r) return null;
  // Én rad per sted: «minst gange» ville sammenlignet med reiser som ikke vises.
  r.fakta = r.fakta.filter(f => f !== 'minst gange');
  if (s.utfall === 'annen vei') r.fakta.push('andre byttested enn kortet');
  else if (s.linjer === 'andre') r.fakta.push('andre linjer enn kortet');
  return r;
}

/* OPPLEVELSER PÅ STEDSRADENE (v1.218.313, steg 1 — docs/tracer-opplevelser.md §16).
   Hentes når kortet velges, for de samme stedene som reisene. stedId → { status, data, gang }. */
const _oppl = new Map();
let _hentOppl = hentOpplevelser, _hentGang = hentGang, _hentBerik = hentBerikelse;
/** Tester: bytt ut kildene. */
export function _settOpplevelseKilder(o, g, b) { _hentOppl = o || hentOpplevelser; _hentGang = g || hentGang; _hentBerik = b || hentBerikelse; _oppl.clear(); }
export const OPPLEVELSER_VIST = 2;
export const opplevelseStatus = id => _oppl.get(id) || null;
/* FORHÅNDSVISNING PÅ KORTENE (v1.218.318): hvert kort viser sin beste opplevelse. Oppslagene går i en
   kø (3 samtidige) så Wikimedia, Entur og kildene ikke struper, og i «lett» modus uten gange og bilde. */
export const FORHÅND_STEDER = 3, FORHÅND_SAMTIDIG = 3;
let _køAktiv = 0; const _kø = [];
export const _køStatus = () => ({ aktiv: _køAktiv, venter: _kø.length });
function køet(arbeid) {
  _kø.push(arbeid); køKjør();
}
function køKjør() {
  while (_køAktiv < FORHÅND_SAMTIDIG && _kø.length) {
    const a = _kø.shift(); _køAktiv++;
    Promise.resolve().then(a).catch(() => {}).finally(() => { _køAktiv--; køKjør(); });
  }
}
function hentOpplevelserFor(p, { lett = false } = {}) {
  if (!p || !p.id || !Number.isFinite(p.lat)) return;
  const ek = _oppl.get(p.id);
  if (ek) { if (ek.lett && !lett && ek.status === 'ok') { ek.lett = false; fyllUt(p, ek); } return; }
  if (lett) return forhåndHent(p);
  const e = { status: 'henter', data: null, gang: new Map(), berik: new Map() };
  _oppl.set(p.id, e);
  // Et svar som kommer etter at tilstanden er nullstilt (nytt sted, nytt svar), tegner ingenting.
  const gjelder = () => _oppl.get(p.id) === e;
  Promise.resolve(_hentOppl({ id: p.id, lat: p.lat, lon: p.lon })).then(d => {
    e.status = 'ok'; e.data = d; fyllUt(p, e, gjelder);
  }).catch(() => { e.status = 'feil'; }).finally(() => { if (gjelder() && _rerender) _rerender(); });
}
/** Bilde, ingress og gangtid for det som vises (høyst OPPLEVELSER_VIST per sted). */
function fyllUt(p, e, gjelder = () => true) {
  for (const o of velgVisning(e.data && e.data.liste, OPPLEVELSER_VIST)) {
    Promise.resolve(_hentBerik(o)).then(b => { if (b) { e.berik.set(o.navn, b); if (gjelder() && _rerender) _rerender(); } }).catch(() => {});
    if (o.luft <= 100) continue;
    Promise.resolve(_hentGang({ id: p.id, lat: p.lat, lon: p.lon }, o)).then(g => { if (g) { e.gang.set(o.navn, g); if (gjelder() && _rerender) _rerender(); } }).catch(() => {});
  }
}
function forhåndHent(p) {
  const e = { status: 'henter', data: null, gang: new Map(), berik: new Map(), lett: true };
  _oppl.set(p.id, e);
  const gjelder = () => _oppl.get(p.id) === e;
  køet(() => Promise.resolve(_hentOppl({ id: p.id, lat: p.lat, lon: p.lon })).then(d => { e.status = 'ok'; e.data = d; })
    .catch(() => { e.status = 'feil'; }).finally(() => { if (gjelder() && _rerender) _rerender(); }));
}
/** Kortets beste opplevelse blant de forhåndsvalgte stedene: { o, sted } eller null. Ren mot tilstanden. */
export function besteForKort(r) {
  const alle = [];
  for (const p of spredt((r.punkter || []).filter(x => x.id && Number.isFinite(x.lat)), FORHÅND_STEDER)) {
    const e = _oppl.get(p.id);
    if (e && e.status === 'ok' && e.data) for (const o of e.data.liste) alle.push({ ...o, _sted: p });
  }
  const best = velgVisning(alle, 1)[0];
  return best ? { o: best, sted: best._sted, av: alle.length } : null;
}
export function forhåndFor(r) {
  for (const p of spredt((r.punkter || []).filter(x => x.id && Number.isFinite(x.lat)), FORHÅND_STEDER)) hentOpplevelserFor(p, { lett: true });
}
const _forhBerik = new Map();
/** Beste opplevelse øverst på kortet. Ingen funn: ingenting (kortet står som før). */
export function forhåndHtml(r, esc) {
  const gruppe = r.retningNavn || r.knuteNavn || '';
  const b = besteForKort(r);
  if (!b) return '';
  const { o, sted } = b;
  if (!_forhBerik.has(o.navn)) { _forhBerik.set(o.navn, null); Promise.resolve(_hentBerik(o)).then(x => { _forhBerik.set(o.navn, x || null); if (_rerender) _rerender(); }).catch(() => {}); }
  const be = _forhBerik.get(o.navn), k = kortData(o, null, [], be), hvorfor = k.hvorfor;
  return '<div class="eb-forh"><div class="eb-forh-tekst"><div class="eb-forh-merke">beste opplevelse i ' + esc(gruppe.toLowerCase()) + '</div>'
    + '<div class="eb-forh-navn">' + esc(o.navn) + '</div>'
    + '<div class="eb-forh-hva">' + esc(k.hva) + ' · ved ' + esc(sted.navn) + ' · ' + esc(k.gang.tekst === 'ved stoppet' ? 'ved stoppet' : k.gang.tekst + ' fra stoppet') + ((r.punkter || []).length > 1 ? ' · ett av ' + Math.min(FORHÅND_STEDER, r.punkter.length) + ' steder kortet dekker' : '') + '</div>'
    + (hvorfor ? '<div class="eb-forh-besk">' + esc(hvorfor.tekst) + '</div>' : '') + '</div>'
    + (k.bilde ? '<img class="eb-forh-bilde" src="' + esc(k.bilde.url) + '" alt="" decoding="sync">' : '') + '</div>';
}
/** «Ingen reise» sier hva søket var — aldri «utilgjengelig» (presisering, 25.11). */
export function ingenReiseTekst(s) {
  return 'ingen kollektivreise i søket ' + søkTekst(s.søkt) + ' — det betyr ikke at stedet ikke kan nås'
    + (s.gangHele ? ' · gange hele veien: ' + s.gangHele.min + ' min (' + (s.gangHele.m / 1000).toFixed(1).replace('.', ',') + ' km, Entur)' : '');
}
/* VALGT OPPLEVELSE — én tilstand for liste og kart (§18). */
let _valgtOppl = null;   // { stedId, navn }
export const valgtOpplevelse = () => _valgtOppl;
export function velgOpplevelse(stedId, navn, { rull = false } = {}) {
  _valgtOppl = _valgtOppl && _valgtOppl.stedId === stedId && _valgtOppl.navn === navn ? null : { stedId, navn };
  if (_rerender) _rerender();
  if (rull && _valgtOppl && typeof document !== 'undefined') setTimeout(() => {
    const el = [...document.querySelectorAll('#v-auto .eb-okort[data-oppl]')].find(x => x.dataset.oppl === stedId + '|' + navn);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, 0);
}
/** Kortdataene for et sted: høyst to opplevelser, med kontrollert grunnlag. Liste og kart leser det samme. */
export function kortFor(p, nå = Date.now()) {
  const e = _oppl.get(p.id);
  if (!e || e.status !== 'ok' || !e.data) return [];
  const plan = sjekkReise(p.id, nå);
  return velgVisning(e.data.liste, OPPLEVELSER_VIST).map(o => {
    const g = grunnlag(_sjekk.get(p.id), { id: p.id, navn: p.navn }, plan, gangFraStopp(e.gang.get(o.navn), o.luft), nå);
    return { ...kortData(o, g, e.data.punkter, e.berik.get(o.navn) || null), stedId: p.id };
  });
}
/** Opplevelseskortene under en stedsrad — i en egen del, «Ved <stopp>», skilt fra reisen (v1.218.315).
    Utprøvd kortmønster: bilde først, navn og kategori, én setning om hvorfor, faktaknapper, tydelige handlinger. */
export function opplevelseHtml(p, esc, nå = Date.now()) {
  const id = typeof p === 'string' ? p : p && p.id;
  const e = _oppl.get(id);
  if (!e) return '';
  if (e.status === 'henter') return '<div class="eb-ved"><div class="eb-oppl eb-oppl-henter">ser etter turer og steder …</div></div>';
  if (typeof p === 'string') return '';
  const kort = kortFor(p, nå);
  if (!kort.length) return '';
  return '<div class="eb-ved"><div class="eb-ved-tittel">Ved ' + esc(p.navn) + ' · ' + kort.length + (kort.length === 1 ? ' ting' : ' ting') + ' å oppleve</div>'
    + kort.map(k => {
      const valgt = !!(_valgtOppl && _valgtOppl.stedId === k.stedId && _valgtOppl.navn === k.navn);
      const kat = k.innganger[0];
      const fakta = [...k.aktiviteter, k.gang.type === 'målt' ? k.gang.tekst + ' å gå fra stoppet' : k.gang.type === 'luftlinje' ? (k.gang.tekst === 'ved stoppet' ? 'ved stoppet' : k.gang.tekst + ' fra stoppet (luftlinje)') : null, ...k.fasiliteter.map(f => f + ' ved')].filter(Boolean);
      return '<div class="eb-okort' + (valgt ? ' eb-okort-valgt' : '') + '" role="button" tabindex="0" aria-pressed="' + valgt + '" data-oppl="' + esc(k.stedId + '|' + k.navn) + '">'
        + (k.bilde ? '<figure class="eb-okort-bilde"><img src="' + esc(k.bilde.url) + '" alt="' + esc(k.navn) + '" decoding="sync">'
          + '<figcaption>Foto: ' + esc(k.bilde.fotograf) + ' · ' + (k.bilde.lisensUrl ? '<a href="' + esc(k.bilde.lisensUrl) + '" target="_blank" rel="noopener">' + esc(k.bilde.lisens) + '</a>' : esc(k.bilde.lisens)) + ' · Wikimedia Commons</figcaption></figure>' : '')
        + '<div class="eb-okort-topp"><span class="eb-okort-navn">' + esc(k.navn) + '</span>'
        + (kat ? '<span class="eb-okort-kat eb-kat-' + kat + '">' + esc(INNGANGER[kat]) + '</span>' : '') + '</div>'
        + '<div class="eb-okort-hva">' + esc(k.hva) + '</div>'
        + (k.hvorfor ? '<div class="eb-okort-besk">' + esc(k.hvorfor.tekst) + ' <span class="eb-okort-kilde">· ' + esc(k.hvorfor.kilde) + '</span></div>' : '')
        + (fakta.length ? '<div class="eb-okort-fakta">' + fakta.map(f => '<span>' + esc(f) + '</span>').join('') + '</div>' : '')
        + '<div class="eb-okort-handling">' + (k.lesMer ? '<a href="' + esc(k.lesMer) + '" target="_blank" rel="noopener">Les mer</a>' : '')
        + '<button type="button" class="eb-vis-kart" data-oppl-kart="' + esc(k.stedId + '|' + k.navn) + '">Vis på kart</button></div>'
        // Reisen hører til reisen: tilgang og «framme ca.» står som «hele turen», skilt fra stedet.
        + '<div class="eb-okort-tur"><span class="eb-okort-tur-tittel">Hele turen:</span> <span class="eb-t-' + k.tilgang.ord + '">' + esc(k.tilgang.ord) + '</span> (' + esc(k.tilgang.verdier) + ')'
        + (k.reise && k.reise.bestilling ? ' · bestillingstransport · må bestilles' : '') + (k.framme ? ' · ' + esc(k.framme) : '') + '</div>'
        + '<div class="eb-okort-kilde">kilder: ' + esc(k.kilder.join(', ')) + '</div>'
        + '</div>';
    }).join('') + '</div>';
}
/* TURRUTER PÅ KARTET (valgfritt, av som standard — beslutning 24.11). Kartverkets WMS oppå dagens kart. */
export const TURLAG_KEY = 't.turruteLag';
export const turLagPå = () => { try { return storage.get(TURLAG_KEY) === '1'; } catch { return false; } };
export const TURLAG_WMS = 'https://wms.geonorge.no/skwms1/wms.friluftsruter2';
export const TURLAG_LAG = 'Fotrute,Skiloype,Sykkelrute,Ruteinfopunkt';
let _turLag = null;
function oppdaterTurLag(map, L, vis) {
  if (_turLag && (_turLag.map !== map || !vis)) { try { _turLag.map.removeLayer(_turLag.lag); } catch (_) {} _turLag = null; }
  if (vis && map && L && !_turLag) {
    const lag = L.tileLayer.wms(TURLAG_WMS, { layers: TURLAG_LAG, format: 'image/png', transparent: true, version: '1.3.0', attribution: 'turruter © <a href="https://www.kartverket.no/" target="_blank" rel="noopener">Kartverket</a>' }).addTo(map);
    _turLag = { map, lag };
  }
}

/**
 * Lista under det valgte kortet: stedene, lengst unna først. Hvert sted er en
 * overskrift og reisen dit som rad (`radHtml`, Auto-tavlas egen radtegning),
 * eller hva appen ikke vet ennå: «henter», «ingen reise funnet», «fikk ikke svar».
 */
export function sjekkListeHtml(r, esc, radHtml = null, nå = Date.now()) {
  const steder = spredt(r.punkter.filter(p => p.id), SJEKK_STEDER);
  if (!steder.length) return '';
  const søkt = steder.map(p => _sjekk.get(p.id)).filter(x => x && x.status === 'ok' && Number.isFinite(x.søkt)).map(x => x.søkt);
  return '<div class="eb-sjekkliste" data-eb-liste="' + esc(r.retning) + '">'
    // Dato og klokkeslett (presisering 1): reisetidene gjelder dette søket.
    + (søkt.length ? '<div class="eb-søkt">reisetider gjelder søk ' + esc(søkTekst(Math.min(...søkt))) + ' fra der du står</div>' : '')
    + steder.map(p => {
      const s = _sjekk.get(p.id);
      const rad = radHtml && sjekkReise(p.id, nå);
      if (rad) return '<div class="eb-sted"><div class="eb-sted-navn"><small>reisen til</small> ' + esc(p.navn) + '</div>' + radHtml(rad, 'eb:' + p.id) + opplevelseHtml(p, esc, nå) + '</div>';
      const svar = !s ? '<span class="eb-sjekk-knapp">sjekk</span>' : s.status === 'henter' ? '<span class="eb-sjekk-svar">sjekker …</span>'
        : '<span class="eb-sjekk-svar' + (s.utfall === 'annen vei' ? ' eb-annen' : '') + '">' + esc(radHtml && s.status === 'ok' ? ingenReiseTekst(s) : s.tekst) + '</span>';
      return '<button type="button" class="eb-sjekk" data-eb-sted="' + esc(p.id) + '"><span class="eb-sjekk-navn">' + esc(p.navn) + '</span>' + svar + '</button>' + opplevelseHtml(p, esc, nå);
    }).join('')
    // Kildene står der opplevelsene står (CC BY 4.0 krever «© Kartverket»), og turrutene kan legges på kartet.
    + (steder.some(p => _oppl.has(p.id)) ? '<div class="eb-oppl-fot"><button type="button" class="eb-turlag" aria-pressed="' + turLagPå() + '">' + (turLagPå() ? 'skjul turruter på kartet' : 'vis turruter på kartet') + '</button>'
      + '<span class="eb-oppl-kilde">turruter © Kartverket · friluftsområder Miljødirektoratet · Wikidata</span></div>' : '')
    + '</div>';
}
export const valgtRetning = () => _valgt;

/**
 * Velg et retningskort (samme igjen = av). Kartet rammer inn retningen; av gir
 * oversikten tilbake. Kalles av kortet, av kartet (trykk på et sted) og testene.
 */
export function velgRetning(retning) {
  _valgt = _valgt === retning ? null : retning;
  _valgtOppl = null; // nytt kort: valgt opplevelse nullstilles
  // Reisene hentes med en gang (v1.218.305): stedene står som rader, ikke som «sjekk».
  const t = _tilstand, rad = _valgt && t && t.svar && aktuelle(t).rader.find(x => x.retning === _valgt);
  if (rad) spredt(rad.punkter.filter(p => p.id), SJEKK_STEDER).forEach(p => { sjekkSted(p.id, { stille: true }); hentOpplevelserFor(p); }); // én tegning for alle
  if (_rerender) _rerender();
}

// Én delegert lytter for kortene, bundet første gang lista tegnes: ingen ny krok i auto.js.
let _lytter = false;
/* BILDENE BLINKER IKKE (v1.218.317). Tavla bytter ut hele innholdet hvert sekund, så hvert
   bilde ble et nytt <img> som måtte dekodes på nytt. Observeren bytter det nye elementet mot
   det ferdig lastede for samme src — flyttet, ikke lastet på nytt — før neste tegning. */
export const _bildeEl = new Map();
export const BILDE_MAKS = 32;
export function gjenbrukBilder(rot) {
  for (const img of rot.querySelectorAll('.eb-okort-bilde img')) {
    const src = img.getAttribute('src'), gammel = _bildeEl.get(src);
    if (gammel && gammel !== img) { if (gammel.complete) img.replaceWith(gammel); continue; }
    if (!gammel) {
      if (_bildeEl.size >= BILDE_MAKS) _bildeEl.delete(_bildeEl.keys().next().value);
      _bildeEl.set(src, img);
    }
  }
}
function bindKort() {
  if (_lytter || typeof document === 'undefined') return;
  _lytter = true;
  const rot = document.getElementById('v-auto');
  if (rot && typeof MutationObserver !== 'undefined') new MutationObserver(() => gjenbrukBilder(rot)).observe(rot, { childList: true, subtree: true });
  document.addEventListener('click', e => {
    const sj = e.target && e.target.closest && e.target.closest('#v-auto .eb-sjekk[data-eb-sted]');
    if (sj) { sjekkSted(sj.dataset.ebSted); return; }
    if (e.target && e.target.closest && e.target.closest('#v-auto .eb-okort a')) return; // «Les mer» og lisens: bare lenken
    const vk = e.target && e.target.closest && e.target.closest('#v-auto .eb-vis-kart[data-oppl-kart]');
    if (vk) { const [sid, ...n] = vk.dataset.opplKart.split('|'); if (!(_valgtOppl && _valgtOppl.stedId === sid && _valgtOppl.navn === n.join('|'))) velgOpplevelse(sid, n.join('|')); const k = document.querySelector('#v-auto .leaflet-container'); if (k) k.scrollIntoView({ block: 'nearest' }); return; }
    const ok = e.target && e.target.closest && e.target.closest('#v-auto .eb-okort[data-oppl]');
    if (ok) { const [sid, ...n] = ok.dataset.oppl.split('|'); velgOpplevelse(sid, n.join('|')); return; }
    if (e.target && e.target.closest && e.target.closest('#v-auto .eb-turlag')) { try { storage.set(TURLAG_KEY, turLagPå() ? '0' : '1'); } catch (_) {} if (_kart) oppdaterTurLag(_kart.map, _kartL, !!_valgt && turLagPå()); if (_rerender) _rerender(); return; }
    const fa = e.target && e.target.closest && e.target.closest('#v-auto [data-eb-fasett]');
    if (fa) { velgFasett(fa.dataset.ebFasett); return; }
    if (e.target && e.target.closest && e.target.closest('#v-auto .eb-vis-alle')) { _visAlle = true; if (_rerender) _rerender(); return; }
    const k = e.target && e.target.closest && e.target.closest('#v-auto .eb-rad[data-eb-retning]');
    if (k) velgRetning(k.dataset.ebRetning);
  });
}

/**
 * Hvor ofte (forslag 4), som én linje under linjene: det oftest gående inn og ut.
 * Én frekvens per linje i linjeraden ble uleselig (sett i nettleseren).
 */
export function frekvensLinje(r, esc) {
  const f = r.frekvens || {}, inn = oftest(Object.values(f.inn || {})), ut = oftest(Object.values(f.ut || {}));
  if (!inn && !ut) return '';
  return '<div class="eb-frekvens">går ' + esc([inn && 'inn ' + inn, ut && 'ut ' + ut].filter(Boolean).join(' · ')) + '</div>';
}

/** Høyst så mange linjepar vises på et kort når listene ville villedet. */
export const PAR_VIST = 3;
/**
 * Linjene på kortet. To lister bare når hver kombinasjon er observert (listerHolder);
 * ellers de observerte parene: «T-bane 3 → 300 på Helsfyr · 74 → tog R14 på Oslo S · +N reiseruter».
 * Parene er sett i avgangene nå — ikke en tidsbekreftet overgang (grunnlagslinja sier det).
 */
export function linjerHtml(r, esc) {
  if (!r.linjepar || listerHolder(r)) {
    return '<div class="eb-linjer">' + esc(r.inn.join(' / ')) + ' → bytt til ' + esc(r.ut.slice(0, UT_VIST).join(', ') + (r.ut.length > UT_VIST ? ` +${r.ut.length - UT_VIST}` : '')) + '</div>';
  }
  const vis = r.linjepar.slice(0, PAR_VIST), rest = r.linjepar.length - vis.length;
  return '<div class="eb-linjer eb-par">' + vis.map(p => esc(p.inn + ' → ' + p.ut) + ' <span class="eb-par-knute">på ' + esc(p.knuteNavn) + '</span>').join(' · ')
    + (rest > 0 ? ' · +' + rest + (rest === 1 ? ' reiserute' : ' reiseruter') : '') + '</div>';
}

/** Rad for én himmelretning. */
export function ettBytteRadHtml(r, esc, kommuner = null) {
  // Kommuner bare når retningen når minst KOMMUNER_MIN andre kommuner: i byen blir
  // mange retninger i din egen kommune, og da sier stoppnavnene mer (målt: Bergen nord, 65 stopp, 0 andre kommuner).
  const kom0 = kommuner ? kommunerI(r.punkter, kommuner.kommuneAv, kommuner.hjemme) : null;
  const kom = kom0 && kom0.length >= KOMMUNER_MIN ? kom0 : null;
  return '<button type="button" class="eb-rad" data-eb-retning="' + esc(r.retning) + '" aria-pressed="' + (_valgt === r.retning) + '">'
    // Stor forbokstav bare for himmelretninger: stedsnavn og linjer skrives som de er («Hauketo stasjon», «T-bane»).
    + '<div class="eb-topp"><span class="eb-retning' + (r.fasett && r.fasett !== 'retning' ? ' eb-tittel' : '') + '">' + esc(r.retningNavn) + '</span>'
    + '<span class="eb-via">' + esc(r.undertittel || 'via ' + r.knuteNavn) + '</span>'
    + (r.ytterpunkt ? '<span class="eb-lengst">helt til ' + esc(r.ytterpunkt.navn) + ' · ' + r.ytterpunkt.km + ' km</span>' : '') + '</div>'
    + linjerHtml(r, esc)
    + frekvensLinje(r, esc)
    + (() => {
      // Kommuner (forslag 3): «Lillestrøm, Ullensaker og 9 kommuner til». Uten kommunedata: stoppene.
      if (kom) {
        const vis = kom.slice(0, EKSEMPLER_KOMMUNER);
        return '<div class="eb-steder">' + esc(vis.join(', ')) + (kom.length > vis.length ? ' og ' + (kom.length - vis.length) + (kom.length - vis.length === 1 ? ' kommune til' : ' kommuner til') : '')
          + (r.typer ? ' <span class="eb-typer">· ' + esc(r.typer) + '</span>' : '') + '</div>';
      }
      // Ytterpunktet står alt i toppen («helt til …»): eksemplene er de neste.
      const eks = r.eksempler.filter(n => !r.ytterpunkt || n !== r.ytterpunkt.navn), vist = eks.length + (r.ytterpunkt ? 1 : 0);
      return '<div class="eb-steder">' + esc(eks.join(', ')) + (r.antallSteder > vist ? (eks.length ? ' og ' : '') + (r.antallSteder - vist) + ' steder til' : '')
        + (r.typer ? ' <span class="eb-typer">· ' + esc(r.typer) + '</span>' : '') + '</div>';
    })()
    // Opplevelsen HENGER UNDER kortet (v1.218.319): tittel først, så høydepunktet i samme ramme.
    + forhåndHtml(r, esc)
    + '</button>';
}

/**
 * HTML for hurtigvalget. `pos` er tavlas stopp; `rerender` kalles når svaret kommer.
 * `hent` kan injiseres (tester); ellers Entur via enturFetch.
 */
export function ettBytteHtml(pos, { esc, rerender, radHtml = null, nå = Date.now(), hent = hentFraEntur, hentKommuner = hent === hentFraEntur ? hentKommunerFraEntur : null } = {}) {
  if (!pos || !Number.isFinite(pos.lat)) return '<div class="at-filter">trenger en posisjon for å se bytter herfra</div>';
  _rerender = rerender || null; _hent = hent; bindKort();
  const nøkkel = pos.lat.toFixed(3) + ',' + pos.lon.toFixed(3);
  if (_tilstand && _tilstand.nøkkel !== nøkkel) _valgt = null; // nytt sted: retningene er andre
  if (!_tilstand || _tilstand.nøkkel !== nøkkel || (_tilstand.status !== 'henter' && nå - _tilstand.tid > 10 * 60_000)) {
    _tilstand = { nøkkel, status: 'henter', tid: nå, pos: { lat: pos.lat, lon: pos.lon } };
    _sjekk.clear(); _oppl.clear(); // nytt sted eller nytt svar: gamle reisesøk og opplevelser gjelder ikke
    const t = _tilstand;
    utforsk({ posisjon: { lat: pos.lat, lon: pos.lon }, tid: new Date(nå).toISOString() }, { hent })
      .then(res => {
        t.res = res;
        t.svar = ettByttePer(res, pos, 'retning');
        // Utforskeren fanger nettfeil selv; «ingen bytter» og «fikk ikke svar» er ulike svar.
        const feilet = ((res && res.rapport && res.rapport.feiledeKall) || []).length > 0;
        t.status = feilet && t.svar.ingen ? 'feil' : 'ok';
      })
      .catch(() => { t.status = 'feil'; })
      .finally(() => {
        // Et valgt kort som ikke finnes i det nye svaret, slippes.
        if (_tilstand === t && _valgt && !(t.svar && aktuelle(t).rader.some(r => r.retning === _valgt))) _valgt = null;
        if (_tilstand === t && rerender) rerender();
        // Kommunene etterpå: kortene står med stopp til de kommer, og blir stående om de ikke kommer.
        if (t.status === 'ok' && !t.svar.ingen && hentKommuner) {
          // Alle stedene ett bytte når, ikke bare retningskortenes ene knutepunkt (fasetten «kommune» trenger dem).
          // Alle stedene ett bytte når (også dem fasettene ikke viser): «hvor langt» teller dem alle (v1.218.308).
          const ider = [...new Set(ettByttVeier(t.res).map(v => _destAv(t).get(v.opsjon)).filter(Boolean))];
          hentKommuner(ider, pos).then(k => { t.kommuner = k; if (_tilstand === t && _rerender) _rerender(); }).catch(() => {});
        }
      });
  }
  const s = _tilstand;
  if (s.status === 'henter') return '<div class="at-filter">ser etter hvor du kommer med ett bytte …</div>';
  if (s.status === 'feil') return '<div class="at-filter">fant ikke svar på bytter herfra nå — prøv igjen litt senere</div>';
  if (s.svar.ingen) return '<div class="at-filter">fant ingen bytter herfra nå — det betyr ikke at det ikke finnes</div>';
  const sv = aktuelle(s);
  const fasetter = FASETTER.filter(f => f !== 'kommune' || (s.kommuner && s.kommuner.kommuneAv && s.kommuner.kommuneAv.size));
  const vist = sv.fasett === 'retning' || _visAlle ? sv.rader : sv.rader.slice(0, GRUPPER_VIST);
  return '<div class="at-filter">' + esc(sv.grunnlag) + '</div>'
    // SE ETTER: hva rutene skal ha til felles. Én fasett om gangen.
    + '<div class="eb-fasetter" role="group" aria-label="se etter"><span class="eb-fasett-tittel">se etter</span>'
    + fasetter.map(f => '<button type="button" class="eb-fasett" data-eb-fasett="' + f + '" aria-pressed="' + (sv.fasett === f) + '">' + esc(FASETT_NAVN[f]) + '</button>').join('') + '</div>'
    + (!vist.length && _rekkevidde ? '<div class="at-filter">ingen steder i denne rekkevidden med ett bytte herfra nå</div>' : '')
    + '<div class="at-liste eb-liste">' + vist.map(r => { forhåndFor(r); return ettBytteRadHtml(r, esc, s.kommuner) + (r.retning === _valgt ? sjekkListeHtml(r, esc, radHtml, nå) : ''); }).join('') + '</div>'
    + (vist.length < sv.rader.length ? '<button type="button" class="eb-vis-alle">vis alle ' + sv.rader.length + ' (de neste har færre steder)</button>' : '');
}

/* ── KARTET (eksperiment) ────────────────────────────────────────────────
 * Et eget lag på Auto-tavlas kart, eid her og ikke av auto.js: når hurtigvalget
 * er aktivt og svaret har kommet, tegnes per himmelretning knutepunktet (med
 * navn, én per knute selv om den bærer flere retninger) og stedene du når derfra. Strekene er skjematiske — fra deg til
 * byttet og fra byttet ut — ikke traséer. Temaet er nytt (docs/kartregler.md:
 * ett tema om gangen): tavlas eget lag skjules mens dette vises (auto.js), og
 * kartet rammes inn ÉN gang per sted; rører du kartet
 * etterpå, er det ditt. Rammen er deg, knutepunktene og de nærmeste stedene per
 * retning; de lengste strekene peker ut av kartet, som retninger. Av igjen: laget fjernes og `ferdig()` ber tavla
 * ramme inn sitt eget tema igjen.
 */
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Høyst så mange steder tegnes per retning (de lengst unna først). */
export const KART_STEDER = 8;
/** For den valgte retningen: flere steder, så kortets «og N steder til» får plass. */
export const KART_STEDER_VALGT = 60;
let _kart = null; // { map, lag, rammet }

/** Høyst n av lista, jevnt fordelt fra første til siste (lengst unna → nærmest): både rekkevidden og nærområdet. */
export const spredt = (xs, n) => (xs.length <= n ? xs.slice() : Array.from({ length: n }, (_, i) => xs[Math.round(i * (xs.length - 1) / (n - 1))]));

/** Det som tegnes, uten Leaflet: testbart. Bare når svaret er klart. */
export function ettBytteKartData(pos) {
  if (!pos || !_tilstand || _tilstand.status !== 'ok' || !_tilstand.svar || _tilstand.svar.ingen) return null;
  if (_tilstand.nøkkel !== pos.lat.toFixed(3) + ',' + pos.lon.toFixed(3)) return null;
  const sv = aktuelle();
  const valgt = sv.rader.some(r => r.retning === _valgt) ? _valgt : null;
  const rader = sv.fasett === 'retning' || _visAlle ? sv.rader : sv.rader.slice(0, GRUPPER_VIST);
  return {
    nøkkel: _tilstand.nøkkel + '@' + _tilstand.tid + '#' + sv.fasett + (_visAlle ? '+' : '') + '#' + (valgt || ''),
    valgt, fasett: sv.fasett,
    retninger: rader.map(r => ({
      retning: r.retning, retningNavn: r.retningNavn, knuteNavn: r.knuteNavn, etikett: r.retningNavn + ' · via ' + r.knuteNavn,
      knute: r.knuteLL, antall: r.antallSteder, ytterpunkt: r.ytterpunkt, knuterDetalj: r.knuterDetalj || [], steder: spredt(r.punkter, r.retning === valgt ? KART_STEDER_VALGT : KART_STEDER),
      // Fremhev, ikke skjul: de andre retningene står, dempet.
      dempet: !!valgt && r.retning !== valgt,
    })),
  };
}

/** Så mange av de NÆRMESTE stedene per retning tas med i rammen; resten (Måløy …) peker ut av kartet. */
export const RAMME_NÆRMESTE = 3;
/** Gulvet for rammegrensen (se rammeGrense). */
export const RAMME_MIN_M = 5000;
/**
 * Hvor langt unna et sted kan ligge og likevel trekke i rammen: to ganger
 * MEDIANavstanden til knutepunktene, minst RAMME_MIN_M. Skalerer med stedet (en
 * bygd med fjerne knuter får stor ramme), men ett fjernt knutepunkt (Oslo
 * lufthavn) drar ikke med seg Lesja. Knutepunktene selv er alltid med i rammen.
 */
export function rammeGrense(pos, knuter) {
  const d = knuter.map(k => metresBetween(pos, k)).sort((a, b) => a - b);
  const median = d.length ? (d.length % 2 ? d[(d.length - 1) / 2] : (d[d.length / 2 - 1] + d[d.length / 2]) / 2) : 0;
  return Math.max(RAMME_MIN_M, 2 * median);
}
/** Største og minste boble (px). */
export const BOBLE_MAKS = 22, BOBLE_MIN = 6;
/**
 * Proporsjonal boble (Proven: kartets «mengde her»-symbol): ARELAET følger antallet
 * steder knutepunktet betjener, så radius ∝ √antall. Det største får BOBLE_MAKS;
 * ingen blir mindre enn BOBLE_MIN, så et lite knutepunkt fortsatt kan trykkes.
 */
export const bobleRadius = (n, maks) => (maks > 0 && n > 0 ? Math.max(BOBLE_MIN, BOBLE_MAKS * Math.sqrt(n / maks)) : BOBLE_MIN);

/**
 * Rammen gir plass til den største boblen rundt punktene og navnene under den
 * (sett i skjermbildet: uten dette ble knutepunktnavnene kuttet i overkanten).
 */
export const RAMME_VALG = Object.freeze({ paddingTopLeft: [BOBLE_MAKS + 8, BOBLE_MAKS + 8], paddingBottomRight: [BOBLE_MAKS + 8, BOBLE_MAKS + 8 + 3 * 16], maxZoom: 15, animate: false });

/** Høyden på én navnelinje under en boble (px), og hvor mange linjer et navn kan flyttes ned. */
export const NAVN_LINJE = 16, NAVN_NIVÅER = 3;
/** Anslått bredde (px) for et navn i 11 px tekst med luft. */
const navnBredde = tekst => 6.5 * tekst.length + 10;
/**
 * Anslått rektangel for et navn ved en boble (px). `plass` er
 * { side: 'under', nivå } — under boblen, nivå linjer ned — eller
 * { side: 'høyre' | 'venstre' } — ved siden av, midt på.
 */
export function navnRekt(p, tekst, r, plass) {
  const b = navnBredde(tekst);
  if (plass.side === 'høyre') return { v: p.x + r + 3, h: p.x + r + 3 + b, t: p.y - NAVN_LINJE / 2, u: p.y + NAVN_LINJE / 2 - 1 };
  if (plass.side === 'venstre') return { v: p.x - r - 3 - b, h: p.x - r - 3, t: p.y - NAVN_LINJE / 2, u: p.y + NAVN_LINJE / 2 - 1 };
  const t = p.y + r + 3 + plass.nivå * NAVN_LINJE;
  return { v: p.x - b / 2, h: p.x + b / 2, t, u: t + NAVN_LINJE - 1 };
}
/** Plassene et navn prøver, i rekkefølge: under boblen (linje for linje), så til høyre, så til venstre. */
export const NAVN_PLASSER = Object.freeze([...Array.from({ length: NAVN_NIVÅER }, (_, nivå) => ({ side: 'under', nivå })), { side: 'høyre' }, { side: 'venstre' }]);
const krasjer = (a, b) => a.v < b.h && b.v < a.h && a.t < b.u && b.t < a.u;
/**
 * Hvert knutepunkt får sitt eget navn ved boblen (Proven: stedsnavn ved
 * symbolet, helst under). Størst boble først; krasjer navnet med et navn som
 * alt står eller med en annen boble, prøves neste plass i NAVN_PLASSER. Er alle
 * opptatt, får det den første (`tvunget`): i oversikten vises hvert navn; med et
 * kort valgt droppes et dempet navn uten plass (sett: fire knutepunkter i
 * Oslo sentrum oppå hverandre). Uten projeksjon (`px` null)
 * står alle rett under. Returnerer knute → plass.
 */
export function plasserNavn(knuter, px, radius = () => 0) {
  const plass = new Map();
  const bobler = px ? knuter.map(k => { const p = px(k), r = radius(k); return { k, v: p.x - r, h: p.x + r, t: p.y - r, u: p.y + r }; }) : [];
  const tatt = [];
  // Det fremhevede (valgte kortets) knutepunktet først, så størst boble.
  for (const k of knuter.slice().sort((a, b) => (!!a.dempet - !!b.dempet) || (b.antall || 0) - (a.antall || 0) || (a.navn < b.navn ? -1 : 1))) {
    if (!px) { plass.set(k, NAVN_PLASSER[0]); continue; }
    const p = px(k), r = radius(k);
    // Ingen ledig plass: første plass, merket `tvunget` — et dempet navn tegnes da ikke (navnet kommer ved trykk).
    const valgt = NAVN_PLASSER.find(pl => { const rekt = navnRekt(p, k.navn, r, pl); return !tatt.some(a => krasjer(a, rekt)) && !bobler.some(b => b.k !== k && krasjer(b, rekt)); }) || { ...NAVN_PLASSER[0], tvunget: true };
    plass.set(k, valgt);
    tatt.push(navnRekt(p, k.navn, r, valgt));
  }
  return plass;
}

/**
 * Tegn eller fjern laget. `aktiv` = hurtigvalget er valgt. `ferdig` kalles når
 * laget nettopp ble fjernet, så tavla kan ramme inn sitt eget tema igjen.
 */
let _kartL = null;
/* OPPLEVELSENE PÅ KARTET (§18): samme kortdata som lista. Prikken og kortet deler
   _valgtOppl. Kartet flyttes ikke — rammingen eies av temaet (docs/kartregler.md). */
export const INNGANG_FARGE = Object.freeze({ natur: '#3fb98a', severdighet: '#e0a640', kultur: '#b07cf0', aktivitet: '#5aa2ff' });
let _opplLag = null;
/** Stedene under det valgte kortet (de samme 8 som reisene hentes for). */
function valgteSteder() {
  const t = _tilstand, rad = _valgt && t && t.svar && aktuelle(t).rader.find(x => x.retning === _valgt);
  return rad ? spredt(rad.punkter.filter(p => p.id), SJEKK_STEDER) : [];
}
/** Prikkene: én per vist opplevelse. Ren mot tilstanden; brukes av kartet og testene. */
export function opplevelsePrikker(nå = Date.now()) {
  return valgteSteder().flatMap(p => kortFor(p, nå)).filter(k => Number.isFinite(k.lat))
    .map(k => ({ stedId: k.stedId, navn: k.navn, lat: k.lat, lon: k.lon, farge: INNGANG_FARGE[k.innganger[0]] || '#888',
      valgt: !!(_valgtOppl && _valgtOppl.stedId === k.stedId && _valgtOppl.navn === k.navn) }));
}
function oppdaterOpplPrikker(map, L, vis) {
  if (_opplLag && (_opplLag.map !== map || !vis)) { try { _opplLag.map.removeLayer(_opplLag.lag); } catch (_) {} _opplLag = null; }
  if (!vis || !map || !L) return;
  const prikker = opplevelsePrikker(), nøkkel = JSON.stringify(prikker);
  // Ingen prikker: intet lag (kartet er som før).
  if (!prikker.length) { if (_opplLag) { try { _opplLag.map.removeLayer(_opplLag.lag); } catch (_) {} _opplLag = null; } return; }
  if (_opplLag && _opplLag.nøkkel === nøkkel) return;
  try {
    if (!_opplLag) _opplLag = { map, lag: L.layerGroup().addTo(map), nøkkel: '' };
    _opplLag.lag.clearLayers(); _opplLag.nøkkel = nøkkel;
    for (const p of prikker) {
      const m = L.circleMarker([p.lat, p.lon], { radius: p.valgt ? 9 : 6, color: '#fff', weight: 2, fillColor: p.farge, fillOpacity: 1, className: 'eb-oppl-prikk' });
      if (m.bindTooltip) m.bindTooltip(p.navn);
      m.on('click', () => velgOpplevelse(p.stedId, p.navn, { rull: true }));
      m.addTo(_opplLag.lag);
    }
  } catch (_) { /* prikkene er et tillegg: feiler de, står kartet som før */ }
}
export function ettBytteKart(map, L, { aktiv, pos, ferdig, ramme: rammeInn = (b, o) => map.fitBounds(b, o) } = {}) {
  _kartL = L || _kartL;
  oppdaterTurLag(map, L, !!(aktiv && _valgt && turLagPå()));
  oppdaterOpplPrikker(map, L, !!(aktiv && _valgt));
  if (_kart && _kart.map !== map) _kart = null; // kartet er bygget på nytt; det gamle laget fulgte med ut
  const data = aktiv && map ? ettBytteKartData(pos) : null;
  if (!data) {
    if (!aktiv) _valgt = null; // valget «ett bytte» av: neste gang starter på oversikten
    if (_kart && !aktiv) { _kart.map.removeLayer(_kart.lag); _kart = null; if (ferdig) ferdig(); }
    return;
  }
  if (_kart && _kart.nøkkel === data.nøkkel) return;
  const lag = _kart ? (_kart.lag.clearLayers(), _kart.lag) : L.layerGroup().addTo(map);
  // Rammes inn når TEMAET endres — nytt sted eller nytt kort valgt / valgt av
  // (docs/kartregler.md). Et nytt svar på samme sted og samme valg flytter ikke kartet.
  const tema = data.nøkkel.split('@')[0] + '#' + (data.valgt || ''), rammet = !!_kart && _kart.rammet === tema;
  _kart = { map, lag, nøkkel: data.nøkkel, rammet: _kart && _kart.rammet };
  const ramme = [[pos.lat, pos.lon]];
  const dempe = (kl, d) => (d ? kl + ' eb-kart-dempet' : kl);
  // Knutepunktene veies mot hverandre: én boble per knute, størrelse og tall =
  // stedene den betjener (summen over retningene den bærer). Ingen streker ut —
  // stedene vises bare for kortet du har valgt.
  const knuter = new Map(), valgteSteder = [];
  // Ett knutepunkt kan høre til flere kort (og et kort til flere knutepunkt, i fasettene):
  // boblen teller ULIKE steder via knutepunktet, så overlappende grupper ikke telles dobbelt.
  const stederVed = new Map();
  for (const r of data.retninger) {
    if (data.valgt === r.retning) valgteSteder.push(...r.steder);
    for (const kd of r.knuterDetalj) {
      if (!kd.ll) continue;
      const fra = [kd.ll.lat, kd.ll.lon], k = fra.join(',');
      const e = knuter.get(k) || knuter.set(k, { fra, navn: kd.navn, retninger: [], antall: 0, dempet: true, retning: r.retning }).get(k);
      e.retninger.push(r.retningNavn);
      const sett = stederVed.get(k) || stederVed.set(k, new Set()).get(k);
      for (const id of kd.steder) sett.add(id);
      e.antall = sett.size;
      if (!r.dempet) { e.dempet = false; e.retning = r.retning; }
    }
  }
  const maks = Math.max(0, ...[...knuter.values()].map(k => k.antall));
  for (const k of knuter.values()) {
    L.polyline([[pos.lat, pos.lon], k.fra], { className: dempe('eb-kart-inn', k.dempet), weight: 2, dashArray: '4 6', interactive: false }).addTo(lag);
  }
  const fremhevet = [...knuter.values()].filter(k => !k.dempet);
  if (data.valgt) {
    // Det valgte kortet: deg, knutepunktet og stedene innenfor grensen for DETTE knutepunktet.
    const g = rammeGrense(pos, fremhevet.map(k => ({ lat: k.fra[0], lon: k.fra[1] })));
    for (const k of fremhevet) ramme.push(k.fra);
    for (const s of valgteSteder) if (metresBetween(pos, s) <= g) ramme.push([s.lat, s.lon]);
  } else {
    for (const k of knuter.values()) ramme.push(k.fra); // oversikten: deg og knutepunktene
  }
  // Uten animasjon: etikettene under måles mot rammen kartet ender i.
  // Kopi: Leaflet skriver selv i valgene (zoom).
  if (!rammet) { _kart.rammet = tema; rammeInn(ramme, { ...RAMME_VALG }); }
  // Stedene til det valgte kortet — under boblene, så knutepunktet ligger øverst.
  // Stedstype (forslag 2): tog og båt er fylt og litt større — de inviterer til en reise ut.
  for (const s of valgteSteder) {
    const t = s.type === 'rail' ? ' eb-kart-tog' : s.type === 'water' ? ' eb-kart-bat' : '';
    const sm = L.circleMarker([s.lat, s.lon], { className: 'eb-kart-sted' + t, radius: t ? 5 : 4, weight: 1.5 }).bindTooltip(s.navn + (t ? (s.type === 'rail' ? ' · tog' : ' · båt') : '')).addTo(lag);
    // Sjekk denne (forslag 5): trykk på et sted i kartet kjører reisesøket for det.
    if (sm.on && s.id) sm.on('click', () => sjekkSted(s.id));
  }
  // Lengst du kommer: ytterpunktet i den valgte retningen får navnet sitt (det kan ligge utenfor rammen).
  const valgtRad = data.valgt && data.retninger.find(r => r.retning === data.valgt);
  const yp = valgtRad && valgtRad.ytterpunkt;
  if (yp) {
    L.circleMarker([yp.lat, yp.lon], { className: 'eb-kart-ytter', radius: 5, weight: 2 }).addTo(lag);
    L.marker([yp.lat, yp.lon], { icon: L.divIcon({ className: 'eb-kart-ytteretikett', html: '<span style="transform:translate(-50%,8px)">' + esc(yp.navn + ' · ' + yp.km + ' km') + '</span>', iconSize: null }), interactive: false, keyboard: false, zIndexOffset: 900 }).addTo(lag);
  }
  // Boblene: de dempede først, størst under minst, så små ikke skjules av store.
  const px = map.latLngToContainerPoint ? k => map.latLngToContainerPoint(k.fra) : null;
  const nivåFor = plasserNavn([...knuter.values()], px, k => bobleRadius(k.antall, maks));
  const rekke = [...knuter.values()].sort((a, b) => (b.dempet - a.dempet) || (b.antall - a.antall));
  for (const k of rekke) {
    const r = bobleRadius(k.antall, maks);
    const m = L.circleMarker(k.fra, { className: dempe('eb-kart-knute', k.dempet), radius: r, weight: 2 });
    m.bindTooltip(k.navn + ' · ' + k.antall + ' steder').addTo(lag); // ved trykk
    // Navnet UNDER boblen, på linjen plasserNavn ga. Som markør, ikke fast lapp:
    // tavlas lapprydding (ryddKart) er laget for tavlas lapper og skjulte «Helsfyr»
    // selv når den stod alene (sett i nettleseren). Ett bytte rydder sine egne.
    const pl = nivåFor.get(k) || NAVN_PLASSER[0], av = Math.round(r + 3);
    const navnVises = !(pl.tvunget && k.dempet);
    const flytt = pl.side === 'høyre' ? av + 'px,-50%' : pl.side === 'venstre' ? 'calc(-100% - ' + av + 'px),-50%' : '-50%,' + Math.round(av + pl.nivå * NAVN_LINJE) + 'px';
    if (navnVises) L.marker(k.fra, { icon: L.divIcon({ className: dempe('eb-kart-etikett', k.dempet), html: '<span style="transform:translate(' + flytt + ')">' + esc(k.navn) + '</span>', iconSize: null }), interactive: false, keyboard: false, zIndexOffset: k.dempet ? 0 : 1000 }).addTo(lag);
    // Kart → kort: trykk på en boble velger (første) retning den bærer.
    if (m.on) m.on('click', () => { if (_valgt !== k.retning) { velgRetning(k.retning); visKort(k.retning); } });
    // Tallet i boblen: antallet steder den betjener. En markør, ikke en lapp: kartets
    // lapprydding (src/ui/lappPlass.js, ryddKart) skjuler lapper som krasjer, og
    // tallene i bobler som overlapper skjulte da også navnet (sett i nettleseren).
    L.marker(k.fra, { icon: L.divIcon({ className: dempe('eb-kart-tall', k.dempet), html: '<span>' + k.antall + '</span>', iconSize: null }), interactive: false, keyboard: false }).addTo(lag);
  }
  // Hvor er jeg: tavlas eget lag er skjult mens dette vises, så laget viser deg selv.
  L.circleMarker([pos.lat, pos.lon], { className: 'eb-kart-deg', radius: 7, weight: 3, interactive: false }).addTo(lag);
}

/** Etter et trykk i kartet: kortet rulles inn i synsfeltet (lista kan være lang). */
function visKort(retning) {
  if (typeof document === 'undefined') return;
  setTimeout(() => { const k = document.querySelector('#v-auto .eb-rad[data-eb-retning="' + retning + '"]'); if (k && k.scrollIntoView) k.scrollIntoView({ block: 'nearest' }); }, 0);
}
