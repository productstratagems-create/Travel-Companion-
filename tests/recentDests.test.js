/**
 * De fem siste stedene du gikk til — og veien ut av dem.
 *
 * Rapportert fra et skjermbilde: «hvor skal du videre?» viser chips du kan
 * velge. Du kunne ikke bli kvitt dem. Det fantes ingen slettefunksjon i det
 * hele tatt.
 *
 * OG UNDER DET LÅ NOE MER.
 *
 * Knappen i innstillingene sier «slett alt appen husker». Det er en absolutt
 * påstand. `clearEvents()` rører bare `t.events`, så fem destinasjoner ble
 * stående igjen etter at noen hadde bedt appen glemme alt.
 *
 * Destinasjoner er dessuten det mest avslørende appen holder på — mer enn en
 * rute, som bare sier hvor du pleier å reise fra. Personvernsiden nevnte dem
 * ikke med et ord.
 *
 * De fortsetter å lagres uten å spørre, som favoritter og ruter gjør. Men da
 * skal det stå skrevet, og knappen som lover å slette alt skal gjøre det.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import {
  RECENT_KEY, MAX_RECENTS,
  loadRecentDests, saveRecentDest, removeRecentDest, clearRecentDests,
} from '../src/api/recentDests.js';

const sted = (label, lat = 59.9, lon = 10.75) => ({ label, lat, lon });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
});

describe('fiksturen selv', () => {
  // Måleinstrumentet først: lagrer den ikke noe, ville hver test under vært
  // grønn uten å ha prøvd noe.
  it('lagrer faktisk, og leser det tilbake', () => {
    saveRecentDest(sted('Stortinget, Oslo'));
    expect(loadRecentDests().map(d => d.label)).toEqual(['Stortinget, Oslo']);
    expect(localStorage.getItem('default::' + RECENT_KEY)).toContain('Stortinget');
  });
});

describe('å fjerne én', () => {
  /* FØR-BILDET. `removeRecentDest` fantes ikke. */
  it('fjerner den du peker på, og lar resten stå', () => {
    ['A', 'B', 'C'].forEach(l => saveRecentDest(sted(l)));
    removeRecentDest('B');
    // Nyeste først, slik `saveRecentDest` legger dem inn.
    expect(loadRecentDests().map(d => d.label)).toEqual(['C', 'A']);
  });

  /* PÅSTANDEN SOM BÆRER KORREKTHETEN.
   *
   * Fjernes det på INDEKS framfor på etikett, ser det riktig ut helt til to
   * chips deler prefiks — og da forsvinner feil sted uten at noen skjønner
   * hvorfor. «Oslo S» og «Oslo lufthavn» er ekte stopp som gjør nettopp det.
   *
   * Her er det også et delstrengproblem: `legExtent` finnes i denne
   * kodebasen fordi «Bryn» er en delstreng av «Brynseng», og den feilen
   * tegnet feil strekning uten å si fra. Samme felle, annen liste. */
  it('treffer på hele etiketten, ikke på en delstreng av den', () => {
    ['Oslo S', 'Oslo lufthavn', 'Oslo'].forEach(l => saveRecentDest(sted(l)));
    removeRecentDest('Oslo');
    expect(loadRecentDests().map(d => d.label)).toEqual(['Oslo lufthavn', 'Oslo S']);
  });

  it('gjør ingenting når etiketten ikke finnes', () => {
    saveRecentDest(sted('A'));
    removeRecentDest('finnes ikke');
    expect(loadRecentDests()).toHaveLength(1);
  });

  it('tåler et tomt lager', () => {
    expect(() => removeRecentDest('A')).not.toThrow();
    expect(loadRecentDests()).toEqual([]);
  });
});

describe('å tømme alle', () => {
  it('etterlater ingenting', () => {
    ['A', 'B', 'C'].forEach(l => saveRecentDest(sted(l)));
    clearRecentDests();
    expect(loadRecentDests()).toEqual([]);
    expect(localStorage.getItem('default::' + RECENT_KEY)).toBeNull();
  });
});

