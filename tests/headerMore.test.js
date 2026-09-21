/**
 * ⋮ på eksakt samme sted på alle skjermer.
 *
 * Bedt om som en begrenset endring: tre loddrette prikker med vei til
 * innstillinger, i samme posisjon uansett hvilken skjerm du står på.
 *
 * Den lå bare på tavla, og menyen den åpner lå INNE i `#v-board` — så
 * `show()` skjulte den sammen med tavla, og ingen annen skjerm kunne nå den.
 *
 * Første forsøk satte én knapp i hver av de seks overskriftene. Prøven målte
 * (357,41), (238,33), (357,38) og (341,49): tre ulike overskriftsidiomer, tre
 * ulike årsaker. Å jage dem ville blitt tre magiske tall som driver neste gang
 * en overskrift endres. Én knapp festet til viewporten er samme sted av
 * konstruksjon.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const html = () => fs.readFileSync('index.html', 'utf8');
const nav = () => fs.readFileSync('src/ui/nav.js', 'utf8');
const css = () => fs.readFileSync('src/style/board.css', 'utf8');

/** Is `needle` inside any `#v-*` screen container? */
function insideAView(src, needle) {
  const at = src.indexOf(needle);
  if (at === -1) return null;
  const views = [...src.slice(0, at).matchAll(/<div id="(v-[a-z]+)"/g)];
  if (!views.length) return false;
  const last = views[views.length - 1];
  const seg = src.slice(last.index, at);
  return seg.split('<div').length > seg.split('</div>').length;
}

describe('én knapp i hver overskrift', () => {
  // Seven: the board plus the six .screen-header screens. «Utforsk» builds
  // its own in JS, so it is counted in explore.js instead.
  it('finnes i hver overskrift, og bare én gang hver', () => {
    expect((html().match(/data-more/g) || []).length).toBe(7);
    const explore = fs.readFileSync('src/views/explore.js', 'utf8');
    expect((explore.match(/data-more/g) || []).length).toBe(1);
  });

  // IN THE ROW, not pinned to the viewport. v1.129.0 pinned it, which made
  // it the same place on every screen and orphaned it from the two buttons
  // it belongs with — and put it on top of the traffic banner.
  it('ligger i raden, ikke festet til viewporten', () => {
    const rule = css().slice(css().indexOf('.hdr-more-btn{'), css().indexOf('.hdr-more-btn:active'));
    expect(rule).not.toMatch(/position:fixed/);
  });

  // THE CONFLICT, fixed at the source: the banner used to push the header
  // down. Now the header is the first thing on every screen, which is what
  // lets the row sit at the same height without leaving it.
  // SAME SIZE AS ITS NEIGHBOURS, and the same on every screen. ⇄ and ↻ are
  // 36x44 (`.board-refresh-btn,.dir-btn`); ⋮ was 2.1rem, then 44px, and
  // both made it a different width from the two buttons it sits between.
  // And since it is anchored to the right edge, a width that varied between
  // screens would move its centre and undo «same place».
  it('har samme bredde som knappene den står mellom', () => {
    const rule = css().slice(css().indexOf('.hdr-more-btn{'), css().indexOf('.hdr-more-btn:active'));
    expect(rule).toMatch(/width:36px;height:44px/);
    expect(css()).toMatch(/\.board-refresh-btn,\.dir-btn\{width:36px/);
  });

  // auto-reise pins both its action buttons to the right edge. They used to
  // share the corner with different vertical anchors — ⋮ at top:0, the
  // other at top:50% — so they overlapped and looked stacked.
  it('auto-reises to knapper deler ikke hjørne', () => {
    const sel = fs.readFileSync('src/style/selected.css', 'utf8');
    expect(sel).toMatch(/\.screen-header-solo > \.nav-plan-btn\{ position:absolute; right:36px; top:0 \}/);
    // And the header is tall enough to hold them: absolutely positioned,
    // they add no height, and a 44px button hung below the bottom border.
    expect(sel).toMatch(/min-height:44px/);
  });

  it('trafikkmeldingen står under overskriften, ikke over', () => {
    const src = html();
    expect(src.indexOf('class="board-header-slim"'))
      .toBeLessThan(src.indexOf('id="service-alerts"'));
  });

  // It used to live inside #v-board, which is why ⋮ existed on one screen.
  it('menyen ligger også utenfor skjermene', () => {
    expect(insideAView(html(), 'id="board-more-menu"')).toBe(false);
  });

  // Leaflet's controls sit at z-index 1000+; below that the zoom buttons and
  // the attribution drew straight through the menu. It looked transparent
  // and was merely underneath — caught in a screenshot, not in a number.
  it('tegnes over kartet, ikke under det', () => {
    const rule = css().slice(css().indexOf('.board-more-menu{'), css().indexOf('.board-more-item{'));
    const z = /z-index:(\d+)/.exec(rule);
    expect(Number(z[1])).toBeGreaterThan(1000);
    expect(rule).toMatch(/background:var\(--bg\)/);
    // Two background declarations in one rule, and the later one won.
    expect((rule.match(/background:/g) || []).length).toBe(1);
  });

  // Three header idioms brought into line. Each rule fixes one measured
  // gap; without them the probe read (357,41), (238,33), (357,38), (341,49).
  it('de tre overskriftsidiomene er brakt på linje', () => {
    expect(css()).toMatch(/#v-leisure \.lei-header\{margin-right:-1rem;padding-top:0\}/);
    expect(css()).toMatch(/\.screen-header-solo > \.hdr-more-btn\{position:absolute/);
    expect(css()).toMatch(/\.hdr-more-btn\{align-self:flex-start\}/);
    // And the board's button row, which its taller header centred.
    expect(css()).toMatch(/\.board-header-slim > div:last-child\{align-self:flex-start\}/);
  });
});

describe('bindingen finnes ett sted', () => {
  // Eight copies of one binding is the failure shape AGENTS.md names — and
  // «Utforsk» rebuilds its header in JS, so a listener bound at startup
  // would be lost on every re-render there.
  it('er delegert, ikke bundet per knapp', () => {
    expect(nav()).toMatch(/document\.addEventListener\('click'/);
    expect(nav()).toMatch(/closest\('\[data-more\]'\)/);
    expect(nav()).not.toMatch(/getElementById\('board-more-btn'\)\.addEventListener/);
  });

  it('aria-expanded holdes i takt på alt som styrer menyen', () => {
    expect(nav()).toMatch(/_moreBtns\(\)\.forEach/);
  });
});

describe('«del denne tavla» hører til tavla', () => {
  // v1.105.0 exists because a banner was global. A menu item that means
  // nothing on underveis is the same fault, smaller.
  it('avgjøres ett sted, sammen med om den kan deles i det hele tatt', () => {
    const src = nav();
    const fn = src.slice(src.indexOf('export function toggleBoardMenu'), src.indexOf('export function navActive'));
    expect(fn).toMatch(/onBoard && canShare/);
    // A second rule in CSS would have lost to the inline style set here.
    expect(css()).not.toMatch(/share-btn\[data-off-board/);
  });
});
