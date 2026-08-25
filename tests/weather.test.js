import { describe, it, expect } from 'vitest';
import { weatherAdvice, darknessNote, forecastAt, weatherIcon } from '../src/api/weather.js';

describe('weatherAdvice', () => {
  it('suggests an umbrella when rain is both forecast and likely', () => {
    expect(weatherAdvice(10, 1.2, 3, { precipProb: 80 })).toContain('ta med paraply');
  });

  it('skips the umbrella when rain is forecast but unlikely', () => {
    // Previously fired on absolute mm alone, with no notion of probability.
    expect(weatherAdvice(10, 1.2, 3, { precipProb: 10 })).not.toContain('paraply');
  });

  it('keeps the old behaviour when probability is unknown', () => {
    expect(weatherAdvice(10, 1.2, 3)).toContain('ta med paraply');
  });

  it('picks the layer from apparent temperature, not the dry-bulb reading', () => {
    // 5°C in a stiff wind feels sub-zero — that changes what you should wear.
    expect(weatherAdvice(5, 0, 14, { feels: -2 })).toContain('vinterjakke og lue');
    expect(weatherAdvice(5, 0, 2)).toContain('vinterjakke');
  });

  it('adds a windbreaker above 12 m/s', () => {
    expect(weatherAdvice(15, 0, 14)).toContain('vindjakke');
  });

  it('returns null when nothing is worth saying', () => {
    expect(weatherAdvice(22, 0, 2)).toBeNull();
  });
});

describe('darknessNote', () => {
  const w = sunset => ({ sunset });

  it('reports darkness when arrival is after sunset', () => {
    expect(darknessNote(w('2026-01-15T16:00:00'), '2026-01-15T17:30:00')).toBe('mørkt');
  });

  it('warns when sunset falls shortly after arrival', () => {
    expect(darknessNote(w('2026-01-15T16:12:00'), '2026-01-15T15:30:00')).toBe('mørkt fra 16:12');
  });

  it('says nothing when arrival is comfortably before sunset', () => {
    expect(darknessNote(w('2026-06-15T22:30:00'), '2026-06-15T14:00:00')).toBeNull();
  });

  it('handles missing data without throwing', () => {
    expect(darknessNote(null, '2026-01-15T12:00:00')).toBeNull();
    expect(darknessNote(w(null), '2026-01-15T12:00:00')).toBeNull();
    expect(darknessNote(w('2026-01-15T16:00:00'), null)).toBeNull();
    expect(darknessNote(w('nonsense'), 'nonsense')).toBeNull();
  });
});

describe('forecastAt', () => {
  const series = [
    { isoTime: '2026-05-24T09:00:00', temp: 5 },
    { isoTime: '2026-05-24T10:00:00', temp: 7 },
    { isoTime: '2026-05-24T11:00:00', temp: 9 },
  ];

  it('picks the entry closest in time', () => {
    expect(forecastAt(series, '2026-05-24T10:20:00').temp).toBe(7);
    expect(forecastAt(series, '2026-05-24T10:40:00').temp).toBe(9);
  });

  it('handles empty input', () => {
    expect(forecastAt([], '2026-05-24T10:00:00')).toBeNull();
    expect(forecastAt(null, '2026-05-24T10:00:00')).toBeNull();
    expect(forecastAt(series, null)).toBeNull();
  });
});

describe('weatherIcon', () => {
  it('maps WMO codes to glyphs', () => {
    expect(weatherIcon(0)).toBe('☀');
    expect(weatherIcon(3)).toBe('☁');
    expect(weatherIcon(65)).toBe('🌧');
    expect(weatherIcon(95)).toBe('⛈');
  });
});
