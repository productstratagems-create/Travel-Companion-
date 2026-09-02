import { describe, it, expect, beforeEach, vi } from 'vitest';

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

const { show, toggleBoardMenu } = await import('../src/ui/nav.js');

beforeEach(() => {
  document.body.innerHTML = VIEWS
    .map(v => `<div id="${v}" tabindex="-1"${v === 'v-board' ? '' : ' style="display:none"'}></div>`)
    .join('') + '<div id="board-more-menu"></div><button id="board-more-btn"></button>';
  document.documentElement.className = '';
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
