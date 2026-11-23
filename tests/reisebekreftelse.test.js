/**
 * Reisebekreftelsen, trinn 4d delsteg 1: bekreftelsesgrensen. Mot opptak fra
 * Entur via nettverksutforskeren (tests/fixtures/entur/) og syntetiske veier.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { grunnlag, tillatt, UTENFOR, velgRepresentativt, BREDDE, NÆR_DUBLETT_M, NÆR_DUBLETT_REGEL, avstandsbånd, AVSTANDSBÅND_KM, veibekreftelse, sammenlign, oppdagetSignatur, faktiskSignatur, sammeStopp, bekreft, BEKREFT_MØNSTRE, REISESØK, medParent, TIDSKOBLING_IKKE_KONTROLLERT } from '../src/reisebekreftelse.js';
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

/* ------------------------------------------- delsteg 3, verifisering av flere ledd */
describe('delsteg 3: flerleddsammenligning — hver sjekk isolert', () => {
  // Oppdaget: L1 fra A til knutepunkt K, L2 fra K til D.
  const fler = { etapper: [{ linje: 'L1', retning: null, påstigning: 'A', avstigning: 'K' }, { linje: 'L2', retning: null, påstigning: 'K', avstigning: 'D' }] };
  const riktig = () => [etappe('L1', sted('A', null), sted('K', null)), etappe('L2', sted('K', null), sted('D', null))];
  /** Nødvendige sjekker som ikke er true, som «etappe:felt=samsvar». */
  const avvikende = m => sammenlign(fler, mønster(...m)).sjekker.filter(x => x.nødvendig && x.samsvar !== true).map(x => `${x.etappe}:${x.felt}=${x.samsvar}`);
  const endre = (i, f) => { const l = riktig(); l[i] = f(l[i]); return l; };

  it('1. begge etapper samsvarer: ingen avvik, fulgt — strukturelt, uten tidskontroll', () => {
    expect(avvikende(riktig())).toEqual([]);
    expect(sammenlign(fler, mønster(...riktig())).utfall).toBe('fulgt');
    expect(sammenlign(fler, mønster(...riktig())).sjekker.map(x => x.felt)).not.toContain('tid'); // ingen tidsmessig sjekk i delsteg 3
  });
  it('2. feil linje i første etappe: bare linje-ID i etappe 1', () => {
    expect(avvikende(endre(0, l => ({ ...l, serviceJourney: { line: { id: 'LX' } } })))).toEqual(['1:linje-ID=false']);
  });
  it('3. feil linje i andre etappe: bare linje-ID i etappe 2', () => {
    expect(avvikende(endre(1, l => ({ ...l, serviceJourney: { line: { id: 'LX' } } })))).toEqual(['2:linje-ID=false']);
  });
  it('4a. feil påstigning i første etappe: bare påstigning i etappe 1', () => {
    expect(avvikende(endre(0, l => ({ ...l, fromPlace: sted('X', null) })))).toEqual(['1:påstigning (samlestopp)=false']);
  });
  it('4b. feil avstigning i siste etappe (destinasjonen): bare avstigning i etappe 2', () => {
    expect(avvikende(endre(1, l => ({ ...l, toPlace: sted('X', null) })))).toEqual(['2:avstigning (samlestopp)=false']);
  });
  it('6. feil overgang ved avstigning fra første etappe: avstigning 1 og overgangen', () => {
    expect(avvikende(endre(0, l => ({ ...l, toPlace: sted('Z', null) })))).toEqual(['1:avstigning (samlestopp)=false', '2:overgang ved knutepunkt=false']);
  });
  it('7. feil overgang ved påstigning på andre etappe: påstigning 2 og overgangen', () => {
    expect(avvikende(endre(1, l => ({ ...l, fromPlace: sted('Z', null) })))).toEqual(['2:påstigning (samlestopp)=false', '2:overgang ved knutepunkt=false']);
  });
  it('8. ukjent overgang (parent ikke spurt, annen ID): null — ukjent, aldri fulgt eller ikke fulgt', () => {
    const m = endre(0, l => ({ ...l, toPlace: sted('K-barn') }));
    expect(avvikende(m)).toEqual(['1:avstigning (samlestopp)=null', '2:overgang ved knutepunkt=null']);
    expect(sammenlign(fler, mønster(...m)).utfall).toBe('ukjent');
  });
  it('8b. understopp med KJENT parent = knutepunktet: overgangen er true', () => {
    expect(avvikende(endre(0, l => ({ ...l, toPlace: sted('K-barn', 'K') })))).toEqual([]);
  });
  it('9. ulikt antall kollektivetapper: bare antallet (etappene sammenlignes ikke)', () => {
    expect(avvikende([riktig()[0]])).toEqual(['null:antall kollektivetapper=false']);
    expect(avvikende([...riktig(), etappe('L3', sted('D', null), sted('E', null))])).toEqual(['null:antall kollektivetapper=false']);
  });
  it('overgangen er strukturelt avledet: den kan ikke feile uten at avstigning 1 eller påstigning 2 også feiler', () => {
    // Overgangen sammenligner knutepunktet med de SAMME faktiske verdiene som avstigning 1 og påstigning 2,
    // fordi den oppdagede signaturen har knutepunktet som begge. Den er en eksplisitt, lesbar sjekk av byttet,
    // ikke en uavhengig kilde til motstrid. (Tidsmessig gjennomførbarhet er ikke en del av delsteg 3.)
    for (const [a1, p2] of [['K', 'K'], ['Z', 'K'], ['K', 'Z'], ['Z', 'Z'], ['K-barn', 'K']]) {
      const m = [etappe('L1', sted('A', null), a1 === 'K-barn' ? sted(a1) : sted(a1, null)), etappe('L2', sted(p2, null), sted('D', null))];
      const x = sammenlign(fler, mønster(...m)).sjekker;
      const v = felt => x.find(s => s.felt === felt && (felt === 'overgang ved knutepunkt' || true));
      const av1 = x.find(s => s.etappe === 1 && s.felt === 'avstigning (samlestopp)').samsvar;
      const på2 = x.find(s => s.etappe === 2 && s.felt === 'påstigning (samlestopp)').samsvar;
      const ov = v('overgang ved knutepunkt').samsvar;
      expect(ov).toBe(av1 === false || på2 === false ? false : av1 === true && på2 === true ? true : null);
    }
  });
  it('den oppdagede flerleddssignaturen (ekte vei fra Tretten) binder etappene i samme knutepunkt', async () => {
    const r = await resultat('tretten_dag');
    for (const v of r.veier.filter(x => x.ledd === 2).slice(0, 50)) {
      const sig = oppdagetSignatur(v, r);
      expect(sig.etapper).toHaveLength(2);
      expect(sig.etapper[0].avstigning).toBe(v.knute);
      expect(sig.etapper[1].påstigning).toBe(v.knute);
      expect(sig.etapper.every(e => e.linje)).toBe(true);
    }
  });
});

