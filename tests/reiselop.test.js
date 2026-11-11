/**
 * Reiseløpet på avgangsdetaljene — en tabell du kan handle på.
 *
 * Rapportert med skjermbilde, Mortensrud → Torshov (buss 74, gange, trikk 18,
 * gange): «verken tabellen eller kartet er særlig intuitive eller
 * hjelpsomme». Tabellen sa:
 *
 *     74  mortensrud      22:49        ← små bokstaver, ingen plattform
 *         jernbanetorget  23:24
 *         GÅ · 2 MIN                   ← gangen én gang …
 *     GÅ  jernbanetorget  23:24        ← … og én gang til, og 1 min her
 *         jernbanetorget  23:25        ← fra X til X: hvor skal jeg?
 *     18  jernbanetorget  23:32
 *         spor E · retning storo-grefsen st.
 *         torshov         23:44
 *     GÅ  torshov         23:44
 *         destination     23:46        ← Journey Planners plassholder
 *
 * Og ingenting sa om åtte minutter var god tid til byttet.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

import { reiselop, bytteDom } from '../src/ui/reiselop.js';

const T0 = Date.UTC(2026, 10, 3, 21, 49, 0);
const iso = m => new Date(T0 + m * 60000).toISOString();
const klk = s => { const d = new Date(s);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };

const kall = (navn, m, id) => ({ quay: { stopPlace: { id: id || 'NSR:StopPlace:' + navn, name: navn } },
  aimedDepartureTime: iso(m), expectedDepartureTime: iso(m), aimedArrivalTime: iso(m), expectedArrivalTime: iso(m) });

const BUSS = {
  mode: 'bus', fromPlace: { name: 'Mortensrud', latitude: 59.85, longitude: 10.83 },
  toPlace: { name: 'Jernbanetorget', latitude: 59.9116, longitude: 10.750 },
  serviceJourney: { id: 'SJ74', line: { publicCode: '74', presentation: { colour: 'e60000' } },
    estimatedCalls: [kall('Mortensrud', 0), kall('Bøler', 6), kall('Helsfyr', 18),
      kall('Grønland', 31), kall('Jernbanetorget', 35), kall('Vika', 40)] },
  fromEstimatedCall: { expectedDepartureTime: iso(0), aimedDepartureTime: iso(0),
    quay: { publicCode: 'B' }, destinationDisplay: { frontText: 'Jernbanetorget' } },
  toEstimatedCall: { expectedArrivalTime: iso(35), aimedArrivalTime: iso(35), quay: { publicCode: 'A' } },
};
const GÅ_BYTTE = {
  mode: 'foot', fromPlace: { name: 'Jernbanetorget' }, toPlace: { name: 'Jernbanetorget' },
  expectedStartTime: iso(35), expectedEndTime: iso(37),
  _shape: [[59.9116, 10.7500], [59.9119, 10.7509], [59.9123, 10.7518]],
};
const TRIKK = {
  mode: 'tram', fromPlace: { name: 'Jernbanetorget', latitude: 59.9123, longitude: 10.7518 },
  toPlace: { name: 'Torshov', latitude: 59.935, longitude: 10.765 },
  serviceJourney: { id: 'SJ18', line: { publicCode: '18', presentation: { colour: '0b91ef' } },
    estimatedCalls: [kall('Jernbanetorget', 43), kall('Schous plass', 50), kall('Torshov', 55)] },
  fromEstimatedCall: { expectedDepartureTime: iso(43), aimedDepartureTime: iso(43),
    quay: { publicCode: 'E' }, destinationDisplay: { frontText: 'Storo-Grefsen st.' } },
  toEstimatedCall: { expectedArrivalTime: iso(55), aimedArrivalTime: iso(55), quay: { publicCode: 'B' } },
};
const GÅ_MÅL = {
  mode: 'foot', fromPlace: { name: 'Torshov' }, toPlace: { name: 'Destination' },
  expectedStartTime: iso(55), expectedEndTime: iso(57),
};
const ALLE = [BUSS, GÅ_BYTTE, TRIKK, GÅ_MÅL];
const lag = (o = {}) => reiselop(ALLE, { fra: 'Mortensrud', til: 'Torshovgata 5', clk: klk,
  ekstraMin: 0, ...o });
const tekst = h => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('navn', () => {
  it('skriver aldri Journey Planners «Destination»', () => {
    expect(tekst(lag())).not.toMatch(/destination/i);
  });
  it('men reisens eget mål', () => {
    expect(tekst(lag())).toMatch(/Gå 2 min til Torshovgata 5/);
  });
  it('og stoppnavn med store bokstaver', () => {
    const t = tekst(lag());
    expect(t).toMatch(/Mortensrud/);
    expect(t).toMatch(/Torshov/);
    expect(t).not.toMatch(/\bmortensrud\b|\bjernbanetorget\b|\btorshov\b/);
  });
  it('og retningen likeså', () => {
    expect(tekst(lag())).toMatch(/mot Storo-Grefsen st\./);
  });
});

describe('plattform', () => {
  it('på hver etappe, også den første', () => {
    expect(tekst(lag())).toMatch(/Mortensrud · plattform B/);
  });
  it('og der du kommer fram', () => {
    expect(tekst(lag())).toMatch(/ank\. plattform A/);
  });
});

describe('byttet', () => {
  it('er én rad, ikke en skillelinje og en gangrad', () => {
    const h = lag();
    expect((h.match(/rl-bytte/g) || []).length).toBe(1);
    expect(tekst(h)).not.toMatch(/Jernbanetorget\s+Jernbanetorget/);
  });
  it('sier ventetiden, gangen og plattformen du skal TIL', () => {
    expect(tekst(lag())).toMatch(/Bytte på Jernbanetorget · 8 min · gå 2 min/);
    expect(tekst(lag())).toMatch(/til plattform E/);
  });
  it('og omtrent hvor langt det er å gå', () => {
    expect(tekst(lag())).toMatch(/ca \d+ m/);
  });
  /* DOMMEN. Samme regel som underveis (`transferMargin`, med gange). */
  /* 8 min mellom tidene, 2 min gange under 3 minutters plattformgulv:
   * 5 min slakk. Underveis-banneret kaller det stramt (`reachCls` r-soon),
   * og avgangsdetaljene skal si det samme om samme bytte. Første utgave av
   * denne testen ventet «god tid» — testen tok feil, ikke regelen. */
  it('og om det er stramt, som underveis ville sagt', () => {
    expect(tekst(lag())).toMatch(/— stramt/);
  });

  it('og god tid når det er det', () => {
    const SEINT = { ...TRIKK, fromEstimatedCall: { ...TRIKK.fromEstimatedCall,
      expectedDepartureTime: iso(50), aimedDepartureTime: iso(50) } };
    expect(tekst(reiselop([BUSS, GÅ_BYTTE, SEINT, GÅ_MÅL], { til: 'X', clk: klk })))
      .toMatch(/— god tid/);
  });
  /* GANGEN TELLER NÅR DEN ER LENGRE ENN GULVET. 10 min mellom tidene, 8 min
   * å gå: 2 min slakk — stramt. Uten gangen ville gulvet på 3 min gitt 7 —
   * god tid. Fiksturen over har 2 min gange, under gulvet, og kunne derfor
   * ikke se om gangen ble regnet med: en mutant som droppet den overlevde. */
  it('og regner med gangen når den er lengre enn plattformbyttet', () => {
    const LANG_GANG = { ...GÅ_BYTTE, expectedStartTime: iso(35), expectedEndTime: iso(43) };
    const T2 = { ...TRIKK, fromEstimatedCall: { ...TRIKK.fromEstimatedCall,
      expectedDepartureTime: iso(45), aimedDepartureTime: iso(45) } };
    expect(tekst(reiselop([BUSS, LANG_GANG, T2, GÅ_MÅL], { til: 'X', clk: klk, ekstraMin: 0 })))
      .toMatch(/— stramt/);
  });

  it('eller om du ikke rekker det', () => {
    expect(tekst(lag({ ekstraMin: 10 }))).toMatch(/rekker du ikke/);
  });
  it('og trinnfri adkomst når den er kjent', () => {
    expect(tekst(lag({ tilgang: () => 'trinnfri' }))).toMatch(/trinnfri/);
    expect(tekst(lag({ tilgang: () => null }))).not.toMatch(/trinnfri/);
  });
});

