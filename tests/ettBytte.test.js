/**
 * «Ett bytte» (eksperiment): hurtigvalget i Auto-tavla som viser områder du når
 * med ett bytte, én rad per himmelretning. Mot opptak (tests/fixtures/entur/).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ettByttePerRetning, RETNINGER, ytterpunkt, stedstypeTelling, velgStedstype, STEDSTYPE_REKKE, kommunerI, KOMMUNE_DEKNING, frekvensMin, frekvensTekst, SAMME_TUR_MIN } from '../src/ettBytte.js';
import { PARAMETRE } from '../src/nettverksutforsker.js';
import { ettBytteHtml, ettBytteRadHtml, _nullstillEttBytte, ETT_BYTTE_VALG, UT_VIST, ettBytteKart, ettBytteKartData, KART_STEDER, RAMME_NÆRMESTE, rammeGrense, RAMME_MIN_M, bobleRadius, BOBLE_MAKS, BOBLE_MIN, RAMME_VALG, plasserNavn, navnRekt, NAVN_NIVÅER, NAVN_PLASSER, velgRetning, valgtRetning, KART_STEDER_VALGT } from '../src/views/ettBytteVisning.js';
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

describe('ett bytte: lengst du kommer (forslag 1)', () => {
  it('ytterpunktet er det fjerneste stedet i retningen, i hele km', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const { rader } = ettByttePerRetning(await res('mortensrud_dag'), pos);
    for (const r of rader) {
      const km = r.punkter.map(p => metresBetween(pos, p) / 1000);
      expect(r.ytterpunkt.km).toBe(Math.round(Math.max(...km)));
      expect(r.ytterpunkt.navn).toBe(r.punkter[km.indexOf(Math.max(...km))].navn);
    }
    expect(ytterpunkt([], pos)).toBeNull();
    expect(ytterpunkt([{ navn: 'x', lat: 1, lon: 1 }], null)).toBeNull();
  });
  it('kortet sier «helt til X · N km»; valgt kort gir ytterpunktet en navnelapp i kartet', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const hent = avspiller(O.mortensrud_dag).hent, nå = Date.parse(O.mortensrud_dag.scenario.tid);
    ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }); await new Promise(r => setTimeout(r, 50));
    const nø = ettByttePerRetning(await res('mortensrud_dag'), pos).rader.find(r => r.retning === 'NØ');
    expect(ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} })).toContain('helt til ' + esc(nø.ytterpunkt.navn) + ' · ' + nø.ytterpunkt.km + ' km');
    // Ytterpunktet gjentas ikke blant eksemplene, og tellingen regner det med.
    const kort = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }).split('data-eb-retning="NØ"')[1].split('</button>')[0];
    const steder = kort.split('class="eb-steder">')[1].split('</div>')[0];
    expect(steder).not.toContain(esc(nø.ytterpunkt.navn));
    const vist = nø.eksempler.filter(n => n !== nø.ytterpunkt.navn).length + 1;
    expect(steder).toContain((nø.antallSteder - vist) + ' steder til');
    velgRetning('NØ');
    const f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    const lapper = f.lagt[0].ting.filter(t => t.o && t.o.icon && /eb-kart-ytteretikett/.test(t.o.icon.className));
    expect(lapper).toHaveLength(1);
    expect(lapper[0].ll).toEqual([nø.ytterpunkt.lat, nø.ytterpunkt.lon]);
  });
});

describe('ett bytte: stedstyper (forslag 2)', () => {
  it('typen er transportmiddelet til linja som når stedet; tog før buss når flere når det', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const r = await res('mortensrud_dag');
    const { rader } = ettByttePerRetning(r, pos);
    const alle = rader.flatMap(x => x.punkter);
    expect(alle.every(p => p.type === null || STEDSTYPE_REKKE.includes(p.type))).toBe(true);
    // Hvert punkts type er blant ut-linjenes transportmidler for veiene til det stedet.
    const navnTilModi = new Map();
    for (const v of r.veier.filter(v => v.ledd === 2 && v.vindu === 'ordinært')) {
      const o = r.opsjoner.find(o => o.id === v.opsjon), g = r.grupper.linjeretning[v.directionId];
      if (!o || !g) continue;
      const n = o.label || o.destinations[0].name;
      (navnTilModi.get(n) || navnTilModi.set(n, new Set()).get(n)).add(g.modus);
    }
    for (const p of alle.filter(p => p.type)) expect(navnTilModi.get(p.navn).has(p.type)).toBe(true);
    expect(alle.some(p => p.type === 'rail')).toBe(true); // Mortensrud: tog via Nationaltheatret/Oslo
    expect(velgStedstype(new Set(['bus', 'rail']))).toBe('rail');
    expect(velgStedstype(new Set(['bus', 'water']))).toBe('water');
    expect(velgStedstype(new Set())).toBeNull();
  });
  it('kortet teller tog og båt, ikke buss', () => {
    const p = t => ({ type: t });
    expect(stedstypeTelling([p('rail'), p('rail'), p('water'), p('bus'), p('metro')])).toBe('2 togstasjoner · 1 kai');
    expect(stedstypeTelling([p('rail'), p('water'), p('water')])).toBe('1 togstasjon · 2 kaier');
    expect(stedstypeTelling([p('bus'), p('tram')])).toBe('');
    expect(stedstypeTelling([])).toBe('');
  });
  it('kortet og kartet bruker typen: «· N togstasjoner» på kortet, tog-prikker i kartet', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const hent = avspiller(O.mortensrud_dag).hent, nå = Date.parse(O.mortensrud_dag.scenario.tid);
    ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }); await new Promise(r => setTimeout(r, 50));
    const rader = ettByttePerRetning(await res('mortensrud_dag'), pos).rader;
    const medTog = rader.find(r => r.typer);
    expect(ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} })).toContain('<span class="eb-typer">· ' + medTog.typer + '</span>');
    velgRetning(medTog.retning);
    const f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    const tog = f.lagt[0].ting.filter(t => t.o && /eb-kart-tog/.test(t.o.className));
    const vist = ettBytteKartData(pos).retninger.find(r => r.retning === medTog.retning).steder.filter(s => s.type === 'rail');
    expect(tog.length).toBe(vist.length);
  });
});

describe('ett bytte: kommuner, ikke stopp (forslag 3)', () => {
  const p = (id, navn) => ({ id, navn });
  it('slår sammen stopp i samme kommune, lengst unna først, uten din egen kommune', () => {
    const k = new Map([['a', 'Lillehammer'], ['b', 'Ringsaker'], ['c', 'Ringsaker'], ['d', 'Oslo'], ['e', 'Lillestrøm']]);
    expect(kommunerI([p('a'), p('b'), p('c'), p('d'), p('e')], k, 'Oslo')).toEqual(['Lillehammer', 'Ringsaker', 'Lillestrøm']);
    expect(kommunerI([p('d')], k, 'Oslo')).toEqual([]); // bare egen kommune
  });
  it('kortet: «og 1 kommune til», «og 2 kommuner til»', () => {
    const rad = n => ({ retning: 'N', retningNavn: 'nord', knuteNavn: 'K', inn: ['1'], ut: ['2'], eksempler: [], antallSteder: n, punkter: Array.from({ length: n }, (_, i) => p('s' + i)), ytterpunkt: null, typer: '' });
    const kom = n => ({ kommuneAv: new Map(Array.from({ length: n }, (_, i) => ['s' + i, 'K' + i])), hjemme: 'Oslo' });
    expect(ettBytteRadHtml(rad(4), esc, kom(4))).toContain('K0, K1, K2 og 1 kommune til');
    expect(ettBytteRadHtml(rad(5), esc, kom(5))).toContain('K0, K1, K2 og 2 kommuner til');
  });
  it('for lite kommunedata gir null — da står stoppene som før', () => {
    const k = new Map([['a', 'Lillehammer']]);
    const n = Math.ceil(1 / (KOMMUNE_DEKNING - 0.01));
    expect(kommunerI([p('a'), p('b')], k)).toBeNull();
    expect(kommunerI(Array.from({ length: 5 }, (_, i) => p(i < 4 ? 'a' : 'x')), k)).toEqual(['Lillehammer']); // 80 %
    expect(kommunerI([p('a')], null)).toBeNull();
    expect(n).toBeGreaterThan(0);
  });
  it('kortet viser kommuner når de kommer, og stopp før og uten', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const hent = avspiller(O.mortensrud_dag).hent, nå = Date.parse(O.mortensrud_dag.scenario.tid);
    // Falsk kommuneoppslag: annenhver kommune etter id, «Oslo» hjemme.
    let spurt = null, tegnet = 0;
    const hentKommuner = async (ider, q) => { spurt = { ider, q }; return { kommuneAv: new Map(ider.map((id, i) => [id, i % 3 === 0 ? 'Oslo' : 'Kommune ' + (i % 7)])), hjemme: 'Oslo' }; };
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner, rerender: () => { tegnet++; } });
    await new Promise(r => setTimeout(r, 80));
    expect(tegnet).toBe(2);                    // svaret, så kommunene
    expect(spurt.ider.length).toBeGreaterThan(0);
    expect(new Set(spurt.ider).size).toBe(spurt.ider.length);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner, rerender: () => {} });
    expect(html).toMatch(/kommuner til/);
    expect(html).not.toMatch(/>Oslo[,<]/);     // hjemkommunen nevnes ikke
    // Når en retning bare når én annen kommune (eller ingen), står stoppene: de sier mer.
    _nullstillEttBytte(); _tømCache();
    const én = async ider => ({ kommuneAv: new Map(ider.map(id => [id, 'Nabo'])), hjemme: 'Oslo' });
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: én, rerender: () => {} });
    await new Promise(r => setTimeout(r, 80));
    const html1 = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} });
    expect(html1).not.toMatch(/kommuner til|>Nabo</);
    expect(html1).toMatch(/steder til/);
    // Feiler oppslaget: stoppene står.
    _nullstillEttBytte(); _tømCache();
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: async () => { throw new Error('nett'); }, rerender: () => {} });
    await new Promise(r => setTimeout(r, 80));
    const uten = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} });
    expect(uten).toMatch(/steder til/);
    expect(uten).not.toMatch(/kommuner til/);
  });
});

describe('ett bytte: hvor ofte det går (forslag 4)', () => {
  const t = min => new Date(Date.UTC(2026, 10, 24, 11, 0) + min * 60000).toISOString();
  it('median av avstanden mellom ulike avganger; samme tur ved to plattformer er én', () => {
    expect(frekvensMin([t(0), t(10), t(20)])).toBe(10);
    expect(frekvensMin([t(20), t(0), t(10)])).toBe(10);                 // rekkefølgen spiller ingen rolle
    expect(frekvensMin([t(0), t(1), t(10), t(11)])).toBe(10);           // samme tur, to plattformer
    expect(frekvensMin([t(0), t(SAMME_TUR_MIN), t(15)])).toBe(2);       // akkurat på grensen er to turer
    expect(frekvensMin([t(0)])).toBe(Infinity);
    expect(frekvensMin([])).toBeNull();
  });
  it('lesbart og med «ca.»; én avgang sier ingenting', () => {
    expect(frekvensTekst(7)).toBe('ca. hvert 7. min');
    expect(frekvensTekst(13)).toBe('ca. hvert 15. min');
    expect(frekvensTekst(44)).toBe('ca. hvert 45. min');
    expect(frekvensTekst(59)).toBe('ca. hver time');
    expect(frekvensTekst(83)).toBe('ca. hver time');
    expect(frekvensTekst(120)).toBe('ca. hver 2. time');
    expect(frekvensTekst(Infinity)).toBeNull();
    expect(frekvensTekst(null)).toBeNull();
  });
  it('utforskeren tar vare på avgangene den alt har hentet: per linjeretning og stopp, bare ordinært vindu', async () => {
    const r = await res('mortensrud_dag');
    const lr = Object.values(r.grupper.linjeretning);
    expect(lr.every(g => g.avgangerVed && typeof g.avgangerVed === 'object')).toBe(true);
    const tider = lr.flatMap(g => Object.values(g.avgangerVed));
    expect(tider.length).toBeGreaterThan(0);
    // Høyst perLinje per skilt og stopp, sortert.
    expect(tider.every(ts => ts.length <= PARAMETRE.perLinje * 2 && ts.every((x, i) => !i || ts[i - 1] <= x))).toBe(true);
    // Ingen avganger fra «senere i døgnet» (natt): linjeretninger bare med senere-vindu har ingen tider.
    const n = await res('mortensrud_natt');
    for (const g of Object.values(n.grupper.linjeretning)) if (g.vindu.every(v => v === 'senere')) expect(Object.keys(g.avgangerVed)).toHaveLength(0);
  });
  it('ut-frekvensen gjelder ved knutepunktet, ikke ved et annet stopp linja også går fra', () => {
    const resultat = {
      veier: [{ ledd: 2, vindu: 'ordinært', knute: 'K', inn: 'L1>x', directionId: 'L2>y', område: 'N|5–15', opsjon: 'o1' }],
      opsjoner: [{ id: 'o1', destinations: [{ id: 'S', name: 'Sted', lat: 60.2, lon: 10 }] }],
      knutepunkter: { vurdert: [{ id: 'K', navn: 'Knute' }] },
      grupper: { linjeretning: {
        'L1>x': { kode: '1', modus: 'bus', avgangerVed: { A: [t(0), t(20)] } },
        'L2>y': { kode: '2', modus: 'bus', avgangerVed: { K: [t(0), t(30)], A: [t(0), t(5), t(10)] } },
      } },
    };
    const [rad] = ettByttePerRetning(resultat, { lat: 60, lon: 10 }).rader;
    expect(rad.frekvens.ut).toEqual({ 2: 'ca. hvert 30. min' });   // ikke de 5 min ved A
    expect(rad.frekvens.inn).toEqual({ 1: 'ca. hvert 20. min' });  // inn: ved tilgangsstoppet
  });
  it('kortet viser frekvensen ved linja: ut ved knutepunktet', async () => {
    const pos = O.mortensrud_dag.scenario.posisjon;
    const { rader } = ettByttePerRetning(await res('mortensrud_dag'), pos);
    const nø = rader.find(r => r.retning === 'NØ');
    expect(Object.keys(nø.frekvens.ut).length).toBeGreaterThan(0);
    expect(Object.values(nø.frekvens.ut).every(f => /^ca\. hver/.test(f))).toBe(true);
    const hent = avspiller(O.mortensrud_dag).hent, nå = Date.parse(O.mortensrud_dag.scenario.tid);
    ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }); await new Promise(r => setTimeout(r, 50));
    // Én linje: det oftest gående inn og ut, ikke én frekvens per linje.
    const kort = ettBytteHtml(pos, { esc, hent, nå, rerender: () => {} }).split('data-eb-retning="NØ"')[1].split('</button>')[0];
    const best = Object.values(nø.frekvens.ut).sort((a, b) => parseInt(a.replace(/\D/g, ''), 10) - parseInt(b.replace(/\D/g, ''), 10))[0];
    expect(kort).toMatch(/<div class="eb-frekvens">går (inn ca\. [^·<]+ · )?ut /);
    expect(kort).toContain('ut ' + esc(best));
    expect((kort.match(/eb-frekvens/g) || []).length).toBe(1);
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
  it('rammen gir plass til største boble og navnene under den', () => {
    expect(RAMME_VALG.paddingTopLeft[1]).toBeGreaterThanOrEqual(BOBLE_MAKS);
    expect(RAMME_VALG.paddingBottomRight[1]).toBeGreaterThanOrEqual(BOBLE_MAKS + NAVN_NIVÅER * 16); // navnene står under
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
  it('navn ved hver boble: helst under, ned en linje, så til siden — aldri samlet, aldri oppå hverandre', () => {
    const k = (navn, x, antall, y = 0) => ({ navn, x, y, antall });
    const px = q => ({ x: q.x, y: q.y });
    const a = k('Oslo bussterminal', 0, 254), b = k('Nationaltheatret', 40, 192), c = k('Helsfyr', 300, 71);
    const n = plasserNavn([c, b, a], px, () => 10);
    expect(n.size).toBe(3);                                   // hvert knutepunkt sitt navn
    expect(n.get(a)).toEqual({ side: 'under', nivå: 0 });    // størst først, rett under
    expect(n.get(b)).toEqual({ side: 'under', nivå: 1 });    // krasjet: en linje ned
    expect(n.get(c)).toEqual({ side: 'under', nivå: 0 });    // langt unna: rett under
    const ingenKrasj = xs => { const r = xs.map(x => navnRekt(px(x), x.navn, 10, n2.get(x))); for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++) expect(r[i].v < r[j].h && r[j].v < r[i].h && r[i].t < r[j].u && r[j].t < r[i].u).toBe(false); };
    let n2 = n; ingenKrasj([a, b, c]);
    // Mortensrud-tilfellet fra skjermbildet: tre bobler side om side, de små tett på de store.
    const bt = k('Oslo bussterminal', 176, 242, 70), nt = k('Nationaltheatret', 155, 185, 68), hf = k('Helsfyr', 206, 71, 72);
    const rad = q => bobleRadius(q.antall, 242);
    n2 = plasserNavn([bt, nt, hf], px, rad);
    expect(new Set([...n2.values()].map(p => p.side)).has('høyre') || new Set([...n2.values()].map(p => p.side)).has('venstre')).toBe(true);
    const r = [bt, nt, hf].map(x => navnRekt(px(x), x.navn, rad(x), n2.get(x)));
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(r[i].v < r[j].h && r[j].v < r[i].h && r[i].t < r[j].u && r[j].t < r[i].u).toBe(false);
    // Står en annen boble rett under, flyttes navnet forbi den.
    const over = k('Over', 0, 10), under = k('Under', 0, 5, 30);
    expect(plasserNavn([over, under], px, () => 8).get(over)).not.toEqual({ side: 'under', nivå: 0 });
    // Fremhevet først: det valgte knutepunktet får beste plass selv om det er minst.
    const stor = { ...k('Stor', 0, 300), dempet: true }, liten = { ...k('Liten', 5, 10), dempet: false };
    expect(plasserNavn([stor, liten], px, () => 10).get(liten)).toEqual({ side: 'under', nivå: 0 });
    // Ingen plass: merket tvunget.
    const fullt = Array.from({ length: NAVN_PLASSER.length + 1 }, (_, i) => k('Navn ' + i, 0, 100 - i));
    const pf = plasserNavn(fullt, px, () => 10);
    expect([...pf.values()].some(p => p.tvunget)).toBe(true);
    expect([...pf.values()].filter(p => !p.tvunget).length).toBe(NAVN_PLASSER.length);
    // Uten projeksjon: alle rett under.
    expect([...plasserNavn([a, b], null).values()]).toEqual([NAVN_PLASSER[0], NAVN_PLASSER[0]]);
    // Alt opptatt: navnet vises likevel.
    const mange = Array.from({ length: NAVN_PLASSER.length + 2 }, (_, i) => k('Samme sted ' + i, 0, 100 - i));
    expect(plasserNavn(mange, px, () => 10).size).toBe(mange.length);
  });
  it('kartet: hvert knutepunkt har sitt eget navn — i oversikten og med et kort valgt (dempet)', async () => {
    await klar();
    const navnI = f => f.lagt[0].ting.filter(t => t.o && t.o.icon && /eb-kart-etikett/.test(t.o.icon.className));
    const d = ettBytteKartData(pos);
    const knuter = new Map(d.retninger.filter(r => r.knute).map(r => [r.knute.lat + ',' + r.knute.lon, r.knuteNavn]));
    let f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    expect(navnI(f).map(t => [t.ll.join(','), t.o.icon.html.replace(/<[^>]+>/g, '')]).sort()).toEqual([...knuter.entries()].sort());
    expect(navnI(f).every(t => !/·/.test(t.o.icon.html))).toBe(true); // ingen samlet lapp
    expect(navnI(f).every(t => /translate\(-50%,\d+px\)/.test(t.o.icon.html))).toBe(true); // under boblen
    velgRetning('NØ');
    f = falskL();
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    expect(navnI(f)).toHaveLength(knuter.size);
    expect(navnI(f).filter(t => !/dempet/.test(t.o.icon.className)).map(t => t.o.icon.html.replace(/<[^>]+>/g, ''))).toEqual(['Helsfyr']);
  });
  it('med kort valgt: dempede navn uten plass droppes, det valgte står alltid', async () => {
    await klar();
    velgRetning('NØ');
    const f = falskL();
    f.map.latLngToContainerPoint = () => ({ x: 100, y: 100 }); // alle knutepunktene på samme sted
    ettBytteKart(f.map, f.L, { aktiv: true, pos, ramme: () => {} });
    const navn = f.lagt[0].ting.filter(t => t.o && t.o.icon && /eb-kart-etikett/.test(t.o.icon.className));
    const bobler = f.lagt[0].ting.filter(t => t.o && /eb-kart-knute/.test(t.o.className || ''));
    expect(navn.filter(t => !/dempet/.test(t.o.icon.className)).map(t => t.o.icon.html.replace(/<[^>]+>/g, ''))).toEqual(['Helsfyr']);
    expect(navn.length).toBeLessThan(bobler.length);
    // Oversikten: hvert navn vises, også uten plass.
    velgRetning('NØ');
    const g = falskL();
    g.map.latLngToContainerPoint = () => ({ x: 100, y: 100 });
    ettBytteKart(g.map, g.L, { aktiv: true, pos, ramme: () => {} });
    expect(g.lagt[0].ting.filter(t => t.o && t.o.icon && /eb-kart-etikett/.test(t.o.icon.className)).length)
      .toBe(g.lagt[0].ting.filter(t => t.o && /eb-kart-knute/.test(t.o.className || '')).length);
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
