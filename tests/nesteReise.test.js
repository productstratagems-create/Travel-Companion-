// Neste sannsynlige reise i auto-reise: fuzzy tid og retning, og brukeren kan validere.
// Bestilt: «auto-reise informerer om hva den tror er brukers neste reise … indikere fuzzy tid
// og retning for neste reise. Legg til brukers mulighet til å validere hypotesene.»
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { nesteReise, retningOrd, tidsvindu, NESTE_TIMER } from '../src/nesteReise.js';
import { lærNesteSvar, nesteSvarFor, nesteSvarOversikt, glemNesteSvar } from '../src/api/nesteSvar.js';

beforeEach(() => localStorage.clear());
const MAN = h => new Date(2026, 10, 9, h, 10).getTime();          // mandag 9. nov, lokal tid
const HER = { lat: 59.8494, lon: 10.8294 };                         // Mortensrud
const JBT = { toName: 'Jernbanetorget', toLat: 59.9116, toLon: 10.7505 };

// destRanking-form: { toName, toLat, toLon, score, count, diff, ukedag }
const rangering = tabell => at => {
  const h = new Date(at).getHours();
  return (tabell[Math.floor(h / 2)] || []).map(r => ({ ...r }));
};

describe('nesteReise', () => {
  it('finner første tidsrom framover med en sterk nok vane', () => {
    const r = nesteReise({ nå: MAN(11), her: HER, rangering: rangering({ 7: [{ ...JBT, score: 24, count: 6, diff: 0, ukedag: true }] }) });
    expect(r.toName).toBe('Jernbanetorget');
    expect(r.fra).toBe(MAN(14) - 10 * 60000);    // 14:00
    expect(r.til).toBe(MAN(16) - 10 * 60000);    // 16:00
    expect(r.antall).toBe(6);
  });
  it('fuzzy tid: «nå», «mellom 14 og 16», «i morgen mellom 06 og 08»', () => {
    expect(tidsvindu(MAN(14), MAN(14), MAN(16))).toBe('nå');
    expect(tidsvindu(MAN(11), MAN(14) - 600000, MAN(16) - 600000)).toBe('i ettermiddag, mellom 14 og 16');
    expect(tidsvindu(MAN(20), MAN(6) + 86400000 - 600000, MAN(8) + 86400000 - 600000)).toBe('i morgen tidlig, mellom 06 og 08');
  });
  it('retning fra der du er: Jernbanetorget ligger nordvest for Mortensrud', () => {
    expect(retningOrd(HER, JBT)).toBe('nordvest');
    expect(retningOrd(null, JBT)).toBe(null);
  });
  it('for svak vane: ingen hypotese, heller enn å gjette', () => {
    const r = nesteReise({ nå: MAN(11), her: HER, rangering: rangering({ 7: [{ ...JBT, score: 3, count: 1, diff: 0, ukedag: true }] }) });
    expect(r).toBe(null);
  });
  it(`ser høyst ${NESTE_TIMER} timer fram`, () => {
    expect(NESTE_TIMER).toBe(24);
  });
  it('står du alt der, er det ikke neste reise', () => {
    const r = nesteReise({ nå: MAN(11), her: { lat: JBT.toLat, lon: JBT.toLon },
      rangering: rangering({ 5: [{ ...JBT, score: 24, count: 6, diff: 0, ukedag: true }] }) });
    expect(r).toBe(null);
  });
});

describe('validering', () => {
  const tab = { 7: [{ ...JBT, score: 24, count: 6, diff: 0, ukedag: true }, { toName: 'Torshov', toLat: 59.934, toLon: 10.764, score: 20, count: 5, diff: 0, ukedag: true }] };
  it('«nei» to ganger: neste hypotese i stedet', () => {
    const kx = { nå: MAN(11), her: HER, rangering: rangering(tab) };
    const først = nesteReise({ ...kx, svar: nesteSvarFor });
    lærNesteSvar(først, -1); lærNesteSvar(først, -1);
    expect(nesteReise({ ...kx, svar: nesteSvarFor }).toName).toBe('Torshov');
  });
  it('«stemmer» styrker og lagres som det du har sagt', () => {
    const kx = { nå: MAN(11), her: HER, rangering: rangering(tab) };
    const r = nesteReise({ ...kx, svar: nesteSvarFor });
    lærNesteSvar(r, +1);
    expect(nesteSvarFor(r)).toBe(1);
    expect(nesteSvarOversikt()[0].toName).toBe('Jernbanetorget');
    glemNesteSvar();
    expect(nesteSvarOversikt()).toEqual([]);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.nesteSvar',");
  });
});

describe('koblet inn', () => {
  it('auto-reise viser kortet med «stemmer»/«nei», settings viser svarene, slett alt sletter', () => {
    expect(readFileSync('index.html', 'utf8')).toContain('id="auto-neste"');
    const a = readFileSync('src/views/auto.js', 'utf8');
    expect(a).toContain('class="neste-ja"');
    expect(a).toContain('class="neste-nei"');
    const s = readFileSync('src/views/settings.js', 'utf8');
    expect(s).toContain('glemNesteSvar();');
    expect(readFileSync('index.html', 'utf8')).toContain('id="mem-nestesvar"');
  });
});

describe('presisjon', () => {
  it('en vane i et NABOtidsrom er ikke «da»', () => {
    const r = nesteReise({ nå: MAN(11), her: HER, rangering: at => new Date(at).getHours() === 11
      ? [{ ...JBT, score: 24, count: 6, diff: 1, ukedag: true }] : [] });
    expect(r).toBe(null);
  });
  it('retningen regner med at lengdegrader er kortere i nord', () => {
    // 0,01° nord (~1,1 km) og 0,03° øst (~1,7 km ved 60° N): nordøst, ikke øst.
    expect(retningOrd({ lat: 60, lon: 10 }, { toLat: 60.01, toLon: 10.03 })).toBe('nordøst');
  });
});

describe('mot den EKTE destRanking (ikke en fikstur som har feltet)', () => {
  it('rangeringen bærer målets koordinater, så retningen kan regnes', async () => {
    const { destRanking } = await import('../src/api/smart.js');
    const nå = new Date(); const bøtte = Math.floor(nå.getHours() / 2); const helg = [0, 6].includes(nå.getDay());
    localStorage.setItem('default::t.vaneTelling', '2');
    localStorage.setItem('default::t.smartHist', JSON.stringify([{ key: 'jernbanetorget|' + bøtte + '|' + (helg ? 'we' : 'wd'),
      fromName: 'Mortensrud', toName: 'Jernbanetorget', toLat: 59.9116, toLon: 10.7505, bucket: bøtte, isWeekend: helg, count: 7, lastUsed: Date.now() }]));
    const top = destRanking(nå.getTime())[0];
    expect(top.toLat).toBe(59.9116);
    expect(top.toLon).toBe(10.7505);
    const h = nesteReise({ nå: nå.getTime(), her: HER, rangering: at => destRanking(at) });
    expect(h.retning).toBe('nordvest');
  });
});