describe('etappen', () => {
  it('teller stoppene du kjører', () => {
    expect(tekst(lag())).toMatch(/4 stopp/);
  });
  it('og har linjas farge', () => {
    expect(lag()).toMatch(/#e60000/);
  });
});

describe('bytteDom', () => {
  it('følger samme bøtter som underveis', () => {
    expect(bytteDom(20)).toBe('god tid');
    expect(bytteDom(6)).toBe('god tid');
    expect(bytteDom(3)).toBe('stramt');
    expect(bytteDom(0)).toBe('stramt');
    expect(bytteDom(-1)).toBe('rekker du ikke');
  });
});

describe('kallestedet', () => {
  const src = () => require('node:fs').readFileSync('src/views/selected.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  it('avgangsdetaljene bruker reiseløpet', () => {
    expect(src()).toMatch(/reiselop\(/);
    expect(src()).not.toMatch(/itin-xfer/);
  });
});

/* Resten av skjermen sa det samme med små bokstaver: «mortensrud → ljan
 * stasjon» rett over tabellen. Sett i nettleserprøven. */
describe('resten av avgangsdetaljene', () => {
  it('senker ikke stoppnavn', () => {
    const s = require('node:fs').readFileSync('src/views/selected.js', 'utf8');
    expect(s).not.toMatch(/dir\.(from|to)\)?\.toLowerCase\(\)/);
    expect(s).not.toMatch(/cleanName\(dir\.(from|to)\)\.toLowerCase\(\)/);
  });
});

