import { describe, it, expect } from 'vitest';
import { activeSituations, situationText, sevClass, SEVERITY_RANK } from '../src/ui/alerts.js';

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
