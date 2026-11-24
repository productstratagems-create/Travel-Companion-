/**
 * «Gå lenger, færre bytter» (eksperiment, v1.218.302): avveiningsrader fra reisesøket
 * Auto-tavla alt gjør, med brukerens grense for gangtid. Tall fra tracer 2 (Mortensrud → Ski).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { gangAlternativRader, medGangAlternativ, gangTilFørste, lastGangTak, lagreGangTak, GANG_ALT_STANDARD, GANG_ALT_VALG, GANG_ALT_KEY, SAMME_ANKOMST_MIN } from '../src/gangAlternativ.js';
import { reiseRader } from '../src/reiseTil.js';
import { storage } from '../src/storage.js';

const T = hm => '2026-11-24T' + hm + ':00+01:00';
const fot = (fra, til) => ({ mode: 'foot', expectedStartTime: T(fra), expectedEndTime: T(til), fromPlace: { name: 'Origin' }, toPlace: { name: 'x' } });
const etappe = (mode, kode, fraNavn, til, fra, slutt) => ({ mode, expectedStartTime: T(fra), expectedEndTime: T(slutt), fromPlace: { name: fraNavn }, toPlace: { name: til }, serviceJourney: { line: { publicCode: kode } } });
// Mortensrud → Ski, kl. 12 (tracer 2): 71 → 515 fra Mortensrud, framme 12:52; eller gå til Hauketo og ta L2 direkte, framme 12:51.
const viaBuss = { legs: [fot('12:00', '12:03'), etappe('bus', '71', 'Mortensrud', 'Holmen', '12:03', '12:20'), etappe('bus', '515', 'Holmen', 'Ski stasjon', '12:25', '12:52')] };
const gåTog = gang => ({ legs: [fot('12:00', '12:' + String(gang).padStart(2, '0')), etappe('rail', 'L2', 'Hauketo stasjon', 'Ski stasjon', '12:27', '12:51')] });
const nå = Date.parse(T('11:55'));
const rader = (...tps) => reiseRader(tps, nå, null);

describe('gå lenger, færre bytter: radene', () => {
  it('uten bytte fra et annet stopp, samme ankomst, innenfor grensen: én rad som sier hva den sammenlignes med', () => {
    const r = gangAlternativRader(rader(viaBuss, gåTog(12)), { gangTak: 15 });
    expect(r).toHaveLength(1);
    expect(r[0].fra).toBe('Hauketo stasjon');
    expect(r[0].gangMin).toBe(12);
    expect(r[0].fakta).toEqual(['samme ankomst som 71 → 515']); // 12:51 mot 12:52: ett minutt er avrunding
    expect(JSON.stringify(r)).not.toMatch(/bedre|anbefal/);
  });
  it('over brukerens grense vises den ikke; «av» (0) viser ingenting', () => {
    expect(gangAlternativRader(rader(viaBuss, gåTog(24)), { gangTak: 15 })).toEqual([]);
    expect(gangAlternativRader(rader(viaBuss, gåTog(24)), { gangTak: 25 })).toHaveLength(1);
    expect(gangAlternativRader(rader(viaBuss, gåTog(12)), { gangTak: 0 })).toEqual([]);
    // «Av» betyr av, også når alternativet ikke krever gange (starter der du står).
    const utenGange = { legs: [etappe('rail', 'L2', 'Hauketo stasjon', 'Ski stasjon', '12:27', '12:51')] };
    expect(gangAlternativRader(rader(viaBuss, utenGange), { gangTak: 15 })).toHaveLength(1);
    expect(gangAlternativRader(rader(viaBuss, utenGange), { gangTak: 0 })).toEqual([]);
  });
  it('omtrent samme ankomst: innenfor ± SAMME_ANKOMST_MIN, ikke på grensen', () => {
    const sen = min => ({ legs: [fot('12:00', '12:10'), etappe('rail', 'L2', 'Hauketo stasjon', 'Ski stasjon', '12:27', '12:' + String(52 + min).padStart(2, '0'))] });
    expect(gangAlternativRader(rader(viaBuss, sen(SAMME_ANKOMST_MIN - 1)), { gangTak: 15 })[0].fakta).toEqual(['4 min senere enn 71 → 515']);
    expect(gangAlternativRader(rader(viaBuss, sen(SAMME_ANKOMST_MIN)), { gangTak: 15 })).toEqual([]);
  });
  it('må ha færre bytter, og starte fra et annet stopp', () => {
    const sammeStopp = { legs: [fot('12:00', '12:10'), etappe('rail', 'L2', 'Mortensrud', 'Ski stasjon', '12:27', '12:51')] };
    expect(gangAlternativRader(rader(viaBuss, sammeStopp), { gangTak: 15 })).toEqual([]);
    const likeMange = { legs: [fot('12:00', '12:10'), etappe('rail', 'L2', 'Hauketo stasjon', 'Oslo S', '12:27', '12:35'), etappe('bus', '500', 'Oslo S', 'Ski stasjon', '12:40', '12:52')] };
    expect(gangAlternativRader(rader(viaBuss, likeMange), { gangTak: 15 })).toEqual([]);
  });
  it('ett bytte færre (Eina-tilfellet): sier det', () => {
    const tre = { legs: [fot('08:00', '08:03'), etappe('bus', '73', 'Mortensrud', 'Hauketo stasjon', '08:04', '08:10'), etappe('rail', 'L2', 'Hauketo stasjon', 'Oslo S', '08:27', '08:45'), etappe('rail', 'RE30', 'Oslo S', 'Eina stasjon', '09:00', '10:43')] };
    const to = { legs: [fot('08:00', '08:14'), etappe('rail', 'L2', 'Hauketo stasjon', 'Oslo S', '08:27', '08:45'), etappe('rail', 'RE30', 'Oslo S', 'Eina stasjon', '09:00', '10:43')] };
    const r = gangAlternativRader(reiseRader([tre, to], Date.parse(T('07:55')), null), { gangTak: 15 });
    expect(r[0].fakta).toEqual(['ett bytte færre · samme ankomst som 73 → L2 → RE30']);
  });
  it('gange til FØRSTE stopp, ikke all gange i reisen', () => {
    const medBytteGange = { legs: [fot('12:00', '12:05'), etappe('bus', '1', 'A', 'B', '12:05', '12:10'), fot('12:10', '12:30'), etappe('bus', '2', 'C', 'D', '12:30', '12:40')] };
    expect(gangTilFørste({ tp: medBytteGange })).toBe(5);
  });
  it('i tavla sammenlignes bare med reiser som vises; samme reise står ikke to ganger', () => {
    const rr = rader(viaBuss, gåTog(12));
    const buss = rr.find(r => r.fra === 'Mortensrud'), alt = rr.find(r => r.fra === 'Hauketo stasjon');
    // Bussreisen vises: avveiningsraden kommer i tillegg.
    expect(medGangAlternativ([buss], rr, 15).map(r => r.fra)).toEqual(['Mortensrud', 'Hauketo stasjon']);
    // Ingenting vises å sammenligne med: ingen avveiningsrad (den ville vist til noe brukeren ikke ser).
    expect(medGangAlternativ([], rr, 15)).toEqual([]);
    // Alternativet er selv en vist rad: står bare én gang.
    expect(medGangAlternativ([buss, alt], rr, 15)).toHaveLength(2);
  });
});

describe('gå lenger, færre bytter: innstillingen og isolasjonen', () => {
  beforeEach(() => { try { storage.remove(GANG_ALT_KEY); } catch (_) { storage.set(GANG_ALT_KEY, null); } });
  it('standard 15 min (brukertesten); lagres per profil; ugyldig gir standard; 0 = av', () => {
    expect(lastGangTak()).toBe(GANG_ALT_STANDARD);
    expect(GANG_ALT_STANDARD).toBe(15);
    expect(lagreGangTak(20)).toBe(20); expect(lastGangTak()).toBe(20);
    expect(lagreGangTak(0)).toBe(0); expect(lastGangTak()).toBe(0);
    expect(lagreGangTak(17)).toBe(GANG_ALT_STANDARD);
    expect(GANG_ALT_VALG).toEqual([0, 10, 15, 20, 25]);
    expect(readFileSync('src/storage.js', 'utf8')).toContain("'t.gangAlternativ'");
  });
  it('innstillingen finnes med alle valgene; auto.js har bare de merkede krokene', () => {
    const html = readFileSync('index.html', 'utf8');
    for (const v of GANG_ALT_VALG) expect(html).toMatch(new RegExp('id="pref-gangalt"[\\s\\S]*data-val="' + v + '"'));
    const a = readFileSync('src/views/auto.js', 'utf8').split('\n').filter(l => /gangAlternativ|GANG_ALTERNATIV|medGangAlternativ|lastGangTak/.test(l));
    expect(a).toHaveLength(2);
    expect(a.every(l => /GÅ LENGER \(eksperiment\)/.test(l))).toBe(true);
  });
});
