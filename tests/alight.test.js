/**
 * Når skal jeg av — sagt med det appen allerede vet.
 *
 * The screen already has a prominent card for this moment. It appears on a
 * clock threshold and calls itself «Snart fremme» — directly above a strip
 * that says «1 stopp igjen». Two facts, written down separately, and only
 * one of them useful.
 *
 * The first cut of this release added a THIRD statement in a new banner,
 * below the fold. The screenshot killed it: the screen was already saying
 * it three times above the fold. Nothing is added now; the card gains the
 * count it was missing, and its timing is untouched.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { alightEyebrow, stopsUntil, NAME_STOPS } from '../src/api/alight.js';
import { _journeyProgress } from '../src/views/journeyStrip.js';

const iso = ms => new Date(ms).toISOString();
const NOW = new Date(2026, 8, 21, 8, 0).getTime();
const stop = (name, minsFromNow) => ({
  quay: { stopPlace: { name } },
  expectedArrivalTime: iso(NOW + minsFromNow * 60000),
});

const LEG = {
  fromStation: 'Kongsberg',
  toStation: 'Oslo S',
  stops: [
    stop('Kongsberg', -20),
    stop('Hokksund', -8),
    stop('Drammen', -0.25),   // standing AT it right now, inside the 30 s grace
    stop('Asker', 9),
    stop('Sandvika', 14),
    stop('Oslo S', 30),
  ],
};

describe('stopsUntil', () => {
  it('counts the stops still ahead, including the one you get off at', () => {
    // Asker, Sandvika, Oslo S. Drammen is where the train is standing
    // this second, and that is behind you.
    expect(stopsUntil(LEG, NOW)).toBe(3);
  });

  // THE OFF-BY-ONE, which had been there for as long as the count had.
  // Its own comment in track.js said it treated a stop just reached as
  // visited; a 30-second grace did the opposite. The muted tag read «2
  // stopp» while the strip read «1 stopp igjen», and nothing showed it
  // because the prominent card said only «Snart fremme».
  it('treats the stop the vehicle is standing at as behind you', () => {
    const atGrønland = { ...LEG, stops: [stop('Kongsberg', -20), stop('Drammen', -0.1), stop('Oslo S', 3)] };
    expect(stopsUntil(atGrønland, NOW)).toBe(1);
  });

  // stopKey (v1.107.0), the app's one stop-name recipe: «Oslo S, Oslo»
  // and «Ryen T» must match the names the journey carries, or the count
  // runs past the end and never stops.
  it('matches names by the app\'s one recipe', () => {
    const l = {
      fromStation: 'Ryen', toStation: 'Oslo S',
      stops: [stop('Ryen T', -5), stop('Manglerud', 4), stop('Oslo S, Oslo', 20)],
    };
    expect(stopsUntil(l, NOW)).toBe(2);
  });

  /**
   * THE BINDING. Two counts of one fact is the shape this codebase has
   * found about twenty times, and the remedy it applies every time is a
   * test that holds them together.
   *
   * `_journeyProgress().left` draws the caption under the map; `stopsUntil`
   * drives the card's eyebrow and the tag. Making the card say the count is
   * what put them side by side, and they disagreed by one in every position.
   */
  it('agrees with the strip, at every position along the leg', () => {
    const names = ['Oppsal', 'Godlia', 'Hellerud', 'Brynseng', 'Helsfyr', 'Jernbanetorget'];
    const HOP = 120000;
    for (let boarded = 0; boarded <= 4; boarded += 0.5) {
      const calls = names.map((name, i) => {
        const t = NOW + (i - boarded) * HOP;
        return {
          quay: { stopPlace: { name } },
          aimedArrivalTime: iso(t), expectedArrivalTime: iso(t),
          aimedDepartureTime: iso(t + 20000), expectedDepartureTime: iso(t + 20000),
        };
      });
      const leg = { fromStation: 'Oppsal', toStation: 'Jernbanetorget', stops: calls };
      const p = _journeyProgress(calls, NOW, null);
      expect(stopsUntil(leg, NOW), 'boarded=' + boarded).toBe(p.left);
    }
  });

  it('says nothing rather than guessing when the calls have not arrived', () => {
    expect(stopsUntil({ fromStation: 'A', toStation: 'B' }, NOW)).toBe(0);
    expect(stopsUntil(null, NOW)).toBe(0);
  });
});

