import { state } from '../state.js';
import { esc } from './fmt.js';

// Entur situation severities, most disruptive first. Unknown values sort last.
const SEVERITY_RANK = { verySevere: 0, severe: 1, normal: 2, slight: 3, verySlight: 4, noImpact: 5 };
function sevClass(s) {
  if (s === 'severe' || s === 'verySevere') return ' sev-severe';
  if (s === 'slight' || s === 'verySlight' || s === 'noImpact') return ' sev-slight';
  return '';
}

export function renderAlerts() {
  const el = document.getElementById('service-alerts');
  if (!el) return;
  const now = Date.now();
  const active = (state.serviceAlerts || []).filter(s => {
    const vp = s.validityPeriod || {};
    const start = vp.startTime ? new Date(vp.startTime).getTime() : 0;
    const end   = vp.endTime   ? new Date(vp.endTime).getTime()   : Infinity;
    return now >= start && now <= end;
  });
  if (!active.length) { el.style.display = 'none'; return; }
  active.sort((a, b) =>
    (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9));
  const items = active.map(s => {
    const summary = s.summary || [];
    const txt = (summary.find(t => t.language === 'no' || t.language === 'nb') || summary[0] || {}).value || '';
    return txt ? '<div class="service-alert' + sevClass(s.severity) + '">' + esc(txt) + '</div>' : '';
  }).filter(Boolean);
  if (!items.length) { el.style.display = 'none'; return; }
  el.innerHTML = items.join('');
  el.style.display = 'block';
}
