/**
 * Byttet får ett svar.
 *
 * The tracking screen gave two. The onward list went through transferMargin —
 * the platform floor, the reader's «ekstra tid», floored minutes — while the
 * connection banner below it computed `Math.round((depTs - arrTs) / 60000)`
 * and compared that against a bare `3`.
 *
 * So one transfer got two verdicts at once, and the expensive direction was
 * the banner's: it told a reader a change was fine while the row for that very
 * departure was struck through two hundred pixels above.
 */
import { describe, it, expect } from 'vitest';
import { transferState, transferMargin, arrRows, connAlertHtml, PLATFORM_CHANGE_MINS }
  from '../src/views/track.js';
import { loadWalkBuffer } from '../src/geo.js';

const T = (hhmm) => Date.parse('2026-09-17T' + hhmm + ':00Z');
const leg = (arr, dep) => ({
  arrTime: arr ? { time: new Date(arr).toISOString(), clk: 'x' } : null,
  depTime: dep ? { time: new Date(dep).toISOString(), clk: 'x' } : null,
  lineCode: '3', fromStation: 'Jernbanetorget',
});
const pair = (arrTs, depTs) => [leg(arrTs, null), leg(null, depTs)];

describe('transferState — the reported disagreement', () => {
  // THE CASE, IN ONE ASSERTION. Arriving 08:00, onward 08:02, a platform
  // change, and 5 minutes of «ekstra tid»: 2 − 3 − 5 = −6.
  it('agrees with the onward list about the same transfer', () => {
    const arrTs = T('08:00'), depTs = T('08:02'), extra = 5;
    const [cur, next] = pair(arrTs, depTs);
    const banner = transferState(cur, next, extra);
    const row = arrRows([{ depTs, quay: '4' }], arrTs, extra, '1')[0];
    expect(banner.rcls).toBe(row.rcls);
    expect(banner.rcls).toBe('missed');
    expect(banner.kind).toBe('miss');
  });

  // The banner's old number and its new one differ by the platform floor plus
  // the reader's own setting. That difference IS the release.
  it('counts the platform floor and the reader’s extra time', () => {
    const [cur, next] = pair(T('08:00'), T('08:10'));
    expect(transferState(cur, next, 0).margin).toBe(10 - PLATFORM_CHANGE_MINS);
    expect(transferState(cur, next, 4).margin).toBe(10 - PLATFORM_CHANGE_MINS - 4);
  });

  // floor, not round — the list floors, and half a minute either way used to
  // be enough to make the two disagree on its own.
  it('floors the margin, as the list does', () => {
    const [cur, next] = pair(T('08:00'), T('08:05') + 40000);
    expect(transferState(cur, next, 0).margin)
      .toBe(transferMargin(T('08:05') + 40000, T('08:00'), false, 0));
    expect(transferState(cur, next, 0).margin).toBe(2);
  });

  // The verdict and the number printed beside it must come from one place. A
  // banner that says «2 min byttetid» about a change it judged comfortable is
  // the shape of the original fault.
  it('shows the margin it judged, not a different one', () => {
    const [cur, next] = pair(T('08:00'), T('08:06'));
    const tx = transferState(cur, next, 0);
    expect(tx.kind).toBe('tight');
    expect(tx.margin).toBe(3);
  });

  it('stays silent when there is time', () => {
    const [cur, next] = pair(T('08:00'), T('08:20'));
    expect(transferState(cur, next, 0).kind).toBeNull();
  });

  // A change with no slack at all is tight, not missed — you can still run.
  it('calls a zero margin tight rather than missed', () => {
    const [cur, next] = pair(T('08:00'), T('08:03'));
    const tx = transferState(cur, next, 0);
    expect(tx.margin).toBe(0);
    expect(tx.kind).toBe('tight');
  });

  it('gives no verdict when it has no times to judge', () => {
    expect(transferState(null, leg(null, T('08:05')), 0)).toBeNull();
    expect(transferState(leg(T('08:00'), null), null, 0)).toBeNull();
    expect(transferState(leg(null, null), leg(null, null), 0)).toBeNull();
  });

  it('survives an unparseable timestamp rather than judging on NaN', () => {
    const bad = { arrTime: { time: 'i går', clk: 'x' } };
    expect(transferState(bad, leg(null, T('08:05')), 0)).toBeNull();
  });
});

