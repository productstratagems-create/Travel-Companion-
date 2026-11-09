// «På T-banelinje 3 begynner appen å tro at bruker plutselig er på tilstøtende busslinjer.»
// Ekte trasé (Entur, 2026-11-09): 131 av 595 punkter på linje 3 ligger >150 m fra de rette
// strekene mellom stasjonene, mest ved Brynseng (300 m). Avviket ble målt mot rette streker,
// så en reisende PÅ T-banen så ut til å være «utenfor ruta» — og et gjett kunne byttes til en buss.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { oppdaterLås, sisteAvviksrekke, avstandTilRute } from '../src/api/ombordLaas.js';
import { kandidatAv } from '../src/api/kandidat.js';
import { OMBORD_MAKS_AVVIK_M } from '../src/api/ombord.js';

const F = JSON.parse(readFileSync('tests/fixtures/t3-trase.json', 'utf8'));
const T0 = new Date('2026-11-09T08:00:00+01:00').getTime();
const kall = (id, linje, stopp, startMs, stegMs) => ({ serviceJourney: { id, line: { publicCode: linje },
  estimatedCalls: stopp.map((s, i) => ({ aimedDepartureTime: new Date(startMs + i * stegMs).toISOString(),
    expectedDepartureTime: new Date(startMs + i * stegMs).toISOString(),
    aimedArrivalTime: new Date(startMs + i * stegMs).toISOString(), expectedArrivalTime: new Date(startMs + i * stegMs).toISOString(),
    quay: { latitude: s.lat, longitude: s.lon, stopPlace: { id: 'S' + i, name: s.navn, latitude: s.lat, longitude: s.lon } } })) } });

// Punktene på den EKTE traséen som ligger lengst fra de rette strekene.
const stoppPkt = F.stopp.map(s => ({ lat: s.lat, lon: s.lon }));
const verst = F.form.map(([lat, lon]) => ({ lat, lon, d: avstandTilRute(stoppPkt, { lat, lon }) }))
  .sort((a, b) => b.d - a.d).slice(0, 4);

describe('T-bane 3 ved Brynseng', () => {
  it('fiksturen viser problemet: ekte trasé mer enn 150 m fra de rette strekene', () => {
    expect(verst[0].d).toBeGreaterThan(OMBORD_MAKS_AVVIK_M + 100);
  });
  const metro = (spor, form) => kandidatAv(kall('T3', '3', F.stopp, T0, 120_000), spor, form);
  const buss = kandidatAv(kall('B76', '76', F.stopp.slice(5, 9), T0 + 800_000, 120_000), [], null);
  const spor = verst.map((p, i) => ({ lat: p.lat, lon: p.lon, acc: 10, at: T0 + 900_000 + i * 20_000 }));
  const nå = spor[spor.length - 1].at;

  it('med traséen: du er PÅ ruta, ikke utenfor', () => {
    expect(sisteAvviksrekke(metro(spor, F.form), spor)).toEqual([]);
  });
  it('et gjett på T-banen byttes ikke til en buss mens du følger T-banens trasé', () => {
    const lås = { k: metro(spor, F.form), kilde: 'gjettet', stilleFra: null };
    const r = oppdaterLås(lås, { låstK: metro(spor, F.form), vinner: buss, vinnerKilde: 'sikker', fartMS: 12, spor, lang: spor, nå });
    expect(r.hendelse).not.toBe('byttet');
    expect(r.lås.k.linje).toBe('3');
  });
  it('uten trasé: rette streker som før (kjent svakhet, derfor hentes traséen)', () => {
    expect(sisteAvviksrekke(metro(spor, null), spor).length).toBeGreaterThan(0);
  });
  it('kandidaten bærer traséen, og auto-reise henter den for låsen', () => {
    expect(metro([], F.form).form).toBe(F.form);
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toContain("[_lås && _lås.k, ...(dom.kind === 'ombord-tvil' ? dom.kandidater.slice(0, 5) : [])]");
    expect(a).toContain('.forEach(k => { fetchJourneyShape(k.nøkkel).catch(() => {}); });');
  });
});
