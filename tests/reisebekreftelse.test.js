/**
 * Reisebekreftelsen, trinn 4d delsteg 1: bekreftelsesgrensen. Mot opptak fra
 * Entur via nettverksutforskeren (tests/fixtures/entur/) og syntetiske veier.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { grunnlag, tillatt, UTENFOR, velgRepresentativt, BREDDE, NÆR_DUBLETT_M } from '../src/reisebekreftelse.js';
import { utforsk, _tømCache } from '../src/nettverksutforsker.js';
import { SCENARIOER, lastOpptak, avspiller } from './fixtures/entur/avspilling.js';

const O = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n)]));
const resultat = async n => { _tømCache(); return utforsk(O[n].scenario, { hent: avspiller(O[n]).hent }); };
beforeEach(() => _tømCache());

const T = '2026-11-24T12:05:00+01:00';
const direkte = (o = {}) => ({ id: 'v', opsjon: 'destination:X', ledd: 1, knute: null, inn: null, vindu: 'ordinært', avgang: T, ...o });
const fler = (o = {}) => ({ id: 'w', opsjon: 'destination:X', ledd: 2, knute: 'NSR:StopPlace:K', inn: 'L>R', vindu: 'ordinært', avgang: T, ...o });

describe('tillatelsesregelen per vei', () => {
  it('direkte ordinær og direkte utvidet er tillatt', () => {
    expect(tillatt(direkte(), {})).toEqual({ tillatt: true });
    expect(tillatt(direkte({ vindu: 'utvidet' }), {})).toEqual({ tillatt: true });
  });
  it('flere ledd er utenfor — også med ordinær inngang og uten tidsforskyvning-merke', () => {
    expect(tillatt(fler(), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
    expect(tillatt(fler({ vindu: 'utvidet', tidsforskyvning: 'x' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
  });
  it('flere ledd slippes inn først når overgangen er tidsmessig kontrollert (lag 2)', () => {
    expect(tillatt(fler({ tidskobling: { status: 'kontrollert' } }), {})).toEqual({ tillatt: true });
    expect(tillatt(fler({ tidskobling: { status: 'ukjent' } }), {})).toEqual({ tillatt: false, grunn: UTENFOR.flereLedd });
  });
  it('senere og not_now er utenfor', () => {
    expect(tillatt(direkte({ vindu: 'senere' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.senere });
    expect(tillatt(direkte(), { timetable: 'not_now' })).toEqual({ tillatt: false, grunn: UTENFOR.senere });
  });
  it('manglende eller ukjent metadata slipper ikke gjennom', () => {
    for (const v of [direkte({ vindu: undefined }), direkte({ vindu: 'nå' }), direkte({ ledd: undefined }), direkte({ ledd: 3 }), direkte({ knute: 'K' }), fler({ inn: null }), null])
      expect(tillatt(v, {})).toEqual({ tillatt: false, grunn: UTENFOR.ukjentTid });
    expect(tillatt(direkte({ avgang: undefined }), {})).toEqual({ tillatt: false, grunn: UTENFOR.manglerAvgang });
    expect(tillatt(direkte({ avgang: 'snart' }), {})).toEqual({ tillatt: false, grunn: UTENFOR.manglerAvgang });
  });
});

describe('grunnlaget for et oppdagelsesresultat', () => {
  it('endrer ikke oppdagelsesresultatet', async () => {
    const r = await resultat('tretten_dag');
    const før = JSON.stringify(r);
    grunnlag(r);
    expect(JSON.stringify(r)).toBe(før);
  });
  it('Lillehammer skysstasjon (Tretten): kandidat via de 4 direkte veiene; 54 utenfor per vei, med grunn', async () => {
    const r = await resultat('tretten_dag');
    const g = grunnlag(r);
    const k = g.kandidater.find(x => x.opsjon === 'destination:NSR:StopPlace:14115');
    expect(k.veier).toHaveLength(4);
    const veier = new Map(r.veier.map(v => [v.id, v]));
    expect(k.veier.every(id => veier.get(id).ledd === 1 && ['ordinært', 'utvidet'].includes(veier.get(id).vindu))).toBe(true);
    expect(new Set(k.veier.map(id => veier.get(id).vindu))).toEqual(new Set(['ordinært', 'utvidet']));
    const per = {}; for (const u of k.utenforVeier) per[u.grunn] = (per[u.grunn] || 0) + 1;
    expect(per).toEqual({ [UTENFOR.flereLedd]: 50, [UTENFOR.senere]: 4 });
  });
  it('alle veier er gjort rede for: tillatte + utenfor = alle', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const g = grunnlag(r);
      const utenforVeier = g.kandidater.reduce((s, k) => s + k.utenforVeier.length, 0) + g.utenfor.reduce((s, u) => s + u.veier.length, 0);
      expect(g.tellinger.tillatteVeier + utenforVeier).toBe(r.veier.length);
      expect(g.tellinger.veier).toBe(r.veier.length);
    }
  });
  it('ingen flerleddsvei og ingen senere vei er tillatt i noen scenario', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const veier = new Map(r.veier.map(v => [v.id, v]));
      for (const k of grunnlag(r).kandidater) for (const id of k.veier) {
        expect(veier.get(id).ledd).toBe(1);
        expect(veier.get(id).vindu).not.toBe('senere');
      }
    }
  });
  it('en opsjon uten tillatte veier står utenfor — fortsatt i resultatet', async () => {
    const r = await resultat('tretten_dag');
    const g = grunnlag(r);
    expect(g.utenfor.length).toBeGreaterThan(0);
    const ider = new Set(r.opsjoner.map(o => o.id));
    for (const u of g.utenfor) { expect(ider.has(u.opsjon)).toBe(true); expect(u.grunn).toBeTruthy(); }
  });
  it('byene: bare de direkte veiene fra ledd 1 er grunnlag', async () => {
    const r = await resultat('mortensrud_dag');
    const g = grunnlag(r);
    expect(g.tellinger.tillatteVeier).toBe(r.veier.filter(v => v.ledd === 1).length);
    expect(g.tellinger.utenforPerGrunn).toEqual({ [UTENFOR.flereLedd]: r.veier.filter(v => v.ledd === 2).length });
  });
  it('deterministisk og uavhengig av rekkefølgen veiene kom i', async () => {
    const r = await resultat('ranheim_dag');
    const a = grunnlag(r);
    const b = grunnlag({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() });
    expect(b).toEqual(a);
  });
});

/* ------------------------------------------------------------ delsteg 2 */
/** Syntetisk resultat: hver vei { id, dest, lat, lon, område, lr, modus, quay, parent, knute?, ledd?, vindu? }. */
function syntetiskResultat(spes) {
  const opsjoner = new Map(), veier = [];
  for (const x of spes) {
    const oid = `destination:${x.dest}`;
    const o = opsjoner.get(oid) || { id: oid, type: 'destination', label: x.dest, timetable: null, destinations: [{ id: x.dest, lat: x.lat ?? 60, lon: x.lon ?? 10 }], accessPoints: [] };
    o.accessPoints.push({ quayId: x.quay || 'Q1', parentId: x.parent || 'P1', mode: x.modus || 'bus' });
    opsjoner.set(oid, o);
    veier.push({ id: x.id, opsjon: oid, ledd: x.ledd ?? 1, knute: x.knute ?? null, inn: x.inn ?? null, vindu: x.vindu || 'ordinært', avgang: T,
      tilgang: `${x.quay || 'Q1'}|${x.modus || 'bus'}|L`, directionId: x.lr || 'L>R', område: x.område || 'N|0–5' });
  }
  return { opsjoner: [...opsjoner.values()], veier };
}
const ider = u => u.valgt.map(v => v.vei);

