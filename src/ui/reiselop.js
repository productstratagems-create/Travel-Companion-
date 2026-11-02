/**
 * Reiseløpet — en reise med bytter, som en tidslinje du kan handle på.
 *
 * Rapportert med skjermbilde: «verken tabellen eller kartet er særlig
 * intuitive eller hjelpsomme». Tabellen på avgangsdetaljene skrev:
 *
 *   - «destination» som siste stopp — Journey Planners navn på et
 *     koordinat-mål, med små bokstaver;
 *   - alle stoppnavn med små bokstaver;
 *   - gangen mellom etappene TO ganger, med to ulike minutter, og som
 *     «jernbanetorget → jernbanetorget» — som ikke sier hvor du skal;
 *   - plattform bare fra etappe to, og aldri der du kommer fram;
 *   - ingenting om byttet er god tid.
 *
 * PROVEN: tidslinjen (Ruter, Google Maps, Citymapper gjør det slik). Hver
 * etappe en stolpe i linjefargen, påstigning øverst med plattform,
 * avstigning nederst, mellomstoppene sammenfoldet til «N stopp». Gange som
 * en egen, stiplet del.
 *
 * BETTER: byttet får en dom i appens eget vokabular, med gange medregnet —
 * samme regel som underveis (`transferMargin` i `bytte.js`), ikke en ny. Og
 * plattformen du skal TIL står i gangeteksten.
 *
 * Ren funksjon: data inn, HTML ut. Prøves uten DOM.
 */
import { esc, clk as klokke } from './fmt.js';
import { legShape, legEnds } from '../api/adapt.js';
import { reachCls } from '../geo.js';
import { haver } from '../haversine.js';
import { plattformTekst, transferMargin } from '../bytte.js';
import { visStopp, stopKey } from '../stopId.js';

const MIN = 60000;
const ms = v => { const t = v ? new Date(v).getTime() : NaN; return Number.isFinite(t) ? t : null; };
const fra = l => ms((l.fromEstimatedCall && (l.fromEstimatedCall.expectedDepartureTime
  || l.fromEstimatedCall.aimedDepartureTime)) || l.expectedStartTime || l.aimedStartTime);
const til = l => ms((l.toEstimatedCall && (l.toEstimatedCall.expectedArrivalTime
  || l.toEstimatedCall.aimedArrivalTime)) || l.expectedEndTime || l.aimedEndTime);
const min = (a, b) => (a != null && b != null ? Math.max(0, Math.round((b - a) / MIN)) : null);

/**
 * Ordet for et bytte, fra marginen. SAMME BØTTER som underveis-banneret
 * (`transferState`: tight = r-soon/r-now, miss = missed) — gjennom
 * `reachCls`, ikke egne tall.
 */
export function bytteDom(margin) {
  const r = reachCls(margin);
  if (r === 'missed') return 'rekker du ikke';
  if (r === 'r-soon' || r === 'r-now') return 'stramt';
  return 'god tid';
}
const _DOM_KLASSE = { 'god tid': 'rl-ok', 'stramt': 'rl-stramt', 'rekker du ikke': 'rl-miss' };

