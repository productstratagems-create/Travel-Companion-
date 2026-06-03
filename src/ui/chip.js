import { state } from '../state.js';

export function updateOnboardChip() {
  const chip = document.getElementById('onboard-chip');
  if (!chip) return;
  if (state.jny) {
    chip.style.display = 'flex';
    document.body.classList.add('jny-chip-visible');
    chip.innerHTML =
      '<span class="line-badge" style="background:' + state.jny.lineBg + '">' + state.jny.lineCode + '</span>'
      + '<span style="flex:1;font-size:11px;color:#a8a29e">underveis · mot ' + (state.jny.frontText || state.jny.dest).toLowerCase() + '</span>'
      + (state.jny.arrival
        ? '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:1.1rem;color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,.5)">ank ' + state.jny.arrival.clk + ' →</span>'
        : '<span style="font-size:11px;color:#7485a0">→ underveis</span>')
      + '<button id="chip-end-btn" style="background:none;border:none;color:#4a5568;font-size:16px;padding:.25rem .5rem .25rem .65rem;cursor:pointer;line-height:1;flex-shrink:0" aria-label="Avslutt reise">×</button>';
    const endBtn = chip.querySelector('#chip-end-btn');
    if (endBtn) {
      endBtn.addEventListener('click', e => {
        e.stopPropagation();
        window._clearJny && window._clearJny();
      });
    }
  } else {
    chip.style.display = 'none';
    document.body.classList.remove('jny-chip-visible');
  }
}
