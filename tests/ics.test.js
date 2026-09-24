/**
 * Etappen i kalenderen, med alarm på «gå nå».
 *
 * Spurt: «Hvordan kan upcoming reiser i reiseplanen varsles til brukeren?»
 *
 * Dataene fantes allerede — en etappe bærer depIso, arrIso, linje og
 * serviceJourneyId. Det var LEVERINGEN som manglet, og den har en mur:
 * ekte web push krever noen som SENDER den, med en VAPID-nøkkel, og appen
 * lover «ingen server». Alt som hviler på at fanen lever dør også, for iOS
 * fryser en bakgrunnsfane i løpet av sekunder.
 *
 * Kalenderen er det eneste som varsler med appen lukket, uten server:
 * telefonens eget OS gjør jobben.
 *
 * OG ALARMEN SKAL SI «GÅ NÅ». Et varsel når toget går er ubrukelig — da er du
 * for sent ute. Appen har begrepet fra før, i `minsToLeave` og
 * `WALK_FOCUS_MINS`; her er det avgang minus gangtid minus margin.
 */
import { describe, it, expect } from 'vitest';
import { legIcs, leadMins, icsEscape, icsFold, ICS_DOMAIN } from '../src/api/ics.js';
import { LEG_FALLBACK_MINS } from '../src/api/plan.js';

const MIN = 60000;
const DEP = new Date(2026, 8, 23, 8, 12, 0);
const ARR = new Date(2026, 8, 23, 8, 41, 0);

const leg = (over = {}) => ({
  id: 'leg_1758600000000',
  line: '3', lineColour: 'f5a000',
  from: 'Mortensrud', to: 'Jernbanetorget',
  depIso: DEP.toISOString(),
  arrIso: ARR.toISOString(),
  serviceJourneyId: 'RUT:ServiceJourney:1',
  addedAt: DEP.getTime() - 3600000,
  ...over,
});

/** Linjene i en ics, ubrettet igjen, så innholdet kan leses. */
const lines = (txt) => txt.replace(/\r\n[ \t]/g, '').split('\r\n');
const field = (txt, name) =>
  lines(txt).filter(l => l.startsWith(name)).map(l => l.slice(l.indexOf(':') + 1));

describe('leadMins', () => {
  // Gangtiden pluss margin. Appen har allerede `loadWalkBuffer()`.
  it('legger margin til gangtiden', () => {
    const { mins, source } = leadMins(leg(), { walkMins: 9, buffer: 2 });
    expect(mins).toBe(11);
    expect(source).toBe('gange');
  });

  // Etappen lagrer ingen koordinater for avreisestoppet, så gangtiden kan
  // ikke alltid vites. Da gjettes den — OG DET SIES.
  it('faller tilbake på standarden, og sier at den gjetter', () => {
    const { mins, source } = leadMins(leg(), { walkMins: null, buffer: 2, fallback: 8 });
    expect(mins).toBe(10);
    expect(source).toBe('standard');
  });

  it('gir aldri en margin under ett minutt', () => {
    expect(leadMins(leg(), { walkMins: 0, buffer: 0, fallback: 8 }).mins).toBeGreaterThan(0);
  });
});

