import { state } from '../state.js';
import { splitSituations } from '../api/situations.js';
import { storage } from '../storage.js';
import config from '../config.js';
import { esc } from './fmt.js';

// Entur situation severities, most disruptive first. Unknown values sort last.
export const SEVERITY_RANK = { verySevere: 0, severe: 1, normal: 2, slight: 3, verySlight: 4, noImpact: 5 };

/** Norwegian text from one of a situation's multilingual fields. */
function pick(list) {
  const arr = list || [];
  const hit = arr.find(t => t.language === 'no' || t.language === 'nb') || arr[0] || {};
  return (hit.value || '').trim();
}

/**
 * The heading — which is all `summary` ever is.
 *
 * Entur writes a title there ("Anbefaling for reiser til Oslo sentrum") and
 * puts what it actually recommends in `description`. Rendering the summary
 * alone showed a heading with nothing under it.
 */
export function situationTitle(s) {
  return pick(s && s.summary);
}

/**
 * What the message says: the description, then the advice when both are
 * there — the advice being the bit a heading like the one above promises.
 * Empty when the API returned neither, in which case the banner looks
 * exactly as it did before.
 */
export function situationBody(s) {
  const desc = pick(s && s.description);
  const adv = pick(s && s.advice);
  if (desc && adv && adv !== desc) return desc + ' ' + adv;
  return desc || adv;
}

/** Kept for callers that just want something to show. */
export function situationText(s) {
  return situationTitle(s) || situationBody(s);
}

/** Rank for a severity, unknown values last — the one place that decides. */
export function sevRank(severity) {
  const r = SEVERITY_RANK[severity];
  return r == null ? 9 : r;
}

