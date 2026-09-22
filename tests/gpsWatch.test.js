import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const state = { walkOvr: null, statLL: {}, homeLL: null, dIdx: 0,
                nearestStation: null, nearestStations: [], gpsError: null, posAt: null,
                posAsked: false, posAcc: null, posRejAt: null };
vi.mock('../src/state.js', () => ({ state, intervals: {} }));
vi.mock('../src/config.js', () => ({
  default: { defaultWalkMinutes: 8, dirs: [{ key: 'out' }], api: { geocoderReverse: 'https://x/reverse' } },
}));
vi.mock('../src/ui/log.js', () => ({ logMsg: vi.fn() }));

const setItem = vi.fn();
vi.mock('../src/storage.js', () => ({
  storage: { get: () => null, set: (...a) => setItem(...a), remove: vi.fn() },
}));

// Every reverse-geocode returns one station, so calls can simply be counted.
const geocode = vi.fn(() => Promise.resolve({
  json: () => Promise.resolve({ features: [{
    properties: { name: 'Mortensrud', id: 'NSR:StopPlace:1', category: ['metroStation'] },
    geometry: { coordinates: [10.82, 59.86] },
  }] }),
}));
vi.mock('../src/api/http.js', () => ({ enturFetch: (...a) => geocode(...a) }));

// One metre of latitude, near enough at Oslo's latitude for a walk fixture.
const M = 1 / 111_320;
const fix = (lat, lon, accuracy, ts) => ({
  coords: { latitude: lat, longitude: lon, accuracy: accuracy == null ? 8 : accuracy },
  timestamp: ts == null ? Date.now() : ts,
});

let cb, cleared, locateUser;
beforeEach(async () => {
  geocode.mockClear(); setItem.mockClear();
  state.homeLL = null; state.nearestStation = null; state.posAt = null;
  state.posAsked = false; state.posAcc = null; state.posRejAt = null; state.gpsError = null;
  cleared = [];
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (ok) => { cb = ok; return 7; },
      clearWatch: (id) => cleared.push(id),
    },
  });
  // geo.js holds the watch id at module scope for the session's lifetime, so
  // each test needs its own module instance rather than the previous test's
  // still-running watch.
  vi.resetModules();
  ({ locateUser } = await import('../src/geo.js'));
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => new Promise(r => setTimeout(r, 0));

/**
 * Drift used to be measured from the *previous fix* rather than from where the
 * stations were last resolved. Fixes arrive about once a second, each a metre
 * or two from the last, so the 200 m threshold never tripped while walking:
 * walk 800 m to a different station and the app still believed you were at the
 * old one — and isWalkActive(), and the whole walk-time feature, hang off that.
 */
describe('the nearest station, while actually walking', () => {
  it('re-resolves once the walk has covered the threshold', async () => {
    locateUser(() => {}, () => {});
    // First fix: resolves stations once.
    cb(fix(59.8600, 10.8200));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);

    // 400 metres, two at a time — the cadence of a real walk.
    for (let i = 1; i <= 200; i++) { cb(fix(59.8600 + i * 2 * M, 10.8200)); }
    await settle();

    // Once more for crossing 200 m, not zero times and not once per fix.
    expect(geocode.mock.calls.length).toBeGreaterThan(1);
    expect(geocode.mock.calls.length).toBeLessThan(5);
  });

  it('does not re-resolve while you stay put', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200));
    await settle();
    for (let i = 0; i < 100; i++) cb(fix(59.8600 + (i % 3) * M, 10.8200));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
  });
});

describe('the watch is released when the page is hidden', () => {
  it('clears on hidden and re-arms on visible, keeping the position', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200));
    await settle();
    const before = { ...state.homeLL };

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // toContain, not toEqual: resetModules gives each test a fresh module but
    // jsdom's document is shared, so earlier instances' listeners still fire.
    // In the app the module loads once and binds once.
    expect(cleared).toContain(7);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // The point of pausing is battery, not amnesia.
    expect(state.homeLL).toEqual(before);
    cb(fix(59.8601, 10.8200));
    expect(state.homeLL).not.toBeNull();
  });
});

describe('the position carries its own age', () => {
  it('records when the fix was taken, so staleness can be told', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 8, 1_700_000_000_000));
    await settle();
    expect(state.posAt).toBe(1_700_000_000_000);
  });

  it('does not advance the timestamp for a fix too noisy to use', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 8, 1_000));
    await settle();
    cb(fix(59.8700, 10.8300, 250, 9_000));   // beyond ACC_GATE
    expect(state.posAt).toBe(1_000);
  });
});

