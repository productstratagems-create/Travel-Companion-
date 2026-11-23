/**
 * Reisebekreftelsen, trinn 4d delsteg 1: bekreftelsesgrensen. Mot opptak fra
 * Entur via nettverksutforskeren (tests/fixtures/entur/) og syntetiske veier.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { grunnlag, tillatt, UTENFOR, velgRepresentativt, BREDDE, NÆR_DUBLETT_M, NÆR_DUBLETT_REGEL, avstandsbånd, AVSTANDSBÅND_KM, veibekreftelse, sammenlign, oppdagetSignatur, faktiskSignatur, sammeStopp } from '../src/reisebekreftelse.js';
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
    const o = opsjoner.get(oid) || { id: oid, type: 'destination', label: x.dest, timetable: null, origin: x.origin === undefined ? { lat: 60, lon: 10 } : x.origin, destinations: [{ id: x.dest, lat: x.lat ?? 60, lon: x.lon ?? 10 }], accessPoints: [] };
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
    expect(BREDDE).toEqual(['område', 'linjeretning', 'transportform', 'tilgangspunkt', 'knutepunkt', 'avstandsbånd']); // vei-ID (2.2) og destinasjon (2.3) er identitet, ikke dekning
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

/* ------------------------------------------------------------ delsteg 2.1 */
describe('delsteg 2.1: nesten-dublett krever samme tilgangspunkt (samlestopp)', () => {
  // a velges først; n ligger 110 m unna på samme linjeretning og i samme område; f er 2 km unna (fyll).
  const med = (nTilgang) => syntetiskResultat([
    { id: 'a', dest: 'A', lat: 60, lon: 10, quay: 'Q1', parent: 'P1' },
    { id: 'n', dest: 'N', lat: 60.001, lon: 10, ...nTilgang },
    { id: 'f', dest: 'F', lat: 60.02, lon: 10, quay: 'Q1', parent: 'P1' },
  ]);
  it('samme linjeretning, område og nær destinasjon, men annet tilgangspunkt: ikke dublett', () => {
    const u = velgRepresentativt(med({ quay: 'Q9', parent: 'P9' }), 3);
    expect(u.utsatteVeier).toEqual([]);
    expect(u.valgt.every(v => !v.nærDublett)).toBe(true);
    expect(ider(u)).toContain('n');
  });
  it('samme tilgangspunkt og øvrige vilkår: dublett, med full sporbarhet', () => {
    const u = velgRepresentativt(med({ quay: 'Q1', parent: 'P1' }), 2);
    expect(ider(u)).toEqual(['a', 'f']);
    expect(u.utsatteVeier).toEqual([{ vei: 'n', opsjon: 'destination:N', sammenlignetMed: { vei: 'a', opsjon: 'destination:A' }, tilgangspunkt: 'P1', avstandM: 111, regel: NÆR_DUBLETT_REGEL }]);
  });
  it('ulike plattformer ved samme StopPlace er samme tilgangspunkt', () => {
    const u = velgRepresentativt(med({ quay: 'Q2', parent: 'P1' }), 2);
    expect(ider(u)).toEqual(['a', 'f']);
    expect(u.utsatteVeier.map(x => [x.vei, x.tilgangspunkt])).toEqual([['n', 'P1']]);
  });
  it('ukjent samlestopp likestilles aldri — ingen dublett på plattformnøkkel', () => {
    // Begge veiene har ukjent samlestopp (samme plattformnøkkel): null = null skal IKKE gi dublett.
    const r = med({ quay: 'Q1', parent: 'P1' });
    for (const o of r.opsjoner) for (const t of o.accessPoints) { t.quayId = 'Q-ukjent'; t.parentId = undefined; }
    for (const v of r.veier) v.tilgang = 'Q-ukjent|bus|L';
    const u = velgRepresentativt(r, 3);
    expect(u.valgt.every(v => v.dimensjoner.tilgangspunkt === null)).toBe(true);
    expect(u.utsatteVeier).toEqual([]);
  });
  it('opsjon med både dublettvei og alternativ vei velges via den alternative', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: 60, lon: 10, quay: 'Q1', parent: 'P1' },
      { id: 'n1', dest: 'N', lat: 60.001, lon: 10, quay: 'Q1', parent: 'P1' },   // dublett av a
      { id: 'n2', dest: 'N', lat: 60.001, lon: 10, quay: 'Q9', parent: 'P9' },   // annet tilgangspunkt
    ]);
    const u = velgRepresentativt(r, 2);
    expect(u.valgt.map(v => [v.opsjon, v.vei])).toEqual([['destination:A', 'a'], ['destination:N', 'n2']]);
    expect(u.alternativeVeier).toEqual([{ opsjon: 'destination:N', vei: 'n1', grunn: 'samme opsjon undersøkes via vei n2' }]);
    expect(u.utsatteVeier.map(x => x.vei)).toEqual(['n1']); // sporet, ikke slettet
    expect(u.ikkeValgt).toEqual([]);
  });
  it('en opsjon står som «utsatt som dublett» bare når hver vei var dublett', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: 60, lon: 10, quay: 'Q1', parent: 'P1' },
      { id: 'n1', dest: 'N', lat: 60.001, lon: 10, quay: 'Q1', parent: 'P1' },
      { id: 'n2', dest: 'N', lat: 60.001, lon: 10, quay: 'Q9', parent: 'P9' },
      { id: 'z', dest: 'Z', lat: 61, lon: 10, område: 'S|5–15', quay: 'Q8', parent: 'P8', modus: 'rail' },
    ]);
    const u = velgRepresentativt(r, 2);
    expect(u.ikkeValgt).toEqual([{ opsjon: 'destination:N', veier: ['n1', 'n2'], grunn: 'budsjett' }]);
  });
  it('deterministisk uavhengig av inndatarekkefølge, også sporingen', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      for (const nb of [10, 50]) {
        const a = velgRepresentativt(r, nb);
        const b = velgRepresentativt({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() }, nb);
        expect(b.valgt).toEqual(a.valgt);
        expect(b.utsatteVeier).toEqual(a.utsatteVeier);
      }
    }
  });
  it('alle utsatte veier i opptakene har samme tilgangspunkt som veien de ble sammenlignet med', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const u = velgRepresentativt(r, 50);
      const valgt = new Map(u.valgt.map(v => [v.vei, v]));
      for (const x of u.utsatteVeier) {
        expect(valgt.get(x.sammenlignetMed.vei).dimensjoner.tilgangspunkt).toBe(x.tilgangspunkt);
        expect(x.avstandM).toBeLessThanOrEqual(NÆR_DUBLETT_M);
        expect(x.tilgangspunkt).toMatch(/^NSR:StopPlace:/);
      }
    }
  });
});

