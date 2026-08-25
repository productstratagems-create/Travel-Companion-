import { state } from '../state.js';
import { esc } from './fmt.js';

// Entur situation severities, most disruptive first. Unknown values sort last.
export const SEVERITY_RANK = { verySevere: 0, severe: 1, normal: 2, slight: 3, verySlight: 4, noImpact: 5 };

/** Norwegian summary text for a situation, falling back to any language. */
export function situationText(s) {
  const sum = (s && s.summary) || [];
  return (sum.find(t => t.language === 'no' || t.language === 'nb') || sum[0] || {}).value || '';
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
  const items = active.map(s => {
    const txt = situationText(s);
    return txt ? '<div class="service-alert' + sevClass(s.severity) + '">' + esc(txt) + '</div>' : '';
  }).filter(Boolean);
  if (!items.length) { el.style.display = 'none'; return; }
  el.innerHTML = items.join('');
  el.style.display = 'block';
}
