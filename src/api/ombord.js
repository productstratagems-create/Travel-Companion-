/**
 * Sitter du på noe? — dommen auto-reise manglet.
 *
 * «Du er ved» rangeres av `rankStops`: ved stoppet, mot/fra stoppet, vane,
 * avstand. Det er bygget for en som GÅR. For en som sitter på et kjøretøy
 * bytter «nærmeste stopp» hvert halve minutt, og appen hadde ingen måte å si
 * «du er på 3 mot Kolsås» — selv om den kan bli med på en reise.
 *
 * KILDEN LÅ I HVERT TAVLESVAR. `serviceJourney.estimatedCalls` gir hvert
 * stopp på turen med koordinater og forventet tid, og `forventetPos.js`
 * regner ut hvor en avgang SKAL være nå. Følger én avgangs forventede
 * posisjon sporet ditt over tid, sitter du sannsynligvis på den.
 *
 * TID, IKKE BARE GEOMETRI. To linjer i samme gate skilles av rutetidene; en
 * bil i bussfart fire minutter bak bussen skilles av klokka.
 *
 * Et TILBUD, aldri en handling. Samme regel som `autoJumpDest`: å bli flyttet
 * feil koster mer enn trykket det sparer.
 *
 * EN BLADMODUL. Den importerer bare `haversine.js`. Forventede posisjoner
 * samples av kallestedet og sendes inn, så dommen kan prøves uten DOM,
 * nettverk eller `state`.
 *
 * Tallene under er valgt av resonnement og IKKE målt på en ekte tur. Samme
 * forbehold som `AKSELERASJON_MS2` og `PICK_MARGIN_M`. Reiseloggen
 * (`ombord`-hendelser) er bygget for å måle dem.
 */
import { metresBetween } from '../haversine.js';

/** Det du har sagt (api/linjeSvar.js) veier dobbelt så tungt som vanen. Her, så
 *  bladmodulen forblir et blad; linjeSvar.js eksporterer den videre. */
export const SVAR_VEKT = 2;

export const OMBORD_KINDS = ['ombord', 'ombord-tvil', 'vet-ikke'];

/**
 * Under dette går du: 10 km/t, brukerens eget tall («en hastighet som
 * overgår 10 km i timen»). Rask gange er ca 2 m/s (7 km/t); 10 km/t er
 * 2,78 m/s.
 *
 * Det var 5 m/s (18 km/t). Det er en buss i fart, men ikke en buss i
 * bytrafikk eller en trikk som kryper mellom stopp, og der tidde appen.
 * Prisen for det lavere tallet: en som jogger fort kan leses som «i fart».
 * Tilbudet krever likevel at en avgangs forventede posisjon følger sporet
 * ditt over tid, så en jogger blir ikke «ombord» av farten alene.
 *
 * En buss som står ved et stopp er under terskelen. Da tier dommen til den
 * kjører igjen, og det er riktig: å stå stille sier ingenting om hva du står i.
 */
export const OMBORD_MIN_FART_MS = 10 / 3.6;

/** Minst så mange brukbare fikser … */
export const OMBORD_MIN_FIKSER = 3;
/** … over minst så lang tid. Tre fikser i samme sekund er ett punkt. */
export const OMBORD_MIN_SPENN_MS = 20_000;

/**
 * Hvor langt fra forventet posisjon en fiks kan være og fortsatt telle.
 *
 * Romslig med vilje. Forventet posisjon er interpolert mellom stopp; på en
 * kurve uten linjeform skjærer den hjørnet. Og en buss forsinket et halvt
 * minutt i forhold til `expectedDepartureTime` er 150 m unna i 5 m/s.
 *
 * Også grensen for hvilke fikser som er BEVIS: en fiks med `acc` større enn
 * dette kan ikke skille en kandidat fra en annen, og teller verken for eller
 * imot.
 */
export const OMBORD_MAKS_AVVIK_M = 150;