/* ------------------------------------------------------------ delsteg 2.2 */
const nord = km => 60 + km / 111.2; // breddegrad km nord for (60, 10)
describe('delsteg 2.2: avstandsbånd som dekningsdimensjon', () => {
  it('doblingsbånd, ukjent → null (aldri et eget bånd)', () => {
    const o = { lat: 60, lon: 10 };
    expect(AVSTANDSBÅND_KM).toEqual([0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256]);
    expect(avstandsbånd(o, { lat: nord(0.49), lon: 10 })).toBe('<0,5');
    expect(avstandsbånd(o, { lat: nord(0.51), lon: 10 })).toBe('0,5–1');
    expect(avstandsbånd(o, { lat: nord(20), lon: 10 })).toBe('16–32');
    expect(avstandsbånd(o, { lat: nord(255), lon: 10 })).toBe('128–256');
    expect(avstandsbånd(o, { lat: nord(257), lon: 10 })).toBe('256+');
    expect(avstandsbånd(null, { lat: 60, lon: 10 })).toBe(null);
    expect(avstandsbånd(o, { lat: undefined, lon: 10 })).toBe(null);
  });
  it('regnes fra brukerens utgangspunkt (opsjon.origin), ikke fra tilgangspunkt eller knutepunkt', () => {
    // Tilgangen ligger 30 km unna origin; destinasjonen 1,5 km fra origin → båndet er 1–2, ikke 16–32/32–64.
    const r = syntetiskResultat([{ id: 'a', dest: 'A', lat: nord(1.5), lon: 10 }]);
    r.opsjoner[0].accessPoints[0] = { quayId: 'Q1', parentId: 'P1', mode: 'bus', lat: nord(30), lon: 10 };
    r.veier[0].knute = null;
    expect(velgRepresentativt(r, 1).valgt[0].dimensjoner.avstandsbånd).toBe('1–2');
  });
  it('lik reell dekning, ulike vei-ID-er: avstandsbåndet skiller — ikke ID', () => {
    // a velges først; z (lav id) og y (høy id) er like på alt unntatt bånd; y har nytt bånd.
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: nord(1.5), lon: 10, område: 'N|0–5' },
      { id: 'z', dest: 'B', lat: nord(1.6), lon: 10.01, område: 'N|0–5' },   // samme bånd som a (1–2)
      { id: 'y', dest: 'C', lat: nord(3), lon: 10, område: 'N|0–5' },       // nytt bånd (2–4)
    ]);
    const u = velgRepresentativt(r, 2);
    expect(ider(u)).toEqual(['a', 'y']);
    expect(u.valgt[1].nytt.avstandsbånd).toBe(true);
  });
  it('samme bånd og ingen reell forskjell: ID avgjør deterministisk', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: nord(1), lon: 10 },
      { id: 'q', dest: 'C', lat: nord(1.3), lon: 10.01 },
      { id: 'p', dest: 'B', lat: nord(1.3), lon: 10.02 },
    ]);
    expect(ider(velgRepresentativt(r, 2))).toEqual(['a', 'p']); // destination:B < destination:C
  });
  it('ukjent avstand gir ikke ny dekning; ID avgjør mellom to ukjente', () => {
    const r = syntetiskResultat([
      { id: 'a', dest: 'A', lat: nord(1), lon: 10 },
      { id: 'u', dest: 'B', lat: nord(1.2), lon: 10, origin: null },   // ukjent
      { id: 'k', dest: 'C', lat: nord(3), lon: 10 },                   // kjent, nytt bånd
      { id: 'v', dest: 'D', lat: nord(1.2), lon: 10, origin: null },   // ukjent
    ]);
    const u = velgRepresentativt(r, 4);
    expect(ider(u)).toEqual(['a', 'k', 'u', 'v']);
    expect(u.valgt[2].dimensjoner.avstandsbånd).toBe(null);
    expect(u.valgt[2].nytt.avstandsbånd).toBe(false);
  });
  it('vei-ID bevares som identitet, men er ikke en dekningsdimensjon', async () => {
    const r = await resultat('mortensrud_dag');
    const u = velgRepresentativt(r, 10);
    expect(BREDDE).not.toContain('vei');
    for (const v of u.valgt) { expect(v.dimensjoner.vei).toBe(v.vei); expect(v.nytt).not.toHaveProperty('vei'); }
  });
  it('alle scenarioer, budsjett 10 og 50: deterministisk, alt gjort rede for, identiteter bevart', async () => {
    for (const n of SCENARIOER) {
      const r = await resultat(n);
      const veiIder = new Set(r.veier.map(v => v.id)), opsIder = new Set(r.opsjoner.map(o => o.id));
      for (const nb of [10, 50]) {
        const a = velgRepresentativt(r, nb);
        const b = velgRepresentativt({ ...r, veier: [...r.veier].reverse(), opsjoner: [...r.opsjoner].reverse() }, nb);
        expect(b.valgt).toEqual(a.valgt);
        expect(b.utsatteVeier).toEqual(a.utsatteVeier);
        for (const v of a.valgt) { expect(veiIder.has(v.vei)).toBe(true); expect(opsIder.has(v.opsjon)).toBe(true); }
        const tillatte = a.grunnlag.kandidater.reduce((s, k) => s + k.veier.length, 0);
        expect(a.valgt.length + a.alternativeVeier.length + a.ikkeValgt.reduce((s, k) => s + k.veier.length, 0)).toBe(tillatte);
      }
    }
  });
});

