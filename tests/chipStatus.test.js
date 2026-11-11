// Rapportert (skjermbilde 07:47): «3 underveis · mot kolsås · ANK 07:58» — ankomsten er til
// brukerens holdeplass, ikke Kolsås.
import { describe, it, expect } from 'vitest';
import { chipStatus } from '../src/ui/chip.js';

describe('stripen underveis', () => {
  it('med ankomst: målet ditt, ikke endestasjonen', () => {
    expect(chipStatus({ dest: 'Jernbanetorget', frontText: 'Kolsås', arrival: { clk: '07:58' } })).toBe('underveis · til jernbanetorget');
  });
  it('uten ankomst: retningen, som før', () => {
    expect(chipStatus({ dest: 'Jernbanetorget', frontText: 'Kolsås' })).toBe('underveis · mot kolsås');
  });
});