/**
 * SLINGRINGSMONN I RUTETID (v1.218.24). Rapportert: «Auto-reise feilet på
 * linje 3 fra Mortensrud. Mellom Bøler og Ulsrud trodde appen bruker plutselig
 * var på bussen.» Feilsøkingsloggen viste «sanntidsposisjoner: 0 for
 * RUT:Line:3» og «nærmeste:» Bøler → Olav Nygards veg (bus) → Ulsrud → … —
 * T-banen ble aldri kjent igjen. Kravet var 150 m fra turens posisjon ETTER
 * RUTETIDEN på sekundet; en T-bane i ~8 m/s er utenfor etter 20 s.
 *
 * Nå: nærmeste av turens posisjoner innenfor ±180 s rutetid. MÅLT
 * (v1.218.25): turopptaket fra linje 3 samme morgen viste toget 80–165 s FORAN
 * sanntiden (signalfeil; sanntiden hang etter). ±90 s, valgt ved resonnement i
 * v1.218.24, ville gitt «vet-ikke» fra Skullerud. Et tog 5 minutter unna
 * følger deg fortsatt ikke.
 */
export const OMBORD_TIDSSLINGRE_MS = 180_000;
const SLINGRE_STEG_MS = 10_000;

/** Meter fra fiksen til turen, med slingringsmonn i rutetid når turen kan si hvor den er (`posAt`). */
export function avstandTilTur(k, f) {
  if (k && typeof k.posAt === 'function') {
    let best = Infinity;
    for (let d = -OMBORD_TIDSSLINGRE_MS; d <= OMBORD_TIDSSLINGRE_MS; d += SLINGRE_STEG_MS) {
      const p = k.posAt(f.at + d);
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) best = Math.min(best, metresBetween(f, p));
    }
    return best;
  }
  const p = ((k && k.forventet) || []).find(x => x && x.at === f.at);
  return p && Number.isFinite(p.lat) && Number.isFinite(p.lon) ? metresBetween(f, p) : Infinity;
}

/**
 * Er du i fart — raskere enn noen som går?
 *
 * ÉN TERSKEL FOR TO SKJERMDELER. Tilbudet «ser ut som du er på» og
 * overskriften «du er ved» under det spør samme spørsmål. Med hvert sitt
 * tall kunne de svart hvert sitt — «du går mot den» rett under «ser ut som
 * du er på 31», som var nøyaktig det v1.198.0 viste.
 */
export function iFart(fartMS) {
  return Number.isFinite(fartMS) && fartMS >= OMBORD_MIN_FART_MS;
}

/**
 * Gjelder gangtid til stoppet — eller sitter du på noe?
 *
 * I fart er «rekker du den til fots» et svar på et spørsmål ingen stilte.
 * v1.199.0 rettet overskriften; radene strøk fortsatt avganger som «rekker
 * ikke» ut fra at du GÅR til stoppet, også på bussen.
 *
 * En fast «gå fra»-plass (innstillinger) er ikke din GPS: den gjelder uansett
 * hvor du er. Samme terskel som tilbudet og overskriften — `iFart`.
 */
export function gangGjelder(fartMS, harFastSted) {
  return !!harFastSted || !iFart(fartMS);
}

/** Sagt over radene når gangtid ikke regnes. Ustrøkne rader uten forklaring
 *  leses som at alt kan nås. Én tekst for tavla og auto-reise. */
export const I_FART_NOTIS = 'i fart — viser ikke hva du rekker til fots';

const _ok = f => f && Number.isFinite(f.lat) && Number.isFinite(f.lon) && Number.isFinite(f.at);

/** Er fiksen presis nok til å være bevis? Ukjent `acc` regnes som ja. */
const _brukbar = f => _ok(f) && !(Number.isFinite(f.acc) && f.acc > OMBORD_MAKS_AVVIK_M);