/* ------------------------------------------------------------ delsteg 2.3 */
/**
 * Faste referanser: opsjonene valgt ved budsjett 10, målt på koden FØR 2.3
 * (commit 98f058d) mot opptakene. Ikke generert fra koden som testes — 2.3 er
 * en ren semantisk endring og skal gi nøyaktig samme utvalg.
 */
const REFERANSE_10 = {
  mortensrud_dag: ['4007', '5620', '5695', '5726', '5738', '58225', '4029', '5794', '5811', '58211'],
  mortensrud_natt: ['5620', '5697', '5734', '5794', '5807', '58211', '5821', '5879', '5695', '58225'],
  nesttun_dag: ['28881', '29815', '29359', '29172', '29431', '29830', '31275', '31438', '32120', '28911'],
  ranheim_dag: ['144', '41715', '42376', '43682', '58790', '60047', '41800', '416', '42157', '58936'],
  tretten_dag: ['12523', '12697', '12692', '12702', '13784', '13781', '12792', '12527', '12529', '12532'],
};
describe('delsteg 2.3: destinasjon er identitet, ikke dekning', () => {
  it('BREDDE inneholder verken destinasjon eller vei', () => {
    expect(BREDDE).not.toContain('destinasjon');
    expect(BREDDE).not.toContain('vei');
    expect(BREDDE[BREDDE.length - 1]).toBe('avstandsbånd');
  });
  it('utvalget er nøyaktig det samme som før 2.3 (faste referanser)', async () => {
    for (const [n, ref] of Object.entries(REFERANSE_10)) {
      const u = velgRepresentativt(await resultat(n), 10);
      expect([n, u.valgt.map(v => v.opsjon)]).toEqual([n, ref.map(x => `destination:NSR:StopPlace:${x}`)]);
    }
  });
  it('opsjons- og destinasjonsidentitet og vei-ID bevares i hver valgt kandidat', async () => {
    const r = await resultat('nesttun_dag');
    const veier = new Map(r.veier.map(v => [v.id, v]));
    for (const v of velgRepresentativt(r, 10).valgt) {
      expect(v.dimensjoner.destinasjon).toBe(v.opsjon);
      expect(v.dimensjoner.vei).toBe(v.vei);
      expect(veier.get(v.vei).opsjon).toBe(v.opsjon);
      expect(v.nytt).not.toHaveProperty('destinasjon');
      expect(v.nytt).not.toHaveProperty('vei');
    }
  });
  it('samme opsjon velges aldri to ganger, og de andre veiene til den spores som alternative', async () => {
    for (const n of SCENARIOER) {
      const u = velgRepresentativt(await resultat(n), 50);
      expect(new Set(u.valgt.map(v => v.opsjon)).size).toBe(u.valgt.length);
      const valgtVei = new Map(u.valgt.map(v => [v.opsjon, v.vei]));
      for (const a of u.alternativeVeier) {
        expect(valgtVei.has(a.opsjon)).toBe(true);
        expect(a.vei).not.toBe(valgtVei.get(a.opsjon));
        expect(a.grunn).toBe(`samme opsjon undersøkes via vei ${valgtVei.get(a.opsjon)}`);
      }
      const forventet = u.grunnlag.kandidater.filter(k => valgtVei.has(k.opsjon)).reduce((s, k) => s + k.veier.length - 1, 0);
      expect(u.alternativeVeier.length).toBe(forventet);
    }
  });
  it('syntetisk: to veier til samme opsjon gir én valgt og én alternativ — ikke to valg', () => {
    const r = syntetiskResultat([{ id: 'v1', dest: 'A' }, { id: 'v2', dest: 'A', quay: 'Q2', parent: 'P2', område: 'S|5–15' }]);
    const u = velgRepresentativt(r, 5);
    expect(u.valgt.map(v => v.opsjon)).toEqual(['destination:A']);
    expect(u.alternativeVeier.map(a => a.vei)).toEqual([u.valgt[0].vei === 'v1' ? 'v2' : 'v1']);
  });
});