describe('legIcs', () => {
  const txt = () => legIcs(leg(), { mins: 11, source: 'gange' });

  it('er en kalenderfil med én hendelse', () => {
    const l = lines(txt());
    expect(l[0]).toBe('BEGIN:VCALENDAR');
    expect(l[l.length - 2]).toBe('END:VCALENDAR');
    expect(l.filter(x => x === 'BEGIN:VEVENT').length).toBe(1);
  });

  // DETTE ER HELE POENGET: alarmen er ikke avgangen.
  it('setter alarmen på «gå nå», ikke på avgangen', () => {
    expect(field(txt(), 'TRIGGER')).toEqual(['-PT11M']);
  });

  // Avledet av fiksturen, ikke skrevet ut for hånd: `new Date(2026, 8, 23, 8, 12)`
  // bygges i KJØRERENS sone, og jeg skrev først 06:12Z som om den var Oslos.
  // Testen ville da vært grønn i Norge og rød i containeren.
  const utc = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  it('bruker avgang og ankomst som de står', () => {
    expect(field(txt(), 'DTSTART')[0]).toBe(utc(DEP));
    expect(field(txt(), 'DTEND')[0]).toBe(utc(ARR));
  });

  // Faller ankomsten bort, brukes den samme antakelsen legStatus gjør — og
  // den har ETT navn, så de to ikke kan drive fra hverandre.
  it('låner legStatus sin antakelse når ankomsten mangler', () => {
    const t = legIcs(leg({ arrIso: null }), { mins: 11, source: 'gange' });
    const dt = field(t, 'DTEND')[0];
    const ventet = new Date(DEP.getTime() + LEG_FALLBACK_MINS * MIN);
    expect(dt).toBe(ventet.toISOString().replace(/[-:]|\.\d{3}/g, ''));
  });

  // Samme UID betyr at en ny eksport ERSTATTER oppføringen framfor å lage en
  // til. Det er svaret på at en kalenderoppføring er et øyeblikksbilde:
  // flytter avgangen seg, kan appen eksportere igjen og alarmen flytter med.
  it('har en stabil UID, så en ny eksport erstatter', () => {
    const a = field(legIcs(leg(), { mins: 11, source: 'gange' }), 'UID')[0];
    const b = field(legIcs(leg({ depIso: new Date(DEP.getTime() + 4 * MIN).toISOString() }),
      { mins: 11, source: 'gange' }), 'UID')[0];
    expect(a).toBe(b);
    expect(a).toContain('leg_1758600000000');
    expect(a).toContain(ICS_DOMAIN);
  });

  // …og kalenderen ignorerer en oppdatering som ikke sier at den er nyere.
  it('teller SEQUENCE opp for en oppdatering', () => {
    expect(field(legIcs(leg(), { mins: 11, source: 'gange' }, 0), 'SEQUENCE')).toEqual(['0']);
    expect(field(legIcs(leg(), { mins: 11, source: 'gange' }, 3), 'SEQUENCE')).toEqual(['3']);
  });

  it('navngir linja og reisen i overskriften', () => {
    expect(field(txt(), 'SUMMARY')[0]).toContain('3');
    expect(field(txt(), 'SUMMARY')[0]).toContain('Jernbanetorget');
  });

  // SI HVA DU IKKE VET: at alarmen er «gå nå» og ikke avgangen, hva marginen
  // er bygget av, og at en forsinkelse ikke når kalenderen.
  it('sier i teksten hva alarmen er, og hva den ikke vet', () => {
    const d = field(txt(), 'DESCRIPTION')[0];
    expect(d.toLowerCase()).toContain('gå nå');
    expect(d).toMatch(/11 min/);
    expect(d).toMatch(/forsink/i);
  });

  it('sier at marginen er gjettet når den er det', () => {
    const d = field(legIcs(leg(), { mins: 10, source: 'standard' }), 'DESCRIPTION')[0];
    expect(d).toMatch(/standard/);
  });
});

/**
 * Og formatet, som er uforsonlig: bryter en av disse, avviser iOS hele fila
 * stille — ingen feilmelding, bare ingen oppføring.
 */
