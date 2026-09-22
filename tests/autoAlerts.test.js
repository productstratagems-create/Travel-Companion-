/**
 * Meldingene havner der valget tas.
 *
 * Rapportert med skjermbilde fra Jernbanetorget: over skjermens egen identitet
 * sto to rader uten innhold — «5 ANDRE MELDINGER  VIS» og «1 MELDING SKJULT
 * VIS» — mens linjeradene under dem alt bar hvert sitt `!`.
 *
 * De fem var nettopp de meldingene radene allerede viste. Banneret telte om
 * igjen det som sto på skjermen, uten å si hva det var om. Det er derfor
 * grupperingen ikke ga mening: den var sann, og den var om ingenting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { renderAlertsInto, promoteSevere, otherLabel, moreLabel }
  from '../src/ui/alerts.js';
import { splitSituations } from '../src/api/situations.js';
import { rowMessages, dirAlertHtml, rowKey } from '../src/views/auto.js';
import { storage } from '../src/storage.js';
import config from '../src/config.js';

const sit = (id, severity, value, from) => ({
  id, severity, validityPeriod: {},
  summary: [{ language: 'no', value }],
  _from: from,
});
/** A message that hung on a departure's line, which is all auto ever learns. */
const onLine = (id, line, severity = 'normal') =>
  sit(id, severity, 'melding om ' + line,
    { lines: new Set([line]), stops: new Set(), journeys: new Set() });
/** A message that hung on the stop itself. */
const onStop = (id, stop, severity = 'normal') =>
  sit(id, severity, 'melding om ' + stop,
    { lines: new Set(), stops: new Set([stop]), journeys: new Set() });

const el = () => {
  const d = document.createElement('div');
  document.body.appendChild(d);
  return d;
};

const JBT = 'NSR:StopPlace:58366';
/** The reported screen: three directions on the board, five line messages. */
const REPORTED = ['RUT:Line:2', 'RUT:Line:4', 'RUT:Line:3'];
const FIVE = [
  onLine('m1', 'RUT:Line:2'),
  onLine('m2', 'RUT:Line:4'),
  onLine('m3', 'RUT:Line:3'),
  onLine('m4', 'RUT:Line:2'),
  onLine('m5', 'RUT:Line:4'),
];
const ctx = (delivered) => ({
  stopIds: [JBT], lineIds: [], journeyIds: [],
  delivered: delivered == null ? undefined : new Set(delivered),
  otherWord: { one: 'melding om en annen linje', many: 'meldinger om andre linjer' },
});

beforeEach(() => {
  document.body.innerHTML = '';
  storage.remove(config.storage.alertHid);
});

describe('banneret på Jernbanetorget', () => {
  // THE BEFORE-PICTURE. Against today's code this fails: the banner counts
  // all five again, under the heading «5 andre meldinger».
  it('gir ingen bannerlinje til en melding som alt står på en rad', () => {
    const box = el();
    renderAlertsInto(box, FIVE, () => {}, ctx(['m1', 'm2', 'm3', 'm4', 'm5']));
    expect(box.querySelector('.alerts-other')).toBeNull();
    expect(box.style.display).toBe('none');
  });

  // NOTHING IS DROPPED — the whole point of splitSituations. A line with no
  // row on screen (the list is capped at a hub) has nowhere else to be said.
  it('beholder meldingen om en linje som ikke har noen rad', () => {
    const box = el();
    renderAlertsInto(box, FIVE, () => {}, ctx(['m1', 'm2', 'm3']));
    const row = box.querySelector('.alerts-more');
    expect(row).not.toBeNull();
    expect(row.textContent).toContain('2 meldinger om andre linjer');
  });

  // The stop's own message is «mitt» and was never folded — it must not start
  // being folded now.
  it('rører ikke meldingen om stoppet selv', () => {
    const box = el();
    renderAlertsInto(box, [onStop('s1', JBT), ...FIVE], () => {},
      ctx(['m1', 'm2', 'm3', 'm4', 'm5']));
    expect(box.querySelectorAll('.service-alert').length).toBe(1);
    expect(box.textContent).toContain('melding om ' + JBT);
  });

  // A closure is never someone else's problem, and a row shows a MARK, not a
  // closure. `delivered` must not be able to fold one away.
  it('folder aldri en stenging, heller ikke en rad bærer', () => {
    const box = el();
    renderAlertsInto(box, [onLine('bad', 'RUT:Line:2', 'severe')], () => {}, ctx(['bad']));
    expect(box.querySelectorAll('.service-alert').length).toBe(1);
    expect(box.querySelector('.alerts-more')).toBeNull();
  });
});

