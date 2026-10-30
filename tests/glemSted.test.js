/**
 * Et sted du har reist til én gang blir stående i ukevis.
 *
 * Kortene under «dit du ofte skal» rangeres av `t.freqArr`, og `trackPlace()`
 * teller opp hver destinasjon du velger (`settings.js:1155`). Men
 * `src/api/usage.js` har INGEN vei til å fjerne noe — bare `loadFreq`,
 * `saveFreq` og `trackPlace`. Reiser du én gang til Ekeberg camping, er den
 * der til ti andre steder har dyttet den ut.
 *
 * PÅ NAVN, IKKE PÅ ID ELLER INDEKS. `stopId` er `null` når ruta kom fra et
 * skrevet eller geokodet sted (`usage.js:53`), så navnet er identiteten —
 * det er også det `trackPlace` slår opp på (`usage.js:47`). `recentDests.js`
 * lærte den samme leksa, og skrev den ned: to oppføringer kan dele prefiks.
 *
 * OG DEN MÅ IKKE TA FOR MYE. «Oslo S» er et prefiks av «Oslo lufthavn
 * Gardermoen» på ingen måte — men «Oslo» er et prefiks av begge, og en
 * delstrengstest ville tatt dem begge. Hele navnet, eller ingenting.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { loadFreq, saveFreq, trackPlace, glemSted, glemAlleSteder } from '../src/api/usage.js';

const sted = (name, count, stopId) => ({
  name, count, lastUsed: Date.now(), lat: 59.9, lon: 10.7, stopId: stopId || null,
});

beforeEach(() => localStorage.clear());

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten noe i lista ville hver påstand under vært
  // grønn uten å ha prøvd noe.
  it('har en historikk å fjerne fra', () => {
    saveFreq('arr', [sted('Ekeberg camping', 3), sted('Jernbanetorget', 9)]);
    expect(loadFreq('arr')).toHaveLength(2);
  });
});

describe('glemSted', () => {
  /* FØR-BILDET. Funksjonen fantes ikke; det var ingen vei ut av lista. */
  it('fjerner stedet, og lar resten stå', () => {
    saveFreq('arr', [sted('Ekeberg camping', 3), sted('Jernbanetorget', 9)]);
    glemSted('arr', 'Ekeberg camping');
    expect(loadFreq('arr').map(p => p.name)).toEqual(['Jernbanetorget']);
  });

  /* PÅSTANDEN SOM BÆRER IDENTITETEN. Et sted uten stopp-id er det vanlige
   * tilfellet for alt som ble skrevet inn framfor valgt fra en liste. */
  it('glemmer et sted som ikke har noen stopp-id', () => {
    saveFreq('arr', [sted('Mormors hus', 2, null)]);
    glemSted('arr', 'Mormors hus');
    expect(loadFreq('arr')).toHaveLength(0);
  });

  it('og bryr seg ikke om store bokstaver, slik trackPlace ikke gjør', () => {
    saveFreq('arr', [sted('Ekeberg camping', 3)]);
    glemSted('arr', '  ekeberg CAMPING ');
    expect(loadFreq('arr')).toHaveLength(0);
  });

  /* OG DEN TAR IKKE FOR MYE. Hele navnet, ikke en delstreng. */
  it('tar ikke naboen som deler prefiks', () => {
    saveFreq('arr', [sted('Oslo S', 5), sted('Oslo lufthavn', 2)]);
    glemSted('arr', 'Oslo S');
    expect(loadFreq('arr').map(p => p.name)).toEqual(['Oslo lufthavn']);
  });

  it('og den andre veien', () => {
    saveFreq('arr', [sted('Oslo S', 5), sted('Oslo lufthavn', 2)]);
    glemSted('arr', 'Oslo');
    expect(loadFreq('arr')).toHaveLength(2);
  });

  /* ROLLENE ER TO LISTER. Å glemme et reisemål skal ikke røre stedene du
   * reiser FRA — de har sin egen nøkkel og sin egen betydning. */
  it('rører ikke den andre rollen', () => {
    saveFreq('arr', [sted('Oslo S', 5)]);
    saveFreq('dep', [sted('Oslo S', 5)]);
    glemSted('arr', 'Oslo S');
    expect(loadFreq('arr')).toHaveLength(0);
    expect(loadFreq('dep')).toHaveLength(1);
  });

  it('tåler tull', () => {
    saveFreq('arr', [sted('Oslo S', 5)]);
    [null, undefined, '', '   ', 'Finnes ikke'].forEach(x => {
      expect(() => glemSted('arr', x)).not.toThrow();
    });
    expect(loadFreq('arr')).toHaveLength(1);
  });
});

describe('og et glemt sted kommer tilbake når du reiser dit igjen', () => {
  /* DET ER IKKE EN FEIL, DET ER AVTALEN. «Glem» betyr «glem at jeg har reist
   * hit», ikke «skjul for alltid». `trackPlace` er uendret, og en ny reise
   * dit teller fra én igjen.
   *
   * Står dette ikke skrevet ned, er det neste rapport. */
  it('fra null, ikke fra der den slapp', () => {
    saveFreq('arr', [sted('Ekeberg camping', 7)]);
    glemSted('arr', 'Ekeberg camping');
    trackPlace('arr', 'Ekeberg camping', { lat: 59.9, lon: 10.7 });
    const liste = loadFreq('arr');
    expect(liste).toHaveLength(1);
    expect(liste[0].count).toBe(1);
  });
});

/* ── «SLETT ALT APPEN HUSKER» HUSKET FORTSATT HVOR DU REISER ────────────
 *
 * Knappen i innstillinger tømte hendelsesloggen og de nylige destinasjonene,
 * men lot `t.freqArr` og `t.freqDep` stå. Det er den mest personlige
 * opplysningen appen har — hvor du reiser fra og til, og hvor ofte — og den
 * overlevde en knapp som lover det motsatte.
 *
 * Funnet mens `glemSted` ble skrevet, da «alt» viste seg å være mindre enn
 * «én».
 */
describe('glemAlleSteder', () => {
  it('tømmer begge rollene', () => {
    saveFreq('arr', [sted('Oslo S', 5)]);
    saveFreq('dep', [sted('Mortensrud', 9)]);
    glemAlleSteder();
    expect(loadFreq('arr')).toEqual([]);
    expect(loadFreq('dep')).toEqual([]);
  });

  /* OG KNAPPEN KALLER DEN FAKTISK. Funksjonen kan være aldri så riktig;
   * kalles den ikke fra «slett alt», står historikken igjen som før — og det
   * er sjette gang i denne økta at det er kallestedet som bærer. */
  it('og «slett alt appen husker» kaller den', () => {
    const src = fs.readFileSync('src/views/settings.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const i = src.indexOf("getElementById('mem-clear')");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toMatch(/glemAlleSteder\(\)/);
  });
});