/* ── KARTET (v1.209.0) ──────────────────────────────────────────────────
 *
 * Kartet hadde navn bare på første og siste stopp. Byttepunktet var en prikk
 * uten ord, uten linje og uten plattform. Gangen mellom etappene ble bare
 * tegnet når målet var et sted og ikke et stopp. Og tabellen og kartet var
 * ikke koblet: et trykk på byttet gjorde ingenting.
 */
import { kartPunkter, kartUtsnitt } from '../src/ui/reiselop.js';

describe('punktene på kartet', () => {
  const p = () => kartPunkter(ALLE);
  it('sier på, bytt og av — med linje og plattform', () => {
    expect(p().map(x => x.kind)).toEqual(['på', 'av', 'bytt', 'av']);
    expect(p()[0]).toMatchObject({ linje: '74', tekst: 'plattform B' });
    expect(p()[2]).toMatchObject({ linje: '18', tekst: 'plattform E' });
    expect(p()[3].tekst).toBe('Torshov');
  });
  /* Begge ender av byttet: der bussen setter deg av, og der trikken går. */
  it('og der du går av midt i reisen, med linja og plattformen', () => {
    expect(p()[1]).toMatchObject({ kind: 'av', linje: '74', tekst: 'plattform A' });
  });
  it('og står på kvaiens koordinater, ikke stoppets', () => {
    expect(p()[2]).toMatchObject({ lat: 59.9123, lon: 10.7518 });
  });
});

describe('utsnittene', () => {
  const u = () => kartUtsnitt(ALLE);
  it('ett per etappe og ett per bytte, i tabellens rekkefølge', () => {
    expect(u().e).toHaveLength(2);
    expect(u().b).toHaveLength(1);
  });
  /* Byttet er avstigningen, gangen og påstigningen — det du skal finne fram i. */
  it('og byttet rammer inn gangen mellom de to', () => {
    const b = u().b[0];
    expect(b).toContainEqual([59.9116, 10.750]);
    expect(b).toContainEqual([59.9119, 10.7509]);
    expect(b).toContainEqual([59.9123, 10.7518]);
  });
  it('og hele reisen er alt', () => {
    expect(u().alt.length).toBeGreaterThanOrEqual(4);
  });
});

describe('radene peker på kartet', () => {
  it('etapper og bytter bærer en nøkkel kartet forstår', () => {
    const h = lag();
    expect(h).toMatch(/data-rl="e0"/);
    expect(h).toMatch(/data-rl="e1"/);
    expect(h).toMatch(/data-rl="b0"/);
  });
});