describe('promoteSevere', () => {
  it('henter en stenging ut av den andre bunken', () => {
    const bad = onLine('bad', 'RUT:Line:9', 'severe');
    const out = promoteSevere({ mine: [], other: [bad, onLine('ok', 'RUT:Line:9')] });
    expect(out.mine.map(s => s.id)).toEqual(['bad']);
    expect(out.other.map(s => s.id)).toEqual(['ok']);
  });

  it('lar de andre bunkene være i fred når ingenting er alvorlig', () => {
    const split = { mine: [onStop('a', JBT)], other: [onLine('b', 'RUT:Line:9')] };
    const out = promoteSevere(split);
    expect(out.mine.map(s => s.id)).toEqual(['a']);
    expect(out.other.map(s => s.id)).toEqual(['b']);
  });

  // Called BEFORE visibleAlerts, so a reader who put a closure away keeps it
  // away — promotion is about weight, not about overruling the reader.
  it('overkjører ikke en stenging leseren selv har lagt bort', () => {
    const box = el();
    storage.set(config.storage.alertHid, JSON.stringify({ bad: 1 }));
    renderAlertsInto(box, [onLine('bad', 'RUT:Line:9', 'severe')], () => {}, ctx([]));
    expect(box.querySelector('.service-alert')).toBeNull();
    // v1.144.0: én rad for begge slagene, så den bortlagte telles der.
    expect(box.querySelector('.alerts-more').textContent).toContain('1 melding til');
  });
});

/**
 * v1.139.0 delte tellingen i to: toppraden talte bare din egen bunk, og den
 * sammenfoldede bunkens bortlegginger ble talt inne i den. Det var riktig så
 * lenge det VAR to rader. v1.144.0 slo dem sammen, og da er det én telling —
 * bundet av «den ene raden» lenger ned.
 *
 * Det som må overleve sammenslåingen er garantien under: en bortlagt melding
 * skal aldri bli usynlig, for da kan en stengt linje passere ubemerket.
 */
describe('en bortlagt melding blir aldri usynlig', () => {
  it('telles i raden, uansett hvilken bunk den lå i', () => {
    const box = el();
    storage.set(config.storage.alertHid, JSON.stringify({ m1: 2 }));
    renderAlertsInto(box, FIVE, () => {}, ctx([]));
    expect(box.querySelector('.alerts-more')).not.toBeNull();
    // fire andre + én bortlagt
    expect(box.querySelector('.alerts-more').textContent).toContain('5 meldinger til');
  });

  it('også når den er den eneste meldingen som finnes', () => {
    const box = el();
    storage.set(config.storage.alertHid, JSON.stringify({ s1: 2 }));
    renderAlertsInto(box, [onStop('s1', JBT)], () => {}, ctx([]));
    expect(box.querySelector('.alerts-more').textContent).toContain('1 melding til');
  });
});

describe('otherLabel', () => {
  it('bøyer seg, med og uten emneord', () => {
    expect(otherLabel(1)).toBe('1 annen melding');
    expect(otherLabel(4)).toBe('4 andre meldinger');
    const w = { one: 'melding om en annen linje', many: 'meldinger om andre linjer' };
    expect(otherLabel(1, w)).toBe('1 melding om en annen linje');
    expect(otherLabel(4, w)).toBe('4 meldinger om andre linjer');
  });
});

