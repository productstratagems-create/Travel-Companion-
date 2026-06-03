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
        : '<span style="font-size:11px;color:#7485a0">→ underveis</span>');
  } else {
    chip.style.display = 'none';
    document.body.classList.remove('jny-chip-visible');
  }
}
