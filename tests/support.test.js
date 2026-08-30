import { describe, it, expect, beforeEach, vi } from 'vitest';
import config from '../src/config.js';
import {
  supportLinks, shouldAsk, hasSupported, markSupported,
  monthlyCost, supportHtml, renderSupport,
} from '../src/ui/support.js';

const setSupport = (v) => { config.support = v; };
const BASE = { vipps: '', sponsor: '', costs: [] };

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
    setSupport({ ...BASE, vipps: 'https://qr.vipps.no/x' });
    expect(shouldAsk()).toBe(true);
  });

  // Asking again someone who already gave is nagging, and this app does not.
  it('stops asking once the reader has followed a link', () => {
    setSupport({ ...BASE, vipps: 'https://qr.vipps.no/x' });
    markSupported();
    expect(hasSupported()).toBe(true);
    expect(shouldAsk()).toBe(false);
  });

  it('offers each configured rail, and only those', () => {
    setSupport({ ...BASE, sponsor: 'https://github.com/sponsors/x' });
    expect(supportLinks().map(l => l.id)).toEqual(['sponsor']);
    setSupport({ ...BASE, vipps: 'v', sponsor: 's' });
    expect(supportLinks().map(l => l.id)).toEqual(['vipps', 'sponsor']);
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
    setSupport({ vipps: 'https://qr.vipps.no/x', sponsor: '',
      costs: [{ what: 'kartfliser', nok: 180 }, { what: 'domene', nok: 20 }] });
    const h = supportHtml();
    expect(h).toContain('kartfliser');
    expect(h).toContain('180 kr');
    expect(h).toContain('200 kr');       // the total
    expect(h).toContain('qr.vipps.no');
  });

  it('leaves the table out entirely when no cost is filled in', () => {
    setSupport({ ...BASE, vipps: 'https://qr.vipps.no/x' });
    const h = supportHtml();
    expect(h).not.toContain('sup-costs');
    expect(h).toContain('qr.vipps.no');
  });

  // It gates nothing and grants nothing, and the copy has to say so — a
  // status the app cannot check is exactly what this model avoids.
  it('says plainly that it unlocks nothing', () => {
    setSupport({ ...BASE, vipps: 'https://qr.vipps.no/x' });
    expect(supportHtml()).toContain('låser ikke opp noe');
  });

  it('escapes what it is given, since these come from config', () => {
    setSupport({ ...BASE, vipps: 'https://x/"><img src=x>' });
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
    setSupport({ ...BASE, vipps: 'https://qr.vipps.no/x' });
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