describe('delsteg 3: parent-begrensningen (konservativ)', () => {
  it('undefined = ikke spurt, null = ingen parent — ulike tilstander', () => {
    const f = faktiskSignatur(mønster(etappe('L1', sted('A'), sted('D', null))));
    expect(f.etapper[0].påstigning.parent).toBe(undefined);
    expect(f.etapper[0].avstigning.parent).toBe(null);
  });
  it('manglende parent er ikke motstrid: annen ID uten kjent parent gir null, ikke false', () => {
    expect(sammeStopp('A', { id: 'B', parent: undefined })).toBe(null);
    expect(sammeStopp('A', { id: 'B', parent: null })).toBe(false);
  });
  it('ukjent kan aldri bli fulgt — heller ikke over flere mønstre', async () => {
    const { r, direkte } = await tretten();
    const uklart = mønster(etappe(L141, sted('NSR:StopPlace:annet'), sted(DEST, null)));
    const v = veibekreftelse(direkte, r, [uklart, uklart, uklart]);
    expect(v.undersøkt.mønstre.every(m => m.utfall === 'ukjent')).toBe(true);
    expect(v.påstand.utfall).toBe('ukjent');
  });
});

/* ------------------------------------------------------------ delsteg 4 */
const R = Object.fromEntries(SCENARIOER.map(n => [n, lastOpptak(n + '.reisesok')]));
/** Avspilling av reisesøket: `endre(navn, svar)` kan bytte svaret; `kast` feiler et kall. */
function reiseHent(n, { endre, kast = [] } = {}) {
  const kall = [];
  const hent = async (navn, req) => {
    kall.push({ navn, req });
    if (kast.includes(navn)) throw new Error('nettverksfeil (simulert)');
    const o = R[n].opptak[navn];
    if (!o && endre) return endre(navn, null, req);
    if (!o) throw new Error('mangler i opptaket: ' + navn);
    const svar = JSON.parse(JSON.stringify(o.svar));
    return endre ? endre(navn, svar, req) : svar;
  };
  return { hent, kall };
}
async function kjørBekreft(n, valg = {}, budsjett = 10) {
  const r = await resultat(n);
  const u = velgRepresentativt(r, budsjett);
  const a = reiseHent(n, valg);
  const b = await bekreft(u, r, O[n].scenario, { hent: a.hent, klokke: () => Date.parse('2026-11-23T15:00:00Z') });
  return { r, u, b, kall: a.kall, ops: new Map(r.opsjoner.map(o => [o.id, o])) };
}
const finnB = (k, navn) => k.b.bekreftelser.find(x => k.ops.get(x.opsjon).label === navn);
const fjernParent = (navn, svar) => JSON.parse(JSON.stringify(svar, (key, v) => (key === 'parent' ? undefined : v)));

