// Testrutene: foreslår appen gode reiser på tvers av transportmidler?
//
// Hver rute kjøres gjennom appens EKTE kjede: `fetchTrip` (med trappen som
// dropper valgfrie felt Entur avviser) → `adaptTripPattern` →
// `boardRowDeps`. Så måles svaret mot reglene i `src/testruter.js`.
//
//   npm test             spiller av lagrede svar (tests/fixtures/testruter)
//   npm run testruter    spør Entur, lagrer svarene på nytt og skriver
//                        rapporten docs/testruter.md
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { RUTER, HVERDAG, LØRDAG } from './testruter/ruter.js';

const LIVE = process.env.TESTRUTER_LIVE === '1';
const DIR = 'tests/fixtures/testruter';
const TIDER = [['hverdag', HVERDAG], ['lørdag', LØRDAG]];

vi.mock('leaflet', () => ({ default: {} }));
vi.mock('../src/ui/mapCompass.js', () => ({ addCompass: vi.fn() }));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn(), setDot: vi.fn() }));

/* Nettet: live går til Entur og tar opp hvert spørsmål og svar; avspilling
 * gir svarene tilbake i samme rekkefølge. Trappen i `fetchTrip` spør igjen
 * når et felt avvises, så et opptak er en LISTE av spørsmål. */
let opptak = [];
let avspilling = null;
vi.mock('../src/api/http.js', async (orig) => {
  const ekte = await orig();
  return { ...ekte, enturFetch: async (url, opts = {}) => {
    const query = opts.body ? JSON.parse(opts.body).query : null;
    if (avspilling) {
      // Etter spørsmålet, ikke rekkefølgen: «også via» spør to ganger
      // samtidig, og hvilket svar som kom først er tilfeldig.
      const i = avspilling.findIndex(o => o.query === query);
      if (i < 0) throw new Error('avspilling: spørsmålet finnes ikke i opptaket — kjør npm run testruter');
      const [neste] = avspilling.splice(i, 1);
      return { ok: true, status: 200, json: async () => neste.svar };
    }
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), 'ET-Client-Name': ekte.ET_CLIENT_NAME } });
    const svar = await r.json();
    opptak.push({ query, svar });
    return { ok: r.ok, status: r.status, json: async () => svar };
  } };
});

/** Én rute på ett tidspunkt, gjennom appens kjede, i en fersk modul. */
async function kjør(rute, tid) {
  vi.resetModules();
  const entur = await import('../src/api/entur.js');
  const { adaptTripPattern, takeDropReasons } = await import('../src/api/adapt.js');
  const { boardRowDeps } = await import('../src/views/board.js');
  const { BOARD_MODES } = await import('../src/api/queries.js');
  const fil = DIR + '/' + rute.id + '-' + tid[0] + '.json';
  opptak = [];
  avspilling = LIVE ? null : JSON.parse(readFileSync(fil, 'utf8'));
  const rå = await new Promise((ok, feil) =>
    entur.fetchTrip({ key: rute.id, ...rute.fra, ...rute.til, ...(rute.ekstra || {}) }, p => ok(p), e => feil(new Error(e)), tid[1]));
  if (LIVE) { mkdirSync(DIR, { recursive: true }); writeFileSync(fil, JSON.stringify(opptak)); }
  const spurt = (LIVE ? opptak : JSON.parse(readFileSync(fil, 'utf8'))).map(o => o.query);
  takeDropReasons();
  const adaptert = rå.map(adaptTripPattern).filter(Boolean);
  const grunner = takeDropReasons();
  const alle = Object.fromEntries(BOARD_MODES.map(m => [m, true]));
  const rader = boardRowDeps(adaptert, null, alle, null);
  return { rå, adaptert, grunner, rader, spurt };
}

const { vurder } = await import('../src/testruter.js');

/* FUNNET AV TESTRUTENE 2026-11-03 mot det ekte API-et, rettet i v1.211.8.
 *
 * Entur avviser `affects` («Unknown type 'AffectedQuay'»). Feilmeldingen
 * sier ikke hvilket argument som var galt, og trappen i `fetchTrip` dropper
 * derfor i fast rekkefølge: innstilte, bytte, ider og først deretter affects.
 * Tre felt som virker (`includeRealtimeCancellations`, `interchangeTo`,
 * `quay{id}`) går tapt for hele økta, og første henting bruker fem
 * spørsmål. Rettet ved å spørre etter det ekte skjemaet og ved å la
 * trappen droppe feltet feilen peker på. */
