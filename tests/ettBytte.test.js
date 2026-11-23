/**
 * «Ett bytte» (eksperiment): hurtigvalget i Auto-tavla som viser områder du når
 * med ett bytte, én rad per himmelretning. Mot opptak (tests/fixtures/entur/).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ettByttePerRetning, RETNINGER } from '../src/ettBytte.js';
import { ettBytteHtml, ettBytteRadHtml, _nullstillEttBytte, ETT_BYTTE_VALG, UT_VIST, ettBytteKart, ettBytteKartData, KART_STEDER, RAMME_NÆRMESTE, rammeGrense, RAMME_MIN_M, bobleRadius, BOBLE_MAKS, BOBLE_MIN, RAMME_VALG, samleEtiketter, ETIKETT_PX, velgRetning, valgtRetning, KART_STEDER_VALGT } from '../src/views/ettBytteVisning.js';
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { metresBetween } from '../src/haversine.js';
import { AT_RETNINGER } from '../src/views/auto.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const O = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n)]));
const res = async n => { _tømCache(); return utforsk(O[n].scenario, { hent: avspiller(O[n]).hent }); };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
beforeEach(() => { _tømCache(); _nullstillEttBytte(); });

describe('ett bytte: rader per himmelretning (ren)', () => {
  it('Mortensrud: mange ulike retninger, nordøst via Helsfyr med buss 300 og 110', async () => {
    const e = ettByttePerRetning(await res('mortensrud_dag'), O.mortensrud_dag.scenario.posisjon);
    expect(e.rader.length).toBeGreaterThanOrEqual(5);
    const nø = e.rader.find(r => r.retning === 'NØ');
    expect(nø.knute).toBe('NSR:StopPlace:59516');
    expect(nø.ut).toEqual(expect.arrayContaining(['300', '110']));
  });
  it('én rad per retning, i rekkefølge med klokka, aldri sentrum', async () => {
    for (const n of SCENARIOER) {
      const e = ettByttePerRetning(await res(n), O[n].scenario.posisjon);
      const r = e.rader.map(x => x.retning);
      expect(new Set(r).size).toBe(r.length);
      expect(r).toEqual(RETNINGER.filter(x => r.includes(x)));
    }
  });
  it('bare to ledd i ordinært vindu, og bare reelle bytter (ikke samme linje videre)', () => {
    const vei = (o) => ({ ledd: 2, vindu: 'ordinært', knute: 'K', inn: 'L1>A', directionId: 'L2>B', område: 'N|5–15', opsjon: 'destination:D', ...o });
    const r = { veier: [vei({ vindu: 'senere' }), vei({ vindu: 'utvidet' }), vei({ ledd: 1, knute: null, inn: null }), vei({ directionId: 'L1>A2' }), vei({ område: '•|0–5' })], opsjoner: [], grupper: { linjeretning: {} } };
    expect(ettByttePerRetning(r, { lat: 60, lon: 10 })).toMatchObject({ rader: [], ingen: true });
    r.veier.push(vei());
    expect(ettByttePerRetning(r, { lat: 60, lon: 10 }).rader).toHaveLength(1);
  });
  it('natt og bygd: få rader, men ærlige', async () => {
    expect(ettByttePerRetning(await res('mortensrud_natt'), O.mortensrud_natt.scenario.posisjon).rader.length).toBeLessThanOrEqual(2);
  });
  it('deterministisk uavhengig av rekkefølgen veiene kom i', async () => {
    const r = await res('nesttun_dag');
    const a = ettByttePerRetning(r, O.nesttun_dag.scenario.posisjon);
    const b = ettByttePerRetning({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() }, O.nesttun_dag.scenario.posisjon);
    expect(b).toEqual(a);
  });
  it('påstår ingen reisetid og ingen bekreftelse', async () => {
    const e = ettByttePerRetning(await res('ranheim_dag'), O.ranheim_dag.scenario.posisjon);
    expect(e.grunnlag).toMatch(/ikke sjekket/);
    expect(e.grunnlag).toMatch(/ikke tidskontrollert/);
    for (const r of e.rader) { expect(r.sjekket).toBe(false); expect(Object.keys(r)).not.toEqual(expect.arrayContaining(['min', 'reisetid', 'avgang'])); }
  });
});

describe('ett bytte: visningen', () => {
  const pos = O.mortensrud_dag.scenario.posisjon;
  const hent = avspiller(O.mortensrud_dag).hent;
  it('leter først, viser rader når svaret kommer, og ber om ny tegning', async () => {
    let tegnet = 0;
    const nå = Date.parse(O.mortensrud_dag.scenario.tid);
    const først = ettBytteHtml(pos, { esc, hent, nå, rerender: () => { tegnet++; } });
    expect(først).toMatch(/ser etter hvor du kommer med ett bytte/);
    await new Promise(r => setTimeout(r, 50));
    expect(tegnet).toBe(1);
    const etter = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} });
    expect(etter).toMatch(/class="eb-rad"/);
    expect(etter).toMatch(/ikke sjekket/);
    expect(etter).toMatch(/via Helsfyr/);
  });
  it('feil gir en ærlig tekst, ikke en tom liste', async () => {
    ettBytteHtml(pos, { esc, hent: async () => { throw new Error('nett'); }, rerender: () => {} });
    await new Promise(r => setTimeout(r, 20));
    expect(ettBytteHtml(pos, { esc, hent: async () => { throw new Error('nett'); }, rerender: () => {} })).toMatch(/fant ikke svar på bytter herfra nå/);
  });
  it('uten posisjon: sier hva som mangler', () => {
    expect(ettBytteHtml(null, { esc })).toMatch(/trenger en posisjon/);
  });
  it('lange linjelister kortes til UT_VIST + antall', () => {
    const h = ettBytteRadHtml({ retning: 'N', retningNavn: 'nord', knuteNavn: 'K', inn: ['1'], ut: ['a', 'b', 'c', 'd', 'e', 'f'], eksempler: ['X'], antallSteder: 5 }, esc);
    expect(h).toContain('a, b, c, d +2');
    expect(UT_VIST).toBe(4);
  });
});

// Et minimalt Leaflet: teller lag, tooltips og innramminger.
const falskL = () => {
  const lagt = [], rammer = [];
  const lag = () => ({ ting: [], addTo(m) { (m.ting || lagt).push(this); return this; }, clearLayers() { this.ting.length = 0; } });
  const L = {
    layerGroup: () => { const g = lag(); g.addTo = m => { lagt.push(g); return g; }; return g; },
    polyline: (ll, o) => ({ ll, o, addTo(g) { g.ting.push(this); return this; } }),
    circleMarker: (ll, o) => ({ ll, o, bindTooltip(t, to) { this.t = t; this.to = to; return this; }, addTo(g) { g.ting.push(this); return this; } }),
    marker: (ll, o) => ({ ll, o, addTo(g) { g.ting.push(this); return this; } }),
    divIcon: o => o,
  };
  const map = { fitBounds: (b, o) => rammer.push({ b, o }), removeLayer: g => { lagt.splice(lagt.indexOf(g), 1); } };
  return { L, map, lagt, rammer };
};

describe('ett bytte: kartet', () => {
  const pos = O.mortensrud_dag.scenario.posisjon;
  const hent = avspiller(O.mortensrud_dag).hent;
  const nå = Date.parse(O.mortensrud_dag.scenario.tid);
  const klar = async () => { ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }); await new Promise(r => setTimeout(r, 50)); };

  it('ingenting tegnes før svaret er kommet', () => {
    ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} });
    expect(ettBytteKartData(pos)).toBeNull();
  });
  it('én knute per retning med navn, steder med koordinater, høyst KART_STEDER', async () => {
    await klar();
    const d = ettBytteKartData(pos);
    const rader = ettByttePerRetning(await res('mortensrud_dag'), pos).rader;
    expect(d.retninger.map(r => r.retning)).toEqual(rader.map(r => r.retning));
    const nø = d.retninger.find(r => r.retning === 'NØ');
    expect(nø.etikett).toBe('nordøst · via Helsfyr');
    expect(nø.knute.lat).toBeCloseTo(59.913, 2);
    for (const r of d.retninger) {
      expect(r.steder.length).toBeGreaterThan(0);
      expect(r.steder.length).toBeLessThanOrEqual(KART_STEDER);
      expect(r.steder.every(s => Number.isFinite(s.lat) && Number.isFinite(s.lon))).toBe(true);
    }
  });
  it('tegner, rammer inn én gang, og fjerner laget og gir kartet tilbake når valget går av', async () => {
    await klar();
    const { L, map, lagt, rammer } = falskL();
    let tilbake = 0;
    ettBytteKart(map, L, { aktiv: true, pos, ferdig: () => tilbake++ });
    expect(lagt).toHaveLength(1);
    const knuter = lagt[0].ting.filter(t => t.o.className === 'eb-kart-knute');
    // Én prikk og én etikett per knutepunkt, selv om det bærer flere retninger.
    const unike = new Set(ettBytteKartData(pos).retninger.filter(r => r.knute).map(r => r.knute.lat + ',' + r.knute.lon));
    expect(unike.size).toBeLessThan(ettBytteKartData(pos).retninger.length); // Mortensrud: bussterminalen bærer flere
    expect(knuter.length).toBe(unike.size);
    expect(new Set(knuter.map(k => k.t)).size).toBe(knuter.length);
    // Navnelappene er markører, ikke faste lapper — tavlas lapprydding (ryddKart) rører dem ikke.
    expect(lagt[0].ting.some(t => t.to && t.to.permanent)).toBe(false);
    expect(lagt[0].ting.filter(t => t.o && t.o.icon && t.o.icon.className === 'eb-kart-etikett').length).toBeGreaterThan(0);
    expect(rammer).toHaveLength(1);
    ettBytteKart(map, L, { aktiv: true, pos, ferdig: () => tilbake++ }); // ny tegning av tavla: samme lag, ingen ny ramme
    expect(lagt).toHaveLength(1);
    expect(rammer).toHaveLength(1);
    ettBytteKart(map, L, { aktiv: false, pos, ferdig: () => tilbake++ });
    expect(lagt).toHaveLength(0);
    expect(tilbake).toBe(1);
    ettBytteKart(map, L, { aktiv: false, pos, ferdig: () => tilbake++ }); // av og av: ingen ny innramming av tavla
    expect(tilbake).toBe(1);
  });
  it('ny tegning av tavla tegner ikke om; nytt svar på samme sted flytter ikke kartet', async () => {
    await klar();
    const { L, map, lagt, rammer } = falskL();
    ettBytteKart(map, L, { aktiv: true, pos });
    const første = lagt[0].ting[0];
    ettBytteKart(map, L, { aktiv: true, pos });
    expect(lagt[0].ting[0]).toBe(første);
    // Ti minutter senere: nytt svar, samme sted. Laget tegnes på nytt, rammen står.
    ettBytteHtml(pos, { esc, hent, nå: nå + 11 * 60_000, rerender: () => {} });
    await new Promise(r => setTimeout(r, 50));
    ettBytteKart(map, L, { aktiv: true, pos });
    expect(lagt[0].ting[0]).not.toBe(første);
    expect(rammer).toHaveLength(1);
  });
  it('oversikten: deg og knutepunktene som bobler — ingen streker ut og ingen steder', async () => {
    await klar();
    const { L, map } = falskL();
    let b = null;
    const f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: x => { b = x; } });
    const d = ettBytteKartData(pos);
    const knuter = new Set(d.retninger.filter(r => r.knute).map(r => r.knute.lat + ',' + r.knute.lon));
    expect(b.length).toBe(1 + knuter.size);
    const t = f.lagt[0].ting;
    expect(t.some(x => x.o && /eb-kart-ut/.test(x.o.className))).toBe(false);
    expect(t.some(x => x.o && /eb-kart-sted/.test(x.o.className))).toBe(false);
    // Tallet i hver boble = summen av stedene retningene via den knuten betjener.
    const sum = new Map();
    for (const r of d.retninger.filter(r => r.knute)) { const k = r.knute.lat + ',' + r.knute.lon; sum.set(k, (sum.get(k) || 0) + r.antall); }
    // Tallet er en markør, ikke en lapp: kartets lapprydding (ryddKart) skal ikke kunne skjule det.
    expect(t.some(x => x.to && /eb-kart-tall/.test(x.to.className))).toBe(false);
    const tall = t.filter(x => x.o && x.o.icon && /eb-kart-tall/.test(x.o.icon.className)).map(x => [x.ll.join(','), +x.o.icon.html.replace(/\D/g, '')]);
    expect(new Map(tall)).toEqual(sum);
    // Størst antall → størst boble.
    const bobler = t.filter(x => x.o && /eb-kart-knute/.test(x.o.className));
    const størst = [...sum.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const r = new Map(bobler.map(x => [x.ll.join(','), x.o.radius]));
    expect(r.get(størst)).toBe(Math.max(...r.values()));
    expect(new Set(r.values()).size).toBeGreaterThan(1);
  });
  it('rammen gir plass til største boble og navnelappen over den', () => {
    expect(RAMME_VALG.paddingTopLeft[1]).toBeGreaterThanOrEqual(BOBLE_MAKS + 24);
    expect(RAMME_VALG.paddingBottomRight[1]).toBeGreaterThanOrEqual(BOBLE_MAKS);
    expect(Math.min(RAMME_VALG.paddingTopLeft[0], RAMME_VALG.paddingBottomRight[0])).toBeGreaterThanOrEqual(BOBLE_MAKS);
  });
  it('boblene: arealet følger antallet (radius ∝ √n), med et minste trykkbart mål', () => {
    expect(bobleRadius(100, 100)).toBe(BOBLE_MAKS);
    expect(bobleRadius(25, 100)).toBeCloseTo(BOBLE_MAKS / 2, 6); // en firedel av stedene → halv radius
    expect(bobleRadius(1, 1000)).toBe(BOBLE_MIN);
    expect(bobleRadius(0, 0)).toBe(BOBLE_MIN);
  });
  it('rammegrensen: median, ikke maks, og aldri under gulvet', () => {
    const p = { lat: 60, lon: 10 }, nord = km => ({ lat: 60 + km / 111.2, lon: 10 });
    expect(rammeGrense(p, [])).toBe(RAMME_MIN_M);
    expect(rammeGrense(p, [nord(1)])).toBe(RAMME_MIN_M);
    expect(rammeGrense(p, [nord(5), nord(6), nord(40)]) / 1000).toBeCloseTo(12, 0);
    expect(rammeGrense(p, [nord(30), nord(50)]) / 1000).toBeCloseTo(80, 0); // bygd: stor ramme
  });
  it('etiketter: knuter tett på skjermen deler én, flest retninger bærer den', () => {
    const k = (navn, x, n) => ({ navn, x, retninger: Array(n).fill('r') });
    const px = q => ({ x: q.x, y: 0 });
    const g = samleEtiketter([k('Helsfyr', 30, 1), k('Oslo bussterminal', 0, 4), k('Nationaltheatret', 20, 1), k('Lufthavn', 400, 1)], px);
    expect(g.map(x => x.etikett)).toEqual(['Oslo bussterminal · Helsfyr · Nationaltheatret', 'Lufthavn']);
    expect(g[0].bærer.navn).toBe('Oslo bussterminal');
    expect(g[0].andre.map(x => x.navn)).toEqual(['Helsfyr', 'Nationaltheatret']);
    // Akkurat på grensen er for langt unna.
    expect(samleEtiketter([k('A', 0, 2), k('B', ETIKETT_PX, 1)], px)).toHaveLength(2);
    // Langt fra hverandre, men lappene ville krasje (lange navn side om side): én lapp.
    expect(samleEtiketter([k('Oslo bussterminal', 0, 2), k('Nationaltheatret', 100, 1)], px)).toHaveLength(1);
    // Samme avstand, men den ene lappen høyt over den andre (stor boble): to lapper.
    expect(samleEtiketter([k('Oslo bussterminal', 0, 2), k('Nationaltheatret', 100, 1)], q => ({ x: q.x, y: q.x === 0 ? 0 : 200 }))).toHaveLength(2);
    // Uten projeksjon: hver knute sin etikett.
    expect(samleEtiketter([k('A', 0, 2), k('B', 1, 1)], null)).toHaveLength(2);
  });
  it('du står selv på kartet mens laget vises', async () => {
    await klar();
    const { L, map, lagt } = falskL();
    ettBytteKart(map, L, { aktiv: true, pos });
    const deg = lagt[0].ting.filter(t => t.o && t.o.className === 'eb-kart-deg');
    expect(deg).toHaveLength(1);
    expect(deg[0].ll).toEqual([pos.lat, pos.lon]);
  });
  it('stedene på kartet spenner fra lengst unna til nærmest', async () => {
    await klar();
    const d = ettBytteKartData(pos);
    const rader = ettByttePerRetning(await res('mortensrud_dag'), pos).rader;
    for (const r of d.retninger) {
      const alle = rader.find(x => x.retning === r.retning).punkter;
      expect(r.steder[0]).toEqual(alle[0]);
      expect(r.steder[r.steder.length - 1]).toEqual(alle[alle.length - 1]);
    }
  });
  it('valgene til fitBounds kan skrives i (Leaflet legger til zoom — sett i nettleseren)', async () => {
    await klar();
    const f = falskL();
    f.map.fitBounds = (b, o) => { o.zoom = 12; };
    expect(() => ettBytteKart(f.map, f.L, { aktiv: true, pos })).not.toThrow();
  });
  it('uten valget eller uten kart gjør laget ingenting', async () => {
    await klar();
    const { L, map, lagt } = falskL();
    ettBytteKart(map, L, { aktiv: false, pos });
    ettBytteKart(null, L, { aktiv: true, pos });
    expect(lagt).toHaveLength(0);
  });
});

describe('ett bytte: klikkbare retningskort', () => {
  const pos = O.mortensrud_dag.scenario.posisjon;
  const hent = avspiller(O.mortensrud_dag).hent;
  const nå = Date.parse(O.mortensrud_dag.scenario.tid);
  let tegnet = 0;
  const html = () => ettBytteHtml(pos, { esc, hent, nå, rerender: () => { tegnet++; } });
  const klar = async () => { html(); await new Promise(r => setTimeout(r, 50)); tegnet = 0; };
  const kartMed = () => { const f = falskL(); const rammer = []; ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: b => rammer.push(b) }); return { ...f, rammer }; };
  const ting = f => f.lagt[0].ting;

  it('kortene er knapper med aria-pressed; trykk velger, nytt trykk velger av, og tavla tegnes', async () => {
    await klar();
    expect(html()).toMatch(/<button type="button" class="eb-rad" data-eb-retning="NØ" aria-pressed="false">/);
    velgRetning('NØ');
    expect(valgtRetning()).toBe('NØ');
    expect(tegnet).toBe(1);
    expect(html()).toMatch(/data-eb-retning="NØ" aria-pressed="true"/);
    expect((html().match(/aria-pressed="true"/g) || []).length).toBe(1);
    velgRetning('NØ');
    expect(valgtRetning()).toBeNull();
    velgRetning('V'); velgRetning('NØ');
    expect(valgtRetning()).toBe('NØ'); // et annet kort bytter valget
  });
  it('valgt retning i full styrke med etikett; de andre dempet og uten etikett', async () => {
    await klar();
    velgRetning('NØ');
    const f = kartMed();
    const d = ettBytteKartData(pos);
    expect(d.valgt).toBe('NØ');
    const nø = d.retninger.find(r => r.retning === 'NØ');
    expect(nø.dempet).toBe(false);
    expect(nø.steder.length).toBeGreaterThan(KART_STEDER);
    expect(nø.steder.length).toBeLessThanOrEqual(KART_STEDER_VALGT);
    expect(d.retninger.filter(r => r.retning !== 'NØ').every(r => r.dempet)).toBe(true);
    const etiketter = ting(f).filter(t => t.o && t.o.icon && t.o.icon.className === 'eb-kart-etikett').map(t => t.o.icon.html.replace(/<[^>]+>/g, ''));
    expect(etiketter).toEqual(['Helsfyr']);
    // Bare det valgte kortets steder vises, og de er de samme som kortet regner.
    const steder = ting(f).filter(t => t.o && /eb-kart-sted/.test(t.o.className));
    expect(steder.length).toBe(nø.steder.length);
    expect(steder.every(t => !/dempet/.test(t.o.className))).toBe(true);
    // De andre knutepunktene står, dempet; Helsfyr fremhevet.
    const bobler = ting(f).filter(t => t.o && /eb-kart-knute/.test(t.o.className));
    expect(bobler.filter(t => !/dempet/.test(t.o.className)).map(t => t.ll.join(','))).toEqual([nø.knute.lat + ',' + nø.knute.lon]);
    expect(bobler.some(t => /dempet/.test(t.o.className))).toBe(true);
  });
  it('rammen: deg, knutepunktet og retningens steder — ikke de andres; av gir oversikten', async () => {
    await klar();
    velgRetning('NØ');
    const f = falskL(); const rammer = [];
    const tegn = () => ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: b => rammer.push(b) });
    tegn();
    const d = ettBytteKartData(pos);
    const nø = d.retninger.find(r => r.retning === 'NØ');
    const b = new Set(rammer[0].map(p => p.join(',')));
    expect(b.has(nø.knute.lat + ',' + nø.knute.lon)).toBe(true);
    const andreSteder = d.retninger.filter(r => r.retning !== 'NØ').flatMap(r => r.steder).filter(s => !nø.steder.some(x => x.lat === s.lat && x.lon === s.lon));
    expect(andreSteder.some(s => b.has(s.lat + ',' + s.lon))).toBe(false);
    expect(rammer[0].length).toBeGreaterThan(2);
    tegn(); expect(rammer).toHaveLength(1); // samme valg: ingen ny ramme
    velgRetning('NØ'); tegn();
    expect(rammer).toHaveLength(2); // av: oversikten rammes inn igjen
    expect(rammer[1].length).not.toBe(rammer[0].length);
  });
  it('nytt svar på samme sted og samme valg flytter ikke kartet; nytt sted slipper valget', async () => {
    await klar();
    velgRetning('NØ');
    const f = falskL(); const rammer = [];
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: b => rammer.push(b) });
    ettBytteHtml(pos, { esc, hent, nå: nå + 11 * 60_000, rerender: () => {} });
    await new Promise(r => setTimeout(r, 50));
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: b => rammer.push(b) });
    expect(valgtRetning()).toBe('NØ');
    expect(rammer).toHaveLength(1);
    ettBytteHtml({ lat: pos.lat + 0.05, lon: pos.lon }, { esc, hent, nå, rerender: () => {} });
    expect(valgtRetning()).toBeNull();
  });
  it('valget «ett bytte» av: kortvalget glemmes', async () => {
    await klar();
    velgRetning('NØ');
    const f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    ettBytteKart(f.map, f.L, { aktiv: false, pos, ferdig: () => {} });
    expect(valgtRetning()).toBeNull();
  });
});

describe('ett bytte: isolert og lett å rulle tilbake', () => {
  const a = readFileSync('src/views/auto.js', 'utf8');
  it('alle krokene i auto.js er merket, og det er bare seks (fem for lista, én for kartet)', () => {
    const linjer = a.split('\n').filter(l => /ETT_BYTTE|ettBytte/.test(l));
    expect(linjer.length).toBe(6);
    expect(linjer.every(l => /ETT BYTTE \(eksperiment\)/.test(l))).toBe(true);
  });
  it('valget huskes ikke: etter omlasting står tavla på et kjent valg', () => {
    expect(AT_RETNINGER).not.toContain(ETT_BYTTE_VALG);
  });
});
