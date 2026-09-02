import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/config.js', () => ({ default: { storage: { favs: 't.favs' } } }));
vi.mock('../src/storage.js', () => {
  let store = {};
  return { storage: {
    get: (k) => store[k] ?? null,
    set: (k, v) => { store[k] = v; },
    remove: (k) => { delete store[k]; },
    _reset: () => { store = {}; },
  } };
});

import { renderRouteShortcuts } from '../src/ui/favs.js';
import { storage } from '../src/storage.js';

// ── The «ofte brukt» row, now drawn in two places ──────────────────────────
//
// Asked for on the auto-reise screen as well. The markup used to live inside
// settings.js with no test at all; a second copy of it is exactly the shape
// of mistake this codebase keeps making — something that has to be remembered
// in several places and gets remembered in one. So it moved next to its data,
// and these are the rules it has to keep on both screens.
const seed = ({ favs = [], hist = [] }) => {
  storage.set('t.favs', JSON.stringify(favs));
  storage.set('t.smartHist', JSON.stringify(hist));
};
const fav = (from, to, over = {}) => ({
  type: 'route', id: from + '>' + to, from, to, createdAt: 1000, uses: 3, ...over,
});
const trip = (from, to, over = {}) => ({
  key: to.toLowerCase() + '|9|wd', fromName: from, toName: to,
  count: 2, lastUsed: 1000, ...over,
});

let el;
beforeEach(() => {
  storage._reset();
  document.body.innerHTML = '<div id="row"></div>';
  el = document.getElementById('row');
  window._useRouteDir = vi.fn();
});

describe('renderRouteShortcuts', () => {
  // The case that matters most, because auto-reise is where a brand-new
  // reader lands (v1.61.0) and a new reader has no history by definition. An
  // empty heading would greet exactly the person it cannot help.
  it('hides AND empties itself when there is nothing to show', () => {
    seed({});
    renderRouteShortcuts(el, 2);
    expect(el.style.display).toBe('none');
    expect(el.innerHTML).toBe('');
  });

  // Emptied, not merely hidden: a stale row left in the DOM is still read by
  // a screen reader and still found by querySelectorAll.
  it('clears a row it had drawn before, when the routes go away', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')] });
    renderRouteShortcuts(el, 2);
    expect(el.querySelectorAll('.fav-route-btn')).toHaveLength(1);
    storage._reset();
    renderRouteShortcuts(el, 2);
    expect(el.style.display).toBe('none');
    expect(el.querySelectorAll('.fav-route-btn')).toHaveLength(0);
  });

  it('draws one button per route, with the heading', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')], hist: [trip('Ryen', 'Helsfyr')] });
    renderRouteShortcuts(el, 2);
    expect(el.style.display).toBe('block');
    expect(el.querySelector('.set-label').textContent).toBe('ofte brukt');
    const btns = el.querySelectorAll('.fav-route-btn');
    expect(btns).toHaveLength(2);
    expect(btns[0].textContent).toContain('Mortensrud → Jernbanetorget');
  });

  it('honours the count it is asked for', () => {
    seed({ hist: [trip('A', 'B', { count: 9 }), trip('C', 'D', { count: 5 }), trip('E', 'F', { count: 1 })] });
    renderRouteShortcuts(el, 2);
    expect(el.querySelectorAll('.fav-route-btn')).toHaveLength(2);
  });

  // The star is the only thing telling a saved route from one the app merely
  // noticed you taking. Drop it and both look chosen.
  it('stars only the routes that were actually saved', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')], hist: [trip('Ryen', 'Helsfyr')] });
    renderRouteShortcuts(el, 2);
    const btns = [...el.querySelectorAll('.fav-route-btn')];
    const starred = btns.filter(b => b.textContent.includes('★'));
    expect(starred).toHaveLength(1);
    expect(starred[0].textContent).toContain('Mortensrud');
  });

  // The link between the button and the route. It fails silently: a wrong or
  // missing dir just takes you to someone else's board.
  it('hands the tapped route to _useRouteDir, with its fav id', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')] });
    renderRouteShortcuts(el, 2);
    el.querySelector('.fav-route-btn').click();
    expect(window._useRouteDir).toHaveBeenCalledTimes(1);
    const [dir, favId] = window._useRouteDir.mock.calls[0];
    expect(dir.from).toBe('Mortensrud');
    expect(dir.to).toBe('Jernbanetorget');
    expect(favId).toBe('Mortensrud>Jernbanetorget');
  });

  // Clicking the SECOND row must give the second route. Obvious, and the one
  // a mutation survived: every other test here taps the only button, or the
  // first, so "always use top[0]" passed them all.
  it('gives you the route you tapped, not the top one', () => {
    seed({ hist: [trip('Ryen', 'Helsfyr', { count: 9 }), trip('Bogerud', 'Tøyen', { count: 4 })] });
    renderRouteShortcuts(el, 2);
    const btns = [...el.querySelectorAll('.fav-route-btn')];
    expect(btns).toHaveLength(2);
    btns[1].click();
    expect(window._useRouteDir.mock.calls[0][0].to).toBe('Tøyen');
  });

  it('passes no fav id for a route that came from history alone', () => {
    seed({ hist: [trip('Ryen', 'Helsfyr')] });
    renderRouteShortcuts(el, 2);
    el.querySelector('.fav-route-btn').click();
    expect(window._useRouteDir.mock.calls[0][1]).toBe(null);
  });

  // Re-rendered on every GPS fix and every screen entry. If listeners were
  // kept in a module-level map instead of captured per render, the second
  // render would fire the first render's route.
  it('still taps through to the right route after a re-render', () => {
    seed({ hist: [trip('Ryen', 'Helsfyr'), trip('Bogerud', 'Tøyen', { count: 9 })] });
    renderRouteShortcuts(el, 2);
    renderRouteShortcuts(el, 2);
    const btns = [...el.querySelectorAll('.fav-route-btn')];
    btns[0].click();
    expect(window._useRouteDir).toHaveBeenCalledTimes(1);
    expect(window._useRouteDir.mock.calls[0][0].to).toBe('Tøyen');
  });

  it('takes an element id as readily as an element', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')] });
    renderRouteShortcuts('row', 2);
    expect(el.querySelectorAll('.fav-route-btn')).toHaveLength(1);
  });

  it('does nothing, and does not throw, without a container', () => {
    seed({ favs: [fav('A', 'B')] });
    expect(() => renderRouteShortcuts('nope', 2)).not.toThrow();
  });

  // The reason the code moved: two screens must not drift apart. Same data in,
  // identical markup out, whichever container it is drawn into.
  it('draws the same row wherever it is drawn', () => {
    seed({ favs: [fav('Mortensrud', 'Jernbanetorget')], hist: [trip('Ryen', 'Helsfyr')] });
    document.body.innerHTML = '<div id="a"></div><div id="b"></div>';
    renderRouteShortcuts('a', 2);
    renderRouteShortcuts('b', 2);
    expect(document.getElementById('a').innerHTML)
      .toBe(document.getElementById('b').innerHTML);
  });
});