/* ------------------------------------------------------------ delsteg 3 */
// Faktiske reisemønstre i formen fra tripGQL med stoppesteds-ID-er (syntetiske; reisesøk tas ikke opp ennå).
const sted = (id, parent) => ({ quay: { id: 'Q:' + id, stopPlace: parent === undefined ? { id } : { id, parent: parent === null ? null : { id: parent } } } });
const etappe = (linje, fra, til, retning = null, o = {}) => ({ mode: 'bus', serviceJourney: { id: 'SJ', line: { id: linje } }, fromPlace: fra, toPlace: til, fromEstimatedCall: retning ? { destinationDisplay: { frontText: retning } } : {}, ...o });
const gange = { mode: 'foot' };
const mønster = (...legs) => ({ legs: [gange, ...legs, gange] });

const TILG = 'NSR:StopPlace:12692', KNUTE = 'NSR:StopPlace:12523', DEST = 'NSR:StopPlace:14115', L141 = 'INN:Line:141';
async function tretten() {
  const r = await resultat('tretten_dag');
  const direkte = r.veier.find(v => v.opsjon === `destination:${DEST}` && v.ledd === 1 && v.vindu === 'ordinært');
  const fler = r.veier.find(v => v.opsjon === `destination:${DEST}` && v.ledd === 2 && v.knute === KNUTE);
  return { r, direkte, fler };
}

