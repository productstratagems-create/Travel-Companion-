/**
 * One suggestion loop instead of three.
 *
 * The rules that matter are the ones that only bite under timing: a stale
 * answer must not overwrite a fresh one, and the list must not vanish
 * before the tap on it lands.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { bindPlaceInput, MIN_QUERY, DEBOUNCE_MS, BLUR_MS, MAX_SUGGESTIONS } from '../src/ui/suggest.js';

function mount() {
  document.body.innerHTML = '<input id="i"><div id="s" hidden></div>';
  return { inp: document.getElementById('i'), sugg: document.getElementById('s') };
}
const type = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };

beforeEach(() => vi.useFakeTimers());

describe('bindPlaceInput', () => {
  it('waits before asking, and asks once', async () => {
    const { inp, sugg } = mount();
    const fetchFn = vi.fn(async () => [{ label: 'Storaas' }]);
    bindPlaceInput(inp, sugg, fetchFn, () => {});
    type(inp, 'stor');
    type(inp, 'storaa');
    type(inp, 'storaas');
    expect(fetchFn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith('storaas');
  });

  it('does not ask about a query too short to mean anything', async () => {
    const { inp, sugg } = mount();
    const fetchFn = vi.fn(async () => []);
    bindPlaceInput(inp, sugg, fetchFn, () => {});
    type(inp, 'a'.repeat(MIN_QUERY - 1));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(sugg.hidden).toBe(true);
  });

  it('shows at most five, and reports the pick', async () => {
    const { inp, sugg } = mount();
    const many = Array.from({ length: 9 }, (_, i) => ({ label: 'sted ' + i }));
    const picks = [];
    bindPlaceInput(inp, sugg, async () => many, r => picks.push(r.label));
    type(inp, 'sted');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const btns = sugg.querySelectorAll('button');
    expect(btns.length).toBe(MAX_SUGGESTIONS);
    expect(sugg.hidden).toBe(false);
    btns[2].click();
    expect(picks).toEqual(['sted 2']);
    expect(sugg.hidden).toBe(true);
  });

  // THE STALE GUARD. A slow answer to «sto» must not overwrite the answer to
  // «storaas» — the list would then disagree with the field it belongs to,
  // which is the one thing a suggestion list must never do.
  it('drops an answer that a newer query has overtaken', async () => {
    const { inp, sugg } = mount();
    const pending = [];
    bindPlaceInput(inp, sugg, () => new Promise(res => pending.push(res)), () => {});
    type(inp, 'sto');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    type(inp, 'storaas');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(pending.length).toBe(2);
    pending[1]([{ label: 'Storaas Gjestegård' }]);   // fresh answers first
    await vi.advanceTimersByTimeAsync(0);
    pending[0]([{ label: 'Stockholm' }, { label: 'Stord' }]);  // stale arrives late
    await vi.advanceTimersByTimeAsync(0);
    expect([...sugg.querySelectorAll('button')].map(b => b.textContent))
      .toEqual(['Storaas Gjestegård']);
  });

  // A click fires blur on the input first, so hiding synchronously would
  // swallow the tap.
  it('keeps the list up long enough for the tap to land', async () => {
    const { inp, sugg } = mount();
    bindPlaceInput(inp, sugg, async () => [{ label: 'Storaas' }], () => {});
    type(inp, 'storaas');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    inp.dispatchEvent(new Event('blur'));
    expect(sugg.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(BLUR_MS);
    expect(sugg.hidden).toBe(true);
  });

  // The app has known «you use this one daily» for releases and spent it
  // on sort order alone. An unexplained reordering is just a list that
  // moved; the reason is what makes it trustworthy.
  it('shows the reason a suggestion is on top, beside the name', async () => {
    const { inp, sugg } = mount();
    bindPlaceInput(inp, sugg, async () => [{ label: 'Ski stasjon', why: 'ofte brukt' }], () => {});
    type(inp, 'ski');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const btn = sugg.querySelector('button');
    expect(btn.querySelector('.sugg-why').textContent).toBe('ofte brukt');
    // Beside, never instead of: the name is the answer.
    expect(btn.textContent).toContain('Ski stasjon');
  });

  it('shows no reason when there is none', async () => {
    const { inp, sugg } = mount();
    bindPlaceInput(inp, sugg, async () => [{ label: 'Skien' }], () => {});
    type(inp, 'ski');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(sugg.querySelector('.sugg-why')).toBe(null);
  });

  it('hides rather than showing an empty list', async () => {
    const { inp, sugg } = mount();
    bindPlaceInput(inp, sugg, async () => [], () => {});
    type(inp, 'qqqq');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(sugg.hidden).toBe(true);
  });

  it('survives a rejected lookup without leaving a half-built list', async () => {
    const { inp, sugg } = mount();
    bindPlaceInput(inp, sugg, async () => { throw new Error('offline'); }, () => {});
    type(inp, 'storaas');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(sugg.hidden).toBe(true);
  });

  it('detaches cleanly', async () => {
    const { inp, sugg } = mount();
    const fetchFn = vi.fn(async () => []);
    bindPlaceInput(inp, sugg, fetchFn, () => {})();
    type(inp, 'storaas');
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
