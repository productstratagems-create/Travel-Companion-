/**
 * Tavla viser ingen meldinger.
 *
 * «Kutt all meldingsvisning øverst på tavle. Den oppfører seg uansett feil.»
 *
 * Fem utgivelser på rad handlet om dette banneret — v1.144 til v1.148 — og
 * tre av dem kom av at jeg la til noe som ikke var bedt om, eller rettet på
 * feil grunnlag. Det skal bort.
 *
 * HVA DET KOSTER: tavla er taus om meldinger. En stengt linje på ruta di
 * dukker ikke opp der. Den står fortsatt på auto-reise, på avgangsdetaljer og
 * underveis.
 *
 * OG DET SOM IKKE MÅ FØLGE MED: tavla er HENTEREN for de tre andre. Fjernes
 * innsamlingen sammen med visningen, blir de tomme uten at noen har bedt om
 * det.
 */
import { describe, it, expect } from 'vitest';

const read = (f) => require('node:fs').readFileSync(f, 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('banneret er borte fra tavla', () => {
  it('finnes ikke i markupen', () => {
    expect(read('index.html')).not.toMatch(/id="service-alerts"/);
  });

  it('tegnes ikke av renderBoard', () => {
    expect(code('src/views/board.js')).not.toMatch(/renderAlerts\(/);
  });

  it('har ingen innpakning igjen i alerts.js', () => {
    expect(code('src/ui/alerts.js')).not.toMatch(/export function renderAlerts\(/);
  });

  it('har ingen egen stilregel igjen', () => {
    expect(read('src/style/board.css')).not.toMatch(/#service-alerts\s*\{/);
  });
});

/**
 * Og alt som bærer de tre andre skjermene står.
 *
 * Dette er den dyre feilen å gjøre her: å rive ut innsamlingen fordi den lå
 * ved siden av visningen.
 */
describe('meldingene finnes fortsatt', () => {
  it('tavla henter dem fortsatt, for de andre skjermene', () => {
    const b = code('src/views/board.js');
    expect(b).toMatch(/state\.serviceAlerts = collectStopSituations\(stop, dir\.stopId\)/);
    expect(b).toMatch(/state\.serviceAlerts = situations \|\| \[\]/);
    expect(b).toMatch(/pruneHidden\(state\.serviceAlerts\)/);
  });

  it('og de tre skjermene tegner dem', () => {
    expect(code('src/views/track.js')).toMatch(/renderAlertsInto\(document\.getElementById\('t-alerts'\)/);
    expect(code('src/views/selected.js')).toMatch(/renderAlertsInto\(document\.getElementById\('s-alerts'\)/);
    expect(code('src/views/auto.js')).toMatch(/renderAlertsInto\(_el\('auto-alerts'\)/);
  });

  it('renderAlertsInto står', () => {
    expect(code('src/ui/alerts.js')).toMatch(/export function renderAlertsInto\(/);
  });

  // Lista tegner fortsatt av den, selv om banneret ikke lenger leser den.
  it('boardRowDeps står, for lista', () => {
    const b = code('src/views/board.js');
    expect(b).toMatch(/export function boardRowDeps\(/);
    expect(b).toMatch(/const rowDeps = _rows;/);
  });
});

/**
 * Vakten fra v1.105.0 flytter med.
 *
 * `#service-alerts` lå utenfor hver v-*-div, og show() slår bare dem av og på
 * — så ett banner sto på hver skjerm uansett hva det handlet om. Lærdommen
 * gjelder fortsatt for de tre som er igjen.
 */
describe('hvert banner ligger inne i sin egen skjerm', () => {
  const html = read('index.html');
  const inni = (skjerm, banner) => {
    const s = html.indexOf('id="' + skjerm + '"');
    const b = html.indexOf('id="' + banner + '"');
    expect(s).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(-1);
    // banneret kommer etter skjermens egen div, og før den neste v-*-div
    const neste = html.indexOf('id="v-', b);
    return s < b && (neste === -1 || neste > b);
  };

  it('auto-reise', () => expect(inni('v-auto', 'auto-alerts')).toBe(true));
  it('avgangsdetaljer', () => expect(inni('v-selected', 's-alerts')).toBe(true));
  it('underveis', () => expect(inni('v-track', 't-alerts')).toBe(true));
});