describe('trappen i fetchTrip', () => {
  it('beholder feltene Entur godtar', async () => {
    const fil = DIR + '/oslos-lillestrom-hverdag.json';
    if (!existsSync(fil)) return;
    const siste = JSON.parse(readFileSync(fil, 'utf8')).slice(-1)[0].query;
    expect(siste).toContain('includeRealtimeCancellations');
    expect(siste).toContain('interchangeTo');
    expect(siste).toContain('quay{id');
    expect(siste).toContain('affects{');
    // Og første gang, ikke etter fem forsøk.
    expect(JSON.parse(readFileSync(fil, 'utf8'))).toHaveLength(1);
  });
});
const resultater = [];

describe.each(RUTER)('$navn ($tester)', (rute) => {
  describe.each(rute.tider || TIDER)('%s', (navn, tid) => {
    let res;
    beforeAll(async () => {
      if (!LIVE && !existsSync(DIR + '/' + rute.id + '-' + navn + '.json')) return;
      const k = await kjør(rute, [navn, tid]);
      res = { k, regler: vurder(rute, k.rå, k.adaptert.length, k.rader, k.grunner) };
      resultater.push({ rute, navn, ...res });
    }, 60000);
    // Reiser som MÅ være blant radene, som linjekjeder («metro:3>metro:2>bus:69»).
    it.each(rute.måHa || [])('har %s', (kjede) => {
      if (!res) return;
      const kjeder = res.k.rader.map(({ c }) => (c._legs || []).map(l => l.mode + ':' + ((l.serviceJourney && l.serviceJourney.line && l.serviceJourney.line.publicCode) || '?')).join('>'));
      expect(kjeder, kjeder.join(' | ')).toContain(kjede);
    });
    // «Også»: noe fra spørringen uten via skal stå der også.
    if (rute.ekstra && rute.ekstra.viaOgså) it('har reiser uten via-stoppet også', () => {
      if (!res) return;
      expect(res.k.rader.some(({ c }) => !c._via)).toBe(true);
      expect(res.k.rader.some(({ c }) => c._via === rute.ekstra.via)).toBe(true);
    });
    it.each(['svar', 'ingen stille tap', 'riktig transportmiddel', 'ikke dårligere enn Entur',
      'bytter', 'gange', 'stigende avganger'])('%s', (regel) => {
      if (!res) return;                    // ikke tatt opp ennå
      const r = res.regler.find(x => x.regel === regel);
      if (!r) return;                      // ingen rader å måle
      expect(r.ok, r.detalj).toBe(true);
    });
  });
});

if (LIVE) {
  // Rapporten, skrevet når alle rutene er kjørt.
  describe('rapport', () => {
    it('skrives til docs/testruter.md', () => {
      const linjer = ['# Testruter', '', 'Kjørt mot Entur ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC.', '',
        '| rute | når | rader | beste reise | brudd |', '|---|---|---|---|---|'];
      resultater.forEach(({ rute, navn, regler, k }) => {
        const brudd = regler.filter(r => !r.ok).map(r => r.regel + ' (' + r.detalj + ')').join('; ') || '—';
        const beste = (regler.find(r => r.regel === 'riktig transportmiddel') || {}).detalj || '';
        linjer.push('| ' + rute.navn + ' | ' + navn + ' | ' + k.rader.length + '/' + k.rå.length + ' | '
          + beste.replace(/^beste reise: /, '').replace(/;.*/, '') + ' | ' + brudd + ' |');
      });
      // Hva trappen endte med å sende, målt på de faktiske spørsmålene.
      const felt = ['includeRealtimeCancellations', 'interchangeTo', 'quay{id', 'searchWindow', 'transportMode:coach', 'affects'];
      const k0 = resultater[0] && resultater[0].k;
      if (k0) {
        const siste = k0.spurt[k0.spurt.length - 1];
        linjer.push('', '## Spørringen etter trappen', '',
          k0.spurt.length + ' spørsmål før Entur svarte. Felt i spørringen som ble brukt:', '',
          ...felt.map(f => '- `' + f + '`: ' + (siste.includes(f) ? 'med' : '**droppet**')));
      }
      writeFileSync('docs/testruter.md', linjer.join('\n') + '\n');
    });
  });
}