describe('kartet på avgangsdetaljene', () => {
  const src = () => require('node:fs').readFileSync('src/views/selected.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  /* All gange, ikke bare når målet er et sted. */
  it('tegner gangen mellom etappene uansett mål', () => {
    const s = src();
    const i = s.indexOf('if (destIsVenue) {', s.indexOf('function _renderSelMap'));
    const venue = s.slice(i, s.indexOf('\n  }\n', i));
    expect(venue).not.toMatch(/feet\.forEach/);
    // Og listen er ALL gange, ikke filtrert på sted. Første utgave så bare
    // hvor løkka stod; en mutant som filtrerte på `destIsVenue` overlevde.
    expect(s).toMatch(/const feet = \(dep\._allLegs \|\| \[\]\)\.filter\(l => l\.mode === 'foot'\);/);
    expect(s).toMatch(/kartPunkter\(/);
  });
  it('og et trykk på en rad zoomer kartet dit', () => {
    expect(src()).toMatch(/closest\('\[data-rl\]'\)/);
    expect(src()).toMatch(/_selMap\.fitBounds\(geo/);
  });
});

/* HVERT SPOR ETT STED. Rapportert: «spor 1» ved linjenavnet, i kartetiketten
 * og under tiden, og «spor 2» uten å si hvilket stopp det gjaldt. Uten
 * bytte står plattformen under avgangs- og ankomsttiden, og kartet sier
 * stoppnavnet. */
describe('punktene uten bytte', () => {
  const p = () => kartPunkter([BUSS]);
  it('sier stoppnavnet der du går på, ikke plattformen', () => {
    expect(p()[0]).toMatchObject({ kind: 'på', linje: '74', tekst: 'Mortensrud' });
  });
  it('og der du går av', () => {
    expect(p()[1]).toMatchObject({ kind: 'av', tekst: 'Jernbanetorget' });
  });
  it('mens en reise med bytte fortsatt sier plattformen', () => {
    expect(kartPunkter(ALLE)[0].tekst).toBe('plattform B');
  });
});

import { readFileSync } from 'node:fs';
describe('avgangsdetaljene: sporet under tiden', () => {
  const s = readFileSync('src/views/selected.js', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const chip = s.slice(s.indexOf('<div class="train-chip">'), s.indexOf('<div id="s-live-status">'));
  it('står ikke ved linjenavnet', () => {
    expect(chip).not.toMatch(/spor|quay|plattformTekst/);
  });
  it('avgangssporet står under avgår-tiden', () => {
    const avg = s.slice(s.indexOf("'<div class=\"jd-label\">avgår "), s.indexOf("'<div class=\"jd-label\">ankommer "));
    expect(avg).toContain('plattformTekst(quay, depMode(c))');
  });
  it('ankomstsporet under ankommer-tiden, med ordet som passer transportmiddelet', () => {
    const ank = s.slice(s.indexOf("'<div class=\"jd-label\">ankommer "), s.indexOf("'<div class=\"jd-label\">ankommer ") + 500);
    expect(ank).toContain('plattformTekst(c._arrQuay, depMode(c))');
    expect(ank).not.toMatch(/'spor '/);
  });
});

// v1.218.43 — «putte inn neste avgang … slik at bruker kan vurdere om det er verdt å ta sjansen».
import { velgNeste } from '../src/views/selected.js';
describe('neste avgang etter et bytte', () => {
  it('står ved etappen etter byttet, med anslått ankomst og ekstra tid', () => {
    const spurt = [];
    const h = tekst(lag({ neste: e => { spurt.push(e); return { dep: T0 + 58 * 60000, ankCa: T0 + 70 * 60000 }; } }));
    expect(h).toMatch(/22:47 neste → framme ca\. 22:59 · \+15 min/);
    // Bare etappe 2 (trikken) spørres — første etappe har «forrige / neste» selv.
    expect(spurt.map(e => e.kode)).toEqual(['18']);
    expect(spurt[0]).toMatchObject({ stopId: 'NSR:StopPlace:Jernbanetorget', front: 'Storo-Grefsen st.', dep: T0 + 43 * 60000, arr: T0 + 55 * 60000 });
  });
  it('ingen ny avgang: sier det i varselfarge', () => {
    expect(lag({ neste: () => ({ ingen: true }) })).toContain('rl-neste-ingen');
    expect(tekst(lag({ neste: () => ({ ingen: true }) }))).toMatch(/ingen ny avgang innen 2 t/);
  });
  it('ikke svar ennå: ingenting', () => {
    expect(lag({ neste: () => null })).not.toContain('rl-neste');
  });
  it('velgNeste: samme linje og retning, etter avgangen, kjøretiden lagt til', () => {
    const e = { lineId: 'L18', kode: '18', front: 'Storo-Grefsen st.', dep: 1000_000, arr: 1000_000 + 12 * 60000 };
    const d = (ms, id = 'L18', dest = 'Storo-Grefsen st.', cancelled = false) => ({ ln: { id, publicCode: '18' }, dest, depTs: ms, cancelled });
    expect(velgNeste([d(1000_000), d(1600_000, 'L18', 'Ljabru'), d(1900_000, 'L18', 'Storo-Grefsen st.', true), d(2200_000), d(2500_000)], e))
      .toEqual({ dep: 2200_000, ankCa: 2200_000 + 12 * 60000 });
    expect(velgNeste([d(1600_000, 'L17')], e)).toEqual({ ingen: true });
  });
});