describe('the two surfaces, swept together', () => {
  // ACROSS THE WHOLE RANGE, not at one point. The old banner and the old list
  // happened to agree for some gaps and not others, which is exactly why the
  // bug survived: whoever checked it probably checked a gap where they agreed.
  it('never disagrees with the onward list, at any gap', () => {
    const arrTs = T('08:00');
    for (const extra of [0, 2, 5, 10]) {
      for (let gap = -5; gap <= 40; gap++) {
        const depTs = arrTs + gap * 60000;
        const [cur, next] = pair(arrTs, depTs);
        const banner = transferState(cur, next, extra);
        const row = arrRows([{ depTs, quay: '4' }], arrTs, extra, '1')[0];
        if (!row) continue;   // beyond the list's horizon
        expect(banner.rcls).toBe(row.rcls);
      }
    }
  });
});

// A matcher is not a formatter. normStn IS stopKey — it lowercases, because
// that is what comparing needs — and six places on the tracking screen printed
// its output, so the connection banner read «går fra hellerud».
describe('names that are printed keep their capitals', () => {
  it('does not print a lowercased stop name in the banner', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/views/track.js', 'utf8');
    const banner = src.slice(src.indexOf('conn-alert-miss'), src.indexOf('conn-alert-risk'));
    expect(banner).toContain('displayStn');
    expect(banner).not.toContain('normStn');
  });
});

// ── The seam (the two mutants purity could not kill) ───────────────────────
//
// transferState was pure and fully tested, and two mutants still survived: one
// that stopped passing the reader's «ekstra tid», and one that stopped
// printing the margin. Neither is arithmetic — both are wiring, which is what
// actually goes wrong. track.js has written this lesson down once before,
// about a renderer that fed Date.now() where an arrival time belonged.
describe('connAlertHtml — the wiring', () => {
  const legsFor = (gapMins) => [
    leg(T('08:00'), null),
    { ...leg(null, T('08:00') + gapMins * 60000), lineCode: '5', quay: '4',
      fromStation: 'Hellerud' },
  ];

  // THE MUTANT PURITY COULD NOT KILL: a banner that stops reading the setting.
  // Bound to loadWalkBuffer() rather than to a number, so it holds whatever
  // the reader has chosen and cannot be satisfied by a literal.
  it('defaults to the reader’s own extra time', () => {
    expect(connAlertHtml(legsFor(6), 0))
      .toBe(connAlertHtml(legsFor(6), 0, loadWalkBuffer()));
    // And that default is not a constant: more extra time is a tighter change.
    expect(connAlertHtml(legsFor(6), 0, 0)).toContain('3 min byttetid');
    expect(connAlertHtml(legsFor(6), 0, 10)).toContain('conn-alert-miss');
  });

  it('prints the margin it judged on', () => {
    expect(connAlertHtml(legsFor(7), 0, 0)).toContain('4 min byttetid');
    expect(connAlertHtml(legsFor(6), 0, 0)).toContain('3 min byttetid');
  });

  it('says nothing when there is time, and nothing when there is no next leg', () => {
    expect(connAlertHtml(legsFor(30), 0, 0)).toBe('');
    expect(connAlertHtml(legsFor(6), 5, 0)).toBe('');
    expect(connAlertHtml(null, 0, 0)).toBe('');
  });

  it('prints the stop name with its capitals', () => {
    expect(connAlertHtml(legsFor(6), 0, 10)).toContain('Hellerud');
  });
});
