/**
 * Mot sentrum eller fra?
 *
 * «Hvor skal du?» lists every direction leaving your stop. At Hauketo that
 * is eight rows — mot Lysaker, mot Ski, mot Stabekk, mot Fornebu, mot
 * Brenna — each correct, and none of them the question a person actually
 * holds, which is almost always one of two.
 *
 * THE PART THAT HAD TO BE GOT RIGHT is the refusing. geo.js carries the
 * scar: Oslo S was written into six geocoder URLs and a validity radius,
 * and «a destination typed in Bergen was discarded 306 km outside a circle
 * the reader could not move». A wrong «mot sentrum» sends someone the
 * opposite way, so this module says nothing wherever it does not know.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  centreward, kmTo, CENTRE, CENTRE_LABEL,
  CENTRE_MAX_KM, AT_CENTRE_KM, MIN_GAIN_KM,
} from '../src/api/centre.js';

const at = (lat, lon) => ({ lat, lon });
const HAUKETO = at(59.8300, 10.8050);      // ~9 km south of Oslo S
const OSLO_S = at(CENTRE.lat, CENTRE.lon);
const BERGEN = at(60.3913, 5.3221);

describe('the signal', () => {
  // THE CASE IN THE SCREENSHOT. The train to Lysaker runs through the middle
  // of town and out the other side; by its terminus alone it is just another
  // suburb. By where the journey takes you, it passes the centre.
  it('reads the closest approach, not the terminus', () => {
    // THE FIXTURE MUST SEPARATE THE TWO RULES. The first version ended at
    // Lysaker, which is itself closer to town than Hauketo is — so judging
    // by the terminus gave the same answer and the mutant survived. Asker
    // is FURTHER out than Hauketo, and the journey still runs through the
    // middle of town: closest-approach says «mot», terminus says «fra».
    const viaTown = [at(59.87, 10.80), OSLO_S, at(59.833, 10.435)];
    expect(kmTo(at(59.833, 10.435), CENTRE)).toBeGreaterThan(kmTo(HAUKETO, CENTRE));
    expect(centreward(HAUKETO, viaTown)).toBe('mot');
  });

  it('calls a line that keeps leaving «fra»', () => {
    expect(centreward(HAUKETO, [at(59.80, 10.82), at(59.72, 10.84)])).toBe('fra');
  });

  it('needs a real margin before it commits', () => {
    // A stop that wobbles a few hundred metres townward is not «mot sentrum».
    expect(centreward(HAUKETO, [at(59.832, 10.81)])).toBe(null);
  });

  it('is exactly the margin, on each side of it', () => {
    const here = kmTo(HAUKETO, CENTRE);
    // A point on the line to the centre, `gain` km closer than we are.
    const closer = g => at(CENTRE.lat + (HAUKETO.lat - CENTRE.lat) * ((here - g) / here),
      CENTRE.lon + (HAUKETO.lon - CENTRE.lon) * ((here - g) / here));
    expect(centreward(HAUKETO, [closer(MIN_GAIN_KM + 0.2)])).toBe('mot');
    expect(centreward(HAUKETO, [closer(MIN_GAIN_KM - 0.2)])).toBe(null);
  });
});

describe('what it refuses to answer', () => {
  // The whole point. Silence is the honest answer, and the screen falls
  // back to exactly the list it has today.
  it('says nothing outside the city it knows', () => {
    expect(kmTo(BERGEN, CENTRE)).toBeGreaterThan(CENTRE_MAX_KM);
    expect(centreward(BERGEN, [at(60.30, 5.30)])).toBe(null);
  });

  it('says nothing when you are already there', () => {
    expect(centreward(at(59.9110, 10.7530), [at(59.83, 10.80)])).toBe(null);
    expect(kmTo(at(59.9110, 10.7530), CENTRE)).toBeLessThan(AT_CENTRE_KM);
  });

  it('says nothing without onward stops, or without a position', () => {
    expect(centreward(HAUKETO, [])).toBe(null);
    expect(centreward(HAUKETO, null)).toBe(null);
    expect(centreward(null, [OSLO_S])).toBe(null);
  });

  it('ignores onward stops that carry no coordinates', () => {
    expect(centreward(HAUKETO, [{ name: 'Ukjent' }, { name: 'Også ukjent' }])).toBe(null);
  });
});

describe('the coordinate, and the label', () => {
  // Six copies of this once decided which half of the country a search
  // could see. There is one, and this module owns it precisely because it
  // imports nothing and so cannot sit in an import cycle.
  it('is the app\'s one centre, in a file that imports nothing', () => {
    const src = fs.readFileSync('src/api/centre.js', 'utf8');
    expect(src).not.toMatch(/^import /m);
    expect(fs.readFileSync('src/geo.js', 'utf8')).toMatch(/FALLBACK_FOCUS = CENTRE/);
  });

  // One place decides the words, so the screen cannot invent a third.
  it('names both sides and nothing else', () => {
    expect(Object.keys(CENTRE_LABEL).sort()).toEqual(['fra', 'mot']);
    expect(new Set(Object.values(CENTRE_LABEL)).size).toBe(2);
  });

  // The list is already sorted by the reader's own choice. A heading
  // emitted on change would interleave through that order; the rows are
  // partitioned instead, and the chosen order survives inside each group.
  it('the screen partitions rather than emitting on change', () => {
    const src = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(src).toMatch(/const groups = \[\['mot', \[\]\], \['fra', \[\]\], \[null, \[\]\]\]/);
    expect(src).toMatch(/const ordered = grouped \? groups\.flatMap/);
    // And with nothing judgeable, the screen is what it was.
    expect(src).toMatch(/: live;/);
  });
});