describe('persisting the position', () => {
  // A synchronous localStorage write on every fix is ~60 main-thread writes a
  // minute while walking.
  it('writes at most once per throttle window, not once per fix', async () => {
    locateUser(() => {}, () => {});
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < 60; i++) cb(fix(59.8600 + i * 2 * M, 10.8200, 8, t0 + i * 1000));
    await settle();
    const writes = setItem.mock.calls.filter(c => String(c[0]).includes('homeLL')).length;
    expect(writes).toBeGreaterThan(0);
    expect(writes).toBeLessThanOrEqual(8);
  });
});


// ── The fix that was thrown away without a word (v1.108.0) ─────────────────
//
// ACC_GATE discards anything noisier than ±40 m once a fix exists — routine
// indoors, in a tunnel, in an urban canyon — and geo.js described that discard
// as «silent» in its own comment. The dot stopped moving, the walk time kept
// being computed from where you used to be, and nothing on any screen could
// say why. This is that discard, made visible.
describe('a fix that ACC_GATE refuses', () => {
  it('leaves a trace instead of vanishing', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 8, 1000));
    await settle();
    expect(state.posAt).toBe(1000);

    // A metre away, but far too noisy to use.
    cb(fix(59.8600 + M, 10.8200, 150, 2000));
    await settle();

    // The position we show is unchanged — that is the gate doing its job.
    expect(state.posAt).toBe(1000);
    // But it is no longer silent: both WHEN it happened and HOW noisy.
    expect(state.posRejAt).toBe(2000);
    expect(state.posAcc).toBe(150);
  });

  it('records the accuracy of a fix it accepts too', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 9, 1000));
    await settle();
    expect(state.posAcc).toBe(9);
    expect(state.posRejAt).toBeNull();
  });

  // The very first fix is never gated, however noisy — a rough position beats
  // none, and there is nothing yet for it to make worse.
  it('accepts the first fix at any accuracy', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8600, 10.8200, 900, 1000));
    await settle();
    expect(state.posAt).toBe(1000);
    expect(state.posRejAt).toBeNull();
  });

  it('marks that the position has been asked for at all', async () => {
    expect(state.posAsked).toBe(false);
    locateUser(() => {}, () => {});
    expect(state.posAsked).toBe(true);
  });
});

/**
 * Holdeplassen velges fra posisjonen appen faktisk godtok.
 *
 * Rapportert med skjermbilde fra en telefon i Oslo:
 *
 *   DU ER VED Jernbanetorget · 10221 m å gå · 125 min gange
 *   posisjonen er unøyaktig (±148 m)
 *
 * Ti kilometer er to timers gange. De to tallene kunne ikke begge være sanne,
 * og de kom fra hvert sitt punkt: `_handleFix` porter `homeLL` på nøyaktighet,
 * men regnet drifta og kalte `findNearestStation` fra RÅ latitude/longitude,
 * utenfor porten. Navnet kom altså fra målingen appen nettopp hadde bestemt
 * seg for å ikke stole på, mens avstanden kom fra den beholdte.
 *
 * To definisjoner av «hvor du er», som drev fra hverandre — og den ene var
 * den appen selv hadde forkastet.
 */