/** id → the severity rank it had when the reader put it away. */
export function loadHidden() {
  try {
    const v = JSON.parse(storage.get(config.storage.alertHid) || '{}');
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch { return {}; }
}

function saveHidden(map) {
  try { storage.set(config.storage.alertHid, JSON.stringify(map)); } catch { /* full or blocked */ }
}

/** Put one message away, remembering how bad it was at the time. */
export function hideAlert(id, severity) {
  if (!id) return;
  const map = loadHidden();
  map[id] = sevRank(severity);
  saveHidden(map);
}

/** Bring them all back. */
export function unhideAll() {
  storage.remove(config.storage.alertHid);
}

/**
 * Forget entries for messages that are no longer in the response at all,
 * so the key cannot grow without limit over months of use.
 */
export function pruneHidden(situations) {
  const map = loadHidden();
  const live = new Set((situations || []).map(s => s && s.id).filter(Boolean));
  let changed = false;
  Object.keys(map).forEach(id => {
    if (!live.has(id)) { delete map[id]; changed = true; }
  });
  if (changed) saveHidden(map);
}

/**
 * Which messages to show, and how many are put away.
 *
 * The rule with the sharp edge is the escalation: a message stays hidden only
 * while it is no worse than when it was hidden. If Entur raises the severity
 * that is a new thing to say, not the same thing again, so it comes back —
 * and its entry is dropped, so it can be put away again on its own terms.
 *
 * Pure, and asked by both banners, so the board and underveis cannot end up
 * disagreeing about what is hidden.
 */
export function visibleAlerts(active, hidden) {
  const map = hidden || {};
  const shown = [];
  const escalated = [];
  let hiddenCount = 0;
  (active || []).forEach(s => {
    const at = s && s.id != null ? map[s.id] : undefined;
    if (at == null) { shown.push(s); return; }
    if (sevRank(s.severity) < at) { shown.push(s); escalated.push(s.id); return; }
    hiddenCount++;
  });
  return { shown, hiddenCount, escalated };
}

/** «1 melding skjult» / «2 meldinger skjult» — Norwegian agreement, tested. */
export function hiddenLabel(n) {
  if (!n) return '';
  return n === 1 ? '1 melding skjult' : n + ' meldinger skjult';
}

/**
 * One alert: heading plus body clamped to two lines, and a way to put it away.
 *
 * A full Entur description can run several sentences; unclamped it would eat
 * the top of the underveis screen, where the space is already tight.
 *
 * The text is its own button and ✕ is another, side by side inside a plain
 * div. The alert used to BE the button — nesting ✕ inside it would be invalid
 * HTML and would give the two controls one unpredictable tap target, which on
 * a touch screen fails quietly rather than loudly.
 */
export function alertHtml(s) {
  const title = situationTitle(s);
  const body = situationBody(s);
  if (!title && !body) return '';
  const sid = esc(String((s && s.id) || ''));
  const hide = '<button type="button" class="sa-hide" data-sid="' + sid + '"'
    + ' data-sev="' + esc(String((s && s.severity) || '')) + '"'
    + ' aria-label="Legg bort meldingen">✕</button>';
  if (!body) {
    return '<div class="service-alert' + sevClass(s.severity) + '">'
      + '<span class="sa-title">' + esc(title) + '</span>' + hide + '</div>';
  }
  return '<div class="service-alert' + sevClass(s.severity) + '" data-sid="' + sid + '">'
    + '<button type="button" class="sa-more" aria-expanded="false">'
    + (title ? '<span class="sa-title">' + esc(title) + '</span>' : '')
    + '<span class="sa-body">' + esc(body) + '</span>'
    + '</button>' + hide + '</div>';
}

/**
 * «2 andre meldinger ›» — the ones that are not about your journey.
 *
 * Reported: a bus from Bjørndal shown to a reader riding metro line 3. The
 * fix sorts messages by whether they concern the journey on screen — but our
 * matching rests on where a message hung and on a field we cannot verify from
 * here, so NOTHING IS DELETED. Hiding a real closure because we could not
 * prove it was relevant is the expensive mistake; one tap opens them.
 *
 * Deliberately the same shape as the put-away row above rather than a new
 * one: two rows meaning «there is more here» would be two things a reader has
 * to learn.
 */
export function otherLabel(n) {
  if (!n) return '';
  return n === 1 ? '1 annen melding' : n + ' andre meldinger';
}

export function otherRowHtml(n, open) {
  if (!n) return '';
  return '<button type="button" class="alerts-other" aria-expanded="' + (open ? 'true' : 'false') + '">'
    + esc(otherLabel(n)) + ' <span class="ah-show">' + (open ? 'skjul' : 'vis') + '</span></button>';
}

/** The one line that says something is put away, and takes you back. */
export function hiddenRowHtml(n) {
  if (!n) return '';
  return '<button type="button" class="alerts-hidden">'
    + esc(hiddenLabel(n)) + ' <span class="ah-show">vis</span></button>';
}

/**
 * One delegated listener per container rather than one per alert: the banner
 * is rebuilt on every render tick, so per-element handlers would be attached
 * and thrown away once a second.
 */
let _otherOpen = false;
export function _setOtherOpen(v) { _otherOpen = !!v; }
export function _isOtherOpen() { return _otherOpen; }

export function bindAlertToggles(el, onChange) {
  if (!el) return;
  if (onChange) el._saChange = onChange;
  if (el._saBound) return;
  el._saBound = true;
  el.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;

    // Put it away. Checked before the expander, since ✕ sits inside the same
    // alert and the reader who taps it does not want the text unfolding too.
    const hide = t.closest('.sa-hide');
    if (hide && el.contains(hide)) {
      hideAlert(hide.dataset.sid, hide.dataset.sev);
      if (el._saChange) el._saChange();
      return;
    }

    // Expanded-ness cannot live in the markup: this container is rewritten
    // once a second, so a class on the button would be gone before the finger
    // lifted. Same reasoning as the folded stop list on auto-reise.
    const other = t.closest('.alerts-other');
    if (other && el.contains(other)) {
      _otherOpen = !_otherOpen;
      if (el._saChange) el._saChange();
      return;
    }

    const back = t.closest('.alerts-hidden');
    if (back && el.contains(back)) {
      unhideAll();
      if (el._saChange) el._saChange();
      return;
    }

    const btn = t.closest('.sa-more');
    if (!btn || !el.contains(btn)) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', open ? 'false' : 'true');
    btn.classList.toggle('sa-open', !open);
  });
}

