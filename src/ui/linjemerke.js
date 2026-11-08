/**
 * LINJEMERKET (v1.218.12) — den ene definisjonen av «74», «R10», «3».
 *
 * Bestilt: «Ta i bruk https://linje.entur.no/komponenter og ikke minst bruk et
 * formspråk som gjør at bruker gjenkjenner viktige tilbydere sine tilbud,
 * eksempelvis Ruter sitt tilbud, Vy sitt tilbud osv.» Valgt: form + farge per
 * tilbyder, med en liten tilbyderbokstav.
 *
 * GRUNNFORMEN er Linjes TravelTag (@entur/travel 8.1.1): 0,25rem hjørner,
 * minst 2rem bred. Komponenten selv er React og kan ikke brukes her; formen og
 * fargetokens kan. Linje har INGEN tilbyderfarger — bare transportmidler — så
 * tilbyderen bæres av FORMEN og BOKSTAVEN, og fargen er linjens egen fra Entur
 * (det tilbyderen selv har meldt inn). Mangler den, Linjes farge for
 * transportmiddelet. Ingen gjettede merkevarefarger.
 *
 * Merket var bygd for hånd på 22 steder, hvert med sin egen reservefarge.
 */

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

/* TILBYDERE etter kodeområdet i linje-id-en (RUT:Line:74 → RUT). Formene er
 * valgt så de fire store — Ruter, Vy, Skyss, AtB — er ulike. Et ukjent
 * kodeområde gir ingen tilbyder: grunnformen og ingen bokstav, heller enn en
 * påstand vi ikke kan stå for. */
export const TILBYDERE = {
  RUT: { navn: 'Ruter', kort: 'R', form: 'firkant' },
  VYG: { navn: 'Vy', kort: 'Vy', form: 'pille' },
  VYB: { navn: 'Vy', kort: 'Vy', form: 'pille' },
  VYX: { navn: 'Vy', kort: 'Vy', form: 'pille' },
  NBU: { navn: 'Vy', kort: 'Vy', form: 'pille' },
  SKY: { navn: 'Skyss', kort: 'S', form: 'diagonal' },
  ATB: { navn: 'AtB', kort: 'A', form: 'flagg' },
  KOL: { navn: 'Kolumbus', kort: 'K', form: 'kant' },
  BRA: { navn: 'Brakar', kort: 'B', form: 'kant' },
  AKT: { navn: 'AKT', kort: 'AKT', form: 'kant' },
  FLT: { navn: 'Flytoget', kort: 'F', form: 'pille' },
  SJN: { navn: 'SJ', kort: 'SJ', form: 'pille' },
  GOA: { navn: 'Go-Ahead', kort: 'GA', form: 'pille' },
  INN: { navn: 'Innlandstrafikk', kort: 'I', form: 'kant' },
  OST: { navn: 'Østfold kollektiv', kort: 'Ø', form: 'kant' },
  VKT: { navn: 'VKT', kort: 'V', form: 'kant' },
  TEL: { navn: 'Farte', kort: 'Fa', form: 'kant' },
  MOR: { navn: 'Fram', kort: 'Fr', form: 'kant' },
  NOR: { navn: 'Reis', kort: 'Re', form: 'kant' },
  TRO: { navn: 'Svipper', kort: 'Sv', form: 'kant' },
  FIN: { navn: 'Snelandia', kort: 'Sn', form: 'kant' },
};

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
  const bg = farge(o.farge, o.modus);
  const fg = o.tekst && /^#?[0-9a-f]{6}$/i.test(String(o.tekst)) ? '#' + String(o.tekst).replace('#', '') : tekstFarge(bg);
  const kode = esc(o.kode || '?');
  return '<span class="line-badge lm lm-' + (t ? t.form : 'linje') + (o.klasse ? ' ' + o.klasse : '') + '"'
    + (t ? ' data-tilbyder="' + esc(t.navn) + '" aria-label="' + esc(t.navn) + ' linje ' + kode + '"' : '')
    + ' style="--lm-bg:' + bg + ';--lm-fg:' + fg + (o.stil ? ';' + o.stil : '') + '">'
    + kode
    + (t ? '<span class="lm-tilb" aria-hidden="true">' + esc(t.kort) + '</span>' : '')
    + '</span>';
}