/**
 * Følger kandidatens forventede posisjon disse fiksene?
 * Fiksens egen `acc` trekkes fra: en fiks på ±40 m 160 m unna kan være 120.
 */
function _følger(k, fikser) {
  return fikser.every(f => {
    const acc = Number.isFinite(f.acc) ? f.acc : 0;
    return avstandTilTur(k, f) - acc <= OMBORD_MAKS_AVVIK_M;
  });
}

/**
 * @param {{spor:Array<{lat,lon,at,acc}>, fartMS:number|null,
 *          kandidater:Array<{nøkkel,linje,front,call,forventet:Array<{at,lat,lon}>}>}} o
 * @returns {{kind:string, grunn:string|null, kandidater:Array}}
 */
export function ombord(o) {
  const c = o || {};
  const vetIkke = grunn => ({ kind: 'vet-ikke', grunn, kandidater: [] });

  // «Ingen fart» og «går» er to setninger (AGENTS.md regel 4). Den første
  // betyr at filteret ikke har noe å si; den andre at det har svart.
  if (!Number.isFinite(c.fartMS)) return vetIkke('ingen-fart');
  if (!iFart(c.fartMS)) return vetIkke('går');

  const fikser = (Array.isArray(c.spor) ? c.spor : []).filter(_brukbar);
  if (fikser.length < OMBORD_MIN_FIKSER
    || fikser[fikser.length - 1].at - fikser[0].at < OMBORD_MIN_SPENN_MS) {
    return vetIkke('kort-spor');
  }

  const treff = (Array.isArray(c.kandidater) ? c.kandidater : [])
    .filter(k => k && k.nøkkel && _følger(k, fikser));
  if (!treff.length) return vetIkke('ingen-følger');
  // To eller flere som følger deg like godt: to linjer på samme trasé til
  // samme tid. Appen velger ikke for deg.
  return { kind: treff.length === 1 ? 'ombord' : 'ombord-tvil', grunn: null, kandidater: treff };
}

/* ── STOPPET PÅ LINJA DU ER PÅ ───────────────────────────────────────── */

const _ms = c => { const v = _tid(c); return v ? new Date(v).getTime() : NaN; };

/**
 * Det neste stoppet kandidatens tur skal innom etter `nå`, eller null.
 */
export function nesteStopp(k, nå) { return stoppFram(k, nå, 0); }

/** Stopp nr. `n` framover (0 = neste), eller null. */
export function stoppFram(k, nå, n) {
  return _stoppAv(_kall(k).filter(x => _ms(x) > nå)[n || 0]);
}

const _kall = k => {
  const sj = k && k.call && k.call.serviceJourney;
  return (sj && Array.isArray(sj.estimatedCalls)) ? sj.estimatedCalls : [];
};

/** Står du så nær et stopp (eller innenfor fiksens nøyaktighet), er du VED det. */
export const VED_STOPP_M = 80;

/**
 * «DU ER VED» OG «NESTE STASJON», fra samme tur (v1.218.26).
 *
 * Rapportert: «Jeg ønsker at auto-reise viser både «Du er ved» og «Neste
 * stasjon».» Turopptaket fra linje 3 (10.11): toget sto 2 m fra Brynseng,
 * men rutetiden der var passert, så appen sa bare «neste stopp Hellerud».
 * Tiden alene sier ikke hvor toget står — posisjonen gjør det. Tiden brukes
 * bare til å skille to besøk på samme stopp (±OMBORD_TIDSSLINGRE_MS).
 *
 * @returns {{ved:object|null, forrige:object|null, neste:object|null}}
 */
