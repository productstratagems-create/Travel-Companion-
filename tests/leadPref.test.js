/**
 * «Bruker kan angi hvor lenge i forveien av avgangstid bruker ønsker varsel.»
 *
 * Den farlige formen her er ikke koden, det er BEGREPET: appen hadde allerede
 * ett svar på «når skal alarmen gå» — gangtid + margin — og et brukervalgt
 * tall er et andre svar på det samme spørsmålet. To regler som må være enige
 * er feilformen AGENTS.md navngir, og som denne kodebasen har betalt for
 * omtrent femten ganger.
 *
 * Derfor er «automatisk» en VERDI I SAMME LISTE som tallene, ikke en bryter
 * ved siden av: det finnes ett lagret valg, én leser, og ingen skjult
 * overstyring.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { leadMins, loadLeadPref, saveLeadPref, LEAD_AUTO, LEAD_CHOICES, legIcs }
  from '../src/api/ics.js';
import { storage } from '../src/storage.js';

const leg = () => ({
  id: 'leg_1', line: '3', lineColour: 'f5a000',
  from: 'Mortensrud', to: 'Jernbanetorget',
  depIso: new Date(2026, 8, 23, 8, 12, 0).toISOString(),
  arrIso: new Date(2026, 8, 23, 8, 41, 0).toISOString(),
});

const desc = (t) => t.replace(/\r\n[ \t]/g, '').split('\r\n')
  .filter(l => l.startsWith('DESCRIPTION:'))[0];
const trigger = (t) => t.replace(/\r\n[ \t]/g, '').split('\r\n')
  .filter(l => l.startsWith('TRIGGER:'))[0];

describe('innstillingen', () => {
  beforeEach(() => { storage.remove('t.lead'); });

  it('er automatisk før noen har valgt noe', () => {
    expect(loadLeadPref()).toBe(LEAD_AUTO);
  });

  it('husker tallet du valgte, som et tall', () => {
    saveLeadPref(15);
    expect(loadLeadPref()).toBe(15);
  });

  it('kan settes tilbake til automatisk', () => {
    saveLeadPref(15);
    saveLeadPref(LEAD_AUTO);
    expect(loadLeadPref()).toBe(LEAD_AUTO);
  });

  // En lagret verdi som ikke er et av valgene slippes ikke inn i en alarm —
  // den faller tilbake til regelen, ikke til et vilkårlig minutt.
  it('stoler ikke på en verdi som ikke står i lista', () => {
    storage.set('t.lead', '7');
    expect(loadLeadPref()).toBe(LEAD_AUTO);
    storage.set('t.lead', 'tull');
    expect(loadLeadPref()).toBe(LEAD_AUTO);
  });

  it('tilbyr automatisk først, så stigende tall', () => {
    expect(LEAD_CHOICES[0]).toBe(LEAD_AUTO);
    const tall = LEAD_CHOICES.slice(1);
    expect(tall).toEqual([...tall].sort((a, b) => a - b));
  });
});

describe('hva det valgte tallet gjør med alarmen', () => {
  // DETTE ER HELE POENGET: velger du 15, er alarmen 15 — ikke 15 pluss noe.
  it('gjelder tallet du valgte, ubehandlet', () => {
    const { mins, source } = leadMins(leg(), { pref: 15, walkMins: 9, buffer: 2 });
    expect(mins).toBe(15);
    expect(source).toBe('valgt');
  });

  // Og en lang gangtid hever det IKKE. «15 min før» må bety 15, ellers er
  // innstillingen en løgn. (Dette er mutanten Math.max(pref, walk+buffer).)
  it('heves ikke av en lang gangtid', () => {
    expect(leadMins(leg(), { pref: 5, walkMins: 40, buffer: 2 }).mins).toBe(5);
  });

  it('lar regelen gjelde når ingenting er valgt', () => {
    const { mins, source } = leadMins(leg(), { pref: null, walkMins: 9, buffer: 2 });
    expect(mins).toBe(11);
    expect(source).toBe('gange');
  });

  it('når helt ut i kalenderfila', () => {
    expect(trigger(legIcs(leg(), leadMins(leg(), { pref: 15 })))).toBe('TRIGGER:-PT15M');
  });

  // SI HVOR TALLET KOM FRA. Tre kilder, tre setninger — ellers kan ikke
  // leseren se forskjell på et valg og en gjetning.
  it('sier at tallet er ditt eget valg', () => {
    expect(desc(legIcs(leg(), { mins: 15, source: 'valgt' }))).toMatch(/valgt/);
  });

  it('skiller de tre kildene fra hverandre', () => {
    const v = desc(legIcs(leg(), { mins: 15, source: 'valgt' }));
    const g = desc(legIcs(leg(), { mins: 11, source: 'gange' }));
    const s = desc(legIcs(leg(), { mins: 10, source: 'standard' }));
    expect(new Set([v, g, s]).size).toBe(3);
    expect(g).toMatch(/gangtid/);
    expect(s).toMatch(/standard/);
  });
});
