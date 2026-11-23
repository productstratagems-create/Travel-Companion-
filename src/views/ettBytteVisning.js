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
/** Høyst så mange steder tegnes per retning (de lengst unna først). */
export const KART_STEDER = 8;
/** For den valgte retningen: flere steder, så kortets «og N steder til» får plass. */
export const KART_STEDER_VALGT = 20;
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
      knute: r.knuteLL, steder: spredt(r.punkter, r.retning === valgt ? KART_STEDER_VALGT : KART_STEDER),
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
/** Knutepunkter nærmere hverandre enn dette på skjermen deler én etikett. */
export const ETIKETT_PX = 48;
/**
 * Etiketter uten overlapp: knutepunktene (flest retninger først) samles grådig
 * til grupper der alle ligger innen ETIKETT_PX fra gruppens første. Gruppens
 * første bærer etiketten med alle navnene; de andre får navnet bare ved trykk.
 * `px` er skjermpunktet; uten (ingen projeksjon) blir hver knute sin egen gruppe.
 */
export function samleEtiketter(knuter, px) {
  const rekke = knuter.slice().sort((a, b) => b.retninger.length - a.retninger.length || (a.navn < b.navn ? -1 : 1));
  const grupper = [];
  for (const k of rekke) {
    const p = px && px(k);
    const g = p && grupper.find(x => x.p && Math.hypot(x.p.x - p.x, x.p.y - p.y) < ETIKETT_PX);
    if (g) g.knuter.push(k); else grupper.push({ p, knuter: [k] });
  }
  return grupper.map(g => ({ bærer: g.knuter[0], etikett: g.knuter.map(k => k.navn).join(' · '), andre: g.knuter.slice(1) }));
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
  // Ett knutepunkt kan bære flere retninger (Oslo bussterminal: nord, sør, vest …):
  // én prikk og én etikett per knute, med retningene samlet — ikke fem lapper oppå hverandre.
  const knuter = new Map(), nære = [], valgteSteder = [];
  // De dempede først, så den valgte retningen ligger oppå.
  const rekke = data.retninger.filter(r => r.dempet).concat(data.retninger.filter(r => !r.dempet));
  for (const r of rekke) {
    const fra = r.knute ? [r.knute.lat, r.knute.lon] : null;
    for (const s of r.steder) {
      if (fra) L.polyline([fra, [s.lat, s.lon]], { className: dempe('eb-kart-ut', r.dempet), weight: r.dempet ? 1 : 1.5, interactive: false }).addTo(lag);
      const m = L.circleMarker([s.lat, s.lon], { className: dempe('eb-kart-sted', r.dempet), radius: r.dempet ? 3 : 4, weight: 1.5 }).bindTooltip(s.navn).addTo(lag);
      // Kart → kort: trykk på et sted velger retningen det hører til.
      if (m.on) m.on('click', () => { if (_valgt !== r.retning) { velgRetning(r.retning); visKort(r.retning); } });
    }
    nære.push(...r.steder.slice(-RAMME_NÆRMESTE)); // punkter er lengst unna først
    if (data.valgt === r.retning) valgteSteder.push(...r.steder);
    if (fra) {
      const k = fra.join(',');
      const e = knuter.get(k) || knuter.set(k, { fra, navn: r.knuteNavn, retninger: [], dempet: true }).get(k);
      e.retninger.push(r.retningNavn);
      if (!r.dempet) e.dempet = false;
    }
  }
  for (const k of knuter.values()) {
    L.polyline([[pos.lat, pos.lon], k.fra], { className: dempe('eb-kart-inn', k.dempet), weight: 2, dashArray: '4 6', interactive: false }).addTo(lag);
  }
  const fremhevet = [...knuter.values()].filter(k => !k.dempet);
  if (data.valgt) {
    // Den valgte retningen: deg, knutepunktet og stedene innenfor grensen for DETTE knutepunktet.
    const g = rammeGrense(pos, fremhevet.map(k => ({ lat: k.fra[0], lon: k.fra[1] })));
    for (const k of fremhevet) ramme.push(k.fra);
    for (const s of valgteSteder) if (metresBetween(pos, s) <= g) ramme.push([s.lat, s.lon]);
  } else {
    for (const k of knuter.values()) ramme.push(k.fra);
    for (const s of nære) if (metresBetween(pos, s) <= rammeGrense(pos, [...knuter.values()].map(k => ({ lat: k.fra[0], lon: k.fra[1] })))) ramme.push([s.lat, s.lon]);
  }
  // Uten animasjon: etikettene under måles mot rammen kartet ender i.
  if (!rammet) { _kart.rammet = tema; rammeInn(ramme, { padding: [24, 24], maxZoom: 15, animate: false }); }
  // Etter rammen: da vet vi hvor tett knutepunktene står på skjermen.
  const px = map.latLngToContainerPoint ? k => map.latLngToContainerPoint(k.fra) : null;
  // Med et kort valgt bærer bare dets knutepunkt etikett; de dempede får navnet ved trykk.
  for (const k of knuter.values()) if (k.dempet) L.circleMarker(k.fra, { className: 'eb-kart-knute eb-kart-dempet', radius: 5, weight: 2 }).bindTooltip(k.navn).addTo(lag);
  for (const g of samleEtiketter(fremhevet, px)) {
    L.circleMarker(g.bærer.fra, { className: 'eb-kart-knute', radius: 7, weight: 2.5 })
      .bindTooltip(g.etikett, { permanent: true, direction: 'top', className: 'eb-kart-etikett', offset: [0, -6] }).addTo(lag);
    for (const k of g.andre) L.circleMarker(k.fra, { className: 'eb-kart-knute', radius: 7, weight: 2.5 }).bindTooltip(k.navn).addTo(lag);
  }
  // Hvor er jeg: tavlas eget lag er skjult mens dette vises, så laget viser deg selv.
  L.circleMarker([pos.lat, pos.lon], { className: 'eb-kart-deg', radius: 7, weight: 3, interactive: false }).addTo(lag);
}

/** Etter et trykk i kartet: kortet rulles inn i synsfeltet (lista kan være lang). */
function visKort(retning) {
  if (typeof document === 'undefined') return;
  setTimeout(() => { const k = document.querySelector('#v-auto .eb-rad[data-eb-retning="' + retning + '"]'); if (k && k.scrollIntoView) k.scrollIntoView({ block: 'nearest' }); }, 0);
}
