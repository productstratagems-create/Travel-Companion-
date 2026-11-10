// Turopptak om bord: et ekte spor å rette linjegjenkjenningen etter.
// Rapportert: «Appen er ikke god nok til å forstå at bruker nå er på en bestemt rute eller linje,
// og er heller ikke god nok til å bestemme når en bruker har forlatt den linjen.»
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { saveConsent } from '../src/api/consent.js';
import { taOpp, turopptak, turJson, slettTur, glemTuropptak, spillAv, _nullstillTuropptak,
  MAKS_TURER, MAKS_BILDER, BEHOLD_MS, NY_TUR_MS, BILDE_MIN_MS } from '../src/api/turopptak.js';
import { oppdaterLås } from '../src/api/ombordLaas.js';

const T0 = new Date('2026-11-09T08:00:00+01:00').getTime();
// En tur langs en rett linje nordover: fire stopp, ett per 2 min, 1 km fra hverandre.
const kall = (id, linje, startMs) => ({
  serviceJourney: { id, line: { publicCode: linje }, estimatedCalls: [0, 1, 2, 3].map(i => ({
    aimedDepartureTime: new Date(startMs + i * 120_000).toISOString(), expectedDepartureTime: new Date(startMs + i * 120_000).toISOString(),
    aimedArrivalTime: new Date(startMs + i * 120_000).toISOString(), expectedArrivalTime: new Date(startMs + i * 120_000).toISOString(),
    quay: { latitude: 59.90 + i * 0.009, longitude: 10.75, stopPlace: { id: 'S' + i, name: 'Stopp ' + i } } })) },
  destinationDisplay: { frontText: 'Stopp 3' },
});
const k = (id, linje) => ({ nøkkel: id, linje, call: kall(id, linje, T0) });
const fiks = (t, lat) => ({ lat, lon: 10.75, acc: 10, at: t });

beforeEach(() => { localStorage.clear(); _nullstillTuropptak(); });

