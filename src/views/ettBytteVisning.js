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
import { ettByttePerRetning } from '../ettBytte.js';
import { enturFetch } from '../api/http.js';
import { metresBetween } from '../haversine.js';
import '../style/ettBytte.css';

export const ETT_BYTTE = true;
export const ETT_BYTTE_VALG = 'bytte';
export const ETT_BYTTE_TEKST = 'ett bytte';
/** Høyst så mange linjer ut vises per rad; resten telles. */
export const UT_VIST = 4;

const hentFraEntur = (_navn, req) => enturFetch(req.url, {
  method: req.method, body: req.body, headers: req.body ? { 'Content-Type': 'application/json' } : {},
}).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });

let _tilstand = null; // { nøkkel, status: 'henter' | 'ok' | 'feil', svar }
/** Valgt retningskort ('NØ' …) eller null: kartet viser da den retningen. */
let _valgt = null;
let _rerender = null;
export function _nullstillEttBytte() { _tilstand = null; _valgt = null; _rerender = null; }
export const valgtRetning = () => _valgt;

/**
 * Velg et retningskort (samme igjen = av). Kartet rammer inn retningen; av gir
 * oversikten tilbake. Kalles av kortet, av kartet (trykk på et sted) og testene.
 */
export function velgRetning(retning) {
  _valgt = _valgt === retning ? null : retning;
  if (_rerender) _rerender();
}

// Én delegert lytter for kortene, bundet første gang lista tegnes: ingen ny krok i auto.js.
let _lytter = false;
function bindKort() {
  if (_lytter || typeof document === 'undefined') return;
  _lytter = true;
  document.addEventListener('click', e => {
    const k = e.target && e.target.closest && e.target.closest('#v-auto .eb-rad[data-eb-retning]');
    if (k) velgRetning(k.dataset.ebRetning);
  });
}

/** Rad for én himmelretning. */
export function ettBytteRadHtml(r, esc) {
  const ut = r.ut.slice(0, UT_VIST).join(', ') + (r.ut.length > UT_VIST ? ` +${r.ut.length - UT_VIST}` : '');
  return '<button type="button" class="eb-rad" data-eb-retning="' + esc(r.retning) + '" aria-pressed="' + (_valgt === r.retning) + '">'
    + '<div class="eb-topp"><span class="eb-retning">' + esc(r.retningNavn) + '</span>'
    + '<span class="eb-via">via ' + esc(r.knuteNavn) + '</span></div>'
    + '<div class="eb-linjer">' + esc(r.inn.join(' / ')) + ' → bytt til ' + esc(ut) + '</div>'
    + '<div class="eb-steder">' + esc(r.eksempler.join(', ')) + (r.antallSteder > r.eksempler.length ? ' og ' + (r.antallSteder - r.eksempler.length) + ' steder til' : '') + '</div>'
    + '</button>';
}

/**
 * HTML for hurtigvalget. `pos` er tavlas stopp; `rerender` kalles når svaret kommer.
 * `hent` kan injiseres (tester); ellers Entur via enturFetch.
 */