/** Situations currently in their validity window, most disruptive first. */
export function activeSituations(list, now = Date.now()) {
  return (list || [])
    .filter(s => {
      const vp = s.validityPeriod || {};
      const start = vp.startTime ? new Date(vp.startTime).getTime() : 0;
      const end   = vp.endTime   ? new Date(vp.endTime).getTime()   : Infinity;
      return now >= start && now <= end;
    })
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
}

export function sevClass(s) {
  if (s === 'severe' || s === 'verySevere') return ' sev-severe';
  if (s === 'slight' || s === 'verySlight' || s === 'noImpact') return ' sev-slight';
  return '';
}

/**
 * Render a set of situations into a container — the board's banner and the
 * destination banner both come through here, so what counts as hidden cannot
 * differ between them.
 */
export function renderAlertsInto(el, situations, onChange, ctx) {
  if (!el) return;
  const active = activeSituations(situations);
  // WHICH OF THESE ARE ABOUT THE JOURNEY ON SCREEN.
  //
  // Reported: a bus from Bjørndal shown to a reader riding metro line 3. The
  // banner used to be one global list rendered identically on every screen;
  // now each screen hands in what it knows it is showing, and the rest fold
  // into one line rather than disappearing.
  //
  // No ctx — the caller has no context to offer — means everything is «mine»,
  // which is exactly today's behaviour.
  const split = ctx ? splitSituations(active, ctx) : { mine: active, other: [] };
  const { shown, hiddenCount, escalated } = visibleAlerts(split.mine, loadHidden());
  // A message that got worse is shown again and forgets it was ever put away,
  // so the reader can put it away again on its own terms.
  if (escalated.length) {
    const map = loadHidden();
    escalated.forEach(id => delete map[id]);
    saveHidden(map);
  }
  // The other pile goes through the SAME put-away rules: a message set aside
  // as someone else's should still stay away once the reader dismisses it.
  const otherVis = visibleAlerts(split.other, loadHidden());
  const items = shown.map(alertHtml).filter(Boolean);
  const otherItems = _otherOpen ? otherVis.shown.map(alertHtml).filter(Boolean) : [];
  const other = otherRowHtml(otherVis.shown.length, _otherOpen);
  const row = hiddenRowHtml(hiddenCount + otherVis.hiddenCount);
  if (!items.length && !other && !row) { el.innerHTML = ''; el.style.display = 'none'; return; }

  // Expanded state lives on the DOM, and the banner is rebuilt every tick —
  // so remember which ids were open and restore them, or an alert someone is
  // reading would snap shut a second later.
  const open = new Set([...el.querySelectorAll('.sa-open')]
    .map(b => b.parentElement && b.parentElement.dataset.sid));
  el.innerHTML = items.join('') + other + otherItems.join('') + row;
  shown.concat(_otherOpen ? otherVis.shown : []).forEach(s => {
    if (!s.id || !open.has(s.id)) return;
    const box = el.querySelector('.service-alert[data-sid="' + (window.CSS && CSS.escape ? CSS.escape(s.id) : s.id) + '"]');
    const btn = box && box.querySelector('.sa-more');
    if (btn) { btn.classList.add('sa-open'); btn.setAttribute('aria-expanded', 'true'); }
  });
  bindAlertToggles(el, onChange);
  el.style.display = 'block';
}

/**
 * The board's own banner.
 *
 * `#service-alerts` used to sit OUTSIDE every v-* div in index.html, and
 * show() only toggles those — so one global banner stood on every screen
 * whatever it was about. It lives inside the board now, and the other screens
 * have their own slots with their own context.
 *
 * @param {object} [ctx] what the board is showing: {lineIds, journeyIds, stopIds}
 */
export function renderAlerts(ctx) {
  renderAlertsInto(
    document.getElementById('service-alerts'),
    state.serviceAlerts,
    () => renderAlerts(ctx),
    ctx,
  );
}
