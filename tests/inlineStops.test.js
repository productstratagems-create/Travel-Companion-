/**
 * Dine egne stopp — nå som en blokk øverst, ikke innrykket per rad.
 *
 * v1.143.0 snudde aksen: fire rader som alle nådde Jernbanetorget ble til én
 * overskrift med ankomsten på. Innrykkene er ikke slettet, de er foldet opp i
 * den — `stopShortcuts` bærer fortsatt nedtrekkslista, og `stopsAhead`
 * sammen med `catchable` er kjernen i `destinations`.
 *
 * Historien under står igjen fordi den forklarer hvorfor stoppene ble hentet
 * hit i det hele tatt.
 *
 * «Hvor skal du?» er elleve rader på Mortensrud. Trykker du på én, får du
 * stopplista for den linja — med «ofte brukt» øverst. Svaret du som regel
 * var ute etter lå altså bak et trykk, på en skjerm du måtte tilbake fra.
 *
 * Alt som trengtes fantes: `stopsAhead` ble ALLEREDE regnet ut per rad for
 * «mot sentrum»-grupperingen i v1.133.0, og kastet. `stopShortcuts` har
 * gjort utvelgelsen siden den ble skrevet.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { stopShortcuts, stopsAhead, arriveText, STOP_SHORTCUTS, INLINE_STOPS } from '../src/views/auto.js';

const src = () => fs.readFileSync('src/views/auto.js', 'utf8');
const css = () => fs.readFileSync('src/style/settings.css', 'utf8');
const stop = (name, mins) => ({ name, id: 'NSR:StopPlace:' + name, mins });
const used = (name, count) => ({ name, count, lastUsed: Date.now() });

describe('utvelgelsen', () => {
  const LINJE = [stop('Ryen', 3), stop('Manglerud', 6), stop('Brynseng', 9), stop('Tøyen', 14)];

  it('tar de mest brukte, mest brukt først', () => {
    const picks = stopShortcuts(LINJE, [used('Tøyen', 9), used('Ryen', 2)], INLINE_STOPS);
    expect(picks.map(i => LINJE[i].name)).toEqual(['Tøyen', 'Ryen']);
  });

  // The line's own order breaks a tie, so two equally used stops stay in the
  // order you would ride past them.
  it('linjas egen rekkefølge bryter likhet', () => {
    const picks = stopShortcuts(LINJE, [used('Tøyen', 4), used('Ryen', 4)], INLINE_STOPS);
    expect(picks.map(i => LINJE[i].name)).toEqual(['Ryen', 'Tøyen']);
  });

  // THE WHOLE POINT of the empty case: a reader who has not travelled sees
  // exactly today's screen, and it falls out without a branch anywhere.
  it('gir ingenting uten historikk', () => {
    expect(stopShortcuts(LINJE, [], INLINE_STOPS)).toEqual([]);
    expect(stopShortcuts(LINJE, [used('Et helt annet sted', 12)], INLINE_STOPS)).toEqual([]);
  });

  it('holder seg under taket uansett hvor mange treff', () => {
    const alle = LINJE.map((s, i) => used(s.name, 10 - i));
    expect(stopShortcuts(LINJE, alle, INLINE_STOPS).length).toBe(INLINE_STOPS);
  });

  // A different choice for a different reason, which is why it is its own
  // constant: in the drill-down the shortcuts are the only thing on screen.
  it('viser færre her enn i nedtrekket', () => {
    expect(INLINE_STOPS).toBeLessThan(STOP_SHORTCUTS);
  });
});

describe('hvordan skjermen bruker dem nå', () => {
  // v1.105.0 finnes fordi noe var globalt. Blokka arver garantien: hvert
  // alternativ bærer sin EGEN rad, og ankomsten er den radens egen.
  it('tar alternativene fra radenes egne stopp', () => {
    const s = src();
    expect(s).toMatch(/const dests = destinations\(live, freq, walkMins, now, _stop && _stop\.name\)/);
    expect(s).toMatch(/prev\.options\.push\(\{ i, d, call: ride\.call/);
  });

  // The screen redraws every second. Reading and re-indexing the history per
  // row would be eleven times the work for one answer.
  it('leser historikken én gang per tegning', () => {
    const s = src();
    const body = s.slice(s.indexOf('const here = (_stop && _stop.lat'), s.indexOf('// PARTITIONED'));
    expect(body).toMatch(/const freq = loadFreq\('arr'\);/);
    const loop = s.slice(s.indexOf('for (const { d, i } of live) {'), s.indexOf('// WHERE YOU ARE GOING'));
    expect(loop).not.toMatch(/loadFreq/);
  });

  // stopsAhead ble alt regnet ut her for grupperingen; gjenbruken er det som
  // gjør dette nesten gratis.
  it('regner stoppene per rad bare én gang', () => {
    const loop = src().slice(src().indexOf('const side = new Map();'),
      src().indexOf('// WHERE YOU ARE GOING'));
    expect((loop.match(/stopsAhead\(/g) || []).length).toBe(1);
  });

  // Én vei videre for alle tre inngangene: blokka, nedtrekket og «ofte brukt».
  it('bruker samme vei videre som stoppet i nedtrekket', () => {
    const s = src();
    const handler = s.slice(s.indexOf("body.querySelectorAll('.auto-dest')"));
    expect(handler.slice(0, 500)).toMatch(/autoRoute\(_stop, \{ name: x\.name, id: x\.id \}\)/);
    expect(handler.slice(0, 500)).toMatch(/_useRouteDir/);
  });

  // Uten historikk finnes ingen destinasjon, og da tegnes ingen overskrift
  // heller — skjermen er nøyaktig dagens.
  it('tegner ingen blokk uten destinasjoner', () => {
    expect(src()).toMatch(/dests\.length\s*\n?\s*\? '<div class="set-label">dit du skal<\/div>'/);
  });
});

/**
 * «Det innrykkede stoppet må være like klikkbart som linjen det tilhører.»
 *
 * Kravet flytter med til blokka: målt på innrykket var det 29 px mot radens
 * 54, altså under de 44 px en trykkflate skal ha. Overskriften i blokka er
 * det viktigste trykket på hele skjermen og må ikke være dårligere.
 */
