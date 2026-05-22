import config from './config.js';
import { state } from './state.js';
import { renderBoard } from './views/board.js';
import { renderSelected } from './views/selected.js';
import { renderWalk } from './views/walk.js';
import { renderTrack } from './views/track.js';

function render() {
  switch (state.view) {
    case 'board':    renderBoard();    break;
    case 'selected': renderSelected(); break;
    case 'walk':     renderWalk();     break;
    case 'track':    renderTrack();    break;
  }
}

export function startRenderLoop() {
  setInterval(render, config.renderTickMs);
}
