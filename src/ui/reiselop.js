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
import { linjemerke } from './linjemerke.js';
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
  return domFraKlasse(reachCls(margin));
}
/** Ordet for en `reachCls`-klasse. Én definisjon, lest av bytteraden og overgangene. */
export function domFraKlasse(r) {
  if (r === 'missed') return 'rekker du ikke';
  if (r === 'r-soon' || r === 'r-now') return 'stramt';
  return 'god tid';
}
export const _DOM_KLASSE = { 'god tid': 'rl-ok', 'stramt': 'rl-stramt', 'rekker du ikke': 'rl-miss' };

/** Lengden langs en gangeetappes form, i meter (urundet) — eller null uten form. */
function _formMeter(foot) {
  let m = 0, har = false;
  foot.forEach(l => {
    const p = legShape(l);
    if (!p || p.length < 2) return;
    har = true;
    for (let i = 1; i < p.length; i++) m += haver(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
  });
  return har ? m : null;
}
/** Samme lengde, rundet til 10 m slik byttelinja skriver den. */
function _meter(foot) {
  const m = _formMeter(foot);
  return m != null ? Math.round(m / 10) * 10 : null;
}

/* ── OMVEIEN, SAGT MED ORD ──────────────────────────────────────────────
 *
 * Rapportert med skjermbilde: buss 74 av på Jernbanetorget A, trikk 12 på
 * fra B. Kartet tegnet gangen som en sløyfe via Karl Johans gate, og linja
 * sa bare «ca 60 m» — mellom to plattformer som står nesten vegg i vegg.
 *
 * Undersøkt mot de ekte kildene (docs/produktretning.md, 2026-11-02): Entur
 * har ingen gangforbindelser (0 PathLink i hele landet), og NVDB viser at en
 * kjørebane (KV11926) går mellom A og B, med nærmeste gangfelt ca 22 m unna.
 * Omveien er altså VIRKELIG. En rett strek ville ledet folk over kjørebanen.
 *
 * Så appen sier det den vet: at plattformene ligger tett, at gangveien går
 * rundt, og gjennom hvilken gate — fra Journey Planners `steps`.
 * Byttedommen (`transferMargin`) rører dette ikke; den regner alt med
 * gangtiden.
 */
/** Gangveien er en omvei når den er minst så mange ganger luftlinja … */
export const OMVEI_FAKTOR = 3;
/** … og plattformene ligger nærmere enn dette. Lenger fra hverandre er
 *  ikke «tett», og da er en lang gangvei ikke overraskende. */
export const OMVEI_MAKS_LUFT_M = 100;

/* Navn i stegene som ikke er en gate du kan kjenne igjen. OpenStreetMap
 * kaller plattformene selv «Jernbanetorget A» og «Plattform B»; Journey
 * Planner merker oppdiktede navn («fortau», «gangvei») med `bogusName` og
 * plasser med `area`. */
const _ER_PLATTFORM = /^(plattform|platform|spor|perrong)\b/i;

/**
 * Er gangen mellom to kjøretøy en omvei rundt noe — og i så fall via hva?
 *
 * @param {{latitude:number, longitude:number}} av  kvaien du går av på
 * @param {{latitude:number, longitude:number}} på  kvaien du går på fra
 * @param {Array} gange gangeetappene mellom dem (rå Journey Planner-etapper)
 * @returns {null | {luft:number, gang:number, via:string[]}} null når det
 *   ikke er en omvei — eller når vi ikke vet (uten form eller koordinater).
 */
export function omvei(av, på, gange) {
  const ok = p => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
  if (!ok(av) || !ok(på)) return null;
  const gang = _formMeter(gange || []);
  if (gang == null) return null;
  const luft = haver(av.latitude, av.longitude, på.latitude, på.longitude);
  if (luft >= OMVEI_MAKS_LUFT_M || gang < OMVEI_FAKTOR * luft) return null;
  const stopp = [av.name, på.name].filter(Boolean).map(stopKey);
  const via = [];
  (gange || []).forEach(l => (l.steps || []).forEach(s => {
    const n = s && typeof s.streetName === 'string' ? s.streetName.trim() : '';
    if (!n || s.bogusName || s.area || _ER_PLATTFORM.test(n)) return;
    if (stopp.some(k => stopKey(n).startsWith(k))) return;
    if (!via.includes(n)) via.push(n);
  }));
  return { luft, gang, via: via.slice(0, 2) };
}

/** «ca 6 m» under 20 m, ellers til nærmeste 10 m. */
const _caM = m => (m < 20 ? Math.max(1, Math.round(m)) : Math.round(m / 10) * 10);

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
function _fraId(l) {
  const e = legEnds(l);
  if (e.fraId) return e.fraId;
  const kall = (l.serviceJourney && l.serviceJourney.estimatedCalls) || [];
  const c = kall.find(k => k && k.quay && k.quay.stopPlace
    && stopKey(k.quay.stopPlace.name) === stopKey(e.fra));
  return (c && c.quay.stopPlace.id) || null;
}

/**
 * NESTE AVGANG ETTER ET BYTTE (v1.218.43). Bestilt med skjermbilde: «putte inn
 * neste avgang … slik at bruker kan vurdere om det er verdt å ta sjansen på
 * denne reisen gitt evt. ventetid på neste dersom det blir forsinkelser».
 * `opt.neste(etappe)` gir `{dep, ankCa}`, `{ingen:true}` eller null (ikke
 * spurt / ikke svar). Ankomsten er et anslag — neste avgang pluss etappens
 * egen kjøretid — og sier det med «ca.».
 */
export function nesteRadHtml(nx, arrMs, tid) {
  if (!nx) return '';
  if (nx.ingen) return '<div class="rl-neste rl-neste-ingen"><span class="rl-tid"></span><span class="rl-navn">rekker du ikke denne: ingen ny avgang innen 2 t</span></div>';
  if (!Number.isFinite(nx.dep)) return '';
  const ekstra = Number.isFinite(nx.ankCa) && Number.isFinite(arrMs) ? Math.round((nx.ankCa - arrMs) / MIN) : null;
  return '<div class="rl-neste"><span class="rl-tid">' + tid(nx.dep) + '</span>'
    + '<span class="rl-navn">neste →'
    + (Number.isFinite(nx.ankCa) ? ' framme ca. ' + tid(nx.ankCa) + (ekstra != null ? ' · +' + ekstra + ' min' : '') : '')
    + '</span></div>';
}

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
      + '<div class="rl-linje">' + linjemerke({ kode: line.publicCode, farge, linjeId: line.id, modus: l.mode })
      + (front ? '<span class="rl-mot">mot ' + esc(front) + '</span>' : '')
      + (n ? '<span class="rl-antall">· ' + n + ' stopp</span>' : '') + '</div>'
      + '<div class="rl-stopp rl-av"><span class="rl-tid">' + tid(til(l)) + '</span>'
      + '<span class="rl-navn"><b>' + esc(visStopp(e.til)) + '</b>' + (avPl ? ' · ank. ' + esc(avPl) : '') + '</span></div>'
      // Bare etter et bytte: første etappe har «← forrige / neste →» selv.
      + (k > 0 && opt.neste ? nesteRadHtml(opt.neste({ stopId: _fraId(l), lineId: line.id || null, kode: line.publicCode,
        front: front || null, dep: fra(l), arr: til(l) }), til(l), tid) : '')
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
    const rundt = omvei(l.toPlace, neste.l.fromPlace, gange);
    deler.push('<div class="rl-bytte ' + (dom ? _DOM_KLASSE[dom] : '') + '" data-rl="b' + k + '">'
      + 'Bytte på ' + esc(visStopp(e.til))
      + (vent != null ? ' · ' + vent + ' min' : '')
      + (gåMin ? ' · gå ' + gåMin + ' min' + (m ? ' (ca ' + m + ' m)' : '') : '')
      + ((annetSted || nyPl) ? ' til ' : '')
      + (annetSted ? esc(visStopp(nyttSted)) + (nyPl ? ' · ' : '') : '')
      + (nyPl ? esc(nyPl) : '')
      + (dom ? ' — <span class="rl-dom">' + esc(dom) + '</span>' : '')
      + (t === 'trinnfri' ? ' · trinnfri' : t === 'ikke-trinnfri' ? ' · ikke trinnfri' : '')
      + (rundt
        ? '<span class="rl-omvei">Plattformene ligger ca ' + _caM(rundt.luft) + ' m fra hverandre, men '
          + (rundt.via.length
            ? 'gangveien går om ' + rundt.via.map(esc).join(' og ')
            : 'gangveien er ca ' + _caM(rundt.gang) + ' m')
          + '.</span>'
        : '')
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
 *
 * UTEN BYTTE STÅR STOPPNAVNET, ikke plattformen. Da står plattformen allerede
 * under avgangs- og ankomsttiden over kartet. Rapportert: «spor 1» ved
 * linjenavnet, i kartetiketten og under tiden, og «spor 2» uten å si at det
 * var på Jernbanetorget. Hvert spor står nå ett sted, ved stoppet det gjelder.
 * Med bytte er plattformene en del av byttet og står i både tabellen og
 * kartet, som før.
 * @returns {Array<{kind:'på'|'bytt'|'av', lat, lon, linje?, farge?, tekst}>}
 */
export function kartPunkter(alle) {
  const kjør = (alle || []).filter(l => l && l.mode !== 'foot');
  const ut = [];
  const medBytte = kjør.length > 1;
  kjør.forEach((l, k) => {
    const p = _ll(l.fromPlace);
    const line = (l.serviceJourney && l.serviceJourney.line) || {};
    const farge = '#' + String((line.presentation && line.presentation.colour) || '7c2d12').replace(/^#/, '');
    if (p) {
      ut.push({ kind: k === 0 ? 'på' : 'bytt', lat: p[0], lon: p[1],
        linje: line.publicCode || '?', farge,
        tekst: (medBytte && plattformTekst(l.fromEstimatedCall && l.fromEstimatedCall.quay
          && l.fromEstimatedCall.quay.publicCode, l.mode)) || visStopp(legEnds(l).fra) });
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
