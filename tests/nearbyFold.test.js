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
import { otherRowHtml } from '../src/ui/alerts.js';

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
  it('opens closed, and says how to open it', () => {
    const b = parse(nearbyToggleHtml(8, false));
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(b.textContent).toContain('8 stopp i nærheten');
    expect(b.querySelector('.ah-show').textContent).toBe('vis');
  });

  it('says how to close it once open', () => {
    const b = parse(nearbyToggleHtml(8, true));
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(b.querySelector('.ah-show').textContent).toBe('skjul');
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

  // «There is more here, tap to see it» is ONE idea, and this is its third
  // appearance. v1.105.0 shipped .alerts-other with no styling at all — it
  // rendered as a bare white default button, and only a screenshot caught it.
  // A shared rule is what stops that happening a third time, so this binds the
  // two rows to the same shape rather than trusting them to stay alike.
  it('wears the same clothes as the folded traffic messages', () => {
    const mine = parse(nearbyToggleHtml(2, false));
    const theirs = parse(otherRowHtml(2, false));
    expect(mine.tagName).toBe(theirs.tagName);
    expect(mine.querySelector('.ah-show').textContent)
      .toBe(theirs.querySelector('.ah-show').textContent);
    expect(mine.getAttribute('aria-expanded')).toBe(theirs.getAttribute('aria-expanded'));
  });

  it('escapes what it prints', () => {
    expect(nearbyToggleHtml(3, false)).not.toContain('<script');
  });
});