describe('delsteg 4: reisesøket (opptak)', () => {
  it('koden spør det samme som i opptaket, med parent som probe, tre mønstre og stoppesteds-ID-er', async () => {
    for (const n of SCENARIOER) {
      const { kall } = await kjørBekreft(n);
      expect(kall.map(k => k.navn)).toEqual([REISESØK]);
      expect(kall[0].req.body).toBe(R[n].opptak[REISESØK].forespørsel.body);
      const q = JSON.parse(kall[0].req.body).query;
      expect(q).toContain('stopPlace{id parent{id}}');
      expect((q.match(/numTripPatterns:3 /g) || []).length).toBeGreaterThan(0);
      expect(q).not.toMatch(/numTripPatterns:(?!3 )/);
      expect(q).not.toMatch(/transportMode:air/);
    }
  });
  it('deterministisk avspilling', async () => {
    const a = await kjørBekreft('tretten_dag'); const b = await kjørBekreft('tretten_dag');
    expect(b.b).toEqual(a.b);
  });
  it('et mønster som følger den oppdagede veien: bekreftet opsjon OG fulgt vei', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    const x = finnB(k, 'Gjettum');
    expect(x.opsjonsbekreftelse.state).toBe('confirmed');
    expect(x.veibekreftelse.påstand.utfall).toBe('fulgt');
  });
  it('samme destinasjon, annen vei: opsjonen bekreftet, veien IKKE fulgt — to svar, ikke ett', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    const x = finnB(k, 'Lofsrudhøgda');
    expect(x.opsjonsbekreftelse.state).toBe('confirmed');
    expect(x.veibekreftelse.påstand.utfall).toBe('ikke fulgt');
    expect(x.veibekreftelse.påstand.begrunnelse).toMatch(/ikke at veien er umulig/);
  });
  it('opsjons- og veibekreftelse er adskilte objekter; vei-ID følger begge', async () => {
    for (const n of SCENARIOER) {
      const k = await kjørBekreft(n);
      for (const x of k.b.bekreftelser) {
        expect(Object.keys(x).sort()).toEqual(['opsjon', 'opsjonsbekreftelse', 'vei', 'veibekreftelse', 'øvrigeVeier']); // øvrigeVeier: alternativ B
        expect(x.opsjonsbekreftelse.vei).toBe(x.vei);
        expect(x.veibekreftelse.vei).toBe(x.vei);
        expect(x.opsjonsbekreftelse).not.toHaveProperty('påstand');
        expect(x.veibekreftelse).not.toHaveProperty('state');
      }
    }
  });
  it('opsjonsbekreftelsen følger opsjonsmodellens kontrakt og gjelder bare søkets reisetid', async () => {
    const { gjelderFor } = await import('../src/opsjonsmodell.js');
    const k = await kjørBekreft('ranheim_dag');
    const tid = O.ranheim_dag.scenario.tid;
    for (const x of k.b.bekreftelser) {
      const c = x.opsjonsbekreftelse;
      expect(c.request.travelTime).toBe(new Date(tid).toISOString());
      expect(['confirmed', 'unknown']).toContain(c.state);
      if (c.state === 'confirmed') expect(Date.parse(c.firstDeparture)).toBeGreaterThan(0);
      expect(gjelderFor(c, tid, c.searchedAt)).toBe(true);
      expect(gjelderFor(c, '2026-11-24T14:00:00+01:00', c.searchedAt)).toBe(false);
    }
  });
  it('tomt reisesøk: unknown med grunn (aldri not_feasible), og veien er ukjent', async () => {
    const k = await kjørBekreft('mortensrud_natt');
    const tomme = k.b.bekreftelser.filter(x => x.opsjonsbekreftelse.state === 'unknown');
    expect(tomme.length).toBeGreaterThan(0);
    for (const x of tomme) {
      expect(x.opsjonsbekreftelse.grunn).toMatch(/ikke bevis for at ingen finnes/);
      expect(x.veibekreftelse.påstand.utfall).toBe('ukjent');
    }
    expect(k.b.bekreftelser.some(x => x.opsjonsbekreftelse.state === 'not_feasible')).toBe(false);
  });
  it('flere mønstre med ulike utfall: fulgt når ett av dem følger veien', async () => {
    // Gjettum: bytt de to første mønstrene med et annet (feil linje) — det tredje følger fortsatt.
    const k0 = await kjørBekreft('mortensrud_dag');
    const i = k0.b.bekreftelser.findIndex(x => k0.ops.get(x.opsjon).label === 'Gjettum');
    const k = await kjørBekreft('mortensrud_dag', { endre: (n, svar) => {
      const t = svar.data['t' + i];
      const feil = JSON.parse(JSON.stringify(t.tripPatterns[0]));
      for (const l of feil.legs) if (l.serviceJourney && l.serviceJourney.line) l.serviceJourney.line.id = 'FEIL:Line:0';
      t.tripPatterns = [feil, JSON.parse(JSON.stringify(feil)), t.tripPatterns[2]];
      return svar;
    } });
    const x = finnB(k, 'Gjettum');
    expect(x.veibekreftelse.undersøkt.mønstre.map(m => m.utfall)).toEqual(['ikke fulgt', 'ikke fulgt', 'fulgt']);
    expect(x.veibekreftelse.påstand).toMatchObject({ utfall: 'fulgt', mønster: 2 });
  });
  it('grensen på tre mønstre: flere returnerte mønstre undersøkes ikke', async () => {
    const k = await kjørBekreft('ranheim_dag', { endre: (n, svar) => {
      for (const t of Object.values(svar.data)) if (t && t.tripPatterns && t.tripPatterns.length) t.tripPatterns = [...t.tripPatterns, ...t.tripPatterns, ...t.tripPatterns];
      return svar;
    } });
    expect(BEKREFT_MØNSTRE).toBe(3);
    for (const x of k.b.bekreftelser) expect(x.veibekreftelse.undersøkt.antallMønstre).toBeLessThanOrEqual(3);
    expect(k.b.bekreftelser.some(x => x.veibekreftelse.undersøkt.antallMønstre === 3)).toBe(true);
  });
  it('parent-probe vellykket: understopp med kjent parent gir samsvar', async () => {
    const k = await kjørBekreft('tretten_dag');
    expect(k.b.rapport.parent).toBe('spurt');
    const svar = R.tretten_dag.opptak[REISESØK].svar;
    expect(JSON.stringify(svar)).toMatch(/"parent":/);
    expect(k.b.rapport.vei.fulgt).toBeGreaterThan(0);
  });
  it('parent-probe avvist: reserve uten parent, sagt i notat; manglende parent gir ukjent — aldri flere «fulgt»', async () => {
    const med = await kjørBekreft('mortensrud_dag');
    const k = await kjørBekreft('mortensrud_dag', { endre: (navn, svar, req) => {
      if (navn === REISESØK) return { errors: [{ message: 'Field parent is undefined' }] };
      return fjernParent(navn, R.mortensrud_dag.opptak[REISESØK].svar); // reserven: samme svar uten parent
    } });
    expect(k.kall.map(x => x.navn)).toEqual([REISESØK, REISESØK + ' uten parent']);
    expect(JSON.parse(k.kall[1].req.body).query).not.toContain('parent{id}');
    expect(k.b.rapport.parent).toBe('avvist (reserve)');
    expect(k.b.notater.join(' ')).toMatch(/parent avvist/);
    const fulgtMed = new Set(med.b.bekreftelser.filter(x => x.veibekreftelse.påstand.utfall === 'fulgt').map(x => x.vei));
    for (const x of k.b.bekreftelser) if (x.veibekreftelse.påstand.utfall === 'fulgt') expect(fulgtMed.has(x.vei)).toBe(true);
    // opsjonsbekreftelsen påvirkes ikke av parent
    expect(k.b.bekreftelser.map(x => x.opsjonsbekreftelse.state)).toEqual(med.b.bekreftelser.map(x => x.opsjonsbekreftelse.state));
  });
  it('manglende parent der ID-ene er ulike gir ukjent, ikke ikke fulgt og ikke fulgt', async () => {
    const k = await kjørBekreft('tretten_dag', { endre: fjernParent });
    const sjekker = k.b.bekreftelser.flatMap(x => x.veibekreftelse.undersøkt.mønstre.flatMap(m => m.sjekker));
    const stopp = sjekker.filter(s => /samlestopp/.test(s.felt));
    for (const s of stopp) if (s.faktisk && s.faktisk.id && s.faktisk.id !== s.oppdaget) expect(s.samsvar).toBe(null);
    expect(stopp.some(s => s.samsvar === null)).toBe(true);
  });
  it('kallet feiler: alle unknown med grunn, ingen kandidat tapt, ingen vei fulgt', async () => {
    const k = await kjørBekreft('ranheim_dag', { kast: [REISESØK] });
    expect(k.b.bekreftelser).toHaveLength(k.u.valgt.length);
    for (const x of k.b.bekreftelser) {
      expect(x.opsjonsbekreftelse).toMatchObject({ state: 'unknown', grunn: 'reisesøket svarte ikke' });
      expect(x.veibekreftelse.påstand.utfall).toBe('ukjent');
    }
  });
  it('et alias mangler: den kandidaten er unknown «mangler i svaret», resten står', async () => {
    const k = await kjørBekreft('ranheim_dag', { endre: (n, svar) => { delete svar.data.t0; return svar; } });
    expect(k.b.bekreftelser[0].opsjonsbekreftelse.grunn).toBe('mangler i svaret');
    expect(k.b.bekreftelser.slice(1).every(x => x.opsjonsbekreftelse.state === 'confirmed')).toBe(true);
  });
  it('ingen ukjent blir «fulgt»: fulgt krever et mønster der alle nødvendige sjekker er true', async () => {
    for (const n of SCENARIOER) {
      const k = await kjørBekreft(n);
      for (const x of k.b.bekreftelser) {
        if (x.opsjonsbekreftelse.state !== 'confirmed') expect(x.veibekreftelse.påstand.utfall).toBe('ukjent');
        if (x.veibekreftelse.påstand.utfall === 'fulgt') {
          const m = x.veibekreftelse.undersøkt.mønstre[x.veibekreftelse.påstand.mønster];
          expect(m.sjekker.filter(s => s.nødvendig).every(s => s.samsvar === true)).toBe(true);
        }
      }
    }
  });
  it('oppdagelsesresultatet og utvalget endres ikke', async () => {
    const r = await resultat('nesttun_dag');
    const u = velgRepresentativt(r, 10);
    const før = JSON.stringify([r, u]);
    await bekreft(u, r, O.nesttun_dag.scenario, { hent: reiseHent('nesttun_dag').hent });
    expect(JSON.stringify([r, u])).toBe(før);
  });
  it('medParent endrer bare bekreftelsens spørring', () => {
    expect(medParent('quay{id stopPlace{id}} x quay{id stopPlace{id}}')).toBe('quay{id stopPlace{id parent{id}}} x quay{id stopPlace{id parent{id}}}');
    expect(medParent('quay{id stopPlace{id}}', false)).toBe('quay{id stopPlace{id}}');
  });
});