describe('«slett alt appen husker» er en absolutt påstand', () => {
  /* FØR-BILDET, OG DEN SOM BETYR MEST.
   *
   * Knappen lover å slette alt. Den kalte bare `clearEvents()`, som rører
   * `t.events` alene — så fem destinasjoner sto igjen etter at noen hadde
   * bedt appen glemme alt.
   *
   * Bundet på kildeteksten og ikke på et kall, fordi det er selve WIRINGEN
   * som manglet: funksjonen kunne finnes og være perfekt uten at knappen
   * noensinne kalte den. */
  const src = fs.readFileSync('src/views/settings.js', 'utf8');

  it('tømmer også destinasjonene', () => {
    expect(src).toMatch(/clearRecentDests/);
    // I samme handler som loggen, ikke et annet sted som kan glemmes.
    expect(src).toMatch(/mem-clear[\s\S]{0,400}clearRecentDests/);
  });

  /* Men BRYTEREN gjør det ikke, og det er med vilje.
   *
   * «Hva appen husker» er den sju døgns loggen; å slå den av tømmer loggen.
   * Knappen sier «slett alt appen husker», og det er de ordene som binder
   * bredere. To ulike handlinger fordi de sier to ulike ting. */
  it('men bryteren tømmer bare loggen, som ordene sier', () => {
    const bryter = (src.match(/cb\.addEventListener\('change'[\s\S]{0,400}?\}\);/) || [''])[0];
    expect(bryter).toMatch(/clearEvents\(\)/);
    expect(bryter).not.toMatch(/clearRecentDests/);
  });
});

describe('personvernsiden sier at de finnes', () => {
  /* Den nevnte dem ikke med et ord. Linja hører hjemme i FØRSTE seksjon —
   * der det står hva som ligger i nettleserens eget lager — og ikke under
   * «hva appen kan huske», som handler om den opt-in-loggen. Disse lagres
   * uten å spørre, og å liste dem under en samtykkeoverskrift ville vært
   * misvisende om nettopp det som er poenget. */
  const side = fs.readFileSync('public/privacy.html', 'utf8');

  it('nevner stedene du har gått til', () => {
    expect(side).toMatch(/stedene du/i);
  });

  /* Første utgave av denne bandt rekkefølgen INNE I én setning — at
   * «stedene» skulle stå etter «nettleserens eget lager». Det er for
   * spesifikt: hvilken halvdel av en setning ordet havner i betyr ingenting.
   * Det som betyr noe er hvilken SEKSJON den står i. */
  it('plasserer dem i lager-seksjonen, ikke under samtykke', () => {
    const iLagerSeksjon = side.indexOf('ingen konto, og ingen server');
    const iSamtykke = side.indexOf('Hva appen kan huske');
    const iSteder = side.search(/stedene du/i);
    expect(iLagerSeksjon).toBeGreaterThan(-1);
    expect(iSamtykke).toBeGreaterThan(iLagerSeksjon);
    expect(iSteder).toBeGreaterThan(iLagerSeksjon);
    expect(iSteder).toBeLessThan(iSamtykke);
  });
});

describe('butikken bor utenfor skjermen', () => {
  /* `settings.js` måtte ellers importert fra en VISNING for å kunne tømme
   * dem — nøyaktig lekkasjen revisjonen fant mellom `track.js` og
   * `board.js`, der to moduler henter `_interpolateVehiclePos` ut av en
   * skjerm. Ett faktum om lagring hører i `api/`. */
  it('eies av api/recentDests.js, ikke av track.js', () => {
    expect(fs.readFileSync('src/views/track.js', 'utf8'))
      .not.toMatch(/RECENT_KEY\s*=\s*'/);
    expect(fs.readFileSync('src/api/recentDests.js', 'utf8'))
      .toMatch(/RECENT_KEY = 't\.recentDests'/);
  });

  it('holder på taket sitt', () => {
    for (let i = 0; i < MAX_RECENTS + 3; i++) saveRecentDest(sted('sted ' + i));
    expect(loadRecentDests()).toHaveLength(MAX_RECENTS);
    // Nyeste først: det eldste er det som faller ut.
    expect(loadRecentDests()[0].label).toBe('sted ' + (MAX_RECENTS + 2));
  });
});
