/**
 * Dine egne stopp, innrykket under linja.
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

describe('hvordan skjermen bruker den', () => {
  // v1.105.0 exists because something was global. A shortcut under «mot
  // Kolsås» that belongs to «mot Ski» is the same fault, and taking the
  // stops from the row's own list is what makes it impossible.
  it('tar stoppene fra radens egen liste', () => {
    const s = src();
    const loop = s.slice(s.indexOf('const side = new Map();'), s.indexOf('// PARTITIONED'));
    expect(loop).toMatch(/const stops = stopsAhead\(d\.call/);
    expect(loop).toMatch(/ahead\.set\(i, stops\)/);
    expect(loop).toMatch(/pick\.set\(i, stopShortcuts\(stops, freq, INLINE_STOPS\)\)/);
  });

  // AND THE RENDER MUST READ THE SAME ROW. The case above only proved the
  // maps were FILLED per row; a mutant that drew every row's shortcuts from
  // ahead.get(0) — every line offering the first line's stops — passed it.
  // Filling per row and reading per row are two facts, and only the second
  // one is the relevance guarantee.
  it('og tegner dem fra samme rad', () => {
    const s = src();
    const render = s.slice(s.indexOf("+ (pick.get(i) || []).map"), s.indexOf("}).join('');"));
    expect(render).toMatch(/ahead\.get\(i\)/);
    expect(render).not.toMatch(/ahead\.get\((?!i\))/);
    expect(s).toMatch(/\(pick\.get\(i\) \|\| \[\]\)\.map/);
  });

  // The screen redraws every second. Eleven rows each reading and
  // re-indexing the history would be eleven times the work for one answer.
  it('leser historikken én gang per tegning, ikke per rad', () => {
    const s = src();
    const body = s.slice(s.indexOf('const here = (_stop && _stop.lat'), s.indexOf('// PARTITIONED'));
    expect(body).toMatch(/const freq = loadFreq\('arr'\);/);
    const loop = s.slice(s.indexOf('for (const { d, i } of live) {'), s.indexOf('// PARTITIONED'));
    expect(loop).not.toMatch(/loadFreq/);
  });

  // stopsAhead was already computed here and discarded — reusing it is what
  // makes this release nearly free.
  it('gjenbruker stoppene grupperingen alt regnet ut', () => {
    const loop = src().slice(src().indexOf('const side = new Map();'), src().indexOf('// PARTITIONED'));
    expect((loop.match(/stopsAhead\(/g) || []).length).toBe(1);
  });

  // The same door the drill-down's stop goes through, so the two cannot
  // drift apart.
  it('bruker samme vei videre som stoppet i nedtrekket', () => {
    const s = src();
    const handler = s.slice(s.indexOf("body.querySelectorAll('.auto-inline-stop')"));
    expect(handler.slice(0, 600)).toMatch(/autoRoute\(_stop, st\)/);
    expect(handler.slice(0, 600)).toMatch(/_useRouteDir/);
    // And it must not also open the direction it sits under.
    expect(handler.slice(0, 600)).toMatch(/stopPropagation/);
  });

  it('tegner ingen knapp for et stopp som ikke finnes', () => {
    expect(src()).toMatch(/if \(!st\) return '';/);
  });
});

/**
 * «Det innrykkede stoppet må være like klikkbart som linjen det tilhører.»
 *
 * Målt før rettelsen: rad 54x382 px, stopp 29x356 px — under halve radens
 * høyde og under de 44 px en trykkflate skal ha. Etter: 44x356, og 0 px
 * utenfor radens høyrekant.
 */
describe('trykkflaten', () => {
  const rule = () => {
    const c = css();
    const i = c.indexOf('#v-auto .auto-inline-stop{');
    expect(i).toBeGreaterThan(-1);
    // Kommentarene her nevner både «padding» og tallet de forklarer; det er
    // erklæringene som gjelder.
    return c.slice(i, c.indexOf('}', i)).replace(/\/\*[\s\S]*?\*\//g, '');
  };

  // The geometry is the row's own: same padding, same font, same box.
  // Anything the stop set for itself is a second copy that can drift.
  it('bærer .nearby-btn, som raden selv', () => {
    expect(src()).toMatch(/class="nearby-btn auto-inline-stop"/);
  });

  it('har et gulv på 44 px', () => {
    expect(rule()).toMatch(/min-height:\s*44px/);
  });

  // `#v-auto .nearby-btn{width:100%}` is an id selector. A bare class loses
  // to it wherever it sits in the file, and it lost silently: the button hung
  // 26 px past the row's right edge.
  it('er scopet til #v-auto, som regelen den må slå', () => {
    expect(css()).toMatch(/#v-auto \.auto-inline-stop\{/);
    expect(css()).not.toMatch(/(^|[^ ])\n\.auto-inline-stop\{/);
  });

  // Innrykk og bredde er ett tall, ikke to som må være enige.
  it('trekker innrykket fra bredden, fra ett navn', () => {
    const r = rule();
    expect(r).toMatch(/--ais-indent:\s*[\d.]+rem/);
    expect(r).toMatch(/width:calc\(100% - var\(--ais-indent\)\)/);
    expect(r).toMatch(/margin-left:var\(--ais-indent\)/);
    // Og ingen håndskrevet kopi av tallet ved siden av.
    const indent = r.match(/--ais-indent:\s*([\d.]+rem)/)[1];
    expect(r.split(indent).length - 1).toBe(1);
  });

  // .nearby-btn brings its own padding; the stop must not undo it and
  // shrink back under the floor.
  it('setter ikke sin egen padding', () => {
    expect(rule()).not.toMatch(/padding/);
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

  // Den innrykkede raden, nedtrekkslista og kartets tooltip sier det samme.
  // Tre håndskrevne kopier er nettopp feilformen denne kodebasen gjentar.
  it('sier det på samme måte alle tre stedene', () => {
    const s = src();
    expect((s.match(/arriveText\(/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(s).toMatch(/class="ais-mins">' \+ arriveText\(st\)/);
    expect(s).toMatch(/class="nearby-dist">' \+ arriveText\(s\)/);
    expect(s).toMatch(/bindTooltip\(st\.name \+ \(arriveText\(st\)/);
    // og ingen som fortsatt skriver ut minuttene for et stopp framover
    expect(s).not.toMatch(/st\.mins \+ ' min'/);
    expect(s).not.toMatch(/s\.mins \+ ' min'/);
  });

  // Den som ikke ser høyrekolonnen hører ellers bare et stoppnavn.
  it('tar klokka med i den opplesbare merkelappen', () => {
    const s = src();
    // Bare selve attributt-uttrykket: et vindu på 260 tegn nådde ned i
    // .ais-mins-spannet under, og besto da merkelappen var tom.
    const from = s.indexOf("aria-label=\"' + esc('mot ' + d.frontText");
    const label = s.slice(from, s.indexOf("'\">'", from));
    expect(label).toMatch(/arriveText\(st\)/);
  });
});
