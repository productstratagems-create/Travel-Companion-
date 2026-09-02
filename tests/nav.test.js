import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';

// nav.js reaches into most of the app on import; none of it matters for the
// question here, which is purely what show() leaves on the view elements.
vi.mock('../src/ui/favs.js', () => ({ addFav: () => {} }));
vi.mock('../src/views/settings.js', () => ({ renderBoardProfileSwitcher: () => {} }));
vi.mock('../src/geo.js', () => ({ saveWeekendMode: () => {} }));
vi.mock('../src/ui/confirm.js', () => ({ confirmTap: () => {} }));
vi.mock('../src/views/selected.js', () => ({ stopSelRefresh: () => {} }));
vi.mock('../src/views/track.js', () => ({ copyJourneyId: () => {} }));
vi.mock('../src/views/spectate.js', () => ({
  toggleSpectatePanel: () => {}, closeSpectatePanel: () => {},
}));

const VIEWS = ['v-board', 'v-selected', 'v-walk', 'v-track', 'v-settings', 'v-prefs', 'v-saved', 'v-leisure', 'v-auto'];

const { state } = await import('../src/state.js');
const { show, toggleBoardMenu, navTo, NAV_ITEMS, navActive, navHidden } = await import('../src/ui/nav.js');

beforeEach(() => {
  document.body.innerHTML = VIEWS
    .map(v => `<div id="${v}" tabindex="-1"${v === 'v-board' ? '' : ' style="display:none"'}></div>`)
    .join('') + '<div id="board-more-menu"></div><button id="board-more-btn"></button>';
  document.documentElement.className = '';
  // state is a module singleton, so the view leaks between tests — and navTo
  // deliberately refuses to move to the screen you are already on.
  state.view = 'board';
});

describe('show', () => {
  it('shows exactly one view and hides the rest', () => {
    show('v-settings');
    expect(document.getElementById('v-settings').style.display).not.toBe('none');
    VIEWS.filter(v => v !== 'v-settings')
      .forEach(v => expect(document.getElementById(v).style.display).toBe('none'));
  });

  // The board is laid out as a flex column by `html.view-board #v-board`, and
  // its departure list scrolls only because it is a flex child of that column.
  // Stamping an inline `display: block` on the view beat that rule, collapsed
  // the column, and left the list sized to its own content inside a viewport
  // with `overflow: hidden` — so after a direction swap, or any other return
  // to the board, the list would not scroll at all.
  it('leaves the shown view free to take its display from the stylesheet', () => {
    show('v-settings');
    show('v-board');
    expect(document.getElementById('v-board').style.display).toBe('');
    expect(document.getElementById('v-board').getAttribute('style') || '')
      .not.toMatch(/display\s*:\s*block/);
  });

  it('stamps view-board only while the board is the visible screen', () => {
    show('v-board');
    expect(document.documentElement.classList.contains('view-board')).toBe(true);
    show('v-saved');
    expect(document.documentElement.classList.contains('view-board')).toBe(false);
  });
});

// Chipen med brukernavnet styrer den samme menyen som ⋯, så den må kunne
// lukke den igjen — og begge kontrollene må si det samme om tilstanden.
describe('toggleBoardMenu', () => {
  beforeEach(() => {
    document.body.innerHTML +=
      '<button id="header-profile-chip" aria-expanded="false"></button>';
  });

  it('veksler menyen og holder aria-expanded i takt på begge kontrollene', () => {
    const menu = document.getElementById('board-more-menu');
    const chip = document.getElementById('header-profile-chip');
    const btn = document.getElementById('board-more-btn');

    toggleBoardMenu();
    expect(menu.style.display).toBe('flex');
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(btn.getAttribute('aria-expanded')).toBe('true');

    toggleBoardMenu();
    expect(menu.style.display).toBe('none');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });
});

