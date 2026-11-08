/**
 * LINJEMERKET — den ene definisjonen av «74», «R10», «3».
 *
 * v1.218.13: ENTURS TravelTag og TILBYDERNES egne linjefarger — ikke noe
 * eget. Bestilt: «Følg designstandarden til Entur og de enkelte tilbyderne,
 * ikke finn opp noe eget. Jeg ønsker at bruker skal oppleve å gjenkjenne seg.»
 * v1.218.12 hadde en oppfunnet form og bokstav per tilbyder («Ruter | R»); den
 * er fjernet.
 *
 *   form     Linjes TravelTag (@entur/travel 8.1.1): ikon for transportmiddelet
 *            (@entur/icons 10.1.1) + publicCode, 0,25rem hjørner, ikon i
 *            tekstfargen. Skalert til appens kompakte merkehøyde.
 *   farge    tilbyderens egen, meldt til Entur (presentation.colour/textColour)
 *            — det Ruter- og Vy-brukere kjenner igjen. Mangler den: Linjes
 *            farge for transportmiddelet med hvit tekst, som TravelTag.
 *   tilbyder bare som tekst for skjermleser og verktøytips.
 *
 * Merket var bygd for hånd på 22 steder før v1.218.12.
 */

import { logoFor } from './tilbyderlogo.js';

/* Linjes fargetokens, standard (lys) variant. Kilde: @entur/tokens 4.3.1,
 * dist/transport.css (EUPL-1.2). Nøklene er appens transportmidler. */
export const LINJE_FARGE = {
  bus: '#c5044e',      // --standard-bus
  coach: '#427500',    // --standard-bus-regional
  metro: '#bf5826',    // --standard-metro
  tram: '#78469a',     // --standard-tram
  rail: '#00367f',     // --standard-train
  water: '#0c6693',    // --standard-ferry
  air: '#800664',      // --standard-plane
  cableway: '#78469a', // --standard-cableway
  funicular: '#78469a',// --standard-funicular
  taxi: '#3d3e40',     // --standard-taxi
};
export const LINJE_NØYTRAL = '#181c56'; // --standard-neutral

/* TILBYDERE etter kodeområdet i linje-id-en (RUT:Line:74 → RUT) — bare
 * navnet, til skjermleser og verktøytips. Ukjent kodeområde: intet navn. */
export const TILBYDERE = {
  RUT: { navn: 'Ruter' },
  VYG: { navn: 'Vy' },
  VYB: { navn: 'Vy' },
  VYX: { navn: 'Vy' },
  NBU: { navn: 'Vy' },
  SKY: { navn: 'Skyss' },
  ATB: { navn: 'AtB' },
  KOL: { navn: 'Kolumbus' },
  BRA: { navn: 'Brakar' },
  AKT: { navn: 'AKT' },
  FLT: { navn: 'Flytoget' },
  SJN: { navn: 'SJ' },
  GOA: { navn: 'Go-Ahead' },
  INN: { navn: 'Innlandstrafikk' },
  OST: { navn: 'Østfold kollektiv' },
  VKT: { navn: 'VKT' },
  TEL: { navn: 'Farte' },
  MOR: { navn: 'Fram' },
  NOR: { navn: 'Reis' },
  TRO: { navn: 'Svipper' },
  FIN: { navn: 'Snelandia' },
};

/* Enturs ikoner for transportmidler, fra @entur/icons 10.1.1 (EUPL-1.2),
 * dist/index.mjs: BusIcon, MetroIcon, TramIcon, TrainIcon, FerryIcon,
 * PlaneIcon, CablewayIcon, FunicularIcon, TaxiIcon. Stiene uendret. */
