/**
 * Lista over stopp i nærheten, foldet.
 *
 * Reported with a screenshot: eight nearby stops sitting between «fra stasjon»
 * and «til stopp eller stasjon», so the second field — and «bruk rute» under
 * it — were off the bottom of the phone. The list is useful and it is not what
 * the screen is for: you come here to set a route, and the stop you are
 * standing at is already in the field above.
 */
import { describe, it, expect } from 'vitest';
import { nearbyLabel, nearbyToggleHtml } from '../src/views/settings.js';
import { stopHeadHtml } from '../src/views/auto.js';

const parse = (html) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el.firstElementChild;
};

describe('nearbyLabel', () => {
  it('counts, and inflects', () => {
    expect(nearbyLabel(1)).toBe('1 stopp i nærheten');
    expect(nearbyLabel(8)).toBe('8 stopp i nærheten');
  });

  it('says nothing about nothing', () => {
    expect(nearbyLabel(0)).toBe('');
    expect(nearbyToggleHtml(0, false)).toBe('');
  });
});

describe('nearbyToggleHtml', () => {
  it('opens closed, and points the way open', () => {
    const b = parse(nearbyToggleHtml(8, false));
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.textContent).toContain('8 stopp i nærheten');
    expect(b.querySelector('.auto-stop-more').textContent).toBe('▾');
  });

  it('turns the caret over once open', () => {
    const b = parse(nearbyToggleHtml(8, true));
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.querySelector('.auto-stop-more').textContent).toBe('▴');
  });

  // A screen reader needs to know WHICH thing this button opens; the list is
  // a sibling, not a child, so nesting cannot say it.
  it('names the list it controls', () => {
    expect(parse(nearbyToggleHtml(8, false)).getAttribute('aria-controls'))
      .toBe('set-nearby-list');
  });

  it('is a button, not a div someone can tab past', () => {
    expect(parse(nearbyToggleHtml(8, false)).tagName).toBe('BUTTON');
    expect(parse(nearbyToggleHtml(8, false)).getAttribute('type')).toBe('button');
  });

  // «THERE IS MORE HERE» IS ONE IDEA, AND THE APP HAD TWO GRAMMARS FOR IT.
  //
  // v1.111.0 built this on otherRowHtml — a dashed box with the word «VIS» —
  // which made it consistent with the traffic banner and inconsistent with
  // «Mortensrud 7 ▾» on auto-reise, where the reader meets the same idea far
  // more often. Asked to settle on the caret, so this now binds to
  // stopHeadHtml instead. The claim the test makes has changed; it has not
  // been dropped, because a fold with nobody to agree with is how the dashed
  // box shipped unstyled in the first place.
  it('wears the same caret as the stop list on auto-reise', () => {
    const stop = { name: 'Mortensrud', distM: 500 };
    const auto = parse(stopHeadHtml(stop, 7, false, {}));
    const mine = parse(nearbyToggleHtml(7, false));
    const caretOf = (el) => el.querySelector('.auto-stop-more').textContent.trim().slice(-1);
    expect(caretOf(mine)).toBe(caretOf(auto));

    const autoOpen = parse(stopHeadHtml(stop, 7, true, {}));
    const mineOpen = parse(nearbyToggleHtml(7, true));
    expect(caretOf(mineOpen)).toBe(caretOf(autoOpen));
    // And the two carets differ from each other, or the test says nothing.
    expect(caretOf(mine)).not.toBe(caretOf(mineOpen));
  });

  // The word is gone with the dashed box. A caret needs no verb, and leaving
  // «vis» behind would have been half of each grammar.
  it('carries no verb', () => {
    expect(nearbyToggleHtml(8, false)).not.toContain('ah-show');
    expect(nearbyToggleHtml(8, false)).not.toMatch(/\bvis\b/);
  });

  it('escapes what it prints', () => {
    expect(nearbyToggleHtml(3, false)).not.toContain('<script');
  });
});
