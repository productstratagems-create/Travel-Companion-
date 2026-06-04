import { loadPlan, savePlan, clearPlan, removeLegFromPlan, legStatus, planStatus } from '../api/plan.js';
import { show } from '../ui/nav.js';

function pad(n) { return String(n).padStart(2, '0'); }
function clk(v) { const d = new Date(v); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function fmtCountdown(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (m >= 60) return Math.floor(m / 60) + 't ' + pad(m % 60) + 'm';
  if (m >= 1) return m + ' min ' + pad(s) + 's';
  return s + 's';
}

let _planInterval = null;

export function renderPlan() {
  const el = document.getElementById('plan-content');
  if (!el) return;

  const now = Date.now();
  const legs = loadPlan();
  const status = planStatus(legs, now);

  if (!legs.length) {
    el.innerHTML =
      '<div class="plan-empty">'
      + 'Ingen etapper planlagt ennå.<br>'
      + 'Velg en avgang og trykk<br>'
      + '«legg til i reiseplan» for å starte.'
      + '</div>';
    _stopPlanInterval();
    return;
  }

  const firstDep = new Date(legs[0].depIso).getTime();
  const lastArr = legs[legs.length - 1].arrIso
    ? new Date(legs[legs.length - 1].arrIso).getTime()
    : null;

  let metaHtml = '';
  if (status === 'done') {
    metaHtml = '<div class="plan-journey-done">Reisen er fullført ✓</div>';
  } else if (status === 'active') {
    metaHtml = '<div class="plan-journey-meta">Reise startet ' + clk(firstDep)
      + (lastArr ? ' · planlagt ankomst ' + clk(lastArr) : '') + '</div>';
  } else {
    metaHtml = '<div class="plan-journey-meta">Avreise ' + clk(firstDep) + '</div>';
  }

  let timelineHtml = '<div class="plan-timeline">';
  legs.forEach(leg => {
    const st = legStatus(leg, now);
    const depTs = new Date(leg.depIso).getTime();
    const arrTs = leg.arrIso ? new Date(leg.arrIso).getTime() : null;

    let bottomHtml = '';
    if (st === 'done') {
      bottomHtml = '<div class="plan-leg-check">✓ ankomst ' + (arrTs ? clk(arrTs) : '—') + '</div>';
    } else if (st === 'active') {
      if (arrTs) {
        const remaining = arrTs - now;
        bottomHtml = '<div class="plan-leg-countdown">'
          + (remaining > 0 ? fmtCountdown(remaining) + ' igjen' : 'ankommer nå') + '</div>';
      }
    } else {
      const wait = depTs - now;
      bottomHtml = '<div class="plan-leg-countdown">'
        + 'om ' + fmtCountdown(wait) + '</div>';
    }

    timelineHtml +=
      '<div class="plan-leg-card ' + st + '">'
      + '<div class="plan-leg-dot ' + st + '"></div>'
      + '<button class="plan-leg-del" onclick="window._planDelLeg(\'' + leg.id + '\')" aria-label="Fjern etappe">×</button>'
      + '<div class="plan-leg-top">'
      + '<span class="line-badge" style="background:#' + leg.lineColour + '">' + leg.line + '</span>'
      + '<div class="plan-leg-route">'
      + '<div class="plan-leg-from">' + leg.from.toLowerCase() + '</div>'
      + '<div class="plan-leg-to">' + leg.to.toLowerCase() + '</div>'
      + '</div>'
      + '</div>'
      + '<div class="plan-leg-times">'
      + '<span>' + clk(leg.depIso) + '</span>'
      + (arrTs ? '<span class="plan-leg-arr">→ ' + clk(arrTs) + '</span>' : '')
      + '</div>'
      + bottomHtml
      + '</div>';
  });
  timelineHtml += '</div>';

  let actionsHtml = '<div class="plan-actions">';
  if (status !== 'done') {
    actionsHtml +=
      '<button class="plan-add-btn" id="plan-add-leg-btn">+ legg til neste etappe →</button>';
  }
  actionsHtml +=
    '<button class="plan-clear-btn" id="plan-clear-btn">'
    + (status === 'done' ? 'Ny reiseplan' : 'Avslutt reiseplan')
    + '</button>';
  actionsHtml += '</div>';

  el.innerHTML = metaHtml + timelineHtml + actionsHtml;

  const addBtn = document.getElementById('plan-add-leg-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      show('v-board');
      window._startBoard && window._startBoard();
    });
  }

  const clearBtn = document.getElementById('plan-clear-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      clearPlan();
      renderPlan();
    });
  }

  _startPlanInterval();
}

function _startPlanInterval() {
  if (_planInterval) return;
  _planInterval = setInterval(() => {
    if (document.getElementById('v-plan') &&
        document.getElementById('v-plan').style.display !== 'none') {
      renderPlan();
    }
  }, 1000);
}

function _stopPlanInterval() {
  if (_planInterval) { clearInterval(_planInterval); _planInterval = null; }
}

window._planDelLeg = (id) => {
  removeLegFromPlan(id);
  renderPlan();
};

window._renderPlan = renderPlan;
