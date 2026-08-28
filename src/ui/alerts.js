import { state } from '../state.js';
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
export function renderAlertsInto(el, situations, onChange) {
  if (!el) return;
  const active = activeSituations(situations);
  const { shown, hiddenCount, escalated } = visibleAlerts(active, loadHidden());
  // A message that got worse is shown again and forgets it was ever put away,
  // so the reader can put it away again on its own terms.
  if (escalated.length) {
    const map = loadHidden();
    escalated.forEach(id => delete map[id]);
    saveHidden(map);
  }
  const items = shown.map(alertHtml).filter(Boolean);
  const row = hiddenRowHtml(hiddenCount);
  if (!items.length && !row) { el.innerHTML = ''; el.style.display = 'none'; return; }

  // Expanded state lives on the DOM, and the banner is rebuilt every tick —
  // so remember which ids were open and restore them, or an alert someone is
  // reading would snap shut a second later.
  const open = new Set([...el.querySelectorAll('.sa-open')]
    .map(b => b.parentElement && b.parentElement.dataset.sid));
  el.innerHTML = items.join('') + row;
  shown.forEach(s => {
    if (!s.id || !open.has(s.id)) return;
    const box = el.querySelector('.service-alert[data-sid="' + (window.CSS && CSS.escape ? CSS.escape(s.id) : s.id) + '"]');
    const btn = box && box.querySelector('.sa-more');
    if (btn) { btn.classList.add('sa-open'); btn.setAttribute('aria-expanded', 'true'); }
  });
  bindAlertToggles(el, onChange);
  el.style.display = 'block';
}

export function renderAlerts() {
  renderAlertsInto(
    document.getElementById('service-alerts'),
    state.serviceAlerts,
    renderAlerts,
  );
}