describe('delsteg 3: oppdaget signatur (funnet)', () => {
  it('direkte vei: linje fra linjeretningen, påstigning = tilgangens SAMLESTOPP (ikke plattform), avstigning = destinasjonen', async () => {
    const { r, direkte } = await tretten();
    expect(direkte.tilgang.startsWith('NSR:Quay:')).toBe(true);
    const sig = oppdagetSignatur(direkte, r);
    expect(sig.etapper).toEqual([{ linje: L141, retning: 'Lillehammer', påstigning: TILG, avstigning: DEST }]);
    expect(sig.mangler).toEqual([]);
  });
  it('flerleddsvei: to etapper bundet sammen i knutepunktet', async () => {
    const { r, fler } = await tretten();
    const sig = oppdagetSignatur(fler, r);
    expect(sig.etapper.map(e => [e.påstigning, e.avstigning])).toEqual([[TILG, KNUTE], [KNUTE, DEST]]);
    expect(sig.knuter).toEqual([KNUTE]);
  });
  it('plattform som ikke finnes i tilgangspunktene gir null og står i mangler', async () => {
    const { r, direkte } = await tretten();
    const sig = oppdagetSignatur({ ...direkte, tilgang: 'NSR:Quay:ukjent|bus|X' }, r);
    expect(sig.etapper[0].påstigning).toBe(null);
    expect(sig.mangler[0]).toMatch(/tilgangens samlestopp/);
  });
});

describe('delsteg 3: stoppsammenligning (treverdi)', () => {
  it('samme StopPlace, plattform under samme StopPlace, eller understopp med kjent parent: true', () => {
    expect(sammeStopp('A', { id: 'A', parent: undefined })).toBe(true);
    expect(sammeStopp('A', { id: 'A-barn', parent: 'A' })).toBe(true);
  });
  it('ulik med kjent parent: false; ulik uten spurt parent: null (kan være understopp)', () => {
    expect(sammeStopp('A', { id: 'B', parent: null })).toBe(false);
    expect(sammeStopp('A', { id: 'B', parent: 'C' })).toBe(false);
    expect(sammeStopp('A', { id: 'B', parent: undefined })).toBe(null);
  });
  it('manglende ID: null', () => {
    expect(sammeStopp(null, { id: 'A' })).toBe(null);
    expect(sammeStopp('A', { id: null })).toBe(null);
  });
});

