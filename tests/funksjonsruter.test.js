// Funksjonsruter: virker spesialfunksjonene for rutevalg på tvers av ruter,
// linjer og transportmidler?
//
// Kjøres mot ekte Entur med `npm run funksjonsruter` (FUNKSJON_LIVE=1). Ikke
// en del av `npm test`: den trenger nett, og svarene følger rutetidene.
// Rutene er testrutene (tests/testruter/ruter.js). Funksjonene er appens egne.
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RUTER } from './testruter/ruter.js';

const LIVE = process.env.FUNKSJON_LIVE === '1';
vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: () => {} }));
vi.mock('../src/ui/log.js', () => ({ logMsg: () => {}, setDot: () => {} }));
vi.mock('../src/api/http.js', async (o) => { const e = await o(); return { ...e,
  enturFetch: (u, op = {}) => fetch(u, { ...op, headers: { ...(op.headers || {}), 'ET-Client-Name': e.ET_CLIENT_NAME } }) }; });

const MORGEN = Date.parse('2026-11-06T07:00:00Z');   // fredag 08:00
const NATT = Date.parse('2026-11-06T23:34:00Z');     // natt til lørdag 00:34
const MIN = 60000;
const ms = v => (v ? new Date(v).getTime() : NaN);
const tid = c => ms(c.expectedArrivalTime || c.aimedArrivalTime || c.expectedDepartureTime || c.aimedDepartureTime);
const ll = c => { const q = c.quay || {}, sp = q.stopPlace || {}; return { lat: q.latitude ?? sp.latitude, lon: q.longitude ?? sp.longitude }; };

const res = [];
const ok = (rute, f, status, detalj) => res.push({ rute: rute.navn, f, status, detalj });

/** Hvor turen er ved t, lineært mellom kallene. */
function posPå(kall, t) {
  for (let i = 1; i < kall.length; i++) {
    const a = kall[i - 1], b = kall[i], ta = tid(a), tb = tid(b);
    if (t >= ta && t <= tb) { const f = tb > ta ? (t - ta) / (tb - ta) : 0, A = ll(a), B = ll(b);
      return { lat: A.lat + (B.lat - A.lat) * f, lon: A.lon + (B.lon - A.lon) * f }; }
  }
  return null;
}