export function vedOgNeste(k, nå, fiks) {
  const alle = _kall(k);
  const tom = { ved: null, forrige: null, neste: null };
  if (!alle.length) return tom;
  let vedI = -1;
  if (fiks && Number.isFinite(fiks.lat) && Number.isFinite(fiks.lon)) {
    const radius = Math.max(VED_STOPP_M, Number.isFinite(fiks.acc) ? fiks.acc : 0);
    let best = Infinity;
    alle.forEach((c, i) => {
      const s = _stoppAv(c);
      const t = _ms(c);
      if (!s || s.lat == null || !Number.isFinite(t) || Math.abs(t - nå) > OMBORD_TIDSSLINGRE_MS) return;
      const d = metresBetween(fiks, s);
      if (d <= radius && d < best) { best = d; vedI = i; }
    });
  }
  let nesteI = vedI >= 0 ? vedI + 1 : alle.findIndex(x => _ms(x) > nå);
  if (nesteI < 0 || nesteI >= alle.length) nesteI = -1;
  const forrigeI = vedI >= 0 ? -1 : (nesteI > 0 ? nesteI - 1 : -1);
  return {
    ved: vedI >= 0 ? _stoppAv(alle[vedI]) : null,
    forrige: forrigeI >= 0 ? _stoppAv(alle[forrigeI]) : null,
    neste: nesteI >= 0 ? _stoppAv(alle[nesteI]) : null,
  };
}

/**
 * Stopp nr. `n` etter stoppet `id` på turen (0 = stoppet selv), eller null.
 * Til å bla langs linja om bord (v1.218.47). Første forekomst som ikke er
 * passert, så en tur innom samme stopp to ganger ikke forveksles.
 */
export function stoppEtterId(k, id, n, nå) {
  const alle = _kall(k);
  const i = alle.findIndex(x => x.quay && x.quay.stopPlace && x.quay.stopPlace.id === id
    && !(_ms(x) < nå - OMBORD_TIDSSLINGRE_MS));
  if (i < 0 || !Number.isInteger(n) || n < 0) return null;
  return _stoppAv(alle[i + n]) || null;
}

/** Stoppet i et kall, i formen resten av appen leser. Én definisjon. */
function _stoppAv(c) {
  const q = c && c.quay;
  const sp = q && q.stopPlace;
  if (!sp || !sp.id) return null;
  const lat = Number.isFinite(sp.latitude) ? sp.latitude : q.latitude;
  const lon = Number.isFinite(sp.longitude) ? sp.longitude : q.longitude;
  return { id: sp.id, name: sp.name || '', lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
    // Når turen er der: grunnlaget for overgangene (src/overganger.js).
    at: _ms(c) };
}

/**
 * Stoppet «du er ved» skal vise når du er i fart: det neste på linja du
 * mest sannsynlig er på, ikke det nærmeste.
 *
 * Rapportert: i fart byttet «nærmeste stopp» til hvilket som helst stopp ved
 * veien, også stopp for linjer du ikke er på. Dommen over (`ombord`) visste
 * allerede hvilken avgang som følger sporet ditt.
 *
 * Ved tvil, altså to linjer som følger deg like godt, velger appen bare når
 * begge skal til samme neste stopp. Ellers står det nærmeste, som før. Det er
 * samme regel som tilbudet: appen velger ikke linje for deg.
 *
 * @returns {{stop:{id,name,lat,lon}, linjer:string[]}|null}
 */
export function stoppPåLinja(dom, nå, lang) {
  if (!dom || (dom.kind !== 'ombord' && dom.kind !== 'ombord-tvil')) return null;
  const neste = dom.kandidater.map(k => nesteStopp(k, nå));
  if (neste.length && neste.every(n => n) && neste.every(n => n.id === neste[0].id)) {
    return { stop: neste[0], linjer: [...new Set(dom.kandidater.map(k => k.linje))],
      k: dom.kandidater.length === 1 ? dom.kandidater[0] : null };
  }
  // TVIL OM NESTE STOPP: avgjøres av stoppene du alt har passert, når
  // akkurat én kandidat har flere enn de andre. Ellers velger ikke appen.
  if (dom.kind !== 'ombord-tvil' || !Array.isArray(lang) || !lang.length) return null;
  const poeng = dom.kandidater.map(k => passerteStopp(k, lang, nå));
  const best = Math.max(...poeng);
  if (best < PASSERT_MIN || poeng.filter(p => p === best).length !== 1) return null;
  const i = poeng.indexOf(best);
  return neste[i] ? { stop: neste[i], linjer: [dom.kandidater[i].linje], passert: best, k: dom.kandidater[i] } : null;
}

