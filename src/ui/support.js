import config from '../config.js';
import { storage } from '../storage.js';
import { esc } from './fmt.js';

/**
 * Asking for support, once.
 *
 * A static host cannot keep a secret or verify anything, so this deliberately
 * gates nothing and grants nothing. There is no badge and no "supporter"
 * status: a status the app cannot check is exactly the dishonesty the rest of
 * the app has spent its life removing. What it can do is say what the thing
 * costs to run, offer a way to help, and then stop asking — because asking
 * again someone who already gave is nagging, and this app does not nag.
 */

const ASKED_KEY = 't.supported';

export function supportLinks() {
  const rails = (config.support && config.support.rails) || [];
  return rails
    .filter(r => r && r.url)
    .map(r => ({
      id: String(r.id || r.label || 'støtt'),
      label: String(r.label || 'Støtt'),
      url: String(r.url),
      qr: r.qr || '',
    }));
}

/**
 * Wide enough that this is probably not a phone.
 *
 * A QR beside a link you can simply tap is noise, and the ask is meant to be
 * quiet. But the guide is read on laptops, and a Vipps link there is a dead
 * end — so the code appears exactly where the tap cannot work.
 */
export const QR_MIN_WIDTH = 700;

export function showQr(width) {
  return (width || 0) >= QR_MIN_WIDTH;
}

/** Has the reader already been to one of the links? Local, and self-declared. */
export function hasSupported() {
  return storage.get(ASKED_KEY) === '1';
}

export function markSupported() {
  storage.set(ASKED_KEY, '1');
}

/**
 * Whether to show the ask at all.
 *
 * Nothing configured means nothing rendered — no empty heading, no
 * placeholder, exactly as the "ofte brukt" section does when there are no
 * favourites.
 */
export function shouldAsk() {
  return supportLinks().length > 0 && !hasSupported();
}

/** Monthly running cost, summed from the parts that are actually paid for. */
export function monthlyCost(costs) {
  return (costs || []).reduce((n, c) => n + (Number(c && c.nok) || 0), 0);
}

/**
 * The section itself: what it costs, then the ways to help.
 *
 * Concrete beats a generic tip jar — «kartfliser 180 kr» is a reason, «støtt
 * utvikleren» is a shrug — and it is the same idiom as the staleness stamp:
 * say the true thing plainly and let the reader decide.
 */
export function supportHtml() {
  const links = supportLinks();
  if (!links.length) return '';
  const costs = (config.support && config.support.costs) || [];
  const named = costs.filter(c => Number(c && c.nok) > 0);
  const total = monthlyCost(named);
  const table = named.length
    ? '<table class="sup-costs">'
      + named.map(c => '<tr><td>' + esc(c.what) + '</td><td>' + Math.round(c.nok) + ' kr</td></tr>').join('')
      + '<tr><td>i måneden</td><td>' + Math.round(total) + ' kr</td></tr>'
      + '</table>'
    : '';
  const wide = typeof window !== 'undefined' && showQr(window.innerWidth);
  return '<div class="set-label">støtt appen</div>'
    + '<p class="sup-lead">Appen er gratis, og blir det. '
    + (named.length
      ? 'Den koster litt å drifte, og her er hva:'
      : 'Vil du bidra til driften, går det an.')
    + '</p>'
    + table
    + '<div class="sup-btns">'
    + links.map(l => '<a class="sup-btn" href="' + esc(l.url) + '" target="_blank" rel="noopener"'
      + ' data-support="' + esc(l.id) + '">' + esc(l.label) + '</a>').join('')
    + '</div>'
    // The code, only on a screen where tapping the link cannot work. The SVG
    // comes from config and is written by whoever deploys the app, not by a
    // third party — the URL beside it is escaped as usual.
    + (wide ? links.filter(l => l.qr).map(l =>
      '<div class="sup-qr">' + l.qr
      + '<span class="sup-qr-cap">skann med ' + esc(l.label) + ' på telefonen</span></div>').join('') : '')
    + '<p class="sup-note">Beløpet er ditt valg, og det er en engangssum — '
    + 'ingen avtale, ingenting som trekkes igjen. '
    + 'Støtte låser ikke opp noe: alle funksjoner er med uansett, '
    + 'og appen får ikke vite hvem som gir.</p>';
}

/**
 * Render into a container and remember a tap.
 *
 * One delegated listener rather than one per link, and the flag is written on
 * the way out: the app cannot know whether the payment went through, so it
 * remembers only that it asked and you followed — which is all it needs to
 * know to stop asking.
 */
export function renderSupport(el, onChange) {
  if (!el) return;
  if (!shouldAsk()) { el.innerHTML = ''; el.style.display = 'none'; return; }
  el.innerHTML = supportHtml();
  el.style.display = 'block';
  if (!el._supBound) {
    el._supBound = true;
    el.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('[data-support]');
      if (!a || !el.contains(a)) return;
      markSupported();
      if (onChange) setTimeout(onChange, 0);
    });
  }
}
