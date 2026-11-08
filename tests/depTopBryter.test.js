// Rapportert med skjermbilde: «Ank tidsp skriver over spor info.» Bytteraden 73 # → L2 Vy:
// merkene og logoene tok bredden, og tidene ble presset ut av kolonnen og inn over sporet.
// Målt i proben: .dep-top 19 px bredere enn .dep-mid, tidene 7 px inn i spor-boksen.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
const css = readFileSync('src/style/board.css', 'utf8');
describe('raden holder seg i sin kolonne', () => {
  it('toppen bryter heller enn å flyte ut', () => {
    expect(css).toMatch(/\.dep-top\{display:flex;flex-wrap:wrap;/);
  });
});
