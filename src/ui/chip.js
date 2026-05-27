import { state } from '../state.js';

export function updateOnboardChip() {
  const chip = document.getElementById('onboard-chip');
  if (!chip) return;
  if (state.jny) {
    chip.style.display = 'flex';
    chip.innerHTML =
      '<span class="line-badge" style="background:' + state.jny.lineBg + ';margin-right:.5rem">' + state.jny.lineCode + '</span>'
      + '<span style="flex:1;font-size:11px;color:#a8a29e">underveis · mot ' + (state.jny.frontText || state.jny.dest).toLowerCase() + '</span>'
      + (state.jny.arrival
        ? '<span style="font-family:\'Bebas Neue\',sans-serif;font-size:1.1rem;color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,.5)">ank ' + state.jny.arrival.clk + ' →</span>'
        : '');
  } else {
    chip.style.display = 'none';
  }
}
