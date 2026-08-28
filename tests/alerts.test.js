import { describe, it, expect } from 'vitest';
import { activeSituations, situationText, situationTitle, situationBody, alertHtml, sevClass, SEVERITY_RANK } from '../src/ui/alerts.js';

const sit = (id, severity, value, validityPeriod = {}) => ({
  id, severity, validityPeriod,
  summary: value == null ? [] : [{ language: 'no', value }],
});

describe('activeSituations', () => {
  const NOW = new Date('2026-05-24T12:00:00Z').getTime();

  it('ranks the most disruptive first', () => {
    const out = activeSituations([
      sit('a', 'slight', 'Heis ute av drift'),
      sit('b', 'verySevere', 'Stengt strekning'),
      sit('c', 'normal', 'Endret rute'),
    ], NOW);
    expect(out.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts unknown severities last rather than dropping them', () => {
    const out = activeSituations([sit('x', 'mystery', 'Ukjent'), sit('y', 'severe', 'Alvorlig')], NOW);
    expect(out.map(s => s.id)).toEqual(['y', 'x']);
  });

  it('excludes situations whose window has passed', () => {
    const out = activeSituations([
      sit('past', 'severe', 'Gammel', { endTime: '2026-05-24T11:00:00Z' }),
      sit('now', 'severe', 'Aktiv'),
    ], NOW);
    expect(out.map(s => s.id)).toEqual(['now']);
  });

  it('excludes situations that have not started', () => {
    const out = activeSituations([
      sit('future', 'severe', 'Kommer', { startTime: '2026-05-24T13:00:00Z' }),
    ], NOW);
    expect(out).toEqual([]);
  });

  it('treats missing bounds as open-ended', () => {
    expect(activeSituations([sit('a', 'severe', 'X')], NOW)).toHaveLength(1);
  });

  it('handles null input', () => {
    expect(activeSituations(null)).toEqual([]);
  });
});

describe('situationText', () => {
  it('prefers Norwegian', () => {
    expect(situationText({ summary: [
      { language: 'en', value: 'Lift out of order' },
      { language: 'no', value: 'Heisen er ute av drift' },
    ] })).toBe('Heisen er ute av drift');
  });

  it('falls back to whatever language is present', () => {
    expect(situationText({ summary: [{ language: 'en', value: 'Only English' }] })).toBe('Only English');
  });

  it('returns an empty string rather than throwing', () => {
    expect(situationText(null)).toBe('');
    expect(situationText({})).toBe('');
    expect(situationText({ summary: [] })).toBe('');
  });
});

describe('sevClass', () => {
  it('marks severe and above', () => {
    expect(sevClass('severe')).toBe(' sev-severe');
    expect(sevClass('verySevere')).toBe(' sev-severe');
  });

  it('marks slight and below', () => {
    expect(sevClass('slight')).toBe(' sev-slight');
    expect(sevClass('noImpact')).toBe(' sev-slight');
  });

  it('leaves normal and unknown unstyled', () => {
    expect(sevClass('normal')).toBe('');
    expect(sevClass(undefined)).toBe('');
  });
});

describe('SEVERITY_RANK', () => {
  it('orders the Entur severity scale', () => {
    expect(SEVERITY_RANK.verySevere).toBeLessThan(SEVERITY_RANK.severe);
    expect(SEVERITY_RANK.severe).toBeLessThan(SEVERITY_RANK.normal);
    expect(SEVERITY_RANK.normal).toBeLessThan(SEVERITY_RANK.slight);
  });
});

// ── What the message actually says ──────────────────────────────────────────
//
// The reported bug: the banner read "Anbefaling for reiser til Oslo sentrum"
// and nothing else. summary is a heading; the recommendation lives in
// description, and neither it nor advice was ever requested or rendered.
const ml = v => (v == null ? undefined : [{ language: 'no', value: v }]);
const full = (sum, desc, adv) => ({
  id: 's1', severity: 'normal', validityPeriod: {},
  summary: ml(sum), description: ml(desc), advice: ml(adv),
});

describe('situationTitle / situationBody', () => {
  it('separates the heading from what it is about', () => {
    const s = full('Anbefaling for reiser til Oslo sentrum', 'Reis via Majorstuen.');
    expect(situationTitle(s)).toBe('Anbefaling for reiser til Oslo sentrum');
    expect(situationBody(s)).toBe('Reis via Majorstuen.');
  });

  it('puts the advice after the description, since that is the recommendation', () => {
    expect(situationBody(full('T', 'Sporarbeid.', 'Bruk buss for tog.')))
      .toBe('Sporarbeid. Bruk buss for tog.');
    // Some feeds repeat the description as advice; do not say it twice.
    expect(situationBody(full('T', 'Sporarbeid.', 'Sporarbeid.'))).toBe('Sporarbeid.');
    expect(situationBody(full('T', null, 'Bruk buss.'))).toBe('Bruk buss.');
  });

  it('has no body when the API returned none — today\'s output, unchanged', () => {
    expect(situationBody(full('Bare overskrift'))).toBe('');
    expect(situationText(full('Bare overskrift'))).toBe('Bare overskrift');
  });

  it('prefers Norwegian, and survives missing or blank fields', () => {
    const s = { summary: [{ language: 'en', value: 'EN' }, { language: 'no', value: 'NO' }],
      description: [{ language: 'en', value: 'body-en' }] };
    expect(situationTitle(s)).toBe('NO');
    expect(situationBody(s)).toBe('body-en');
    expect(situationTitle({})).toBe('');
    expect(situationBody({})).toBe('');
    expect(situationBody(full('T', '   '))).toBe('');
  });
});

describe('alertHtml', () => {
  it('makes an alert with a body a real, expandable button', () => {
    const h = alertHtml(full('Overskrift', 'Brødtekst.'));
    expect(h).toContain('<button');
    expect(h).toContain('aria-expanded="false"');
    expect(h).toContain('sa-title');
    expect(h).toContain('Brødtekst.');
  });

  it('leaves a body-less alert exactly as it was — a plain div, no button', () => {
    const h = alertHtml(full('Bare overskrift'));
    expect(h).toContain('<div class="service-alert');
    expect(h).not.toContain('<button');
  });

  it('escapes both halves, since this is third-party text', () => {
    const h = alertHtml(full('<b>x</b>', '<img src=x onerror=1>'));
    expect(h).not.toContain('<b>');
    expect(h).not.toContain('<img');
  });

  it('renders nothing at all when there is no text', () => {
    expect(alertHtml(full(null))).toBe('');
  });
});
