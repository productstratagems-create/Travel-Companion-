/**
 * Ankomstskjermen: to dører, og et kart som viser dit du skal.
 *
 * Reported with a screenshot four minutes from Jernbanetorget: «Til dels uklar
 * hensikt og flyt med de ulike valgene bruker har her.»
 *
 * Measured on that screen before any change: the map spanned 6.9 km, the
 * «where next» field was prefilled with «Jernbanetorget» — the stop being
 * arrived at — and the ranked answer under it offered «Gå · 0 m · 1 min» and a
 * city bike for that distance. Four doors offered two intents.
 */
import { describe, it, expect } from 'vitest';
import { arrMapPoints, onwardPrefill } from '../src/views/track.js';
import { atPlace, AT_PLACE_M } from '../src/geo.js';

const JBT = { lat: 59.9115, lon: 10.7500 };            // where you arrive
const SKOYENASEN = { lat: 59.9010, lon: 10.8230 };     // where you still are
const AKER = { lat: 59.9105, lon: 10.7290, label: 'Aker brygge' };  // ~1.2 km

describe('atPlace', () => {
  it('calls two points inside one interchange the same place', () => {
    expect(atPlace(JBT, { lat: JBT.lat + 0.0007, lon: JBT.lon })).toBe(true);
  });

  // THE REPORTED DISTANCE. Eight kilometres is not «here».
  it('does not call the far side of the city the same place', () => {
    expect(atPlace(JBT, SKOYENASEN)).toBe(false);
  });

  // On the boundary in metres, not in «about». A whole-hundred fixture would
  // pass whether the comparison were <= or <.
  it('is exact at the threshold', () => {
    const north = (m) => ({ lat: JBT.lat + m / 111320, lon: JBT.lon });
    expect(atPlace(JBT, north(AT_PLACE_M - 2))).toBe(true);
    expect(atPlace(JBT, north(AT_PLACE_M + 2))).toBe(false);
  });

  it('survives a point with no coordinates', () => {
    expect(atPlace(JBT, null)).toBe(false);
    expect(atPlace(JBT, { lat: 'x', lon: 1 })).toBe(false);
  });
});

describe('arrMapPoints — what the arrival map frames', () => {
  // THE WHOLE REPORT IN ONE ASSERTION. Four minutes out, your position is
  // eight kilometres east; framing it spanned 6.9 km and left the place you
  // were arriving at against one edge.
  it('leaves you out of the frame while you are still riding', () => {
    expect(arrMapPoints(JBT, null, SKOYENASEN)).toEqual([[JBT.lat, JBT.lon]]);
  });

  // And the reason the old code put you in is real — once you ARE there,
  // «du er her» must not sit off the map.
  it('puts you in it once you are there', () => {
    const here = { lat: JBT.lat + 0.0003, lon: JBT.lon };
    expect(arrMapPoints(JBT, null, here)).toHaveLength(2);
  });

  // An onward walk you set yourself is always part of the picture: you asked
  // for it, and it is the one thing here that is not near the stop.
  it('always frames a walk you asked for', () => {
    const pts = arrMapPoints(JBT, AKER, SKOYENASEN);
    expect(pts).toHaveLength(2);
    expect(pts[1]).toEqual([AKER.lat, AKER.lon]);
  });

  it('frames nothing when there is no arrival to frame', () => {
    expect(arrMapPoints(null, AKER, SKOYENASEN)).toEqual([]);
  });
});

describe('onwardPrefill — the field asks instead of answering', () => {
  // «Gå · 0 m · 1 min», and a city bike for it.
  it('offers nothing to walk to when the destination is the arrival stop', () => {
    expect(onwardPrefill({ ...JBT, label: 'Jernbanetorget' }, JBT, 'Jernbanetorget'))
      .toBeNull();
  });

  // BY NAME, because the coordinates arrive late. leg.stops only exists once
  // fetchTrack has answered, and the panel renders before that — measured: with
  // the distance test alone the field was still prefilled.
  it('recognises the arrival stop by name before any coordinates have landed', () => {
    expect(onwardPrefill({ ...JBT, label: 'Jernbanetorget' }, null, 'Jernbanetorget'))
      .toBeNull();
  });

  it('is not fooled by the municipality the geocoder appends', () => {
    expect(onwardPrefill({ ...JBT, label: 'Jernbanetorget, Oslo' }, null, 'Jernbanetorget'))
      .toBeNull();
  });

  // AND BY DISTANCE, because two names can be one place. «Oslo S» and
  // «Jernbanetorget» are a hundred metres apart and everyone treats them as
  // the same arrival — the name test cannot see that, and without the distance
  // test the panel would offer to walk you there.
  it('recognises the same place under a different name', () => {
    const osloS = { lat: JBT.lat + 0.0008, lon: JBT.lon + 0.0004, label: 'Oslo S' };
    expect(onwardPrefill(osloS, JBT, 'Jernbanetorget')).toBeNull();
  });

  // THE CASE THE PREFILL EXISTS FOR, which must survive: a venue the vehicle
  // does not reach, where the last stretch really is on foot.
  it('keeps a real onward walk', () => {
    expect(onwardPrefill(AKER, JBT, 'Jernbanetorget')).toEqual(AKER);
  });

  it('offers nothing when the destination has no coordinates', () => {
    expect(onwardPrefill({ label: 'Et sted' }, JBT, 'Jernbanetorget')).toBeNull();
    expect(onwardPrefill(null, JBT, 'Jernbanetorget')).toBeNull();
  });
});

// ── Two doors, and nothing lost ────────────────────────────────────────────
//
// Four entry points offered two intents: «utforsk X» and «steder i nærheten»
// were both «see what's here»; «hvor skal du videre?» and «ny reise fra X»
// were both «go somewhere», one searching in place and one opening the form.
// Two of them sat on the same screen a scroll apart.
//
// NOTHING IS REMOVED — the rooms stay, the duplicate doors go. Asserted
// against the source because the panel is built as one innerHTML string inside
// a render that needs a journey, a map and a clock.
describe('the arrival panel offers two intents', () => {
  const src = () => require('node:fs')
    .readFileSync('src/views/track.js', 'utf8').replace(/\/\/[^\n]*/g, '');

  it('no longer duplicates «see what is here» above the panel', () => {
    expect(src()).not.toMatch(/t-explore-link/);
  });

  // The action survives; only the second door closes. explore is still
  // reachable from the folded section and from utforsk itself.
  it('keeps the explore action itself', () => {
    expect(src()).toMatch(/_exploreDestination/);
    expect(src()).toMatch(/hn-places-details/);
  });

  // «ny reise» moves under the field that asks the same question, as an
  // alternative rather than a competing box at the bottom of the panel.
  it('folds «plan a whole journey» in under the field it belongs to', () => {
    const t = src();
    expect(t).toMatch(/hn-alt-link/);
    expect(t).not.toMatch(/hn-new-btn/);
    // Inside the primary section, not after it.
    const sec = t.indexOf('hn-section hn-primary');
    const link = t.indexOf('hn-alt-link');
    const close = t.indexOf("+ '</div>';", sec);
    expect(link).toBeGreaterThan(sec);
    expect(link).toBeLessThan(close);
  });

  it('still binds both doors', () => {
    expect(src()).toMatch(/getElementById\('t-new-btn'\)/);
  });
});