// ── The fixed menu between the main screens ────────────────────────────────
//
// Reported: "savner å kunne navigere tilbake til auto-reise boardet". There
// was no way back. With the mode ON and the reader on the board, the ⋯ entry
// called `saveAutoMode(!loadAutoMode())` — so the thing that looked like a
// door was a switch, and tapping it turned the mode OFF.
//
// Underneath that: the app conflated GOING to a screen with CHOOSING it as
// the screen the app opens on. These tests hold the two apart.
describe('the fixed navigation menu', () => {
  it('offers the four main screens, board first', () => {
    expect(NAV_ITEMS.map(i => i.view)).toEqual(['v-board', 'v-auto', 'v-saved', 'v-leisure']);
    NAV_ITEMS.forEach(i => expect(i.label).toBeTruthy());
  });

  it('marks the screen you are on', () => {
    expect(navActive('board')).toBe('v-board');
    expect(navActive('auto')).toBe('v-auto');
    expect(navActive('saved')).toBe('v-saved');
    expect(navActive('leisure')).toBe('v-leisure');
  });

  // A screen that is not in the menu leaves every entry unmarked, rather than
  // lighting up the first one and claiming you are on the board.
  it('marks nothing on a screen that is not in it', () => {
    ['settings', 'prefs', 'selected', 'track', 'walk'].forEach(v => {
      expect(navActive(v)).toBe(null);
    });
  });

  // "Underveis" and the walking route are screens you FOLLOW, not screens you
  // navigate from — they carry their own avslutt/tilbake, and a menu there
  // invites leaving a journey by accident.
  // The invariant the whole change rests on: MOVING to a screen must never
  // write down which screen the app opens on. The reported bug was exactly
  // that conflation — the ⋯ entry computed `!loadAutoMode()`, so switching
  // screens switched the mode off, and there was no way back at all.
  it('never writes a mode flag when it navigates', () => {
    const before = { ...localStorage };
    NAV_ITEMS.forEach(i => navTo(i.view));
    expect({ ...localStorage }).toEqual(before);
  });

  it('takes you to the screen you asked for', () => {
    navTo('v-leisure');
    expect(document.getElementById('v-leisure').style.display).toBe('');
    expect(document.getElementById('v-board').style.display).toBe('none');
  });

  // Chosen deliberately: coming back to auto-reise shows FRESH directions
  // from where you are now, not the stop you were at when you left with times
  // that have aged. Reset then render — the order matters, and the restore
  // path used to render without resetting at all.
  it('opens auto-reise fresh, resetting before it renders', () => {
    const order = [];
    window._resetAuto = () => order.push('reset');
    window._renderAuto = () => order.push('render');
    navTo('v-auto');
    expect(order).toEqual(['reset', 'render']);
  });

  it('does nothing when you tap the screen you are already on', () => {
    navTo('v-auto');
    const order = [];
    window._resetAuto = () => order.push('reset');
    window._renderAuto = () => order.push('render');
    navTo('v-auto');
    expect(order).toEqual([]);
  });

  it('is hidden on the journey and walking screens, and nowhere else', () => {
    expect(navHidden('track')).toBe(true);
    expect(navHidden('walk')).toBe(true);
    ['board', 'auto', 'saved', 'leisure', 'settings', 'prefs', 'selected'].forEach(v => {
      expect(navHidden(v)).toBe(false);
    });
  });
});

// ── The board's own refresh ────────────────────────────────────────────────
//
// Reported: "Refresh på tavla tar meg til auto-reise. Det blir feil." It was
// a location.reload(), which was honest while the board was the only screen
// the app could open on — and since v1.61.0 a reload re-runs the landing
// ladder, so with auto-reise as the landing screen the board's refresh button
// navigated off the board and emptied it.
describe('the board refresh button', () => {
  it('refreshes the board in place, and never reloads the page', () => {
    document.body.insertAdjacentHTML('beforeend',
      '<button id="board-refresh-btn"></button>');
    const src = fs.readFileSync('src/ui/nav.js', 'utf8');
    const i = src.indexOf("getElementById('board-refresh-btn')");
    expect(i).toBeGreaterThan(-1);
    const block = src.slice(i, i + 700);
    expect(block).toContain('_refreshBoard');
    expect(block).not.toContain('location.reload');
  });

  // Nothing else in the chrome may reload either — same trap, different
  // button. Comments are stripped first: the auto-reise refresh explains in
  // prose why it is NOT a reload, and matching that would be matching the
  // documentation rather than the code.
  it('leaves no page reload anywhere in the navigation code', () => {
    const code = fs.readFileSync('src/ui/nav.js', 'utf8')
      .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    expect(code).not.toContain('location.reload');
  });
});

// ── The retired gangtid screen ─────────────────────────────────────────────
//
// v1.67.0 folded it into avgangsdetaljer. Someone with the app open still has
// history entries pointing at v-walk, and a browser Back must not drop them on
// a blank screen — nor may the view list keep hiding an element that is gone.
describe('after gangtid was folded away', () => {
  it('is no longer one of the app\'s screens', () => {
    const src = fs.readFileSync('src/ui/nav.js', 'utf8');
    const list = src.match(/\[('v-[^\]]*)\]\.forEach/);
    expect(list).toBeTruthy();
    expect(list[1]).not.toContain('v-walk');
  });

  it('sends an old history entry to the screen its content moved to', () => {
    const src = fs.readFileSync('src/ui/nav.js', 'utf8');
    expect(src).toMatch(/id === 'v-walk'[\s\S]{0,90}'v-selected'/);
  });

  // The listeners for a screen that no longer exists throw on an unguarded
  // getElementById(...).addEventListener — and this file wires them all at
  // startup, so one of them takes every screen down with it. Measured: that
  // is exactly what happened while this change was being made.
  it('wires no button belonging to the removed screen', () => {
    const code = fs.readFileSync('src/ui/nav.js', 'utf8')
      .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
    ['w-back', 'w-plan-btn', 'w-spec-btn', 'w-map-expand'].forEach(id => {
      expect(code).not.toContain("'" + id + "'");
    });
  });
});
