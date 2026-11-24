#!/usr/bin/env node
/**
 * Prototype for opplevelseskort (ingen appendring). Leser data.json (ekte svar
 * fra Entur, Valhalla, Wikidata, Kartverket og Miljødirektoratet) og skriver
 * opplevelseskort.html: fire innganger, underfiltre, kortvariantene A/B/C og
 * et kart der en prikk åpner samme kort. Leaflet legges inn i fila, så siden
 * står alene.  Kjør fra repo-roten: node scratchpad/prototype/lagSide.mjs
 */
import fs from 'node:fs';
const D = JSON.parse(fs.readFileSync('scratchpad/prototype/data.json', 'utf8'));
const leafletJs = fs.readFileSync('node_modules/leaflet/dist/leaflet.js', 'utf8');
const leafletCss = fs.readFileSync('node_modules/leaflet/dist/leaflet.css', 'utf8');

// Fire innganger over de sju kategoriene (plan 25.11): et sted kan høre til flere.
const INNGANG = { natur: 'Natur og friluftsliv', severdighet: 'Severdigheter', kultur: 'Kultur og historie', aktivitet: 'Aktiviteter og rekreasjon' };
const FRA_KAT = { natur: 'natur', friluftsliv: 'natur', severdighet: 'severdighet', kultur: 'kultur', bading: 'aktivitet', park: 'aktivitet', attraksjon: 'aktivitet' };
const FRA_NAVN = { 'Natur og landskap': 'natur', 'Friluftsliv og utfart': 'friluftsliv', 'Severdigheter og landemerker': 'severdighet', 'Kultur og historie': 'kultur', 'Bading og vannaktiviteter': 'bading', 'Parker og rekreasjon': 'park', 'Attraksjoner og opplevelser': 'attraksjon' };
const UTGANGSPUNKT = { mortensrud_dag: 'Mortensrud', nesttun_dag: 'Nesttun', ranheim_dag: 'Ranheim', tretten_dag: 'Tretten' };

// Aktivitet utledet fra kildene — ikke funnet på.
function aktiviteter(o) {
  const u = (o.under || []).join(' ').toLowerCase(), ut = [];
  if (o.rute && o.rute.type === 'Fotrute') ut.push('gåtur');
  if (o.rute && o.rute.type === 'Skiløype') ut.push('skitur');
  if (o.rute && o.rute.type === 'Sykkelrute') ut.push('sykling');
  if (/marka|turområde|utfart/.test(u)) ut.push('tur i skog og mark');
  if (/vann|tjern/.test(u)) ut.push('tur til vannet');
  if (/strand|badeplass|strandsone/.test(u)) ut.push('bading og strand');
  if (/naturreservat|landskapsvern|kvalitetsområde/.test(u)) ut.push('naturopplevelse');
  if (/skisenter|alpin/.test(u) || /alpinsenter/.test((o.beskrivelse || {}).tekst || '')) ut.push('ski');
  if (/fornøyelsespark|attraksjon/.test(u)) ut.push('familieaktivitet');
  if (/museum/.test(u)) ut.push('museumsbesøk');
  if (/ruin|borg|kirke/.test(u)) ut.push('historisk sted');
  if (/teater|kulturhus|kulturarena/.test(u)) ut.push('kulturopplevelse');
  return [...new Set(ut)].slice(0, 3);
}
function innganger(o) {
  const k = o.hoved ? o.hoved : (o.hovedNavn || []).map(n => FRA_NAVN[n]).filter(Boolean);
  return [...new Set(k.map(x => FRA_KAT[x]).filter(Boolean))];
}
// Hvorfor: kildenes egne ord. Ingen tekst vi finner på.
function hvorfor(o) {
  if (o.beskrivelse) return { tekst: o.beskrivelse.tekst, kilde: 'Wikidata' + (o.beskrivelse.språk === 'en' ? ' (engelsk)' : '') };
  if (o.verdi) return { tekst: o.verdi + (o.under && o.under[0] ? ' · ' + o.under[0] : ''), kilde: 'Miljødirektoratet' };
  // Ruter: typen står alt under navnet — ikke gjenta den som «hvorfor» (sett: Pilegrimsleden to ganger).
  return null;
}
// Tilgjengelighet i ord (variant C) — og hva ordet bygger på. Ingen poengsum.
function tilgang(o) {
  const r = o.reise, g = o.gang;
  if (!r || r.ingenKollektiv) return { ord: 'krevende', grunn: 'ingen kollektivreise i søket' };
  const gang = g ? g.min : null;
  if (r.min <= 45 && r.bytter <= 1 && (gang == null || gang <= 15)) return { ord: 'enkel', grunn: r.min + ' min, ' + (r.bytter ? '1 bytte' : 'uten bytte') + (gang != null ? ', ' + gang + ' min gange' : '') };
  if (r.min <= 120 && r.bytter <= 2 && (gang == null || gang <= 25)) return { ord: 'mulig', grunn: r.min + ' min, ' + r.bytter + ' bytte' + (r.bytter === 1 ? '' : 'r') + (gang != null ? ', ' + gang + ' min gange' : '') };
  return { ord: 'krevende', grunn: (r.min >= 60 ? Math.floor(r.min / 60) + ' t ' + (r.min % 60) + ' min' : r.min + ' min') + ', ' + r.bytter + ' bytte' + (r.bytter === 1 ? '' : 'r') + (gang != null ? ', ' + gang + ' min gange' : '') };
}
const kl = iso => new Date(iso).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Oslo' });
const tid = m => (m >= 60 ? Math.floor(m / 60) + ' t ' + (m % 60) + ' min' : m + ' min');

