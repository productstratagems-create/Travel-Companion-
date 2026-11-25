/* BESTE OPPLEVELSE PÅ KORTET (v1.218.318): hvert «ett bytte»-kort viser sin beste opplevelse. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { lastOpptak, avspiller } from './fixtures/entur/avspilling.js';
import { parseTurruter, parseFriluft, parseWikidata } from '../src/api/opplevelserKilder.js';
import { opplevelserVed } from '../src/opplevelser.js';
import { ettBytteHtml, _nullstillEttBytte, _settOpplevelseKilder, _køStatus, FORHÅND_SAMTIDIG, FORHÅND_STEDER } from '../src/views/ettBytteVisning.js';

const F = JSON.parse(fs.readFileSync('tests/fixtures/opplevelser/oppegard.json', 'utf8'));
const tr = parseTurruter(F.turrute, F.stopp);
const data = { liste: opplevelserVed([...tr.kandidater, ...parseFriluft(F.friluft, F.stopp), ...parseWikidata(F.wikidata)], F.stopp), punkter: tr.punkter, status: {} };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const O = lastOpptak('mortensrud_dag'), pos = O.scenario.posisjon, nå = Date.parse(O.scenario.tid), av = avspiller(O);
const hent = av.hent;
const vent = ms => new Promise(r => setTimeout(r, ms));

describe('beste opplevelse på kortet', () => {
  beforeEach(() => _nullstillEttBytte());
  it('kortene viser sin beste opplevelse (navn, hva, ved hvilket stopp), og stoppene står under', async () => {
    _settOpplevelseKilder(async () => data, async () => null, async () => null);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(120);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(200);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
    expect(html).toMatch(/class="eb-forh-merke">beste opplevelse i [a-zæøå ]+</);
    // Opplevelsen henger UNDER kortets overskrift (nærhet + felles ramme), og etiketten bærer kortets eget navn.
    const rad = html.slice(html.indexOf('class="eb-rad"'), html.indexOf('</button>', html.indexOf('class="eb-rad"')));
    expect(rad.indexOf('class="eb-topp"')).toBeGreaterThan(-1);
    expect(rad.indexOf('class="eb-forh"')).toBeGreaterThan(rad.indexOf('class="eb-topp"'));
    expect(rad).toMatch(/ett av \d steder kortet dekker/);
    expect(html).toMatch(/class="eb-forh-hva">[^<]+ · ved [^<]+ · /);
    expect(html).toMatch(/class="eb-steder"/);                    // stoppene står fortsatt, under
    expect((html.match(/class="eb-forh"/g) || []).length).toBeGreaterThan(1);   // flere kort har en
  });
  it('uten funn: kortet står som før, ingen tom boks', async () => {
    _settOpplevelseKilder(async () => ({ liste: [], punkter: [], status: {} }), async () => null, async () => null);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(120);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(200);
    const html = ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} });
    expect(html).not.toMatch(/eb-forh/);
    expect(html).toMatch(/class="eb-rad"/);
  });
  it('køen holder høyst tre oppslag samtidig, og bare tre steder per kort', async () => {
    let aktiv = 0, maks = 0, kall = 0;
    _settOpplevelseKilder(async () => { kall++; aktiv++; maks = Math.max(maks, aktiv); await vent(15); aktiv--; return data; }, async () => null, async () => null);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(120);
    ettBytteHtml(pos, { esc, hent, nå, hentKommuner: null, rerender: () => {} }); await vent(500);
    expect(FORHÅND_SAMTIDIG).toBe(3); expect(FORHÅND_STEDER).toBe(3);
    expect(maks).toBeLessThanOrEqual(3);
    expect(kall).toBeGreaterThan(3);
    expect(kall).toBeLessThanOrEqual(3 * 8);                      // høyst tre steder per kort, åtte kort
    expect(_køStatus().aktiv).toBe(0);
  });
});