export function ettBytteHtml(pos, { esc, rerender, nå = Date.now(), hent = hentFraEntur } = {}) {
  if (!pos || !Number.isFinite(pos.lat)) return '<div class="at-filter">trenger en posisjon for å se bytter herfra</div>';
  _rerender = rerender || null; bindKort();
  const nøkkel = pos.lat.toFixed(3) + ',' + pos.lon.toFixed(3);
  if (_tilstand && _tilstand.nøkkel !== nøkkel) _valgt = null; // nytt sted: retningene er andre
  if (!_tilstand || _tilstand.nøkkel !== nøkkel || (_tilstand.status !== 'henter' && nå - _tilstand.tid > 10 * 60_000)) {
    _tilstand = { nøkkel, status: 'henter', tid: nå };
    const t = _tilstand;
    utforsk({ posisjon: { lat: pos.lat, lon: pos.lon }, tid: new Date(nå).toISOString() }, { hent })
      .then(res => {
        t.svar = ettByttePerRetning(res, pos);
        // Utforskeren fanger nettfeil selv; «ingen bytter» og «fikk ikke svar» er ulike svar.
        const feilet = ((res && res.rapport && res.rapport.feiledeKall) || []).length > 0;
        t.status = feilet && t.svar.ingen ? 'feil' : 'ok';
      })
      .catch(() => { t.status = 'feil'; })
      .finally(() => {
        // Et valgt kort som ikke finnes i det nye svaret, slippes.
        if (_tilstand === t && _valgt && !(t.svar && t.svar.rader.some(r => r.retning === _valgt))) _valgt = null;
        if (_tilstand === t && rerender) rerender();
      });
  }
  const s = _tilstand;
  if (s.status === 'henter') return '<div class="at-filter">ser etter hvor du kommer med ett bytte …</div>';
  if (s.status === 'feil') return '<div class="at-filter">fant ikke svar på bytter herfra nå — prøv igjen litt senere</div>';
  if (s.svar.ingen) return '<div class="at-filter">fant ingen bytter herfra nå — det betyr ikke at det ikke finnes</div>';
  return '<div class="at-filter">' + esc(s.svar.grunnlag) + '</div>'
    + '<div class="at-liste eb-liste">' + s.svar.rader.map(r => ettBytteRadHtml(r, esc)).join('') + '</div>';
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
  const valgt = _tilstand.svar.rader.some(r => r.retning === _valgt) ? _valgt : null;
  return {
    nøkkel: _tilstand.nøkkel + '@' + _tilstand.tid + '#' + (valgt || ''),
    valgt,
    retninger: _tilstand.svar.rader.map(r => ({
      retning: r.retning, retningNavn: r.retningNavn, knuteNavn: r.knuteNavn, etikett: r.retningNavn + ' · via ' + r.knuteNavn,
      knute: r.knuteLL, antall: r.antallSteder, steder: spredt(r.punkter, r.retning === valgt ? KART_STEDER_VALGT : KART_STEDER),
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
 * Rammen gir plass til den største boblen rundt punktene og navnelappen over den
 * (sett i skjermbildet: uten dette ble knutepunktnavnene kuttet i overkanten).
 */
export const RAMME_VALG = Object.freeze({ paddingTopLeft: [BOBLE_MAKS + 8, BOBLE_MAKS + 30], paddingBottomRight: [BOBLE_MAKS + 8, BOBLE_MAKS + 8], maxZoom: 15, animate: false });

/** Knutepunkter nærmere hverandre enn dette på skjermen deler én etikett. */
export const ETIKETT_PX = 48;
/**
 * Etiketter uten overlapp: knutepunktene (flest retninger først) samles grådig
 * til grupper der alle ligger innen ETIKETT_PX fra gruppens første. Gruppens
 * første bærer etiketten med alle navnene; de andre får navnet bare ved trykk.
 * `px` er skjermpunktet; uten (ingen projeksjon) blir hver knute sin egen gruppe.
 */
/** Anslått størrelse på en navnelapp (px): bred nok for 12 px tekst, med luft. */
export const lappRekt = (p, tekst, r = 0) => { const b = 7 * tekst.length + 16, h = 20; return { v: p.x - b / 2, h: p.x + b / 2, t: p.y - r - 4 - h, u: p.y - r - 4 }; };
const krasjer = (a, b) => a.v < b.h && b.v < a.h && a.t < b.u && b.t < a.u;

export function samleEtiketter(knuter, px, radius = () => 0) {
  const rekke = knuter.slice().sort((a, b) => b.retninger.length - a.retninger.length || (a.navn < b.navn ? -1 : 1));
  const grupper = [];
  const tekst = g => g.knuter.map(k => k.navn).join(' · ');
  for (const k of rekke) {
    const p = px && px(k);
    // Samme gruppe når knutepunktene står tett ELLER navnelappene ville krasje
    // (sett i nettleseren: tre bobler med god avstand, to lapper oppå hverandre).
    const g = p && grupper.find(x => x.p && (Math.hypot(x.p.x - p.x, x.p.y - p.y) < ETIKETT_PX
      || krasjer(lappRekt(x.p, tekst(x), radius(x.knuter[0])), lappRekt(p, k.navn, radius(k)))));
    if (g) g.knuter.push(k); else grupper.push({ p, knuter: [k] });
  }
  return grupper.map(g => ({ bærer: g.knuter[0], etikett: tekst(g), andre: g.knuter.slice(1) }));
}

/**
 * Tegn eller fjern laget. `aktiv` = hurtigvalget er valgt. `ferdig` kalles når
 * laget nettopp ble fjernet, så tavla kan ramme inn sitt eget tema igjen.
 */
export function ettBytteKart(map, L, { aktiv, pos, ferdig, ramme: rammeInn = (b, o) => map.fitBounds(b, o) } = {}) {
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
  for (const r of data.retninger) {
    if (data.valgt === r.retning) valgteSteder.push(...r.steder);
    if (!r.knute) continue;
    const fra = [r.knute.lat, r.knute.lon], k = fra.join(',');
    const e = knuter.get(k) || knuter.set(k, { fra, navn: r.knuteNavn, retninger: [], antall: 0, dempet: true, retning: r.retning }).get(k);
    e.retninger.push(r.retningNavn); e.antall += r.antall || 0;
    if (!r.dempet) { e.dempet = false; e.retning = r.retning; }
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
  for (const s of valgteSteder) L.circleMarker([s.lat, s.lon], { className: 'eb-kart-sted', radius: 4, weight: 1.5 }).bindTooltip(s.navn).addTo(lag);
  // Boblene: de dempede først, størst under minst, så små ikke skjules av store.
  const px = map.latLngToContainerPoint ? k => map.latLngToContainerPoint(k.fra) : null;
  const navnFor = new Map();
  for (const g of samleEtiketter(fremhevet, px, k => bobleRadius(k.antall, maks))) { navnFor.set(g.bærer, g.etikett); for (const k of g.andre) navnFor.set(k, null); }
  const rekke = [...knuter.values()].sort((a, b) => (b.dempet - a.dempet) || (b.antall - a.antall));
  for (const k of rekke) {
    const r = bobleRadius(k.antall, maks);
    const m = L.circleMarker(k.fra, { className: dempe('eb-kart-knute', k.dempet), radius: r, weight: 2 });
    const navn = navnFor.get(k);
    m.bindTooltip(k.navn + ' · ' + k.antall + ' steder').addTo(lag); // ved trykk
    // Navnet over boblen der det er plass (samleEtiketter). Som markør, ikke fast lapp:
    // tavlas lapprydding (ryddKart) er laget for tavlas lapper og skjulte «Helsfyr»
    // selv når den stod alene (sett i nettleseren). Ett bytte rydder sine egne.
    if (navn) L.marker(k.fra, { icon: L.divIcon({ className: 'eb-kart-etikett', html: '<span style="transform:translate(-50%,calc(-100% - ' + Math.round(r + 4) + 'px))">' + esc(navn) + '</span>', iconSize: null }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(lag);
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
