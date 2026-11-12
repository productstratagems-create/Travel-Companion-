// Rapportert (skjermbilde, Mortensrud 21:56): «ofte brukt» viste Ensjø → Jernbanetorget og
// Helsfyr → Jernbanetorget — den globale lista, fra steder brukeren ikke sto ved (v1.218.51).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { relevanteSnarveier } from '../src/ui/favs.js';

const t = (from, to, stopId) => ({ key: from + '|' + to, from, to, dir: { stopId: stopId || null } });
const HER = [{ id: 'NSR:StopPlace:5687', name: 'Mortensrud' }, { id: 'NSR:StopPlace:5690', name: 'Lofsrud' }];

describe('«ofte brukt» i auto-reise', () => {
  it('før-bildet: reiser fra andre steder vises ikke', () => {
    expect(relevanteSnarveier([t('Ensjø', 'Jernbanetorget'), t('Helsfyr', 'Jernbanetorget')], HER, [])).toEqual([]);
  });
  it('herfra, og fra et stopp innen gangavstand (på navn eller id)', () => {
    const r = relevanteSnarveier([t('Mortensrud', 'Ryen'), t('Lofsrud', 'Bøler'), t('X', 'Y', 'NSR:StopPlace:5690')], HER, []);
    expect(r.map(x => x.to)).toEqual(['Ryen', 'Bøler', 'Y']);
  });
  it('ikke et mål kortene «dit du ofte skal» alt viser', () => {
    expect(relevanteSnarveier([t('Mortensrud', 'Jernbanetorget')], HER, ['Jernbanetorget'])).toEqual([]);
  });
  it('«velg rute» bruker komponenten uten filter (den globale lista)', () => {
    const s = readFileSync('src/views/auto.js', 'utf8');
    expect(s).toMatch(/renderRouteShortcuts\('auto-fav-routes', 2, liste => relevanteSnarveier\(/);
    const ander = readFileSync('src/views/settings.js', 'utf8') + readFileSync('src/main.js', 'utf8') + readFileSync('src/ui/nav.js', 'utf8');
    expect(ander).not.toMatch(/relevanteSnarveier/);
  });
});