export const IKON = {
  bus: { evenodd: true, d: ["M10.5 11.8a1 1 0 1 1 1.998.003A1 1 0 0 1 10.5 11.8", "m14.996 9.595-.7-4.296A.35.35 0 0 0 13.95 5H1.7c-.35 0-.7.358-.7.717v4.925c0 .178.128.358.3.358h1.547c.236-.719.906-1.2 1.703-1.2s1.468.481 1.703 1.2h3.544c.236-.719.906-1.2 1.703-1.2s1.467.481 1.703 1.2h1.447c.193 0 .35-.161.35-.358v-.988q0-.03-.004-.06m-2.84-2.805c0-.198.158-.358.35-.358h1.087a.35.35 0 0 1 .347.311l.185 1.432a.36.36 0 0 1-.085.282.34.34 0 0 1-.262.122h-1.272a.354.354 0 0 1-.35-.358zm-4.2 0c0-.198.157-.358.35-.358h2.8c.193 0 .35.16.35.358V8.22a.354.354 0 0 1-.35.358h-2.8a.354.354 0 0 1-.35-.358zm-4.2 0c0-.198.157-.358.35-.358h2.8c.194 0 .351.16.351.358V8.22a.355.355 0 0 1-.35.358h-2.8a.354.354 0 0 1-.35-.358zm-2.1 0c0-.198.158-.358.35-.358h.701c.193 0 .349.16.349.358V8.22a.353.353 0 0 1-.349.358h-.7a.354.354 0 0 1-.35-.358z", "M3.55 11.8c0-.551.449-1 1-1s1 .449 1 1a1 1 0 0 1-2 0"] },
  metro: { evenodd: true, d: ["M5.004 5 5.004 6.166 7.416 6.166 7.416 12 8.584 12 8.584 6.166 10.999 6.166 10.999 5z", "M8 2c3.308 0 6 2.692 6 6s-2.692 6-6 6c-3.309 0-6-2.692-6-6s2.691-6 6-6m0-1C4.14 1 1 4.14 1 8s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7"] },
  tram: { evenodd: true, d: ["M14.062 5.272a.35.35 0 0 0-.341-.273H8.566l1.289-.89c.1-.075.149-.133.149-.255a.33.33 0 0 0-.142-.276L8.368 2.399h-.964l1.701 1.434-1.7 1.166H2.28a.35.35 0 0 0-.341.273L1.009 9.38a.45.45 0 0 0 .074.35l.812 1.124a.35.35 0 0 0 .283.145h11.643a.35.35 0 0 0 .284-.145l.812-1.123a.45.45 0 0 0 .074-.351zM3.75 8.182a.35.35 0 0 1-.35.35H2.35a.35.35 0 0 1-.342-.426l.31-1.4a.35.35 0 0 1 .34-.275H3.4a.35.35 0 0 1 .35.35zm3.5 0a.35.35 0 0 1-.35.35H4.799a.35.35 0 0 1-.35-.35V6.78a.35.35 0 0 1 .35-.35h2.1a.35.35 0 0 1 .35.35zm3.51 0a.35.35 0 0 1-.35.35h-2.1a.35.35 0 0 1-.35-.35V6.78a.35.35 0 0 1 .35-.35h2.1a.35.35 0 0 1 .35.35zm3.073.219a.35.35 0 0 1-.272.131H11.81a.35.35 0 0 1-.35-.35V6.781a.35.35 0 0 1 .35-.35h1.441a.35.35 0 0 1 .342.275l.309 1.4a.35.35 0 0 1-.07.295", "M2 11.999H14V12.999H2z"] },
  rail: { evenodd: true, d: ["M1 12H14V13H1z", "M14.75 8.1a.6.6 0 0 0-.091-.11l-.035-.036-.093-.095c-.315-.314-2.34-1.805-3.436-2.528-.358-.236-.76-.331-.999-.331h-3.54l1.295-.89c.1-.076.149-.134.149-.256a.33.33 0 0 0-.142-.276L6.364 2.399H5.4l1.702 1.434-1.7 1.166h.001H1v6h12.612c.196 0 .38-.098.488-.263.49-.755.9-1.41.9-1.902 0-.277-.095-.529-.25-.735m-2.537-.508c-.046.136-.173.172-.317.172h-.666c-.071 0-.185.01-.284-.063l-.95-.671a.332.332 0 0 1 .2-.599h.666c.072 0 .142.024.2.068l1.034.778c.115.086.162.18.117.315"] },
  water: { evenodd: false, d: ["M8.737 13c-.824 0-1.253-.226-1.632-.425-.33-.173-.591-.31-1.168-.31s-.838.137-1.168.31c-.38.2-.81.425-1.633.425-1.052 0-1.969-.588-2.007-.613L1 12.316l.447-.894.196.108c.037.023.743.47 1.493.47.577 0 .838-.137 1.168-.31.38-.199.81-.424 1.633-.424s1.254.225 1.633.424c.33.173.59.31 1.167.31s.837-.137 1.167-.31c.379-.199.81-.424 1.632-.424.643 0 1.046.137 1.372.292l-.479.88c-.23-.103-.48-.172-.893-.172-.577 0-.837.136-1.168.31-.378.198-.808.424-1.631.424M14.75 7.456h-1.432a.05.05 0 0 1-.05-.036l-.907-2.746a.35.35 0 0 0-.33-.242h-.554a.05.05 0 0 1-.047-.034l-.34-.825c-.073-.186-.214-.298-.417-.198l-1.213.706a.45.45 0 0 0-.244.402v.463c0 .04-.026.054-.047.054H5.78a.35.35 0 0 0-.318.198L4.362 7.422a.05.05 0 0 1-.047.034h-.667a.35.35 0 0 0-.314.195l-1.496 3.047c.313.16.658.302 1.275.302 1.4 0 1.4-.733 2.8-.733s1.4.733 2.8.733 1.4-.733 2.8-.733c.9 0 1.45.306 1.845.521l1.611-2.963a.25.25 0 0 0-.22-.37m-7.353-.2a.2.2 0 0 1-.2.2H5.272c-.125 0-.236-.098-.133-.279l.381-.78a.25.25 0 0 1 .228-.141h1.45c.11 0 .2.09.2.2zm2.204-.004a.204.204 0 0 1-.204.204H8.005a.204.204 0 0 1-.204-.204V6.46c0-.113.091-.204.204-.204h1.392c.113 0 .204.091.204.204zm2.535.204-1.933.001A.2.2 0 0 1 10 7.256v-.799c0-.11.09-.201.202-.201h1.653c.116 0 .217.079.245.191l.193.78c.053.165-.049.229-.158.229"] },
  air: { evenodd: false, d: ["M12.58 3.16c.329-.11.642.203.532.532A5.9 5.9 0 0 1 11.687 6L10.254 7.43l1.374 5.697-1 1-2.454-4.616-1.889 1.889.11 1.065-.858.858-.865-1.724-1.723-.864.858-.858 1.063.11 1.89-1.89-4.617-2.455 1-1L8.84 6.017l1.433-1.433a5.9 5.9 0 0 1 2.306-1.425"] },
  cableway: { evenodd: true, d: ["m13.295 1.803-3.917.984a1.23 1.23 0 0 0-.188-.806L13.094 1zm-5.127.121a.74.74 0 1 1 0 1.482.74.74 0 0 1 0-1.482m5.011 6.011a.43.43 0 0 0-.42-.336h-9.18a.43.43 0 0 0-.422.336l-1.146 5.068a.56.56 0 0 0 .09.433l1.003 1.385a.43.43 0 0 0 .35.179h9.429a.43.43 0 0 0 .35-.179l1.002-1.385a.56.56 0 0 0 .09-.433zM5.49 11.502c0 .24-.193.433-.432.433H3.763a.432.432 0 0 1-.422-.526l.382-1.727a.43.43 0 0 1 .42-.34h.915c.239 0 .432.194.432.433zm4.494 0a.43.43 0 0 1-.432.433H6.961a.43.43 0 0 1-.432-.432V9.775c0-.238.193-.432.432-.432h2.591c.238 0 .432.194.432.432zm2.927.272a.43.43 0 0 1-.337.162h-1.295a.43.43 0 0 1-.433-.433V9.775c0-.238.194-.432.432-.432h.914a.43.43 0 0 1 .422.34l.381 1.727a.43.43 0 0 1-.084.364M6.959 2.54l-3.918.984.202.803 3.904-.98a1.23 1.23 0 0 1-.188-.807m1.623 1.273v1.724h1.43v.828H6.324v-.828h1.43V3.814c.13.047.268.084.414.084.147 0 .284-.037.414-.084"] },
  funicular: { evenodd: true, d: ["m15 9.125-14 4.01v.99l14-4.01z", "m2.38 11.52 11.253-3.1A.5.5 0 0 0 14 7.938V3.825a1.5 1.5 0 0 0-1.885-1.45L3.487 4.668A2 2 0 0 0 2 6.6v4.631a.3.3 0 0 0 .38.29m8.917-6.08c0 .111.09.2.2.2h1.6a.2.2 0 0 0 .2-.2V4.026a.8.8 0 0 0-.983-.779l-.863.202a.2.2 0 0 0-.154.195zm-.7.75a.2.2 0 0 1-.2.2h-2.1a.2.2 0 0 1-.2-.2V4.508a.2.2 0 0 1 .148-.194l2.1-.552a.2.2 0 0 1 .251.194zM4.194 7.598a.2.2 0 0 1-.2.2h-1.1a.2.2 0 0 1-.2-.2v-1.06a1 1 0 0 1 .75-.968l.5-.13a.2.2 0 0 1 .25.194zm3-.472a.2.2 0 0 0 .2-.2V4.808a.2.2 0 0 0-.246-.194l-2.1.505a.2.2 0 0 0-.153.195v1.61c0 .111.09.2.2.2z"] },
  taxi: { evenodd: true, d: ["M13.998 7.233h-.002l-1.092-3.337c-.168-.512-.685-.863-1.272-.863H9.5v-.502a.5.5 0 0 0-.498-.498H6.997a.5.5 0 0 0-.497.498v.502H4.364c-.587 0-1.104.35-1.272.862L1.996 7.233h-.002a1 1 0 0 0-.998.999v3.503c0 .275.223.498.499.498h.501v.667a1.1 1.1 0 0 0 2.2 0v-.667h7.6v.667a1.1 1.1 0 0 0 2.2 0v-.667h.501a.5.5 0 0 0 .5-.498V8.232a1 1 0 0 0-1-.999M3.266 7.167l.84-2.74a.51.51 0 0 1 .495-.344h6.79c.23 0 .431.141.494.345l.84 2.739c.011.033-.016.066-.054.066H3.32c-.037 0-.065-.033-.055-.066m-.47 1.066c.44.002.8.36.8.804a.8.8 0 1 1-.8-.804m10.4 1.6a.8.8 0 1 1 0-1.6.8.8 0 0 1 0 1.6"] },
};
const IKON_FOR = { coach: 'bus' };  // regionbuss: Enturs bussikon
const MODUS_NAVN = { bus: 'buss', coach: 'buss', metro: 'T-bane', tram: 'trikk', rail: 'tog', water: 'båt', air: 'fly', cableway: 'taubane', funicular: 'kabelbane', taxi: 'taxi' };