/** Lengden langs en gangeetappes form, i meter — eller null uten form. */
function _meter(foot) {
  let m = 0, har = false;
  foot.forEach(l => {
    const p = legShape(l);
    if (!p || p.length < 2) return;
    har = true;
    for (let i = 1; i < p.length; i++) m += haver(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
  });
  return har ? Math.round(m / 10) * 10 : null;
}

/** Antall stopp du kjører, fra kallene mellom påstigning og avstigning. */
function _stopp(l) {
  const kall = (l.serviceJourney && l.serviceJourney.estimatedCalls) || [];
  const e = legEnds(l);
  const navn = c => (c && c.quay && c.quay.stopPlace && c.quay.stopPlace.name) || '';
  const a = kall.findIndex(c => stopKey(navn(c)) === stopKey(e.fra));
  if (a < 0) return null;
  const b = kall.findIndex((c, i) => i > a && stopKey(navn(c)) === stopKey(e.til));
  return b > a ? b - a : null;
}

/** Stoppestedets id der en etappe slutter — for trinnfri-oppslaget. */
function _tilId(l) {
  const e = legEnds(l);
  if (e.tilId) return e.tilId;
  const kall = (l.serviceJourney && l.serviceJourney.estimatedCalls) || [];
  const c = kall.find(k => k && k.quay && k.quay.stopPlace
    && stopKey(k.quay.stopPlace.name) === stopKey(e.til));
  return (c && c.quay.stopPlace.id) || null;
}

/**
 * @param {Array} alle `_allLegs` — Journey Planners etapper, gange inkludert
 * @param {{fra:string, til:string, ekstraMin?:number, clk?:Function,
 *          tilgang?:(stopId:string)=>('trinnfri'|'ikke-trinnfri'|null)}} o
 * @returns {string} HTML
 */
export function reiselop(alle, o) {
  const opt = o || {};
  const clk = opt.clk || klokke;
  const legs = (alle || []).filter(Boolean);
  const kjør = legs.map((l, i) => ({ l, i })).filter(x => x.l.mode !== 'foot');
  if (!kjør.length) return '';
  const tid = t => (t != null ? esc(clk(new Date(t).toISOString())) : '—');
  const deler = [];

  // Gange FØR første kjøretøy: til påstigningen, med plattformen.
  const førGang = legs.slice(0, kjør[0].i);
  if (førGang.length) {
    const f = kjør[0].l;
    const m = min(fra(førGang[0]), til(førGang[førGang.length - 1]));
    const pl = plattformTekst(f.fromEstimatedCall && f.fromEstimatedCall.quay
      && f.fromEstimatedCall.quay.publicCode, f.mode);
    deler.push('<div class="rl-gange">Gå' + (m != null ? ' ' + m + ' min' : '')
      + ' til ' + esc(visStopp(legEnds(f).fra)) + (pl ? ' · ' + esc(pl) : '') + '</div>');
  }

  kjør.forEach(({ l, i }, k) => {
    const sj = l.serviceJourney || {};
    const line = sj.line || {};
    const farge = '#' + String((line.presentation && line.presentation.colour) || '7c2d12').replace(/^#/, '');
    const e = legEnds(l);
    const påPl = plattformTekst(l.fromEstimatedCall && l.fromEstimatedCall.quay
      && l.fromEstimatedCall.quay.publicCode, l.mode);
    const avPl = plattformTekst(l.toEstimatedCall && l.toEstimatedCall.quay
      && l.toEstimatedCall.quay.publicCode, l.mode);
    const front = l.fromEstimatedCall && l.fromEstimatedCall.destinationDisplay
      && l.fromEstimatedCall.destinationDisplay.frontText;
    const n = _stopp(l);
    deler.push('<div class="rl-etappe" data-rl="e' + k + '" style="--rl-farge:' + esc(farge) + '">'
      + '<div class="rl-stopp rl-på"><span class="rl-tid">' + tid(fra(l)) + '</span>'
      + '<span class="rl-navn"><b>' + esc(visStopp(e.fra)) + '</b>' + (påPl ? ' · ' + esc(påPl) : '') + '</span></div>'
      + '<div class="rl-linje"><span class="line-badge" style="background:' + esc(farge) + '">'
      + esc(line.publicCode || '?') + '</span>'
      + (front ? '<span class="rl-mot">mot ' + esc(front) + '</span>' : '')
      + (n ? '<span class="rl-antall">· ' + n + ' stopp</span>' : '') + '</div>'
      + '<div class="rl-stopp rl-av"><span class="rl-tid">' + tid(til(l)) + '</span>'
      + '<span class="rl-navn"><b>' + esc(visStopp(e.til)) + '</b>' + (avPl ? ' · ank. ' + esc(avPl) : '') + '</span></div>'
      + '</div>');

    const neste = kjør[k + 1];
    if (!neste) return;
    /* BYTTET, ÉN RAD. Gangeetappene mellom de to kjøretøyene er foldet inn
     * her — ikke en skillelinje OG en gangrad, som sa to ulike minutter. */
    if (l.interchangeTo && l.interchangeTo.staySeated) {
      const nl = neste.l.serviceJourney && neste.l.serviceJourney.line;
      deler.push('<div class="rl-bytte rl-ok" data-rl="b' + k + '">Bli sittende på ' + esc(visStopp(e.til))
        + ' — fortsetter som ' + esc((nl && nl.publicCode) || '?') + '</div>');
      return;
    }
    const gange = legs.slice(i + 1, neste.i).filter(x => x.mode === 'foot');
    const gåMin = gange.length ? min(fra(gange[0]), til(gange[gange.length - 1])) : null;
    const vent = min(til(l), fra(neste.l));
    const margin = (til(l) != null && fra(neste.l) != null)
      ? transferMargin(fra(neste.l), til(l), false, opt.ekstraMin || 0, gåMin) : null;
    const dom = margin != null ? bytteDom(margin) : null;
    const m = _meter(gange);
    const nyPl = plattformTekst(neste.l.fromEstimatedCall && neste.l.fromEstimatedCall.quay
      && neste.l.fromEstimatedCall.quay.publicCode, neste.l.mode);
    const nyttSted = legEnds(neste.l).fra;
    const annetSted = nyttSted && stopKey(nyttSted) !== stopKey(e.til);
    const t = opt.tilgang ? opt.tilgang(_tilId(l)) : null;
    deler.push('<div class="rl-bytte ' + (dom ? _DOM_KLASSE[dom] : '') + '" data-rl="b' + k + '">'
      + 'Bytte på ' + esc(visStopp(e.til))
      + (vent != null ? ' · ' + vent + ' min' : '')
      + (gåMin ? ' · gå ' + gåMin + ' min' + (m ? ' (ca ' + m + ' m)' : '') : '')
      + ((annetSted || nyPl) ? ' til ' : '')
      + (annetSted ? esc(visStopp(nyttSted)) + (nyPl ? ' · ' : '') : '')
      + (nyPl ? esc(nyPl) : '')
      + (dom ? ' — <span class="rl-dom">' + esc(dom) + '</span>' : '')
      + (t === 'trinnfri' ? ' · trinnfri' : t === 'ikke-trinnfri' ? ' · ikke trinnfri' : '')
      + '</div>');
  });

  // Gange ETTER siste kjøretøy: til reisens eget mål, aldri «Destination».
  const sist = kjør[kjør.length - 1];
  const etterGang = legs.slice(sist.i + 1);
  if (etterGang.length) {
    const m = min(fra(etterGang[0]), til(etterGang[etterGang.length - 1]));
    deler.push('<div class="rl-gange">Gå' + (m != null ? ' ' + m + ' min' : '')
      + ' til ' + esc(visStopp(opt.til || legEnds(etterGang[etterGang.length - 1]).til)) + '</div>');
  }
  return '<div class="reiselop">' + deler.join('') + '</div>';
}

/* ── KARTET (v1.209.0) ──────────────────────────────────────────────────
 *
 * Kartet hadde navn bare på første og siste stopp; byttepunktet var en prikk
 * uten ord. Og tabellen og kartet var ikke koblet. Begge regnes fra de SAMME
 * rå etappene som tabellen over, så «etappe 2» er samme etappe begge steder.
 */
const _ll = p => (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  ? [p.latitude, p.longitude] : null);

/**
 * På, bytt og av — med linje og plattform, på KVAIENS koordinater (en
 * etappes `fromPlace` er kvaien, ikke stoppestedets midtpunkt).
 * @returns {Array<{kind:'på'|'bytt'|'av', lat, lon, linje?, farge?, tekst}>}
 */
export function kartPunkter(alle) {
  const kjør = (alle || []).filter(l => l && l.mode !== 'foot');
  const ut = [];
  kjør.forEach((l, k) => {
    const p = _ll(l.fromPlace);
    const line = (l.serviceJourney && l.serviceJourney.line) || {};
    const farge = '#' + String((line.presentation && line.presentation.colour) || '7c2d12').replace(/^#/, '');
    if (p) {
      ut.push({ kind: k === 0 ? 'på' : 'bytt', lat: p[0], lon: p[1],
        linje: line.publicCode || '?', farge,
        tekst: plattformTekst(l.fromEstimatedCall && l.fromEstimatedCall.quay
          && l.fromEstimatedCall.quay.publicCode, l.mode) || visStopp(legEnds(l).fra) });
    }
    /* OG DER DU GÅR AV — også midt i reisen. Uten det viste et zoomet bytte
     * bare den ene enden: «bytt» der du går på, og ingenting der bussen
     * setter deg av og gangen starter. Sett i nettleserprøven. */
    const q = _ll(l.toPlace);
    if (!q) return;
    const siste = k === kjør.length - 1;
    ut.push({ kind: 'av', lat: q[0], lon: q[1],
      linje: siste ? undefined : (line.publicCode || '?'), farge: siste ? undefined : farge,
      tekst: siste ? visStopp(legEnds(l).til)
        : (plattformTekst(l.toEstimatedCall && l.toEstimatedCall.quay
          && l.toEstimatedCall.quay.publicCode, l.mode) || visStopp(legEnds(l).til)) });
  });
  return ut;
}

/**
 * Utsnittene en rad i tabellen zoomer til: ett per etappe (`e`), ett per
 * bytte (`b`, avstigning + gange + påstigning), og hele reisen (`alt`).
 * @returns {{e:Array<Array>, b:Array<Array>, alt:Array}}
 */
export function kartUtsnitt(alle) {
  const legs = (alle || []).filter(Boolean);
  const form = l => {
    const p = legShape(l);
    if (p && p.length >= 2) return p;
    return [_ll(l.fromPlace), _ll(l.toPlace)].filter(Boolean);
  };
  const kjør = legs.map((l, i) => ({ l, i })).filter(x => x.l.mode !== 'foot');
  const e = kjør.map(x => form(x.l));
  const b = [];
  kjør.forEach((x, k) => {
    const n = kjør[k + 1];
    if (!n) return;
    const pts = [];
    const av = _ll(x.l.toPlace); if (av) pts.push(av);
    legs.slice(x.i + 1, n.i).forEach(g => form(g).forEach(p => pts.push(p)));
    const på = _ll(n.l.fromPlace); if (på) pts.push(på);
    b.push(pts);
  });
  const alt = [];
  legs.forEach(l => form(l).forEach(p => alt.push(p)));
  return { e, b, alt };
}