const kort = D.kort.map((o, i) => ({ i, navn: o.navn, hva: o.hva || (o.under || [])[0] || '', innganger: innganger(o), aktiviteter: aktiviteter(o), hvorfor: hvorfor(o), tilgang: tilgang(o),
  fra: UTGANGSPUNKT[o.fra.scenario], stopp: o.stopp.navn, lat: o.lat ?? o.stopp.lat, lon: o.lon ?? o.stopp.lon, slat: o.stopp.lat, slon: o.stopp.lon,
  reise: o.reise && { ...o.reise, gårKl: kl(o.reise.går), frammeKl: kl(o.reise.framme), tid: tid(o.reise.min) }, gang: o.gang,
  kilder: [...new Set(o.kilder.map(k => ({ turrute: 'Kartverket', miljodir: 'Miljødirektoratet', wikidata: 'Wikidata', osm: 'OpenStreetMap', kartverket: 'Kartverket' })[k.split(':')[0]]))] }));

const html = `<!doctype html><html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Opplevelseskort – prototype</title>
<style>${leafletCss}
:root{--bg:#0d1526;--kort:#15213a;--linje:rgba(160,180,220,.16);--tekst:#e8eef9;--dempet:#93a3c0;--aksent:#5aa2ff;--enkel:#3fb98a;--mulig:#e0a640;--krevende:#e0645a}
:root[data-tema=lys]{--bg:#f3f6fb;--kort:#fff;--linje:rgba(30,50,90,.12);--tekst:#16213a;--dempet:#5b6b88;--aksent:#2563eb;--enkel:#13865f;--mulig:#a76a00;--krevende:#b8372e}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tekst);font:15px/1.4 -apple-system,system-ui,sans-serif}
.side{max-width:420px;margin:0 auto;padding:12px 16px 40px}
h1{font-size:20px;margin:6px 0 2px}.under{color:var(--dempet);font-size:13px;margin-bottom:10px}
.rad{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chip{border:1px solid var(--linje);background:none;color:var(--tekst);border-radius:999px;padding:5px 11px;font:inherit;font-size:13px;cursor:pointer}
.chip[aria-pressed=true]{background:var(--aksent);border-color:var(--aksent);color:#fff}.chip.liten{font-size:12px;padding:3px 9px}
.variant{color:var(--dempet);font-size:12px}
#kart{height:230px;border-radius:10px;margin:8px 0 12px;border:1px solid var(--linje)}
.kort{background:var(--kort);border:1px solid var(--linje);border-radius:12px;padding:12px 14px;margin:0 0 10px}
.kort.valgt{outline:2px solid var(--aksent)}
.navn{font-weight:700;font-size:16px}.hva{color:var(--dempet);font-size:13px}
.merker{display:flex;flex-wrap:wrap;gap:4px;margin:6px 0}.merke{font-size:11px;border-radius:4px;padding:1px 6px;background:var(--linje);color:var(--tekst)}
.hvorfor{font-size:13.5px;margin:4px 0 8px}.kilde{color:var(--dempet);font-size:11px}
.hvordan{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;border-top:1px solid var(--linje);padding-top:8px}
.tall{font-weight:700;font-size:17px}.etikett{color:var(--dempet);font-size:11px}
.reise{font-size:12.5px;color:var(--dempet);margin-top:6px}
.tilgang{display:inline-block;font-size:12px;font-weight:700;margin-top:6px}.enkel{color:var(--enkel)}.mulig{color:var(--mulig)}.krevende{color:var(--krevende)}
.a-rad{background:var(--kort);border-bottom:1px solid var(--linje);padding:9px 12px;font-size:13.5px}.a-rad b{font-weight:700}
.tom{color:var(--dempet);font-size:13px;padding:8px 0}
.fot{color:var(--dempet);font-size:11px;margin-top:18px}
</style></head><body><div class="side">
<h1>Utforsk mulighetene</h1>
<div class="under">Steder du kan nå med kollektivtransport · prototype med ekte data</div>
<div class="rad" id="innganger"></div><div class="rad" id="underfiltre"></div>
<div class="rad"><span class="variant">variant:</span><button class="chip liten" data-v="A">A tett rad</button><button class="chip liten" data-v="B">B kort</button><button class="chip liten" data-v="C">C kort + tilgang</button>
<button class="chip liten" id="tema">lys / mørk</button></div>
<div id="kart"></div><div id="liste"></div>
<div class="fot">Data: reisesøk Entur (avreise ${kl(D.avreise)} 25.11), gange Valhalla/OSM, beskrivelser Wikidata, turruter © Kartverket, friluftsområder Miljødirektoratet. Kart © Kartverket. Hentet ${D.hentet.slice(0, 10)}. Utgangspunktene er fire steder (Mortensrud, Nesttun, Ranheim, Tretten); kortet sier hvilket.</div>
</div>
<script>${leafletJs}</script>
<script>
const KORT = ${JSON.stringify(kort)};
const INNGANG = ${JSON.stringify(INNGANG)};
const q = new URLSearchParams(location.search);
let inngang = q.get('i') || 'alle', aktivitet = null, variant = q.get('v') || 'B', valgt = null;
if (q.get('tema')) document.documentElement.dataset.tema = q.get('tema');
const e = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const synlige = () => KORT.filter(k => (inngang === 'alle' || k.innganger.includes(inngang)) && (!aktivitet || k.aktiviteter.includes(aktivitet)));
function tegnFaner() {
  document.getElementById('innganger').innerHTML = [['alle','Alle'], ...Object.entries(INNGANG)].map(([k, t]) => '<button class="chip" data-i="' + k + '" aria-pressed="' + (inngang === k) + '">' + t + '</button>').join('');
  // Underfiltre bare inni valgt inngang, og bare de som finnes der.
  const akt = inngang === 'alle' ? [] : [...new Set(KORT.filter(k => k.innganger.includes(inngang)).flatMap(k => k.aktiviteter))];
  document.getElementById('underfiltre').innerHTML = akt.length ? '<button class="chip liten" data-a="" aria-pressed="' + (!aktivitet) + '">alle</button>' + akt.map(a => '<button class="chip liten" data-a="' + a + '" aria-pressed="' + (aktivitet === a) + '">' + a + '</button>').join('') : '';
  document.querySelectorAll('[data-v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === variant));
}
function hvordan(k) {
  if (!k.reise || k.reise.ingenKollektiv) return '<div class="reise">Ingen kollektivreise i søket (avreise ${kl(D.avreise)}).' + (k.reise ? ' Gange hele veien: ' + k.reise.tid + ' (Entur).' : '') + '</div>';
  return '<div class="hvordan"><div><div class="tall">' + k.reise.tid + '</div><div class="etikett">reise til stoppet</div></div>'
    + '<div><div class="tall">' + k.reise.bytter + '</div><div class="etikett">' + (k.reise.bytter === 1 ? 'bytte' : 'bytter') + '</div></div>'
    + '<div><div class="tall">' + (k.gang ? k.gang.min + ' min' : '–') + '</div><div class="etikett">' + (k.gang ? 'gange fra stopp, målt' : 'gange ukjent') + '</div></div></div>'
    + '<div class="reise">' + e(k.reise.linjer.join(' → ')) + ' · går ' + k.reise.gårKl + ' · framme ' + k.stopp + ' ' + k.reise.frammeKl + ' · fra ' + k.fra + '</div>';
}
function kortHtml(k) {
  if (variant === 'A') return '<div class="a-rad" data-k="' + k.i + '"><b>' + e(k.navn) + '</b> · ' + e(k.hva) + ' · ' + (k.gang ? k.gang.min + ' min å gå' : 'gange ukjent') + ' fra ' + e(k.stopp)
    + (k.reise && !k.reise.ingenKollektiv ? ' · ' + k.reise.tid + ', ' + k.reise.bytter + ' bytte' : ' · ingen kollektivreise') + '</div>';
  const t = k.tilgang;
  return '<div class="kort' + (valgt === k.i ? ' valgt' : '') + '" data-k="' + k.i + '"><div class="navn">' + e(k.navn) + '</div><div class="hva">' + e(k.hva) + ' · ved ' + e(k.stopp) + '</div>'
    + '<div class="merker">' + k.innganger.map(i => '<span class="merke">' + INNGANG[i] + '</span>').join('') + k.aktiviteter.map(a => '<span class="merke">' + a + '</span>').join('') + '</div>'
    + (k.hvorfor ? '<div class="hvorfor">' + e(k.hvorfor.tekst) + ' <span class="kilde">· ' + e(k.hvorfor.kilde) + '</span></div>' : '<div class="hvorfor kilde">ingen beskrivelse i kildene</div>')
    + hvordan(k)
    + (variant === 'C' ? '<div class="tilgang ' + t.ord + '">' + t.ord + ' <span class="kilde">(' + e(t.grunn) + ')</span></div>' : '')
    + '<div class="kilde" style="margin-top:6px">kilder: ' + k.kilder.join(', ') + '</div></div>';
}
function tegnListe() {
  const s = synlige();
  document.getElementById('liste').innerHTML = s.length ? s.map(kortHtml).join('') : '<div class="tom">Ingen steder i denne inngangen i utvalget.</div>';
  tegnPrikker(s);
}
const kart = L.map('kart', { zoomControl: false, attributionControl: false });
L.tileLayer('https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png', { maxZoom: 17 }).addTo(kart);
const lag = L.layerGroup().addTo(kart);
const FARGE = { natur: '#3fb98a', severdighet: '#e0a640', kultur: '#b07cf0', aktivitet: '#5aa2ff' };
function tegnPrikker(s) {
  lag.clearLayers();
  s.forEach(k => L.circleMarker([k.lat, k.lon], { radius: valgt === k.i ? 9 : 6, color: '#fff', weight: 2, fillColor: FARGE[k.innganger[0]] || '#888', fillOpacity: 1 })
    .on('click', () => velg(k.i)).addTo(lag));
  if (s.length) kart.fitBounds(L.latLngBounds(s.map(k => [k.lat, k.lon])).pad(0.2), { maxZoom: 12, animate: false });
}
// En prikk og et kort er samme ting: trykk på prikken velger kortet i lista.
function velg(i) { valgt = i; tegnListe(); const el = document.querySelector('[data-k="' + i + '"]'); if (el) el.scrollIntoView({ block: 'nearest' }); }
document.addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) { const c = ev.target.closest('[data-k]'); if (c) velg(+c.dataset.k); return; }
  if (b.dataset.i) { inngang = b.dataset.i; aktivitet = null; }
  else if (b.dataset.a !== undefined) aktivitet = b.dataset.a || null;
  else if (b.dataset.v) variant = b.dataset.v;
  else if (b.id === 'tema') document.documentElement.dataset.tema = document.documentElement.dataset.tema === 'lys' ? 'mørk' : 'lys';
  tegnFaner(); tegnListe();
});
tegnFaner(); tegnListe();
</script></body></html>`;
fs.writeFileSync('scratchpad/prototype/opplevelseskort.html', html);
console.log('skrevet', kort.length, 'kort', kort.map(k => k.navn + ' [' + k.innganger.join(',') + '] ' + k.tilgang.ord).join(' | '));
