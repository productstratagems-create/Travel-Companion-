/**
 * Kompasset hører til kartet sitt.
 *
 * Rapportert med skjermbilde: på auto-reise lå kompasset oppe i
 * overskriften, oppå ⋮, langt utenfor kartet det gjelder.
 *
 * `.map-compass` er `position:absolute` og plasseres i forhold til sin
 * nærmeste POSISJONERTE forelder. De fleste kartomslag er `.map-wrap`, som
 * setter `position:relative`. auto-reises er en `.set-section`, som ikke
 * gjør det — så kompasset klatret forbi den til neste posisjonerte
 * forelder, `.screen-header-solo`, og havnet i overskriften.
 *
 * Å rette det ene omslaget ville latt neste kart finne feilen på nytt. Det
 * er `addCompass` som plasserer knappen, så det er `addCompass` som
 * garanterer forutsetningen den plasserer den under.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/ui/leafletGlobal.js', () => ({}));
vi.mock('leaflet-rotate', () => ({}));

const fakeMap = () => ({
  getBearing: () => 0,
  setBearing: vi.fn(),
  on: vi.fn(),
});

let addCompass;
beforeEach(async () => {
  document.body.innerHTML = '';
  ({ addCompass } = await import('../src/ui/mapCompass.js'));
});

describe('addCompass', () => {
  const mount = (wrapStyle) => {
    const wrap = document.createElement('div');
    if (wrapStyle) wrap.setAttribute('style', wrapStyle);
    const map = document.createElement('div');
    wrap.appendChild(map);
    document.body.appendChild(wrap);
    return { wrap, map };
  };

  // THE BUG. A static wrapper is not a positioning context, so the
  // absolutely positioned compass anchors to something further up the tree.
  it('gjør omslaget til en posisjoneringskontekst når det ikke er en', () => {
    const { wrap, map } = mount(null);
    addCompass(fakeMap(), map);
    expect(wrap.style.position).toBe('relative');
  });

  it('rører ikke et omslag som allerede er posisjonert', () => {
    const { wrap, map } = mount('position:absolute');
    addCompass(fakeMap(), map);
    expect(wrap.style.position).toBe('absolute');
  });

  it('legger knappen i omslaget, ved siden av kartet', () => {
    const { wrap, map } = mount(null);
    addCompass(fakeMap(), map);
    const btn = wrap.querySelector('.map-compass');
    expect(btn).toBeTruthy();
    expect(btn.parentElement).toBe(wrap);
  });

  // Called again on a re-render, it must not stack a second needle.
  it('lager bare én, uansett hvor mange ganger den kalles', () => {
    const { wrap, map } = mount(null);
    addCompass(fakeMap(), map);
    addCompass(fakeMap(), map);
    expect(wrap.querySelectorAll('.map-compass').length).toBe(1);
  });

  it('gjør ingenting uten et omslag', () => {
    const orphan = document.createElement('div');
    expect(() => addCompass(fakeMap(), orphan)).not.toThrow();
  });
});