describe.skipIf(!LIVE)('funksjonsruter mot Entur', () => {
  let E, A, O, L, OV, R, Q;
  beforeAll(async () => {
    E = await import('../src/api/entur.js'); A = await import('../src/api/adapt.js');
    O = await import('../src/api/ombord.js'); L = await import('../src/api/ombordLaas.js');
    OV = await import('../src/overganger.js'); R = await import('../src/raskere.js'); Q = await import('../src/api/queries.js');
  });

  it.each(RUTER.filter(r => !r.ekstra))('$navn', async (rute) => {
    const dir = { key: rute.id, ...rute.fra, ...rute.til };
    const rå = await new Promise((y, n) => E.fetchTrip(dir, y, e => n(new Error(e)), MORGEN));
    const beste = rå.slice().sort((a, b) => ms(a.legs.at(-1).expectedEndTime) - ms(b.legs.at(-1).expectedEndTime))[0];
    if (!beste) { ok(rute, 'alle', 'feilet', 'ingen reise fra Entur'); return; }
    const leg = beste.legs.find(l => l.mode !== 'foot');
    const sj = leg.serviceJourney, alleKall = (sj && sj.estimatedCalls) || [];
    const påI = alleKall.findIndex(c => tid(c) >= ms(leg.expectedStartTime) - 30000);
    const kall = alleKall.slice(Math.max(0, påI));
    const linje = sj && sj.line && sj.line.publicCode;

    // 1. Neste side forbi midnatt.
    try {
      const side = await new Promise((y, n) => E.fetchTripPage(dir, NATT, 12, y, n));
      const etter = side.filter(tp => ms((tp.legs.find(l => l.mode !== 'foot') || {}).expectedStartTime) > NATT + 30 * MIN);
      ok(rute, 'neste side forbi midnatt', etter.length ? 'bestått' : (side.length ? 'feilet' : 'ikke aktuelt'),
        etter.length ? etter.length + ' avganger etter nattpausen, første ' + new Date(ms(etter[0].legs.find(l => l.mode !== 'foot').expectedStartTime)).toISOString().slice(11, 16) + 'Z'
          : (side.length ? 'bare ' + side.length + ' nær 00:34' : 'Entur har ingenting fra 00:34'));
    } catch (e) { ok(rute, 'neste side forbi midnatt', 'feilet', String(e.message || e)); }

    // 2. Videre fra ankomst (bare når målet er et stopp).
    const ank = ms(beste.legs.at(-1).expectedEndTime);
    if (rute.til.toStopId) {
      try {
        const b = await E.fetchArrBoard(rute.til.toStopId, OV.ARR_BOARD_ASK, OV.arrBoardSpørsmål(ank));
        const etter = b.departures.filter(c => c.depTs >= ank);
        const modi = new Set(etter.map(c => c.ln && c.ln.transportMode));
        ok(rute, 'videre fra ankomst', etter.length ? 'bestått' : 'feilet', etter.length + ' etter ankomst, ' + new Set(etter.map(c => c.ln && c.ln.publicCode)).size + ' linjer, ' + [...modi].join('/'));
      } catch (e) { ok(rute, 'videre fra ankomst', 'feilet', String(e.message || e)); }
    } else ok(rute, 'videre fra ankomst', 'ikke aktuelt', 'målet er en koordinat');

    // 3. Overganger på første etappes neste stopp.
    const neste = kall[1], etter2 = kall[2];
    if (neste && neste.quay && neste.quay.stopPlace) {
      try {
        const nAt = tid(neste);
        const b = await E.fetchArrBoard(neste.quay.stopPlace.id, OV.ARR_BOARD_ASK, OV.arrBoardSpørsmål(nAt));
        const o = OV.overganger(b.departures, nAt, { linje, journeyId: sj.id, ofte: [] });
        const brudd = o.rader.filter(r => String(r.c.ln && r.c.ln.publicCode) === String(linje) || r.rcls === 'missed');
        ok(rute, 'overganger', brudd.length ? 'feilet' : 'bestått', o.totalt + ' overganger på ' + neste.quay.stopPlace.name
          + (brudd.length ? '; FEIL: egen linje eller ikke rekkbar med' : ''));
      } catch (e) { ok(rute, 'overganger', 'feilet', String(e.message || e)); }
    } else ok(rute, 'overganger', 'ikke aktuelt', 'første etappe har ikke et neste stopp');

    // 4. Raskere hvis du går av her (bare når målet er et stopp).
    if (rute.til.toStopId && neste && etter2) {
      try {
        const [h, s] = await Promise.all([E.fetchTripFra(neste.quay.stopPlace.id, rute.til.toStopId, tid(neste)),
          E.fetchTripFra(etter2.quay.stopPlace.id, rute.til.toStopId, tid(etter2))]);
        const r = R.raskereHer({ herfra: h, herfraAnk: tid(neste), senere: s, senereAnk: tid(etter2) });
        const plausibel = !r || (r.framMs > tid(neste) && R.bestFra(h, tid(neste)) === r.tp);
        ok(rute, 'raskere', plausibel ? 'bestått' : 'feilet', r ? 'sier raskere på ' + neste.quay.stopPlace.name + ', ' + r.sparerMin + ' min' : 'sier ingenting (ingen gevinst ≥ 3 min)');
      } catch (e) { ok(rute, 'raskere', 'feilet', String(e.message || e)); }
    } else ok(rute, 'raskere', 'ikke aktuelt', rute.til.toStopId ? 'for få stopp' : 'målet er en koordinat');

    // 5. Lås og passerte stopp: syntetisk spor langs den ekte turen, med 40 s ved hvert stopp.
    if (kall.length >= 3 && kall.every(c => Number.isFinite(ll(c).lat))) {
      const t0 = tid(kall[0]), t1 = tid(kall.at(-1));
      const fikser = [];
      for (let t = t0; t <= t1; t += 10000) {
        const vedStopp = kall.find(c => Math.abs(tid(c) - t) <= 20000);
        const p = vedStopp ? ll(vedStopp) : posPå(kall, t);
        if (p) fikser.push({ lat: p.lat, lon: p.lon, at: t, acc: 10, stille: !!vedStopp });
      }
      const k = (spor) => ({ nøkkel: sj.id, linje, call: { serviceJourney: { id: sj.id, estimatedCalls: kall } },
        forventet: spor.map(f => ({ at: f.at, ...(posPå(kall, f.at) || {}) })) });
      let lås = null, sistIdx = -1, bakover = 0, hendelser = [], holdt = 0, sjekket = 0;
      for (let i = 3; i < fikser.length; i++) {
        const spor = fikser.slice(Math.max(0, i - 11), i + 1), nå = fikser[i].at, fart = fikser[i].stille ? 0 : 8;
        const dom = O.ombord({ spor, fartMS: fart, kandidater: [k(spor)] });
        const r = L.oppdaterLås(lås, { låstK: lås ? k(spor) : null, vinner: dom.kind === 'ombord' ? dom.kandidater[0] : null, fartMS: fart, spor, nå });
        if (r.hendelse) hendelser.push(r.hendelse);
        if (!r.lås) sistIdx = -1;   // en ny lås begynner forfra
        lås = r.lås;
        if (hendelser.includes('låst')) { sjekket++; if (lås) holdt++;
          const n = lås && O.nesteStopp(lås.k, nå); const idx = n ? kall.findIndex(c => c.quay.stopPlace.id === n.id) : -1;
          if (idx >= 0) { if (idx < sistIdx) bakover++; sistIdx = idx; } }
      }
      // Bestått: låst, holdt til endestasjonen uten å slippe underveis, og aldri bakover.
      const fasit = hendelser[0] === 'låst' && !hendelser.some(h => h === 'sluppet:brudd' || h === 'sluppet:stille') && bakover === 0;
      ok(rute, 'lås (' + (leg.mode) + ')', fasit ? 'bestått' : 'feilet',
        'hendelser: ' + hendelser.join(', ') + '; holdt ' + holdt + '/' + sjekket + ' tikk; neste stopp bakover ' + bakover + ' ganger');
    } else ok(rute, 'lås (' + leg.mode + ')', 'ikke aktuelt', 'for få stopp med koordinater');

    // 6. Også via, med via = et stopp på den beste reisen.
    // Via er et stopp UNDERVEIS, ikke målet: med via = målet er alle reisene like.
    const viaKall = kall.slice(1, -1).find(c => c.quay && c.quay.stopPlace && c.quay.stopPlace.id !== rute.til.toStopId);
    if (viaKall && rute.til.toStopId) {
      try {
        const ov = await new Promise((y, n) => E.fetchTrip({ ...dir, via: viaKall.quay.stopPlace.name, viaStopId: viaKall.quay.stopPlace.id, viaOgså: true }, y, e => n(new Error(e)), MORGEN));
        const medVia = ov.filter(t => t._via).length, uten = ov.length - medVia;
        ok(rute, 'også via', uten > 0 ? 'bestått' : 'feilet', medVia + ' via ' + viaKall.quay.stopPlace.name + ', ' + uten + ' uten via');
      } catch (e) { ok(rute, 'også via', 'feilet', String(e.message || e)); }
    } else ok(rute, 'også via', 'ikke aktuelt', rute.til.toStopId ? 'ingen stopp underveis på første etappe' : 'målet er en koordinat');

    expect(true).toBe(true);
  }, 120000);

  it('rapport', () => {
    const f = [...new Set(res.map(r => r.f.replace(/ \(.*\)/, '')))];
    const linjer = ['# Funksjonsruter', '', 'Kjørt mot Entur ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC, med reiser fra fredag 08:00 og neste side fra natt til lørdag 00:34.', '',
      '| funksjon | bestått | feilet | ikke aktuelt |', '|---|---|---|---|',
      ...f.map(n => { const r = res.filter(x => x.f.replace(/ \(.*\)/, '') === n); return '| ' + n + ' | ' + r.filter(x => x.status === 'bestått').length + ' | ' + r.filter(x => x.status === 'feilet').length + ' | ' + r.filter(x => x.status === 'ikke aktuelt').length + ' |'; }),
      '', '## Per rute', '', '| rute | funksjon | status | detalj |', '|---|---|---|---|',
      ...res.map(r => '| ' + r.rute + ' | ' + r.f + ' | ' + r.status + ' | ' + r.detalj.replace(/\|/g, '/') + ' |')];
    writeFileSync('docs/funksjonsruter.md', linjer.join('\n') + '\n');
    console.log(linjer.slice(4, 6 + f.length).join('\n'));
  });
});