describe('delsteg 2: representativ utvelgelse', () => {
  it('prioriteringsrekkefølgen følges dimensjon for dimensjon', () => {
    // a valgt først (id). Deretter: b gir nytt område; c gir ny linjeretning; d bare ny destinasjon.
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', område: 'N|0–5', lr: 'L1>R' },
      { id: 'd', dest: 'D', område: 'N|0–5', lr: 'L1>R', lat: 61 },
      { id: 'c', dest: 'C', område: 'N|0–5', lr: 'L2>R', lat: 62 },
      { id: 'b', dest: 'B', område: 'S|5–15', lr: 'L1>R', lat: 63 },
    ]);
    expect(ider(velgRepresentativt(r, 4))).toEqual(['a', 'b', 'c', 'd']);
    expect(BREDDE).toEqual(['område', 'linjeretning', 'destinasjon', 'transportform', 'tilgangspunkt', 'knutepunkt', 'vei']);
  });
  it('ny transportform går foran nytt tilgangspunkt; nytt tilgangspunkt foran bare ny destinasjon', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A' },
      { id: 'x', dest: 'X', lat: 61 },                             // bare ny destinasjon
      { id: 'y', dest: 'Y', lat: 62, quay: 'Q2', parent: 'P2' },  // nytt tilgangspunkt
      { id: 'z', dest: 'Z', lat: 63, modus: 'rail', quay: 'Q1' }, // ny transportform
    ]);
    expect(ider(velgRepresentativt(r, 4))).toEqual(['a', 'z', 'y', 'x']);
  });
  it('id avgjør bare når alle dimensjonene er like', () => {
    const r = syntetiskResultat([{ id: 'v2', dest: 'B', lat: 61, område: 'S|0–5' }, { id: 'v1', dest: 'A', lat: 62, område: 'S|0–5' }]);
    expect(ider(velgRepresentativt(r, 1))).toEqual(['v1']); // destination:A < destination:B
    const r2 = syntetiskResultat([{ id: 'v2', dest: 'B', område: 'S|0–5' }, { id: 'v1', dest: 'A', område: 'N|0–5' }, { id: 'v0', dest: 'C', område: 'N|0–5', lat: 61 }]);
    expect(ider(velgRepresentativt(r2, 2))[1]).toBe('v2'); // nytt område slår lavere id
  });
  it('deterministisk uavhengig av inndataenes rekkefølge', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const a = velgRepresentativt(r);
      const b = velgRepresentativt({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() });
      expect(b.valgt).toEqual(a.valgt);
      expect(b.ikkeValgt.map(x => x.opsjon)).toEqual(a.ikkeValgt.map(x => x.opsjon));
    }
  });
  it('nesten-dubletter utsettes, men fortrenger ikke ny bredde — og fjernes ikke', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: 60, lon: 10 },
      { id: 'n', dest: 'N', lat: 60.001, lon: 10 },                       // ~110 m, samme lr og område
      { id: 'f', dest: 'F', lat: 60.02, lon: 10 },                        // ~2 km, samme lr og område
    ]);
    const u = velgRepresentativt(r, 2);
    expect(ider(u)).toEqual(['a', 'f']);
    expect(u.ikkeValgt).toEqual([{ opsjon: 'destination:N', veier: ['n'], grunn: 'budsjett (nær dublett av destination:A, utsatt)' }]);
    expect(ider(velgRepresentativt(r, 3))).toEqual(['a', 'f', 'n']); // valgt når ingenting annet gjenstår
    expect(velgRepresentativt(r, 3).valgt[2].nærDublett).toBe(true);
    expect(NÆR_DUBLETT_M).toBe(300);
  });
  it('flere veier til samme opsjon gir én valgt vei; de andre bevares som alternative veier', () => {
    const r = syntetiskResultat([{ id: 'v1', dest: 'A' }, { id: 'v2', dest: 'A', quay: 'Q2', parent: 'P2' }, { id: 'w', dest: 'B', lat: 61 }]);
    const u = velgRepresentativt(r, 10);
    expect(u.valgt.map(v => v.opsjon)).toEqual(['destination:A', 'destination:B']);
    expect(u.alternativeVeier).toEqual([{ opsjon: 'destination:A', vei: 'v2', grunn: 'samme opsjon undersøkes via vei v1' }]);
  });
  it('alt er gjort rede for, og budsjettet tar ingenting ut av oppdagelsesresultatet', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const før = JSON.stringify(r);
      const u = velgRepresentativt(r);
      expect(JSON.stringify(r)).toBe(før);
      const tillatte = u.grunnlag.kandidater.flatMap(k => k.veier.map(v => `${k.opsjon}#${v}`)).sort();
      const gjort = [...u.valgt.map(v => `${v.opsjon}#${v.vei}`), ...u.alternativeVeier.map(v => `${v.opsjon}#${v.vei}`), ...u.ikkeValgt.flatMap(k => k.veier.map(v => `${k.opsjon}#${v}`))].sort();
      expect(gjort).toEqual(tillatte);
      expect(u.valgt.length).toBe(Math.min(10, u.grunnlag.kandidater.length));
      expect(new Set(u.valgt.map(v => v.opsjon)).size).toBe(u.valgt.length);
      expect(u.grunnlag.utenfor.length + u.grunnlag.kandidater.length).toBe(r.opsjoner.filter(o => o.type === 'destination').length);
    }
  });
  it('veier som ikke er tillatt i delsteg 1 slipper aldri inn', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const veier = new Map(r.veier.map(v => [v.id, v]));
      const ops = new Map(r.opsjoner.map(o => [o.id, o]));
      for (const v of velgRepresentativt(r, 50).valgt) expect(tillatt(veier.get(v.vei), ops.get(v.opsjon))).toEqual({ tillatt: true });
    }
    const r = syntetiskResultat([{ id: 'fl', dest: 'A', ledd: 2, knute: 'K', inn: 'X>Y' }, { id: 'sen', dest: 'B', vindu: 'senere', lat: 61 }, { id: 'ok', dest: 'C', lat: 62 }]);
    expect(ider(velgRepresentativt(r, 10))).toEqual(['ok']);
  });
  it('Tretten: bestillingstaxi og buss 142 kommer med; bredde før gjentakelse', async () => {
    const r = await resultat('tretten_dag');
    const u = velgRepresentativt(r);
    const lr = u.valgt.map(v => v.dimensjoner.linjeretning);
    expect(lr.some(x => /:5035>/.test(x))).toBe(true);
    expect(lr.some(x => /:142>/.test(x))).toBe(true);
    // grådig og leksikografisk: nyhetsvektorene (i BREDDE-rekkefølge) faller aldri
    const vek = u.valgt.filter(v => !v.nærDublett).map(v => BREDDE.map(b => (v.nytt[b] ? 1 : 0)).join(''));
    expect(vek).toEqual([...vek].sort().reverse());
  });
});