describe('formatet', () => {
  it('rømmer tegnene RFC 5545 krever', () => {
    expect(icsEscape('Oslo S, spor 1; linje 3\nneste')).toBe('Oslo S\\, spor 1\\; linje 3\\nneste');
    expect(icsEscape('bakover\\fram')).toBe('bakover\\\\fram');
  });

  it('overlever et stoppnavn med komma', () => {
    const t = legIcs(leg({ to: 'Jernbanetorget, Oslo' }), { mins: 11, source: 'gange' });
    expect(field(t, 'SUMMARY')[0]).toContain('Jernbanetorget\\, Oslo');
  });

  it('bretter linjer på 75 oktetter, med mellomrom foran fortsettelsen', () => {
    const lang = icsFold('DESCRIPTION:' + 'æ'.repeat(200));
    lang.split('\r\n').forEach(l => {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    });
    expect(lang.split('\r\n').slice(1).every(l => l.startsWith(' '))).toBe(true);
  });

  it('bretter ikke midt i et flerbytetegn', () => {
    const ut = icsFold('X:' + 'ø'.repeat(100));
    expect(ut).not.toContain('�');
    expect(ut.replace(/\r\n /g, '')).toBe('X:' + 'ø'.repeat(100));
  });

  it('bruker CRLF overalt', () => {
    const t = legIcs(leg(), { mins: 11, source: 'gange' });
    expect(t.split('\n').every(l => l === '' || l.endsWith('\r'))).toBe(true);
  });
});

/**
 * Og hvor skjermen tilbyr den.
 *
 * Kildetest, fordi `renderPlan` ikke tegnes av noen test i dette repoet —
 * nettleserprøven er det som faktisk ser den. Det denne binder er at
 * koblingen ikke forsvinner, og at den ikke tilbys på feil etappe.
 */
describe('knappen i reiseplanen', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/plan.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  // En alarm for en reise du alt sitter på er støy.
  it('tilbys bare på en etappe som ikke har begynt', () => {
    const s = src();
    expect(s).toMatch(/st === 'future'\s*\n?\s*\? '<button class="plan-leg-cal"/);
  });

  // Kortet under åpner etappen; knappen skal ikke gjøre begge deler.
  it('åpner ikke etappen på veien', () => {
    expect(src()).toMatch(/plan-leg-cal" onclick="event\.stopPropagation\(\)/);
  });

  // Stigen og marginen bor nå i src/api/calShare.js: da tillegget på
  // avgangsskjermen ville ha det samme arket, ville en kopi her vært to
  // steder som bygger den samme fila. Påstandene er de samme — de leser bare
  // eieren. At reiseplanen ikke bygger fila selv bindes av addLegShare.test.js.
  const lad = () => require('node:fs')
    .readFileSync('src/api/calShare.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  // Stigen: delearket først (iOS-veien), så nedlasting, så et ord.
  it('prøver delearket før nedlasting', () => {
    const h = lad();
    expect(h.indexOf('navigator.canShare')).toBeLessThan(h.indexOf('a.download'));
    expect(h).toMatch(/type: 'text\/calendar'/);
    expect(h).toMatch(/logMsg\(/);
  });

  // Marginen skal komme fra leadMins, ikke fra et tall skrevet her.
  it('lar leadMins bestemme marginen', () => {
    const s = lad();
    expect(s).toMatch(/return leadMins\(leg, \{/);
    expect(s).toMatch(/buffer: loadWalkBuffer\(\)/);
    expect(s).toMatch(/fallback: config\.defaultWalkMinutes/);
  });
});

/**
 * Og at den kan kjøre i en nettleser.
 *
 * `Buffer` finnes i node og ikke i nettleseren, og `Buffer.byteLength ? …` er
 * ikke en trygg sjekk: et bart navn som ikke finnes KASTER. Alle testene her
 * passerte mens funksjonen kastet «Buffer is not defined» på telefonen —
 * nettleserprøven fant det, og ingen enhetstest i dette repoet kunne.
 *
 * Derfor en kildetest: modulen skal ikke nevne Buffer i det hele tatt.
 */
describe('ics.js kjører i en nettleser', () => {
  it('bruker ikke Buffer', () => {
    const s = require('node:fs').readFileSync('src/api/ics.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(s).not.toMatch(/\bBuffer\b/);
    expect(s).toMatch(/new TextEncoder\(\)/);
  });
});