export function tilbyder(linjeId) {
  if (!linjeId || typeof linjeId !== 'string') return null;
  return TILBYDERE[linjeId.split(':')[0]] || null;
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Lesbar tekst på bakgrunnen: WCAG relativ luminans. */
export function tekstFarge(bg) {
  const h = String(bg || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return '#ffffff';
  const lin = i => { const v = parseInt(h.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  // Kontrast mot hvit vs. mot Linjes nøytrale (L ≈ 0,014): velg den største.
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.064) ? '#ffffff' : LINJE_NØYTRAL;
}

function farge(f, modus) {
  if (f) { const h = String(f).replace('#', ''); if (/^[0-9a-f]{3,8}$/i.test(h)) return '#' + h; }
  return LINJE_FARGE[modus] || LINJE_NØYTRAL;
}

/**
 * @param {{kode:string, farge?:string, tekst?:string, linjeId?:string, modus?:string, stil?:string, klasse?:string}} o
 *   farge/tekst: linjens egne fra Entur (presentation.colour/textColour, med
 *   eller uten #). Tekstfargen er tilbyderens — Ruter melder hvitt på oransje —
 *   og regnes bare ut når den mangler. stil: ekstra inline-stil.
 */
export function linjemerke(o) {
  const t = tilbyder(o.linjeId);
  const egen = o.farge && /^#?[0-9a-f]{6}$/i.test(String(o.farge));
  const bg = farge(o.farge, o.modus);
  const tekst = o.tekst && /^#?[0-9a-f]{6}$/i.test(String(o.tekst)) ? '#' + String(o.tekst).replace('#', '') : null;
  // Tilbyderens tekstfarge; ellers TravelTags hvite på Linjes farge; ellers kontrast.
  const fg = tekst || (egen ? tekstFarge(bg) : '#ffffff');
  const kode = esc(o.kode || '?');
  const i = IKON[IKON_FOR[o.modus] || o.modus];
  const svg = i ? '<svg class="lm-ikon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">'
    + i.d.map(d => '<path' + (i.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : '') + ' d="' + d + '"/>').join('') + '</svg>' : '';
  const hvem = [t && t.navn, MODUS_NAVN[o.modus]].filter(Boolean);
  const etikett = hvem.length ? (t ? t.navn + ', ' : '') + (MODUS_NAVN[o.modus] ? MODUS_NAVN[o.modus] + ' ' : 'linje ') + kode : '';
  const merke = '<span class="line-badge lm' + (o.klasse ? ' ' + o.klasse : '') + '"'
    + (etikett ? ' aria-label="' + etikett + '" title="' + etikett + '"' : '')
    + ' style="--lm-bg:' + bg + ';--lm-fg:' + fg + (o.stil ? ';' + o.stil : '') + '">'
    + svg + kode + '</span>';
  // Enturs tilbyderlogo ved merket (v1.218.14). Slås av der det er trangt.
  const logo = o.logo === false ? null : logoFor(o.linjeId);
  if (!logo) return merke;
  return '<span class="lm-par">' + merke
    + '<span class="lm-logo" role="img" aria-label="' + esc(logo.navn) + '" title="' + esc(logo.navn) + '"'
    + ' style="--lm-forhold:' + logo.forhold + '">' + logo.svg + '</span></span>';
}