describe('opptak', () => {
  it('ingenting uten samtykke', () => {
    expect(taOpp({ nå: T0, fiks: fiks(T0, 59.9), dom: 'ombord', kandidater: [k('A', '74')] })).toBe(false);
    expect(turopptak(T0)).toEqual([]);
  });
  it('med samtykke: ett bilde, og ett til bare når noe endrer seg eller tiden har gått', () => {
    saveConsent(true);
    expect(taOpp({ nå: T0, fiks: fiks(T0, 59.9), dom: 'ombord', kandidater: [k('A', '74')] })).toBe(true);
    expect(taOpp({ nå: T0 + 1000, fiks: fiks(T0 + 1000, 59.9), dom: 'ombord', kandidater: [k('A', '74')] })).toBe(false);
    expect(taOpp({ nå: T0 + BILDE_MIN_MS, dom: 'ombord', kandidater: [k('A', '74')] })).toBe(true);
    expect(taOpp({ nå: T0 + BILDE_MIN_MS + 1, dom: 'ombord', kandidater: [k('A', '74')], hendelse: 'låst' })).toBe(true);
    const [tur] = turopptak(T0 + 10_000);
    expect(tur.bilder).toBe(3);
    expect(tur.linjer).toEqual(['74']);
    expect(tur.hendelser).toEqual(['låst']);
  });
  it(`ny tur etter ${NY_TUR_MS / 60000} min stille; høyst ${MAKS_TURER} turer`, () => {
    saveConsent(true);
    for (let i = 0; i <= MAKS_TURER; i++) taOpp({ nå: T0 + i * (NY_TUR_MS + 1), dom: 'ombord', kandidater: [k('A' + i, '74')] });
    expect(turopptak(T0 + MAKS_TURER * (NY_TUR_MS + 1)).length).toBe(MAKS_TURER);
  });
  it(`høyst ${MAKS_BILDER} bilder per tur`, () => {
    saveConsent(true);
    for (let i = 0; i < MAKS_BILDER + 5; i++) taOpp({ nå: T0 + i * BILDE_MIN_MS, dom: 'ombord', kandidater: [k('A', '74')] });
    expect(turopptak(T0 + MAKS_BILDER * BILDE_MIN_MS)[0].bilder).toBe(MAKS_BILDER);
  });
  it(`glemt etter ${BEHOLD_MS / 86400000} døgn`, () => {
    saveConsent(true);
    taOpp({ nå: T0, dom: 'ombord', kandidater: [k('A', '74')], hendelse: 'låst' });
    expect(turopptak(T0 + BEHOLD_MS + 1)).toEqual([]);
  });
  it('kopier gir gyldig JSON med kallene; slett og glem', () => {
    saveConsent(true);
    taOpp({ nå: T0, fiks: fiks(T0, 59.9), dom: 'ombord', kandidater: [k('A', '74')], hendelse: 'låst' });
    const id = turopptak(T0)[0].id;
    const j = JSON.parse(turJson(id));
    expect(j.versjon).toBe(1);
    expect(j.kall.A.call.serviceJourney.id).toBe('A');
    expect(j.bilder[0].p.slice(0, 2)).toEqual([59.9, 10.75]);
    slettTur(id);
    expect(turopptak(T0)).toEqual([]);
    taOpp({ nå: T0 + 1, dom: 'ombord', kandidater: [k('A', '74')], hendelse: 'låst' });
    glemTuropptak();
    expect(turopptak(T0)).toEqual([]);
  });
  it('følger profilen, slettes med alt og når samtykket slås av, og vises', () => {
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.turopptak',");
    const s = readFileSync('src/views/settings.js', 'utf8');
    expect(s).toContain('    glemTuropptak();\n    renderMemory();');
    expect(s).toContain('if (!cb.checked) glemTuropptak();');
    expect(readFileSync('index.html', 'utf8')).toContain('id="mem-turer"');
  });
  it('auto.js tar opp etter oppdaterLås, med traséen', () => {
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toMatch(/_lås = r\.lås;\n[\s\S]{0,700}taOpp\(\{ nå, fiks: siste, fart: fartNå\(nå\)/);
    expect(a).toContain('form: n => journeyShapeCached(n) });');
  });
});

describe('avspilling', () => {
  // Om bord på A i fart langs ruta, så av ved Stopp 1 og gå vekk i gangfart.
  function tur() {
    saveConsent(true);
    const bilder = [];
    for (let s = 0; s <= 120; s += 5) {        // i fart, på ruta
      const t = T0 + s * 1000;
      taOpp({ nå: t, fiks: fiks(t, 59.90 + 0.009 * s / 120), fart: 8, dom: 'ombord', kandidater: [k('A', '74')], vinner: k('A', '74'), vinnerKilde: 'sikker' });
    }
    // Sju minutter: med dagens terskler (150 m + 60 s, eller 3 min «stille») tar det
    // omtrent tre minutter før låsen slipper. Det er funnet i del 2, ikke her.
    for (let s = 125; s <= 540; s += 5) {      // gått av, 1,3 m/s østover, bort fra ruta
      const t = T0 + s * 1000;
      taOpp({ nå: t, fiks: { lat: 59.909, lon: 10.75 + (s - 120) * 1.3 / 56000, acc: 10, at: t }, fart: 1.3, dom: 'vet-ikke', kandidater: [] });
    }
    return JSON.parse(turJson(turopptak(T0 + 540_000)[0].id));
  }
  it('låser i fart på ruta, og slipper etter at du har gått av', () => {
    const ut = spillAv(tur());
    const h = ut.filter(x => x.hendelse);
    expect(h[0].hendelse).toBe('låst');
    const slipp = h.find(x => x.hendelse.startsWith('sluppet:'));
    expect(slipp).toBeTruthy();
    // DAGENS OPPFØRSEL, målt her (v1.218.20): gått av ved 125 s, sluppet på
    // «stille» ved 310 s — 3 min 5 s senere. Det er brukerens rapport om at appen
    // er treg til å forstå at du har forlatt linja; rettes i del 2, mot ekte spor.
    expect(slipp.hendelse).toBe('sluppet:stille');
    expect((slipp.t - T0) / 1000).toBe(310);
  });
  it('avspillingen bruker farten — i kjørefart slipper ikke låsen på avvik alene', () => {
    const t = tur();
    t.bilder.forEach(b => { b.v = 8; });
    const h = spillAv(t).filter(x => x.hendelse).map(x => x.hendelse);
    expect(h).not.toContain('sluppet:brudd');
  });
  it('spiller av med den ekte oppdaterLås som standard', () => {
    let kalt = 0;
    spillAv(tur(), { oppdaterLås: (l, o) => { kalt++; return oppdaterLås(l, o); } });
    expect(kalt).toBeGreaterThan(0);
  });
});
