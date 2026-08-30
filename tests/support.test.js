import { describe, it, expect, beforeEach, vi } from 'vitest';
import config from '../src/config.js';
import {
  supportLinks, shouldAsk, hasSupported, markSupported,
  monthlyCost, supportHtml, renderSupport, showQr, QR_MIN_WIDTH,
} from '../src/ui/support.js';

const rail = (id, label, url, qr) => ({ id, label, url, qr });

const setSupport = (v) => { config.support = v; };
const BASE = { rails: [], costs: [] };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('__activeProfile', 'default');
  setSupport({ ...BASE });
});

describe('shouldAsk', () => {
  // Nothing configured means nothing rendered — no empty heading, no
  // placeholder, the same rule the "ofte brukt" shortcuts follow.
  it('says nothing at all when no link is configured', () => {
    expect(supportLinks()).toEqual([]);
    expect(shouldAsk()).toBe(false);
    expect(supportHtml()).toBe('');
  });

  it('asks once a link exists', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    expect(shouldAsk()).toBe(true);
  });

  // Asking again someone who already gave is nagging, and this app does not.
  it('stops asking once the reader has followed a link', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    markSupported();
    expect(hasSupported()).toBe(true);
    expect(shouldAsk()).toBe(false);
  });

  it('offers each configured rail, in the order given, and skips the empty', () => {
    setSupport({ ...BASE, rails: [rail('sponsor', 'GitHub Sponsors', 'https://github.com/sponsors/x')] });
    expect(supportLinks().map(l => l.id)).toEqual(['sponsor']);
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'v'), rail('sponsor', 'S', 's')] });
    expect(supportLinks().map(l => l.id)).toEqual(['vipps', 'sponsor']);
    // A half-filled entry is the configuration mistake that would otherwise
    // render a button leading nowhere.
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', ''), rail('x', 'X', 'u')] });
    expect(supportLinks().map(l => l.id)).toEqual(['x']);
  });
});

describe('monthlyCost', () => {
  it('sums what is actually paid for, and shrugs off junk', () => {
    expect(monthlyCost([{ what: 'a', nok: 180 }, { what: 'b', nok: 60 }])).toBe(240);
    expect(monthlyCost([])).toBe(0);
    expect(monthlyCost(null)).toBe(0);
    expect(monthlyCost([{ what: 'a' }, { what: 'b', nok: 'tull' }])).toBe(0);
  });
});

describe('supportHtml', () => {
  it('names the real costs, because concrete beats a tip jar', () => {
    setSupport({ rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')],
      costs: [{ what: 'kartfliser', nok: 180 }, { what: 'domene', nok: 20 }] });
    const h = supportHtml();
    expect(h).toContain('kartfliser');
    expect(h).toContain('180 kr');
    expect(h).toContain('200 kr');       // the total
    expect(h).toContain('qr.vipps.no');
  });

  it('leaves the table out entirely when no cost is filled in', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    const h = supportHtml();
    expect(h).not.toContain('sup-costs');
    expect(h).toContain('qr.vipps.no');
  });

  // It gates nothing and grants nothing, and the copy has to say so — a
  // status the app cannot check is exactly what this model avoids.
  it('says plainly that it unlocks nothing', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    expect(supportHtml()).toContain('låser ikke opp noe');
    expect(supportHtml()).toContain('engangssum');
  });

  it('escapes what it is given, since these come from config', () => {
    setSupport({ ...BASE, rails: [rail('v', 'V', 'https://x/"><img src=x>')] });
    expect(supportHtml()).not.toContain('<img');
  });
});

describe('renderSupport', () => {
  it('renders nothing and hides the container when there is nothing to ask', () => {
    const el = document.createElement('div');
    renderSupport(el);
    expect(el.innerHTML).toBe('');
    expect(el.style.display).toBe('none');
  });

  it('remembers a tap, so the next render is silent', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    const el = document.createElement('div');
    document.body.appendChild(el);
    renderSupport(el);
    expect(el.style.display).toBe('block');

    const a = el.querySelector('[data-support]');
    a.addEventListener('click', e => e.preventDefault());   // jsdom: no navigation
    a.click();
    expect(hasSupported()).toBe(true);

    renderSupport(el);
    expect(el.style.display).toBe('none');
  });
});

describe('the QR', () => {
  // A code beside a link you can simply tap is noise; the guide is read on
  // laptops, where a Vipps link is a dead end. So it appears exactly where
  // tapping cannot work.
  it('is for wide screens only', () => {
    expect(showQr(414)).toBe(false);
    expect(showQr(QR_MIN_WIDTH - 1)).toBe(false);
    expect(showQr(QR_MIN_WIDTH)).toBe(true);
    expect(showQr(1200)).toBe(true);
    expect(showQr(undefined)).toBe(false);
  });

  it('is left out entirely when the rail has no code, however wide the window', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x')] });
    window.innerWidth = 1200;
    expect(supportHtml()).not.toContain('sup-qr');
  });

  it('is rendered as SVG, not as text, on a wide window', () => {
    setSupport({ ...BASE, rails: [rail('vipps', 'Vipps', 'https://qr.vipps.no/x', '<svg class="qr"></svg>')] });
    window.innerWidth = 1200;
    const h = supportHtml();
    expect(h).toContain('<svg class="qr">');
    expect(h).toContain('skann med Vipps');
    window.innerWidth = 414;
    expect(supportHtml()).not.toContain('<svg');
  });
});
