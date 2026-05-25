import { state } from '../state.js';

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
  const items = active.map(s => {
    const summary = s.summary || [];
    const txt = (summary.find(t => t.language === 'no' || t.language === 'nb') || summary[0] || {}).value || '';
    return txt ? '<div class="service-alert">' + txt + '</div>' : '';
  }).filter(Boolean);
  if (!items.length) { el.style.display = 'none'; return; }
  el.innerHTML = items.join('');
  el.style.display = 'block';
}