describe('en måling som er for unøyaktig til å flytte prikken', () => {
  // Hauketo, og ti kilometer nord er omtrent Jernbanetorget.
  const HAUKETO = [59.8300, 10.8050];
  const TI_KM_NORD = [59.8300 + 10000 * M, 10.8050];

  it('velger ikke holdeplass heller', async () => {
    locateUser(() => {}, () => {});
    cb(fix(...HAUKETO, 8, 1_000));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);

    // ±148 m: godt forbi ACC_GATE, altså forkastet for prikkens del.
    cb(fix(...TI_KM_NORD, 148, 9_000));
    await settle();

    // Prikken står — det virket fra før.
    expect(state.posAt).toBe(1_000);
    // Og navnet står. DETTE er det som ikke virket.
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  // Og den må ikke etterlate seg et anker der den var: gjorde den det, ville
  // NESTE gode måling se ti kilometers drift og slå opp på nytt — feilen
  // flyttet ett steg fram i tid framfor å være borte.
  it('etterlater seg ikke et anker der den aldri var', async () => {
    locateUser(() => {}, () => {});
    cb(fix(...HAUKETO, 8, 1_000));
    await settle();
    cb(fix(...TI_KM_NORD, 148, 9_000));
    await settle();
    // En god måling to meter fra der du sto hele tiden.
    cb(fix(59.8300 + 2 * M, 10.8050, 8, 12_000));
    await settle();
    expect(geocode).toHaveBeenCalledTimes(1);
  });

  // Motprøven, så testen over ikke bare beviser at ingenting skjer: en god
  // måling som faktisk flytter deg, slår fortsatt opp.
  it('mens en god måling over terskelen fortsatt slår opp', async () => {
    locateUser(() => {}, () => {});
    cb(fix(...HAUKETO, 8, 1_000));
    await settle();
    // 400 m nord, i gangfart og innenfor porten.
    for (let i = 1; i <= 200; i++) cb(fix(59.8300 + i * 2 * M, 10.8050, 8, 1_000 + i * 1000));
    await settle();
    expect(geocode.mock.calls.length).toBeGreaterThan(1);
  });
});

/**
 * OG DET ER IKKE NOK Å SPØRRE OM DET SKJEDDE — det må spørres HVILKET PUNKT
 * oppslaget ble gjort fra.
 *
 * Tre av fire mutanter overlevde testene over: driftsporten står foran
 * oppslaget, så når drifta regnes riktig, slipper den forkastede målingen
 * aldri fram — og da kan oppslagets egne koordinater være hva som helst uten
 * at noe faller. Forskjellen er ekte på en vanlig tur: `homeLL` er
 * EMA-utjevnet, den rå målingen er ikke, og de to kan ligge titalls meter fra
 * hverandre. Her leses punktet ut av URL-en oppslaget faktisk ba om.
 */
describe('punktet oppslaget gjøres fra', () => {
  const at = () => {
    const url = geocode.mock.calls[geocode.mock.calls.length - 1][0];
    return {
      lat: Number(new URL(url).searchParams.get('point.lat')),
      lon: Number(new URL(url).searchParams.get('point.lon')),
    };
  };

  it('er den utjevnede posisjonen, ikke den rå målingen', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8300, 10.8050, 8, 1_000));
    await settle();
    // Sammenlikningen må tas I DET oppslaget skjer. Første forsøk målte mot
    // `state.homeLL` etter hele turen — som hadde gått videre — og fanget
    // ingenting: instrumentet, ikke koden.
    let raa = null; let ema = null; let n = geocode.mock.calls.length;
    for (let i = 1; i <= 200; i++) {
      const lat = 59.8300 + i * 2 * M;
      cb(fix(lat, 10.8050, 8, 1_000 + i * 1000));
      if (geocode.mock.calls.length > n) {
        n = geocode.mock.calls.length;
        raa = lat; ema = state.homeLL.lat;
        break;
      }
    }
    await settle();
    expect(ema).not.toBeNull();
    // EMA ligger etter den rå målingen — ellers skiller ikke testen dem.
    // Hvor langt etter er regnbart: med EMA_α = 0,3 og to meter per måling
    // er etterslepet 2·(1−0,3)/0,3 ≈ 4,7 m, og målt til nettopp det. Jeg
    // hadde skrevet «titalls meter» i planen; på en jevn gange er det fem.
    // Større blir det først ved et hopp eller en fartsendring.
    expect(Math.abs(raa - ema)).toBeGreaterThan(3 * M);
    expect(at().lat).toBeCloseTo(ema, 9);
    expect(at().lat).not.toBeCloseTo(raa, 9);
  });

  // Ankeret settes fra det samme punktet, av samme grunn — men det er IKKE
  // selvstendig observerbart: forskjellen er de fem meterne over, og terskelen
  // er to hundre. En mutant som setter ankeret fra den rå målingen overlever
  // alle testene her, og det er verdt å si framfor å bygge en konstruert sak
  // rundt den. Den står som den står fordi ett punkt skal ha ett navn.
  //
  // Det testen under faktisk binder, er at det å stå stille etter en gange
  // ikke slår opp på nytt.
  it('så det å stå stille etter en gange ikke slår opp på nytt', async () => {
    locateUser(() => {}, () => {});
    cb(fix(59.8300, 10.8050, 8, 1_000));
    await settle();
    for (let i = 1; i <= 200; i++) cb(fix(59.8300 + i * 2 * M, 10.8050, 8, 1_000 + i * 1000));
    await settle();
    const etter = geocode.mock.calls.length;
    // Står du stille der EMA-en endte, skal ingenting mer slås opp. Var
    // ankeret satt fra den rå målingen, ligger det foran deg, og «å stå
    // stille» ville lest som drift.
    for (let i = 0; i < 60; i++) {
      cb(fix(state.homeLL.lat, state.homeLL.lon, 8, 400_000 + i * 1000));
    }
    await settle();
    expect(geocode.mock.calls.length).toBe(etter);
  });
});
