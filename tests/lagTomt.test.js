import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { lagSynlig } from '../src/views/auto.js';

describe('lag-knappen står aldri med et tomt panel (v1.218.92)', () => {
  // Rapportert 17:46: kortets reise på kartet, lag-knappen aktiv, panelet tomt.
  it('ingenting å velge: knappen skjules', () => {
    expect(lagSynlig([])).toBe(false);
    expect(lagSynlig([{ modus: 'metro', antall: 1 }, { modus: 'bus', antall: 2 }])).toBe(true);
  });
  it('første tegning går forbi vakten, og skjulingen står før den', () => {
    const s = fs.readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/let _modiKontroll = null, _modiNøkkel = null;/);
    const i = s.indexOf('function _tegnModiKnapper');
    const f = s.slice(i, i + 2500);
    // v1.218.110: «noe å velge» er transportmidler ELLER linjer.
    expect(f.indexOf('const noe = lagSynlig(modi) || linjer.length > 0;')).toBeGreaterThan(-1);
    expect(f.indexOf('if (!noe) {')).toBeGreaterThan(-1);
    expect(f.indexOf('if (!noe) {')).toBeLessThan(f.indexOf('if (nøkkel === _modiNøkkel) return;'));
  });
});
