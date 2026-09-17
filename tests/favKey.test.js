/**
 * Én rute, én nøkkel — og den ene jeg tok feil om.
 *
 * v1.107.0 swept nine copies of the stop rule and left this one out, on the
 * stated grounds that it was «lagret på disk» and changing it would orphan the
 * reader's favourites. That was false. The key is built and thrown away inside
 * routeShortcuts; what is stored is {from, to, …} with the names as typed. So
 * there was never a migration to fear, and a real duplicate survived three
 * releases because of a caution that did not apply.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { addFav, loadFavs, saveFavs, routeShortcuts } from '../src/ui/favs.js';

beforeEach(() => saveFavs([]));

describe('starring one route twice, spelled two ways', () => {
  // «Ryen T» and «Ryen» are one stop — the geocoder and the metro map simply
  // disagree about the T. Starring the route from each left TWO stars, and the
  // twelve-entry cap then pushed a real favourite out to make room for the
  // duplicate.
  it('keeps one star', () => {
    expect(addFav({ from: 'Ryen T', to: 'Oslo S' })).toBe(true);
    expect(addFav({ from: 'Ryen', to: 'Oslo S' })).toBe(false);
    expect(loadFavs()).toHaveLength(1);
  });

  it('is not fooled by the municipality the geocoder appends', () => {
    addFav({ from: 'Skullerud, Oslo', to: 'Oslo S' });
    expect(addFav({ from: 'Skullerud', to: 'Oslo S' })).toBe(false);
  });

  // The merge must not go too far: two genuinely different routes stay two.
  it('still keeps two different routes apart', () => {
    addFav({ from: 'Ryen', to: 'Oslo S' });
    expect(addFav({ from: 'Ryen', to: 'Majorstuen' })).toBe(true);
    expect(loadFavs()).toHaveLength(2);
  });

  it('keeps the same route the other way round', () => {
    addFav({ from: 'Ryen', to: 'Oslo S' });
    expect(addFav({ from: 'Oslo S', to: 'Ryen' })).toBe(true);
  });
});

describe('the shortcut list', () => {
  // The starred one wins where both describe one journey — it carries stop
  // ids, a via and a line filter the history does not — and that only works
  // if the two are recognised as one journey in the first place.
  it('merges a starred route with the same route in the history', () => {
    const favs = [{ id: 'f1', type: 'route', from: 'Ryen T', to: 'Oslo S' }];
    const hist = [{ fromName: 'Ryen', toName: 'Oslo S' }];
    const rows = routeShortcuts(favs, hist, () => 9, 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].favId).toBe('f1');
  });

  it('does not merge two journeys that only share an origin', () => {
    const favs = [{ id: 'f1', type: 'route', from: 'Ryen', to: 'Oslo S' }];
    const hist = [{ fromName: 'Ryen', toName: 'Majorstuen' }];
    expect(routeShortcuts(favs, hist, () => 9, 5)).toHaveLength(2);
  });
});