describe('delsteg 3: sammenligning per mønster og veibekreftelse', () => {
  const direkteSig = { etapper: [{ linje: 'L1', retning: 'R', påstigning: 'A', avstigning: 'D' }] };
  const flerSig = { etapper: [{ linje: 'L1', retning: 'R', påstigning: 'A', avstigning: 'K' }, { linje: 'L2', retning: 'S', påstigning: 'K', avstigning: 'D' }] };
  const utfall = (sig, m) => sammenlign(sig, m).utfall;
  it('fullstendig samsvar: fulgt (plattformer under samme StopPlace teller)', () => {
    expect(utfall(direkteSig, mønster(etappe('L1', sted('A-plattform', 'A'), sted('D', null), 'R')))).toBe('fulgt');
  });
  it('ulik linje-ID: ikke fulgt', () => {
    expect(utfall(direkteSig, mønster(etappe('L9', sted('A', null), sted('D', null), 'R')))).toBe('ikke fulgt');
  });
  it('ulik påstigning: ikke fulgt', () => {
    expect(utfall(direkteSig, mønster(etappe('L1', sted('X', null), sted('D', null), 'R')))).toBe('ikke fulgt');
  });
  it('ulik avstigning (samme linje): ikke fulgt', () => {
    expect(utfall(direkteSig, mønster(etappe('L1', sted('A', null), sted('Y', null), 'R')))).toBe('ikke fulgt');
  });
  it('flere ledd: riktig overgang gir fulgt; feil knutepunkt gir ikke fulgt', () => {
    expect(utfall(flerSig, mønster(etappe('L1', sted('A', null), sted('K', null)), etappe('L2', sted('K', null), sted('D', null))))).toBe('fulgt');
    const feil = sammenlign(flerSig, mønster(etappe('L1', sted('A', null), sted('Z', null)), etappe('L2', sted('Z', null), sted('D', null))));
    expect(feil.utfall).toBe('ikke fulgt');
    expect(feil.sjekker.find(x => x.felt === 'overgang ved knutepunkt').samsvar).toBe(false);
  });
  it('overgangen alene: riktige linjer og ender, men byttet skjer et annet sted → ikke fulgt', () => {
    const m = mønster(etappe('L1', sted('A', null), sted('K', null)), etappe('L2', sted('K2', null), sted('D', null)));
    const x = sammenlign(flerSig, m);
    expect(x.sjekker.find(s => s.felt === 'overgang ved knutepunkt').samsvar).toBe(false);
    expect(x.utfall).toBe('ikke fulgt');
  });
  it('ekstra etappe etter en ellers samsvarende etappe: ikke fulgt (antallet avgjør)', () => {
    const x = sammenlign(direkteSig, mønster(etappe('L1', sted('A', null), sted('D', null)), etappe('L2', sted('D', null), sted('E', null))));
    expect(x.sjekker.find(s => s.felt === 'antall kollektivetapper').samsvar).toBe(false);
    expect(x.utfall).toBe('ikke fulgt');
  });
  it('ulikt antall etapper: ikke fulgt', () => {
    expect(utfall(direkteSig, mønster(etappe('L1', sted('A', null), sted('K', null)), etappe('L2', sted('K', null), sted('D', null))))).toBe('ikke fulgt');
  });
  it('manglende StopPlace-ID eller linje-ID: ukjent — aldri fulgt', () => {
    expect(utfall(direkteSig, mønster(etappe('L1', {}, sted('D', null), 'R')))).toBe('ukjent');
    expect(utfall(direkteSig, mønster({ ...etappe('L1', sted('A', null), sted('D', null)), serviceJourney: {} }))).toBe('ukjent');
    expect(utfall({ etapper: [{ linje: 'L1', retning: 'R', påstigning: null, avstigning: 'D' }] }, mønster(etappe('L1', sted('A', null), sted('D', null))))).toBe('ukjent');
  });
  it('delvis samsvar (alt true unntatt ett null) gir ukjent; parent ikke spurt og annen ID gir null', () => {
    const x = sammenlign(direkteSig, mønster(etappe('L1', sted('A-barn'), sted('D', null), 'R')));
    expect(x.sjekker.find(s => s.felt === 'påstigning (samlestopp)').samsvar).toBe(null);
    expect(x.utfall).toBe('ukjent');
    expect(x.begrunnelse).toMatch(/utilstrekkelige data/);
  });
  it('bare retningstekst avviker: fortsatt fulgt, med merknad; retning er aldri nødvendig', () => {
    const x = sammenlign(direkteSig, mønster(etappe('L1', sted('A', null), sted('D', null), 'Annet')));
    expect(x.utfall).toBe('fulgt');
    expect(x.merknader[0]).toMatch(/retningstekst avviker/);
    expect(x.sjekker.find(s => s.felt === 'retning (supplerende)').nødvendig).toBe(false);
  });
  it('samme destinasjon, annen vei: ikke fulgt', async () => {
    const { r, direkte } = await tretten();
    const annenLinje = mønster(etappe('INN:Line:142', sted(TILG, null), sted(DEST, null)));
    const annenTilgang = mønster(etappe(L141, sted('NSR:StopPlace:12792', null), sted(DEST, null)));
    expect(veibekreftelse(direkte, r, [annenLinje]).påstand.utfall).toBe('ikke fulgt');
    expect(veibekreftelse(direkte, r, [annenTilgang]).påstand.utfall).toBe('ikke fulgt');
  });
  it('flere mønstre: fulgt i mønster 2; ikke fulgt i alle sier «ikke umulig»; ett ukjent hindrer «ikke fulgt»', async () => {
    const { r, direkte } = await tretten();
    const feil = mønster(etappe('INN:Line:142', sted(TILG, null), sted(DEST, null)));
    const rett = mønster(etappe(L141, sted('NSR:StopPlace:12692-barn', TILG), sted(DEST, null)));
    const uklart = mønster(etappe(L141, sted('NSR:StopPlace:annet'), sted(DEST, null)));
    const a = veibekreftelse(direkte, r, [feil, feil, rett]);
    expect(a.påstand).toMatchObject({ utfall: 'fulgt', mønster: 2 });
    const b = veibekreftelse(direkte, r, [feil, feil]);
    expect(b.påstand.utfall).toBe('ikke fulgt');
    expect(b.påstand.begrunnelse).toMatch(/2 undersøkte mønstrene — det betyr ikke at veien er umulig/);
    expect(veibekreftelse(direkte, r, [feil, uklart]).påstand.utfall).toBe('ukjent');
  });
  it('ingen mønstre: ukjent', async () => {
    const { r, direkte } = await tretten();
    expect(veibekreftelse(direkte, r, []).påstand).toEqual({ utfall: 'ukjent', mønster: null, begrunnelse: 'ingen mønstre å sammenligne' });
  });
  it('flerleddsvei fra opptaket: riktig mønster gir fulgt', async () => {
    const { r, fler } = await tretten();
    const inn = linjeretningLinje(fler.inn), ut = linjeretningLinje(fler.directionId);
    const m = mønster(etappe(inn, sted(TILG, null), sted(KNUTE, null)), etappe(ut, sted(KNUTE, null), sted(DEST, null)));
    expect(veibekreftelse(fler, r, [m]).påstand.utfall).toBe('fulgt');
  });
  it('svaret skiller funnet / undersøkt / påstand og er etterprøvbart', async () => {
    const { r, direkte } = await tretten();
    const v = veibekreftelse(direkte, r, [mønster(etappe(L141, sted(TILG, null), sted(DEST, null), 'Lillehammer'))]);
    expect(Object.keys(v).sort()).toEqual(['funnet', 'opsjon', 'påstand', 'undersøkt', 'vei']);
    expect(v.opsjon).toBe(direkte.opsjon); expect(v.vei).toBe(direkte.id);
    const m = v.undersøkt.mønstre[0];
    expect(m.mønster).toBe(0);
    for (const x of m.sjekker) expect(Object.keys(x).sort()).toEqual(['etappe', 'faktisk', 'felt', 'nødvendig', 'oppdaget', 'samsvar']);
    // rekonstruer utfallet fra sjekkene alene
    const nød = m.sjekker.filter(x => x.nødvendig);
    expect(nød.every(x => x.samsvar === true)).toBe(m.utfall === 'fulgt');
  });
  it('faktiskSignatur hopper over gange og holder «parent ikke spurt» adskilt fra «ingen parent»', () => {
    const f = faktiskSignatur(mønster(etappe('L1', sted('A'), sted('D', null))));
    expect(f.etapper).toHaveLength(1);
    expect(f.etapper[0].påstigning).toEqual({ id: 'A', parent: undefined });
    expect(f.etapper[0].avstigning).toEqual({ id: 'D', parent: null });
  });
});
const linjeretningLinje = d => d.slice(0, d.indexOf('>'));
