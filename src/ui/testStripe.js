/**
 * Stripen øverst mens testposisjonen er på (v1.218.46). En glemt testposisjon
 * gir feil avganger uten at noe sier hvorfor — så den sies, på hver skjerm.
 * Trykk slår den av.
 */
import { hentTestPos } from '../api/testPos.js';
import { brukTestPos } from '../geo.js';

export function testStripeTekst(t) {
  return t ? 'TESTPOSISJON · ' + t.navn + ' · slå av' : '';
}

export function oppdaterTestStripe() {
  const el = typeof document !== 'undefined' && document.getElementById('testpos-stripe');
  if (!el) return;
  const t = hentTestPos();
  el.hidden = !t;
  el.textContent = testStripeTekst(t);
  document.body.classList.toggle('har-testpos', !!t);
  if (!el._bundet) {
    el._bundet = true;
    el.addEventListener('click', () => {
      brukTestPos(null);
      oppdaterTestStripe();
      window._onTestPos && window._onTestPos();
    });
  }
}
