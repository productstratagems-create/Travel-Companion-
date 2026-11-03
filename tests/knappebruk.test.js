// Knappebruk: hvilke knapper som brukes, rangert fra mest til minst.
import { describe, it, expect, beforeEach } from 'vitest';
import { saveConsent } from '../src/api/consent.js';
import { knappNavn, normTekst, tellTrykk, tellVist, rangering, rangeringTekst, glemKnappebruk, prune, KNAPP_DAGER } from '../src/api/knappebruk.js';
import { FIELD_LABELS } from '../src/api/eventLog.js';

const NÅ = Date.UTC(2026, 10, 3, 12);
const DAG = 86400000;
const lagret = () => JSON.parse(localStorage.getItem('default::t.knappebruk') || '{}');

function skjerm(html) {
  document.body.innerHTML = '<div id="v-selected">' + html + '</div><nav id="app-nav"><button>tavla</button></nav>';
  // jsdom har ingen layout: alle knapper regnes som synlige.
  document.querySelectorAll('button, a, summary').forEach(b => { b.getClientRects = () => [{}]; });
}

beforeEach(() => { localStorage.clear(); saveConsent(true); });

describe('navnet på en knapp', () => {
  it('data-knapp vinner, så id, så skjerm og tekst', () => {
    skjerm('<button data-knapp="reis" id="x">REIS →</button><button id="sel-map-expand">⤢</button><button>Lagre avgang</button>');
    const [a, b, c] = document.querySelectorAll('#v-selected button');
    expect(knappNavn(a)).toBe('reis');
    expect(knappNavn(b)).toBe('sel-map-expand');
    expect(knappNavn(c)).toBe('selected: Lagre avgang');
  });
  it('klokkeslett og tall skifter, knappen gjør det ikke', () => {
    expect(normTekst('← 19:33')).toBe('← tid');
    expect(normTekst('20:09 →')).toBe('tid →');
    expect(normTekst('3 meldinger')).toBe('# meldinger');
    expect(normTekst('⚡auto-reise')).toBe('auto-reise');
  });
  it('bunnmenyen telles som vist ved hvert skjermbesøk', () => {
    const src = require('node:fs').readFileSync('src/ui/nav.js', 'utf8');
    expect(src).toMatch(/tellVist\(document\.getElementById\('app-nav'\)\)/);
  });
  it('kartets kildehenvisning er ikke en knapp', () => {
    skjerm('<div class="leaflet-control-attribution"><a href="#">OSM</a></div>');
    expect(knappNavn(document.querySelector('.leaflet-control-attribution a'))).toBeNull();
  });
  it('bunnmenyen har sin egen skjerm', () => {
    skjerm('');
    expect(knappNavn(document.querySelector('#app-nav button'))).toBe('meny: tavla');
  });
});

describe('telling og rangering', () => {
  it('trykk telles og rangeres fra mest til minst', () => {
    skjerm('<button>← 19:33</button><button>REIS →</button><button>Lagre avgang</button>');
    const [forrige, reis] = document.querySelectorAll('#v-selected button');
    tellVist(document.getElementById('v-selected'), NÅ);
    tellTrykk(reis, NÅ); tellTrykk(reis, NÅ); tellTrykk(forrige, NÅ);
    const r = rangering(NÅ);
    expect(r.map(x => x.knapp)).toEqual(['selected: REIS →', 'selected: ← tid', 'selected: Lagre avgang']);
    expect(r[0]).toMatchObject({ trykk: 2, vist: 1, andel: 2 });
    expect(r[2]).toMatchObject({ trykk: 0, vist: 1 });
  });
  it('et trykk på noe inne i knappen teller knappen', () => {
    skjerm('<button id="reis"><span>REIS</span></button>');
    tellTrykk(document.querySelector('#reis span'), NÅ);
    expect(rangering(NÅ)[0]).toMatchObject({ knapp: 'reis', trykk: 1 });
  });
  it('samme navn to ganger på én skjerm er ett besøk', () => {
    skjerm('<button>hele reisen</button><button>hele reisen</button>');
    expect(tellVist(document.getElementById('v-selected'), NÅ)).toBe(1);
    expect(rangering(NÅ)[0].vist).toBe(1);
  });
  it('ingenting uten samtykke', () => {
    saveConsent(false);
    skjerm('<button id="reis">REIS</button>');
    tellTrykk(document.getElementById('reis'), NÅ);
    tellVist(document.getElementById('v-selected'), NÅ);
    expect(localStorage.getItem('default::t.knappebruk')).toBe(null);
    expect(rangering(NÅ)).toEqual([]);
  });
  it('glemmes etter sju døgn', () => {
    skjerm('<button id="reis">REIS</button>');
    tellTrykk(document.getElementById('reis'), NÅ - KNAPP_DAGER * DAG);
    tellTrykk(document.getElementById('reis'), NÅ);
    expect(rangering(NÅ)[0].trykk).toBe(1);
    expect(Object.keys(prune(lagret(), NÅ).reis.dager)).toHaveLength(1);
  });
  it('nullstill tømmer', () => {
    skjerm('<button id="reis">REIS</button>');
    tellTrykk(document.getElementById('reis'), NÅ);
    glemKnappebruk();
    expect(rangering(NÅ)).toEqual([]);
  });
  it('som tekst, for å limes inn', () => {
    expect(rangeringTekst([{ knapp: 'reis', skjerm: 'selected', trykk: 4, vist: 2, andel: 2 }]))
      .toBe('1. reis (selected) — 4 trykk, vist 2, 200 %');
  });
});

describe('alt som lagres, vises', () => {
  it('lagret: knappens navn, skjerm, dag, trykk og vist, og ingenting annet', () => {
    skjerm('<button id="reis">REIS</button>');
    tellTrykk(document.getElementById('reis'), NÅ);
    const o = lagret();
    expect(Object.keys(o.reis).sort()).toEqual(['dager', 'skjerm']);
    expect(Object.keys(Object.values(o.reis.dager)[0]).sort()).toEqual(['trykk', 'vist']);
    expect(JSON.stringify(o)).not.toMatch(/lat|lon|pos/);
    expect(FIELD_LABELS).toBeTruthy();
  });
  it('og innstillingene viser hver kolonne', async () => {
    const { knappebrukHtml } = await import('../src/views/settings.js');
    const h = knappebrukHtml([{ knapp: 'reis', skjerm: 'selected', trykk: 3, vist: 4, andel: .75 },
      { knapp: 'kalender', skjerm: 'selected', trykk: 0, vist: 9, andel: 0 }]);
    ['reis', 'selected', '>3<', '>4<', '75 %', 'vist, men aldri trykket', 'kalender', '>9<'].forEach(t => expect(h).toContain(t));
  });
});
