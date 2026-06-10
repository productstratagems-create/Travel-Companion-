import { state } from '../state.js';
import { confirmTap } from './confirm.js';

export function updateOnboardChip() {
  const chip = document.getElementById('onboard-chip');
  if (!chip) return;
  if (state.jny) {
    chip.style.display = 'flex';
    document.body.classList.add('jny-chip-visible');
    chip.innerHTML =
      '<button class="chip-main" aria-label="Vis reise underveis">'
      + '<span class="line-badge" style="background:' + state.jny.lineBg + '">' + state.jny.lineCode + '</span>'
      + '<span class="chip-status">underveis · mot ' + (state.jny.frontText || state.jny.dest).toLowerCase() + '</span>'
      + (state.jny.arrival
        ? '<span class="chip-arrival">ank ' + state.jny.arrival.clk + ' →</span>'
        : '<span class="chip-arrival chip-arrival-plain">→ underveis</span>')
      + '</button>'
      + '<button id="chip-end-btn" aria-label="Avslutt reise">×</button>';
    chip.querySelector('.chip-main').addEventListener('click', () => {
      window.jnyGoTracking && window.jnyGoTracking();
    });
    const endBtn = chip.querySelector('#chip-end-btn');
    endBtn.addEventListener('click', e => {
      e.stopPropagation();
      confirmTap(endBtn, '✓', () => {
        window._clearJny && window._clearJny();
      });
    });
  } else {
    chip.style.display = 'none';
    document.body.classList.remove('jny-chip-visible');
  }
}
