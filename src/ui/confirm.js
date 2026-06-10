// Shared "tap again to confirm" helper for destructive actions.
// First tap arms the button (relabels it + visual warning state) for a
// short window; a second tap within that window runs the action. No tap
// reverts the button to normal. Returns true if the action was confirmed
// and run on this call.

const ARM_MS = 2500;

export function confirmTap(btn, armedLabel, onConfirm) {
  if (btn.dataset.armed === '1') {
    clearTimeout(btn._confirmTimer);
    delete btn.dataset.armed;
    btn.classList.remove('confirm-armed');
    btn.textContent = btn.dataset.origLabel;
    onConfirm();
    return true;
  }

  btn.dataset.armed = '1';
  btn.dataset.origLabel = btn.textContent;
  btn.textContent = armedLabel;
  btn.classList.add('confirm-armed');
  btn._confirmTimer = setTimeout(() => {
    delete btn.dataset.armed;
    btn.classList.remove('confirm-armed');
    btn.textContent = btn.dataset.origLabel;
  }, ARM_MS);
  return false;
}
