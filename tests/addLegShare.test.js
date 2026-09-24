/**
 * «Modalen skal komme opp i det øyeblikk reisen er lagt til reiseplan.»
 *
 * Det som avgjør om dette i det hele tatt KAN virke er ikke vår kode, det er
 * nettleserens regel om TRANSIENT USER ACTIVATION: `navigator.share` åpner
 * bare mens trykket ennå er ferskt. Legger det seg en `await` foran kallet —
 * et nettverkskall, en geokoding — er aktiveringen brukt opp og arket nektes.
 *
 * Her holder det akkurat: `addLegToPlan` skriver til localStorage og
 * `renderSelected` bygger DOM. Begge er synkrone. Testene under binder begge
 * halvdeler av det: at handleren ikke venter på noe, og at fila bygges uten
 * nettverk.
 */
import { describe, it, expect } from 'vitest';
import { addLegToPlan, loadPlan, clearPlan } from '../src/api/plan.js';

const read = (f) => require('node:fs').readFileSync(f, 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const call = () => ({
  expectedDepartureTime: new Date(2026, 8, 23, 8, 12, 0).toISOString(),
  serviceJourney: { id: 'RUT:ServiceJourney:1',
    line: { publicCode: '3', presentation: { colour: 'f5a000' } } },
  destinationDisplay: { frontText: 'Jernbanetorget' },
});
const dir = () => ({ from: 'Mortensrud', to: 'Jernbanetorget' });

describe('addLegToPlan gir etappen tilbake', () => {
  // Skjermen skal eksportere NETTOPP den etappen den la til. Slår den opp
  // etappen på nytt etter en annen regel, er det to regler som må være enige
  // om hvilken etappe det gjaldt — og feil etappe havner i kalenderen.
  it('returnerer etappen, ikke bare true', () => {
    clearPlan();
    const leg = addLegToPlan(call(), dir());
    expect(leg).toBeTruthy();
    expect(leg.id).toBe(loadPlan()[0].id);
    expect(leg.line).toBe('3');
  });

  // FØR-BILDET: den ga `true`, og da finnes det ingen etappe å dele.
  it('og det som kom før var et tall uten identitet', () => {
    clearPlan();
    expect(typeof addLegToPlan(call(), dir())).not.toBe('boolean');
  });

  it('gir fortsatt noe falsy når etappen alt ligger der', () => {
    clearPlan();
    addLegToPlan(call(), dir());
    expect(addLegToPlan(call(), dir())).toBeFalsy();
  });
});

/**
 * Og at trykket ikke rekker å bli gammelt.
 *
 * Kildetester, fordi `renderSelected` ikke tegnes av noen test i dette repoet
 * — nettleserprøven er det som faktisk ser arket. Det disse binder er regelen
 * som gjør arket lovlig i det hele tatt.
 */
describe('arket åpnes mens trykket ennå er ferskt', () => {
  const handler = () => {
    const s = stripComments(read('src/views/selected.js'));
    const i = s.indexOf('planBtn.onclick');
    return s.slice(i, s.indexOf('};', s.indexOf('shareLegCalendar', i)));
  };

  it('venter ikke på noe før delingen', () => {
    expect(handler()).not.toMatch(/\bawait\b/);
  });

  it('deler etappen addLegToPlan nettopp ga tilbake', () => {
    const h = handler();
    expect(h).toMatch(/const leg = addLegToPlan\(c, dir\)/);
    expect(h).toMatch(/shareLegCalendar\(leg/);
  });

  // Tilbudt uten å bli spurt: på et skrivebord uten delingsark skal det IKKE
  // falle gjennom til nedlasting, ellers havner en fil i Nedlastinger hver
  // eneste gang en etappe legges til.
  it('faller ikke gjennom til nedlasting når det tilbys uoppfordret', () => {
    const h = handler();
    expect(h).toMatch(/canShareCal\(\)/);
    expect(h).toMatch(/shareOnly: true/);
  });

  // Og fila bygges uten nettverk — et fetch her ville brukt opp aktiveringen
  // selv om handleren ikke ventet på det.
  it('bygger fila uten å røre nettverket', () => {
    const s = stripComments(read('src/api/calShare.js'));
    expect(s).not.toMatch(/fetch\(|geocode|entur/);
  });
});

/**
 * Og at det finnes ÉN stige, ikke to.
 *
 * Bjella på reiseplanen og tillegget på avgangsskjermen bygger den samme fila
 * med den samme alarmen og den samme SEQUENCE. Da den bodde i views/plan.js
 * var det ingen vei til det uten en kopi.
 */
describe('én eier av kalenderfila', () => {
  it('reiseplanen bygger den ikke selv lenger', () => {
    const s = stripComments(read('src/views/plan.js'));
    expect(s).toMatch(/shareLegCalendar\(leg\)/);
    expect(s).not.toMatch(/legIcs\(|new File\(|navigator\.share/);
  });

  it('og SEQUENCE telles ett sted', () => {
    const s = stripComments(read('src/api/calShare.js'));
    expect(s).toMatch(/export const CAL_SEQ_KEY = 't\.calSeq'/);
    expect(stripComments(read('src/views/plan.js'))).not.toMatch(/t\.calSeq/);
  });
});