/* ------------------------------------------- 4d alternativ B: øvrige veier, strukturelt */
describe('4d alternativ B: de samme mønstrene mot opsjonens øvrige oppdagede veier', () => {
  /** Faste verdier fra e456e0a (før B): opsjons- og valgt veibekreftelse skal være uendret. */
  const FØR_B = {
    mortensrud_dag: [{ confirmed: 10 }, { fulgt: 4, 'ikke fulgt': 6 }],
    mortensrud_natt: [{ unknown: 6, confirmed: 4 }, { ukjent: 6, 'ikke fulgt': 3, fulgt: 1 }],
    nesttun_dag: [{ confirmed: 10 }, { fulgt: 5, 'ikke fulgt': 5 }],
    ranheim_dag: [{ confirmed: 10 }, { fulgt: 10 }],
    tretten_dag: [{ confirmed: 9, unknown: 1 }, { fulgt: 8, 'ikke fulgt': 1, ukjent: 1 }],
  };
  it('opsjonsbekreftelsen og veibekreftelsen for valgt vei er uendret; fortsatt ett kall', async () => {
    for (const n of SCENARIOER) {
      const k = await kjørBekreft(n);
      expect([n, k.b.rapport.opsjon, k.b.rapport.vei]).toEqual([n, ...FØR_B[n]]);
      expect(k.kall.map(x => x.navn)).toEqual([REISESØK]);
    }
  });
  it('alle øvrige oppdagede veier til den valgte opsjonen sammenlignes — ikke den valgte selv, ingen andre opsjoners', async () => {
    for (const n of SCENARIOER) {
      const k = await kjørBekreft(n);
      for (const x of k.b.bekreftelser) {
        const alle = k.r.veier.filter(v => v.opsjon === x.opsjon && v.id !== x.vei).map(v => v.id).sort();
        expect(x.øvrigeVeier.map(y => y.vei)).toEqual(alle);
        for (const y of x.øvrigeVeier) expect(y.veibekreftelse.opsjon).toBe(x.opsjon);
      }
    }
  });
  it('samme mønstre gjenbrukes: hver øvrige vei er sammenlignet med nøyaktig mønstrene til den valgte', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    for (const x of k.b.bekreftelser) for (const y of x.øvrigeVeier)
      expect(y.veibekreftelse.undersøkt.antallMønstre).toBe(x.veibekreftelse.undersøkt.antallMønstre);
  });
  it('direkte oppdaget vei mot direkte faktisk reise: øvrige direkte veier kan være fulgt', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    const d = k.b.bekreftelser.flatMap(x => x.øvrigeVeier).filter(y => y.ledd === 1 && y.veibekreftelse.påstand.utfall === 'fulgt');
    expect(d.length).toBeGreaterThan(0);
    for (const y of d) expect(y.tidskobling).toBe('ikke relevant (én etappe)');
  });
  it('flerleddsvei mot faktisk reise med to etapper: Furuset skole fulgt strukturelt — uten påstand om tidskontroll', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    const x = finnB(k, 'Furuset skole');
    expect(x.veibekreftelse.påstand.utfall).toBe('ikke fulgt'); // den valgte direkte veien
    const fler = x.øvrigeVeier.filter(y => y.ledd === 2 && y.veibekreftelse.påstand.utfall === 'fulgt');
    expect(fler.length).toBeGreaterThan(0);
    for (const y of fler) {
      expect(y.tidskobling).toBe(TIDSKOBLING_IKKE_KONTROLLERT);
      expect(y.grense).toBe(UTENFOR.flereLedd);
      const m = y.veibekreftelse.undersøkt.mønstre[y.veibekreftelse.påstand.mønster];
      expect(m.sjekker.find(s => s.felt === 'overgang ved knutepunkt').samsvar).toBe(true);
      expect(JSON.stringify(y.veibekreftelse)).not.toMatch(/tidskontrollert|gjennomførbar/);
    }
    expect(k.b.rapport.strukturelt.flerleddFulgt).toBe(4);
  });
  it('ett mønster følger én oppdaget vei, men ikke en annen, innenfor samme opsjon', async () => {
    const x = finnB(await kjørBekreft('mortensrud_dag'), 'Furuset skole');
    const utfall = new Set(x.øvrigeVeier.map(y => y.veibekreftelse.påstand.utfall));
    expect(utfall.has('fulgt') && utfall.has('ikke fulgt')).toBe(true);
  });
  it('flere mønstre med ulike utfall for samme øvrige vei', async () => {
    const k = await kjørBekreft('mortensrud_dag');
    const blandet = k.b.bekreftelser.flatMap(x => x.øvrigeVeier).find(y => new Set(y.veibekreftelse.undersøkt.mønstre.map(m => m.utfall)).size > 1);
    expect(blandet).toBeTruthy();
  });
  it('flerleddsvei med feil overgang: byttestedet endres i reisen → ikke fulgt, med overgangen som motstrid', async () => {
    const k0 = await kjørBekreft('mortensrud_dag');
    const i = k0.b.bekreftelser.findIndex(x => k0.ops.get(x.opsjon).label === 'Furuset skole');
    const k = await kjørBekreft('mortensrud_dag', { endre: (n, svar) => {
      for (const p of svar.data['t' + i].tripPatterns) {
        const kol = p.legs.filter(l => l.mode !== 'foot');
        if (kol.length === 2) { kol[0].toPlace.quay.stopPlace = { id: 'NSR:StopPlace:FEIL', parent: null }; kol[1].fromPlace.quay.stopPlace = { id: 'NSR:StopPlace:FEIL', parent: null }; }
      }
      return svar;
    } });
    const fler = finnB(k, 'Furuset skole').øvrigeVeier.filter(y => y.ledd === 2);
    expect(fler.every(y => y.veibekreftelse.påstand.utfall === 'ikke fulgt')).toBe(true);
    const m = fler[0].veibekreftelse.undersøkt.mønstre.find(mm => mm.sjekker.some(s => s.felt === 'overgang ved knutepunkt'));
    expect(m.sjekker.find(s => s.felt === 'overgang ved knutepunkt').samsvar).toBe(false);
  });
  it('flerleddsvei med manglende parent: aldri flere «fulgt», og ingen ukjent blir fulgt', async () => {
    const med = await kjørBekreft('mortensrud_dag');
    const uten = await kjørBekreft('mortensrud_dag', { endre: fjernParent });
    const fulgt = k => new Set(k.b.bekreftelser.flatMap(x => x.øvrigeVeier).filter(y => y.veibekreftelse.påstand.utfall === 'fulgt').map(y => y.vei));
    for (const v of fulgt(uten)) expect(fulgt(med).has(v)).toBe(true);
    for (const y of uten.b.bekreftelser.flatMap(x => x.øvrigeVeier)) {
      if (y.veibekreftelse.påstand.utfall !== 'fulgt') continue;
      const m = y.veibekreftelse.undersøkt.mønstre[y.veibekreftelse.påstand.mønster];
      expect(m.sjekker.filter(s => s.nødvendig).every(s => s.samsvar === true)).toBe(true);
    }
  });
  it('flerleddsvei der parent mangler og ID-ene er ulike: ukjent, ikke ikke fulgt', () => {
    const r = syntetiskResultat([{ id: 'v', dest: 'D', quay: 'Q1', parent: 'A' }]);
    r.veier[0] = { ...r.veier[0], ledd: 2, knute: 'K', inn: 'L1>R', directionId: 'L2>S' };
    const m = mønster(etappe('L1', sted('A', null), sted('K-barn')), etappe('L2', sted('K-barn'), sted('D', null)));
    expect(veibekreftelse(r.veier[0], r, [m]).påstand.utfall).toBe('ukjent');
  });
  it('tidsmessig verifisering påstås ikke: ingen ny utfallsverdi, tidskobling eksplisitt for flere ledd', async () => {
    for (const n of SCENARIOER) {
      const k = await kjørBekreft(n);
      for (const y of k.b.bekreftelser.flatMap(x => x.øvrigeVeier)) {
        expect(['fulgt', 'ikke fulgt', 'ukjent']).toContain(y.veibekreftelse.påstand.utfall);
        expect(Object.keys(y.veibekreftelse.påstand).sort()).toEqual(['begrunnelse', 'mønster', 'utfall']);
        if (y.ledd === 2) expect(y.tidskobling).toBe(TIDSKOBLING_IKKE_KONTROLLERT);
      }
    }
  });
  it('når søket er tomt, er alle øvrige veier ukjent', async () => {
    const k = await kjørBekreft('mortensrud_natt');
    for (const x of k.b.bekreftelser.filter(b => b.opsjonsbekreftelse.state === 'unknown'))
      for (const y of x.øvrigeVeier) expect(y.veibekreftelse.påstand.utfall).toBe('ukjent');
  });
});