describe('alightEyebrow', () => {
  const eb = o => alightEyebrow({ transfer: false, ...o });

  // THE CASE IN THE SCREENSHOT: the card said «Snart fremme» while the
  // strip two centimetres above said «1 stopp igjen».
  it('says the stop count instead of a vague «snart»', () => {
    expect(eb({ stopsLeft: 1 }).label).toBe('Av ved neste stopp');
    expect(eb({ stopsLeft: 2 }).label).toBe('Av om 2 stopp');
    expect(eb({ stopsLeft: 1 }).label).not.toMatch(/snart/i);
  });

  // Further out than the count usefully says, the card's own timing is the
  // reason it is on screen — so it keeps its original words rather than
  // counting out loud from six stops away.
  it('keeps the old wording when the count says nothing useful', () => {
    expect(eb({ stopsLeft: NAME_STOPS + 1 }).label).toBe('Snart fremme');
    expect(eb({ stopsLeft: 9 }).kind).toBe('snart');
  });

  // The clock outranks the count: a stop list that has not caught up must
  // not talk a reader out of standing up.
  it('lets the clock win once it has run out', () => {
    expect(eb({ stopsLeft: 3, arriving: true }).label).toBe('Gå av nå');
    expect(eb({ stopsLeft: null, arriving: true }).label).toBe('Gå av nå');
  });

  // «Av» and «Bytt» are different instructions. Telling someone to get off
  // at a transfer, with no word that another vehicle follows, is how a
  // reader ends up on the right platform believing they arrived.
  it('keeps «bytt» apart from «av»', () => {
    expect(alightEyebrow({ stopsLeft: 1, transfer: true }).label).toBe('Bytt ved neste stopp');
    expect(alightEyebrow({ stopsLeft: 9, transfer: true }).label).toBe('Bytt her');
    expect(alightEyebrow({ stopsLeft: 3, transfer: true, arriving: true }).label).toBe('Bytt her');
  });

  // NOT the same as «one stop left». The count is null before the calls
  // arrive, and «av ved neste stopp» there would be an invention.
  it('falls back to the old wording rather than inventing a stop', () => {
    expect(eb({ stopsLeft: null }).label).toBe('Snart fremme');
    expect(eb({ stopsLeft: null }).kind).toBe('snart');
  });

  it('tells its states apart', () => {
    const said = [eb({ stopsLeft: 9 }), eb({ stopsLeft: 3 }), eb({ stopsLeft: 1 }),
      eb({ stopsLeft: 1, arriving: true })].map(v => v.label);
    expect(new Set(said).size).toBe(said.length);
  });
});

describe('it reaches the screen, and adds no new voice', () => {
  const src = () => fs.readFileSync('src/views/track.js', 'utf8');

  it('both alight cards use the one verdict', () => {
    expect((src().match(/alightEyebrow\(/g) || []).length).toBe(2);
    expect(src()).not.toMatch(/'Gå av nå' : 'Snart fremme'/);
  });

  // The card's TIMING is untouched. «Does five minutes' warning feel right
  // on this line» is a question about a real ride, and this sandbox cannot
  // answer it — so the release does not pretend to.
  it('leaves the clock thresholds exactly as they were', () => {
    expect(src()).toMatch(/if \(mLeft > 2\) return '';/);
    expect(src()).toMatch(/if \(mLeft > 5\) return '';/);
  });

  // The first cut added a banner below the fold to a screen that already
  // stated the same fact three times above it.
  it('adds no fourth statement of the same fact', () => {
    expect(src()).not.toMatch(/ct-alight/);
    expect(fs.readFileSync('src/style/track.css', 'utf8')).not.toMatch(/ct-alight/);
  });

  it('and no longer counts stops inline', () => {
    expect(src()).toMatch(/stopsUntil\(/);
    expect(src()).not.toMatch(/const isEnd = toN && normStn\(nm\) === toN/);
    expect(src()).not.toMatch(/const stopsLeft = \(\(\) =>/);
  });
});
