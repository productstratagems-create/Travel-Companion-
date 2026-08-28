import { state } from '../state.js';
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

/**
 * One alert, as heading plus body clamped to two lines.
 *
 * A full Entur description can run several sentences; unclamped it would eat
 * the top of the underveis screen, where the space is already tight. The
 * whole alert is the button, so the tap target is the thing you are reading.
 */
export function alertHtml(s) {
  const title = situationTitle(s);
  const body = situationBody(s);
  if (!title && !body) return '';
  if (!body) {
    return '<div class="service-alert' + sevClass(s.severity) + '">' + esc(title) + '</div>';
  }
  return '<button type="button" class="service-alert sa-more' + sevClass(s.severity) + '"'
    + ' aria-expanded="false">'
    + (title ? '<span class="sa-title">' + esc(title) + '</span>' : '')
    + '<span class="sa-body">' + esc(body) + '</span>'
    + '</button>';
}

/**
 * One delegated listener per container rather than one per alert: the banner
 * is rebuilt on every render tick, so per-element handlers would be attached
 * and thrown away once a second.
 */
export function bindAlertToggles(el) {
  if (!el || el._saBound) return;
  el._saBound = true;
  el.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.sa-more');
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

export function renderAlerts() {
  const el = document.getElementById('service-alerts');
  if (!el) return;
  const active = activeSituations(state.serviceAlerts);
  if (!active.length) { el.style.display = 'none'; return; }
  const items = active.map(alertHtml).filter(Boolean);
  if (!items.length) { el.style.display = 'none'; return; }
  // Expanded state lives on the DOM, and the banner is rebuilt every tick —
  // so remember which ids were open and restore them, or an alert someone is
  // reading would snap shut a second later.
  const open = new Set([...el.querySelectorAll('.sa-open')].map(b => b.dataset.sid));
  el.innerHTML = items.join('');
  active.forEach((s, i) => {
    const btn = el.children[i];
    if (!btn || !btn.classList.contains('sa-more')) return;
    btn.dataset.sid = s.id || String(i);
    if (open.has(btn.dataset.sid)) { btn.classList.add('sa-open'); btn.setAttribute('aria-expanded', 'true'); }
  });
  bindAlertToggles(el);
  el.style.display = 'block';
}