describe('trykkflaten', () => {
  const rule = () => {
    const c = css();
    const i = c.indexOf('#v-auto .auto-dest{');
    expect(i).toBeGreaterThan(-1);
    // Kommentarene her nevner både «padding» og tallet de forklarer; det er
    // erklæringene som gjelder.
    return c.slice(i, c.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
  };

  // The geometry is the row's own: same padding, same font, same box.
  // Anything the block sets for itself is a second copy that can drift.
  it('bærer .nearby-btn, som radene under', () => {
    expect(src()).toMatch(/class="nearby-btn auto-dest"/);
  });

  it('har et gulv på 44 px', () => {
    expect(rule()).toMatch(/min-height:\s*44px/);
  });

  // `#v-auto .nearby-btn{width:100%}` er en id-selektor. En bar klasse taper
  // for den uansett hvor i fila den står, og den tapte stille: knappen hang
  // 26 px utenfor radens høyrekant.
  it('er scopet til #v-auto, som regelen den må slå', () => {
    expect(css()).toMatch(/#v-auto \.auto-dest\{/);
    expect(css()).not.toMatch(/(^|[^ ])\n\.auto-dest\{/);
  });

  // Overskriften har to linjer og må få lov til å være høyere enn en rad —
  // men aldri lavere, som innrykket var.
  it('setter ikke et tak som kan ta den under gulvet', () => {
    expect(rule()).not.toMatch(/max-height/);
  });
});

/**
 * «Hva betyr tidsangivelsen på det innrykkede stoppet?»
 *
 * Raden talte ned til AVGANGEN («12 min»), stoppet under den til ANKOMSTEN
 * («26 min»). To ulike hendelser i samme form, rett over hverandre, uten at
 * noe sa hvilken som var hvilken. Klokkeslettet er en annen slags ting å se
 * på enn en nedtelling, og ett ord bærer resten.
 */
describe('hva tallet betyr', () => {
  const at = new Date(2026, 0, 5, 7, 42).getTime();

  it('sier ankomsten som klokkeslett, med ett ord foran', () => {
    expect(arriveText({ name: 'Oslo S', at })).toBe('framme 07:42');
  });

  it('sier ingenting når ankomsten ikke er kjent', () => {
    expect(arriveText({ name: 'Oslo S', at: null })).toBe('');
    expect(arriveText(null)).toBe('');
  });

  // Nedtelling og klokke må komme fra samme tidspunkt, ellers er de to
  // uavhengige påstander om samme ankomst.
  it('henter klokka og nedtellingen fra samme tidspunkt', () => {
    const now = at - 26 * 60000;
    const call = { serviceJourney: { estimatedCalls: [
      { quay: { stopPlace: { name: 'Hauketo', id: 'A' } }, expectedArrivalTime: new Date(now).toISOString() },
      { quay: { stopPlace: { name: 'Oslo S', id: 'B' } }, expectedArrivalTime: new Date(at).toISOString() },
    ] } };
    const [s] = stopsAhead(call, 'Hauketo', now);
    expect(s.at).toBe(at);
    expect(s.mins).toBe(26);
    expect(arriveText(s)).toBe('framme 07:42');
  });

  // Nedtrekkslista og kartets tooltip sier det samme. Det innrykkede stoppet
  // var det tredje stedet; blokka erstattet det, og den sier ankomsten på sin
  // egen måte — «framme 20:13» i sitt eget spann. Fortsatt ett uttrykk per
  // sted, ingen håndskrevne kopier.
  it('sier det på samme måte begge stedene som bruker arriveText', () => {
    const s = src();
    expect(s).toMatch(/class="nearby-dist">' \+ \(ride \? arriveText\(s\) : ''\)/);
    expect(s).toMatch(/bindTooltip\(st\.name \+ \(arriveText\(st\)/);
    expect(s).not.toMatch(/st\.mins \+ ' min'/);
    expect(s).not.toMatch(/s\.mins \+ ' min'/);
  });

  // Og blokka bruker clk() på det samme feltet, ikke en egen formatering.
  it('lar blokka lese ankomsten fra det samme feltet', () => {
    expect(src()).toMatch(/'framme ' \+ clk\(o\.at\)/);
  });

  // Den som ikke ser skjermen skal høre hele svaret, ikke bare et stedsnavn.
  it('tar hele svaret med i den opplesbare merkelappen', () => {
    const s = src();
    expect(s).toMatch(/'reis til ' \+ x\.name \+ ', framme ' \+ clk\(o\.at\) \+ ', ' \+ how/);
  });
});