describe('to bannere på samme side', () => {
  // `_otherOpen` was a module-level global: opening the other pile on the
  // board opened it on auto too, and track.js renders several containers in
  // one loop. That is the v1.105.0 fault in miniature.
  it('deler ikke åpen-tilstand', () => {
    const a = el(); const b = el();
    renderAlertsInto(a, FIVE, () => {}, ctx([]));
    renderAlertsInto(b, FIVE, () => {}, ctx([]));
    a.querySelector('.alerts-more').click();
    renderAlertsInto(a, FIVE, () => {}, ctx([]));
    renderAlertsInto(b, FIVE, () => {}, ctx([]));
    expect(a.querySelector('.alerts-more').getAttribute('aria-expanded')).toBe('true');
    expect(b.querySelector('.alerts-more').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('rowMessages', () => {
  const perLine = new Map([
    ['RUT:Line:2', [FIVE[0], FIVE[3]]],
    ['RUT:Line:4', [FIVE[1], FIVE[4]]],
    ['RUT:Line:3', [FIVE[2]]],
  ]);
  const row = (i, ...lines) => ({ i, d: { lines: lines.map(id => ({ id })) } });

  it('samler meldingene per rad, og id-ene de dermed dekker', () => {
    const { byRow, ids } = rowMessages(REPORTED.map((l, i) => row(i, l)), perLine);
    expect(byRow.get(0).map(m => m.id)).toEqual(['m1', 'm4']);
    expect([...ids].sort()).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  // THE MUTATION THAT MATTERS. Derive this from _dirs instead of the live
  // rows and a message whose row has aged out — or was never drawn, because
  // a hub's list is capped — is folded away as «already on a row» while no
  // row shows it.
  it('regner bare med radene som faktisk tegnes', () => {
    const { ids } = rowMessages([row(0, 'RUT:Line:2')], perLine);
    expect([...ids].sort()).toEqual(['m1', 'm4']);
    expect(ids.has('m3')).toBe(false);
  });

  it('teller en melding én gang når raden bærer to linjer', () => {
    const { byRow } = rowMessages([row(0, 'RUT:Line:2', 'RUT:Line:2')], perLine);
    expect(byRow.get(0).map(m => m.id)).toEqual(['m1', 'm4']);
  });

  it('gir tomt uten meldinger', () => {
    const { byRow, ids } = rowMessages([row(0, 'RUT:Line:9')], perLine);
    expect(byRow.get(0)).toEqual([]);
    expect(ids.size).toBe(0);
  });
});

describe('splitSituations er fortsatt bare om emne', () => {
  // The weight rule lives in alerts.js. If it migrated back into relevance,
  // the pure two-pile contract («never drops a message») would start meaning
  // something else.
  it('flytter ikke en stenging selv', () => {
    const bad = onLine('bad', 'RUT:Line:9', 'severe');
    const out = splitSituations([bad], { stopIds: [JBT], lineIds: [], journeyIds: [] });
    expect(out.other.map(s => s.id)).toEqual(['bad']);
  });
});

describe('merket på raden', () => {
  const one = [onLine('m1', 'RUT:Line:2')];
  const two = [onLine('m1', 'RUT:Line:2'), onLine('m2', 'RUT:Line:2')];
  const box = (html) => { const d = el(); d.innerHTML = html; return d; };

  // «The mark says HOW MANY» was written in the comment while the code wrote
  // a literal `!` — one fact, two places, disagreeing.
  it('sier hvor mange når det er flere enn én', () => {
    expect(box(dirAlertHtml(two, new Set(), 'K', 0).mark).querySelector('button').textContent).toBe('2');
    expect(box(dirAlertHtml(one, new Set(), 'K', 0).mark).querySelector('button').textContent).toBe('!');
  });

  it('tegner ingenting uten meldinger', () => {
    expect(dirAlertHtml([], new Set(), 'K', 0)).toEqual({ mark: '', block: '' });
    expect(dirAlertHtml(null, new Set(), 'K', 0)).toEqual({ mark: '', block: '' });
  });

  // The text was on a `title` attribute — invisible on a phone, which is
  // point 2 of the rettesnor word for word.
  it('viser teksten når den er åpen, ikke bare i et attributt', () => {
    const closed = box(dirAlertHtml(one, new Set(), 'K', 0).block);
    expect(closed.querySelector('.auto-dir-msg')).toBeNull();
    const open = box(dirAlertHtml(one, new Set(['K']), 'K', 0).block);
    expect(open.querySelector('.sa-title').textContent).toBe('melding om RUT:Line:2');
    expect(open.querySelectorAll('.service-alert').length).toBe(1);
  });

  it('sier om den er åpen, så en skjermleser kan høre det', () => {
    expect(box(dirAlertHtml(one, new Set(), 'K', 0).mark)
      .querySelector('button').getAttribute('aria-expanded')).toBe('false');
    expect(box(dirAlertHtml(one, new Set(['K']), 'K', 0).mark)
      .querySelector('button').getAttribute('aria-expanded')).toBe('true');
  });

  // The mark is amber by default — «warn rather than err». A closure is not
  // a warning, and the colour is the only thing saying so before the tap.
  it('farger stengingen annerledes enn en vanlig melding', () => {
    const bad = box(dirAlertHtml([onLine('x', 'RUT:Line:2', 'severe')], new Set(), 'K', 0).mark);
    expect(bad.querySelector('button').className).toContain('sev-severe');
    expect(box(dirAlertHtml(one, new Set(), 'K', 0).mark).querySelector('button').className)
      .not.toContain('sev-severe');
  });

  it('har en merkelapp å lese opp, ikke bare et utropstegn', () => {
    const b = box(dirAlertHtml(two, new Set(), 'K', 0).mark).querySelector('button');
    expect(b.getAttribute('aria-label')).toBe('Vis 2 meldinger om denne linjen');
  });

  // .auto-dir is itself a button; a button inside it is invalid markup and
  // one unpredictable tap target (ui/alerts.js says so beside its own ✕).
  it('legger teksten utenfor knappen, ikke inni den', () => {
    const { mark, block } = dirAlertHtml(one, new Set(['m1']));
    expect(mark).not.toContain('auto-dir-msg');
    expect(block).not.toContain('<button');
  });
});

describe('index.html', () => {
  const html = () => require('node:fs').readFileSync('index.html', 'utf8');

  // The board's own slot carries this lesson in a comment: «BELOW the header,
  // not above it. Up there it pushed the station name — the screen's own
  // identity — off the top.» Auto-reise never got it: on the reported
  // screenshot two message rows stood above «DU ER VED Jernbanetorget».
  it('setter meldingene under skjermens egen identitet på auto-reise', () => {
    const t = html();
    expect(t.indexOf('id="auto-where"')).toBeGreaterThan(-1);
    expect(t.indexOf('id="auto-where"')).toBeLessThan(t.indexOf('id="auto-alerts"'));
  });

  it('holder banneret inne i skjermen sin', () => {
    const t = html();
    expect(t.lastIndexOf('id="v-auto"', t.indexOf('id="auto-alerts"'))).toBeGreaterThan(-1);
  });
});

describe('trykket på merket', () => {
  const src = () => require('node:fs').readFileSync('src/views/auto.js', 'utf8');
  const handler = () => {
    const t = src();
    const i = t.indexOf("body.querySelectorAll('.auto-dir-alert')");
    expect(i).toBeGreaterThan(-1);
    return t.slice(i, t.indexOf('});', t.indexOf('_renderBody();', i)));
  };

  // The mark sits INSIDE .auto-dir, which drills down into the line. Without
  // this the tap would open the message and leave the screen it is on.
  // (The same trap the indented stop hit in v1.138.0.)
  it('åpner ikke også retningen under', () => {
    expect(handler()).toMatch(/e\.stopPropagation\(\)/);
  });

  it('slår av og på for hele radens meldinger', () => {
    const h = handler();
    expect(h).toMatch(/_openMsgs\.delete\(k\)/);
    // og nøkkelen slås opp i JS, ikke smugles gjennom et attributt
    expect(h).toMatch(/rm\.keys\.get\(Number\(b\.dataset\.i\)\)/);
    expect(h).toMatch(/_openMsgs\.add\(k\)/);
    expect(h).toMatch(/_renderBody\(\)/);
  });

  // Rewritten once a second: a class in the markup would be gone before the
  // finger lifted, and a row index would move when the list is re-sorted.
  it('holder tilstanden i en mengde, ikke i markupen', () => {
    expect(src()).toMatch(/let _openMsgs = new Set\(\)/);
    expect(src()).toMatch(/_openMsgs = new Set\(\); \}/);   // resetAuto
    // og den beskjæres mot radene som faktisk finnes
    expect(src()).toMatch(/_openMsgs\.forEach\(k => \{ if \(!\[\.\.\.rm\.keys\.values\(\)\]/);
  });
});


describe('rowKey', () => {
  const dir = (front, line) => ({ frontText: front, lines: [{ id: line }] });

  // The probe caught the first attempt: keyed by situation id, the same
  // closure hangs on every L2 row, so opening «mot Ski» unfolded «mot
  // Stabekk» and «mot Lysaker» too — three copies of three sentences.
  it('skiller to retninger på samme linje', () => {
    expect(rowKey(dir('Ski', 'RUT:Line:L2'))).not.toBe(rowKey(dir('Stabekk', 'RUT:Line:L2')));
  });

  // And it must not be the row index: the sort pills move every index.
  it('er den samme etter at lista er sortert om', () => {
    expect(rowKey(dir('Ski', 'RUT:Line:L2'))).toBe(rowKey(dir('Ski', 'RUT:Line:L2')));
  });

  it('tåler en retning uten linje eller navn', () => {
    expect(() => rowKey(null)).not.toThrow();
    expect(rowKey({})).toBe(rowKey({}));
  });
});


// A \u0000 in an HTML attribute is a parse error, not a character: every row
// collapsed to its line badge alone, and the probe showed it as «L2» where
// «L2 mot Stabekk spor 1 12 min» had been.
describe('nøkkelen i markupen', () => {
  it('sender ikke rownøkkelen ut i HTML', () => {
    const { mark } = dirAlertHtml([onLine('m1', 'RUT:Line:2')], new Set(), rowKey({
      frontText: 'Ski', lines: [{ id: 'RUT:Line:L2' }] }), 3);
    expect(mark).not.toContain('\u0000');
    expect(mark).toContain('data-i="3"');
  });
});

/**
 * Én rad der det sto to.
 *
 * Rapportert med skjermbilde fra tavla, Mortensrud → Jernbanetorget:
 *
 *   1 ANNEN MELDING   VIS
 *   1 MELDING SKJULT  VIS
 *
 * To stablede rader som begge betyr «det er mer her». Kommentaren over
 * `otherLabel` sa det selv, fra dagen den ble skrevet: «two rows both meaning
 * «there is more here» would be two things a reader has to learn». Formen ble
 * delt; det ble aldri én rad.
 *
 * Jeg lot dem stå i v1.139.0 fordi verbene er ulike — den ene folder ut, den
 * andre kaller unhideAll() og henter tilbake ALT på hver skjerm. Den
 * begrunnelsen holder bare så lenge det andre verbet må være globalt.
 */
describe('den ene raden', () => {
  const bortlagt = (id) => storage.set(config.storage.alertHid, JSON.stringify({ [id]: 2 }));

  // FØR-BILDET: én i andre-bunken og én bortlagt gir to rader i dag.
  it('holder begge slagene', () => {
    const box = el();
    bortlagt('s1');
    renderAlertsInto(box, [onStop('s1', JBT), onLine('m1', 'RUT:Line:9')], () => {}, ctx([]));
    expect(box.querySelectorAll('.alerts-more').length).toBe(1);
    expect(box.querySelector('.alerts-other')).toBeNull();
    expect(box.querySelector('.alerts-hidden')).toBeNull();
    expect(box.querySelector('.alerts-more').textContent).toContain('2 meldinger til');
  });

  // Uten emneord er det den nøytrale bøyningen. (Med emneord og BARE
  // andre-bunken vinner emnet — se testen lenger ned; jeg skrev denne først
  // med emneordet på og motsa min egen regel.)
  it('bøyer entall', () => {
    const box = el();
    renderAlertsInto(box, [onLine('m1', 'RUT:Line:9')], () => {},
      { stopIds: [JBT], lineIds: [], journeyIds: [] });
    expect(box.querySelector('.alerts-more').textContent).toContain('1 melding til');
  });

  // Teller den bare den ene bunken, blir den andre usynlig.
  it('teller begge bunkene', () => {
    const box = el();
    bortlagt('s1');
    renderAlertsInto(box, [onStop('s1', JBT), onLine('m1', 'RUT:Line:9'),
      onLine('m2', 'RUT:Line:8')], () => {}, ctx([]));
    expect(box.querySelector('.alerts-more').textContent).toContain('3 meldinger til');
  });

  it('forsvinner når det verken er andre eller bortlagte', () => {
    const box = el();
    renderAlertsInto(box, [onStop('s1', JBT)], () => {}, ctx([]));
    expect(box.querySelector('.alerts-more')).toBeNull();
    expect(box.querySelectorAll('.service-alert').length).toBe(1);
  });

  // Emneordet fra v1.139.0 gjelder fortsatt når det BARE er andre-bunken —
  // da vet skjermen hva de handler om.
  it('bruker emneordet når det bare er andre-bunken', () => {
    const box = el();
    renderAlertsInto(box, [onLine('m1', 'RUT:Line:9')], () => {}, ctx([]));
    expect(box.querySelector('.alerts-more').textContent)
      .toContain('1 melding om en annen linje');
  });
});

/**
 * «Hva er disse pil-knappene? Gir ingen mening!»
 *
 * v1.144.0 tegnet de bortlagte meldingene inne i folden, dempet, hver med sin
 * egen ↩, og hengte en «hent alle tilbake» under dem. Det var en ny slags
 * knapp og en ny slags melding å lære, oppfunnet for å holde på én rad — mens
 * regelen appen allerede hadde sier det rett ut: ✕ legger bort, «vis» henter
 * tilbake.
 *
 * Raden er fortsatt én. Verbet er det gamle.
 */
describe('utfoldingen', () => {
  const åpne = (box) => { box.querySelector('.alerts-more').click(); };

  it('tegner ingen piler og ingen «hent alle tilbake»', () => {
    const box = el();
    storage.set(config.storage.alertHid, JSON.stringify({ s1: 2, s2: 2 }));
    const draw = () => renderAlertsInto(box,
      [onStop('s1', JBT), onStop('s2', JBT), onLine('m1', 'RUT:Line:9')], draw, ctx([]));
    draw(); åpne(box); draw();
    expect(box.querySelector('.sa-back')).toBeNull();
    expect(box.querySelector('.alerts-back-all')).toBeNull();
    expect(box.querySelector('.sa-put-away')).toBeNull();
  });

  // «Vis» betyr det den alltid har betydd: hent fram det som holdes unna deg.
  it('henter de bortlagte tilbake når du folder ut', () => {
    const box = el();
    storage.set(config.storage.alertHid, JSON.stringify({ s1: 2, s2: 2 }));
    const draw = () => renderAlertsInto(box,
      [onStop('s1', JBT), onStop('s2', JBT), onLine('m1', 'RUT:Line:9')], draw, ctx([]));
    draw();
    expect(box.querySelector('.alerts-more').textContent).toContain('3 meldinger til');
    åpne(box); draw();
    expect(storage.get(config.storage.alertHid)).toBeNull();
    // og de står der som vanlige meldinger, med ✕
    expect(box.querySelectorAll('.service-alert .sa-hide').length).toBe(3);
  });

  // Å folde IGJEN henter ingenting tilbake. Åpningen er verbet, ikke begge
  // veier — og forskjellen er ikke teoretisk: legg bort en melding MENS
  // folden er åpen, fold igjen, og en ubetinget unhideAll ville slettet
  // bortleggingen du nettopp gjorde.
  it('beholder en bortlegging du gjør mens folden er åpen', () => {
    const box = el();
    const draw = () => renderAlertsInto(box, [onStop('s1', JBT), onLine('m1', 'RUT:Line:9')],
      draw, ctx([]));
    draw(); åpne(box); draw();
    // ✕ på meldingen om stoppet, mens folden står åpen
    box.querySelector('.service-alert .sa-hide').click(); draw();
    expect(Object.keys(JSON.parse(storage.get(config.storage.alertHid)))).toEqual(['s1']);
    // fold igjen — bortleggingen skal stå
    åpne(box); draw();
    expect(Object.keys(JSON.parse(storage.get(config.storage.alertHid)))).toEqual(['s1']);
  });
});

describe('moreLabel', () => {
  const w = { one: 'melding om en annen linje', many: 'meldinger om andre linjer' };

  it('legger sammen begge slagene', () => {
    expect(moreLabel(2, 1)).toBe('3 meldinger til');
    expect(moreLabel(0, 1)).toBe('1 melding til');
    expect(moreLabel(1, 0)).toBe('1 melding til');
    expect(moreLabel(0, 0)).toBe('');
  });

  // Emnet bare når bunken ER det emnet. En bortlagt melding om stoppet ditt
  // er ikke «en melding om en annen linje», og å telle den inn i den
  // setningen ville sagt noe usant om den.
  it('bruker emnet bare når ingenting er lagt bort', () => {
    expect(moreLabel(2, 0, w)).toBe('2 meldinger om andre linjer');
    expect(moreLabel(2, 1, w)).toBe('3 meldinger til');
  });
});