/**
 * Snittavstanden mellom sporet og turens forventede posisjon, i meter.
 * Lavere er tettere. Null uten noe å sammenligne.
 */
export function snittAvvik(k, spor) {
  // Samme mål som «følger» (avstandTilTur), så «følger tettest» er enig med det.
  const d = (spor || []).filter(f => f && Number.isFinite(f.lat) && Number.isFinite(f.at))
    .map(f => avstandTilTur(k, f)).filter(Number.isFinite);
  return d.length ? d.reduce((a, b) => a + b, 0) / d.length : null;
}

/** Under så mange meters forskjell i snittavvik er to kandidater like tette. */
export const TETT_LIKT_M = 30;

/**
 * ALLTID ET VALG. Bestilt: «Auto-reise må i større grad greie å velge mest
 * sannsynlige linje … uten at bruker har fortalt appen det. Ta et valg, men
 * la bruker korrigere.» Ved tvil ga `stoppPåLinja` null, og appen valgte
 * ingenting. Nå rangeres kandidatene, og den øverste velges:
 *   1. passerte stopp (det lange sporet), sterkest;
 *   2. hvor tett sporet følger turen, når forskjellen er over TETT_LIKT_M;
 *   3. vanen: linja du har reist med siste uke, og om turen skal innom et
 *      sted du ofte reiser til;
 *   4. tettest, når alt annet er likt.
 *
 * @param {Array} kandidater fra `ombord()`
 * @param {{spor?:Array, lang?:Array, nå:number, linjeBruk?:Map<string,number>, ofte?:Set<string>, stopKey?:Function}} o
 * @returns {Array<{k, passert:number, avvik:number|null, vane:number, grunn:string}>}
 */
export function rangerKandidater(kandidater, o) {
  const c = o || {};
  const nøkkel = c.stopKey || (x => String(x || '').toLowerCase());
  const rad = (kandidater || []).map(k => {
    const sj = k.call && k.call.serviceJourney;
    const framover = ((sj && sj.estimatedCalls) || []).filter(x => _ms(x) > c.nå);
    const motOfte = c.ofte && framover.some(x => x.quay && x.quay.stopPlace && c.ofte.has(nøkkel(x.quay.stopPlace.name))) ? 1 : 0;
    return { k, passert: Array.isArray(c.lang) ? passerteStopp(k, c.lang, c.nå) : 0,
      avvik: snittAvvik(k, c.spor),
      // Det du har SAGT (v1.218.19) går inn i samme felt, med dobbel vekt.
      sagt: (c.svar && c.svar.get(k.linje)) || 0,
      vane: ((c.linjeBruk && c.linjeBruk.get(k.linje)) || 0) + motOfte + SVAR_VEKT * ((c.svar && c.svar.get(k.linje)) || 0) };
  });
  const av = r => (r.avvik == null ? Infinity : r.avvik);
  rad.sort((a, b) => (b.passert - a.passert)
    || (Math.abs(av(a) - av(b)) > TETT_LIKT_M ? av(a) - av(b) : 0)
    || (b.vane - a.vane) || (av(a) - av(b)));
  rad.forEach((r, i) => {
    const neste = rad[i + 1];
    r.grunn = !neste ? 'eneste'
      : r.passert > neste.passert ? 'passerte stopp'
      : Math.abs(av(r) - av(neste)) > TETT_LIKT_M ? 'følger tettest'
      : r.vane > neste.vane ? (r.sagt > neste.sagt ? 'du har bekreftet denne før' : 'vanen din') : 'følger tettest';
  });
  return rad;
}

