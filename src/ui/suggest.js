/**
 * Type a place, get five suggestions, pick one.
 *
 * This loop — debounce, abort the one in flight, refuse a query too short to
 * mean anything, drop a response that arrived after a newer one, hide the
 * list on blur but not before the click lands — was written out twice: once
 * in `views/settings.js` for the route form and once in `views/leisure.js`
 * for the location override. «Utforsk» would have been the third, and three
 * copies of one rule is how this codebase's recurring bug is born.
 *
 * NOT folded in here: the route form's version. It also carries frequent-place
 * pills, clear buttons and a destination map preview, and pulling those apart
 * is a refactor, not this release. It is named rather than quietly left out.
 *
 * The blur delay is the part that looks like a magic number and is not: a
 * click on a suggestion fires `blur` on the input first, so hiding the list
 * synchronously would swallow the tap. `mousedown` is cancelled for the same
 * reason.
 */

/** Below this a query matches half the country; asking is worse than waiting. */
export const MIN_QUERY = 2;
/** Long enough that typing does not fire a request per keystroke. */
export const DEBOUNCE_MS = 250;
/** Long enough for the click to land after blur. */
export const BLUR_MS = 150;
export const MAX_SUGGESTIONS = 5;

/**
 * @param {HTMLElement} input
 * @param {HTMLElement} sugg   container for the buttons
 * @param {(q:string)=>Promise<Array<{label:string}>>} fetchFn
 * @param {(r:object)=>void} onPick
 * @returns {() => void} detach
 */
export function bindPlaceInput(input, sugg, fetchFn, onPick) {
  if (!input || !sugg) return () => {};
  let timer = null;
  let seq = 0;

  const hide = () => { sugg.hidden = true; sugg.innerHTML = ''; };

  const onInput = () => {
    const q = input.value.trim();
    clearTimeout(timer);
    if (q.length < MIN_QUERY) { hide(); return; }
    timer = setTimeout(() => {
      // The stale guard. Without it a slow answer to «sto» can overwrite the
      // answer to «storaas» — the list then disagrees with the field it
      // belongs to, which is the one thing a suggestion list must never do.
      const mine = ++seq;
      Promise.resolve(fetchFn(q)).then(results => {
        if (mine !== seq) return;
        sugg.innerHTML = '';
        const list = (results || []).slice(0, MAX_SUGGESTIONS);
        if (!list.length) { sugg.hidden = true; return; }
        list.forEach(r => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'sugg-btn';
          btn.textContent = r.label;
          btn.addEventListener('mousedown', ev => ev.preventDefault());
          btn.addEventListener('click', () => { hide(); onPick(r); });
          sugg.appendChild(btn);
        });
        sugg.hidden = false;
      }).catch(() => {});
    }, DEBOUNCE_MS);
  };

  const onBlur = () => setTimeout(hide, BLUR_MS);

  input.addEventListener('input', onInput);
  input.addEventListener('blur', onBlur);
  return () => {
    clearTimeout(timer);
    input.removeEventListener('input', onInput);
    input.removeEventListener('blur', onBlur);
  };
}
