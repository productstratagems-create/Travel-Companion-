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

describe('én knapp, ett sted', () => {
  it('finnes nøyaktig én ⋮ i markupen', () => {
    expect((html().match(/data-more/g) || []).length).toBe(1);
  });

  // The whole point. Seven buttons in three header idioms cannot be in the
  // same place; one pinned to the viewport is, by construction.
  it('er festet til viewporten, ikke til en overskrift', () => {
    const rule = css().slice(css().indexOf('.hdr-more-btn{'), css().indexOf('.hdr-more-btn:active'));
    expect(rule).toMatch(/position:fixed/);
    expect(rule).toMatch(/top:1rem/);
    expect(rule).toMatch(/right:1rem/);
  });

  it('og ligger utenfor hver eneste skjerm', () => {
    expect(insideAView(html(), 'id="board-more-btn"')).toBe(false);
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

  it('overskriftene gir plass til den framfor å løpe under', () => {
    expect(css()).toMatch(/\.board-header-slim,\.screen-header,#v-leisure \.lei-header\{padding-right/);
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