/** Hvor nær et stopp du må ha vært, og når, for at det teller som passert. */
export const PASSERT_M = 150;
export const PASSERT_MS = 3 * 60_000;
/** Minst så mange passerte stopp før de avgjør noe. Ett kan være tilfeldig. */
export const PASSERT_MIN = 2;

/**
 * Hvor mange av kandidatturens TIDLIGERE stopp (siste time) du var ved,
 * omtrent da turen var der.
 *
 * Bestilt: er det uklart om neste stopp er T-bane eller buss, er det trolig
 * det ene eller det andre ut fra hvilke stopp du alt har passert. En buss og
 * en T-bane kan gå side om side et stykke, men de har ikke stoppet på de
 * samme stedene til de samme tidene før det.
 */
export function passerteStopp(k, lang, nå) {
  const sj = k && k.call && k.call.serviceJourney;
  const alle = (sj && Array.isArray(sj.estimatedCalls)) ? sj.estimatedCalls : [];
  let n = 0;
  alle.forEach(c => {
    const t = _ms(c);
    if (!(t <= nå) || nå - t > 60 * 60_000) return;
    const q = c.quay || {}; const sp = q.stopPlace || {};
    const lat = Number.isFinite(q.latitude) ? q.latitude : sp.latitude;
    const lon = Number.isFinite(q.longitude) ? q.longitude : sp.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (lang.some(f => Math.abs(f.at - t) <= PASSERT_MS && metresBetween(f, { lat, lon }) <= PASSERT_M)) n++;
  });
  return n;
}

/* ── REISEN DU BLIR MED PÅ ──────────────────────────────────────────── */

const _tid = c => (c && (c.expectedDepartureTime || c.aimedDepartureTime
  || c.expectedArrivalTime || c.aimedArrivalTime)) || null;

/**
 * Formen `joinJourney(meta, toIdx)` tar, bygget av et kall fra tavla.
 *
 * STARTER VED STOPPET DU SIST PASSERTE. `joinJourney` setter reisen fra
 * `calls[0]`; bygget av hele turen ville du «gått på» ved endeholdeplassen
 * for en halvtime siden, og «fra Nydalen · avg 06:50» ville stått på en
 * skjerm du åpnet 07:00 på Sinsen.
 *
 * @returns {object|null}
 */
export function reiseMeta(call, nå) {
  const sj = call && call.serviceJourney;
  const alle = (sj && Array.isArray(sj.estimatedCalls)) ? sj.estimatedCalls : [];
  if (!alle.length) return null;
  const t = Number.isFinite(nå) ? nå : Date.now();
  const ms = c => { const v = _tid(c); const n = v ? new Date(v).getTime() : NaN; return n; };
  let fra = 0;
  alle.forEach((c, i) => { if (ms(c) <= t) fra = i; });
  const calls = alle.slice(fra).map(c => {
    const q = c.quay || {};
    const sp = q.stopPlace || {};
    return {
      name: sp.name || '',
      lat: Number.isFinite(q.latitude) ? q.latitude : (Number.isFinite(sp.latitude) ? sp.latitude : null),
      lon: Number.isFinite(q.longitude) ? q.longitude : (Number.isFinite(sp.longitude) ? sp.longitude : null),
      quay: q.publicCode || null,
      aimed: c.aimedDepartureTime || c.aimedArrivalTime || null,
      expected: c.expectedDepartureTime || c.expectedArrivalTime || null,
    };
  });
  const line = sj.line || {};
  const farge = line.presentation && line.presentation.colour;
  return {
    journeyId: sj.id || null,
    lineCode: line.publicCode || '?',
    lineBg: farge ? '#' + farge : '#7c2d12',
    mode: line.transportMode || 'bus',
    dest: (call.destinationDisplay && call.destinationDisplay.frontText) || '',
    calls,
  };
}
