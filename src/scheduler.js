import config from './config.js';
import { state } from './state.js';
import { logMsg } from './ui/log.js';
import { renderBoard } from './views/board.js';
import { renderSelected } from './views/selected.js';
import { renderAuto } from './views/auto.js';
import { renderTrack } from './views/track.js';

/**
 * One tick's render, and it must not be able to stop the next one.
 *
 * This ran unguarded, so a single throw inside renderBoard froze the screen
 * on whatever it last drew — at 1 Hz, for ever, with no error anywhere the
 * reader could see. That is exactly how the departure list disappeared and
 * stayed gone: the throw landed before the list was written, and every tick
 * after it landed in the same place.
 *
 * Logged rather than swallowed. A render that keeps failing is a bug, and
 * the debug panel is where it should show up — but a broken tick must not
 * take the clock down with it.
 */
function render() {
  try {
    switch (state.view) {
      case 'board':    renderBoard();    break;
      case 'selected': renderSelected(); break;
      // Auto-reise counts down too. Without this its times were frozen from
      // the moment the screen opened: measured, five minutes on screen and
      // the rows still said "3 · 16 · 31" for a departure that had gone.
      case 'auto':     renderAuto();     break;
      case 'track':    renderTrack();    break;
    }
  } catch (err) {
    logMsg('render (' + state.view + '): ' + (err && err.message ? err.message : err), 'err');
  }
}

export function startRenderLoop() {
  setInterval(render, config.renderTickMs);
}
