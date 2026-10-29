/**
 * Appen kunne ikke sende rettelser til noen.
 *
 * Rapportert: «vær og steder laster fortsatt ikke» — etter at v1.170.0 var
 * utrullet og grønn. Ordlyden på skjermen avgjorde saken: det sto «laster
 * vær…», og den strengen finnes ikke lenger i koden. v1.170.0 erstattet den
 * med «henter vær …».
 *
 * Telefonen kjørte altså et gammelt bygg, og hadde gjort det i flere
 * utgivelser.
 *
 * HVA SOM MANGLET:
 *
 *   sw.js    skipWaiting() + clients.claim()     ← arbeideren byttet seg selv
 *   pwa.js   register('./sw.js?v=' + versjon)    ← nettleseren merket utgivelsen
 *
 *   updatefound            → fantes ikke
 *   controllerchange       → fantes ikke
 *   registration.update()  → fantes ikke
 *
 * Tjenestearbeideren byttet seg selv ut, og INGENTING fortalte den kjørende
 * siden at det hadde skjedd. En PWA på hjemskjermen som iOS gjenopptar fra
 * minnet kjører da den gamle pakken i det uendelige — og registreringen
 * skjedde bare på `load`, som aldri inntreffer ved en gjenopptakelse.
 *
 * `cacheFirst` for egne filer er trygt fordi de er innholdshashet. Men en
 * side som aldri lastes på nytt spør aldri etter de nye hashene.
 *
 * DEN EGENTLIGE KOSTNADEN var ikke den manglende stien. Det var den
 * manglende tilbakemeldingssløyfa: tre utgivelser ble sendt uten at noen
 * kunne si om de virket.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { trygtÅLasteInn, _nyVersjonKlar, _kobleOppdatering, OPPDATER_SPERRE_MS }
  from '../src/pwa.js';

/** En falsk registrering som lar oss fyre hendelsene selv. */
function fakeReg() {
  const lyttere = {};
  const ny = {
    state: 'installing',
    lyttere: {},
    addEventListener(t, f) { (this.lyttere[t] ||= []).push(f); },
    fyr(t) { (this.lyttere[t] || []).forEach(f => f()); },
  };
  return {
    installing: ny,
    oppdateringer: 0,
    update() { this.oppdateringer++; return Promise.resolve(); },
    addEventListener(t, f) { (lyttere[t] ||= []).push(f); },
    fyr(t) { (lyttere[t] || []).forEach(f => f()); },
    _ny: ny,
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="update-banner" style="display:none"></div>';
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('fiksturen selv', () => {
  // Måleinstrumentet først: uten disse eksportene ville hele fila vært grønn
  // uten å ha prøvd noe.
  it('har noe å koble til', () => {
    expect(typeof trygtÅLasteInn).toBe('function');
    expect(typeof _kobleOppdatering).toBe('function');
  });
});

describe('når er det trygt å laste inn av seg selv', () => {
  /* ÉN NAVNGITT VAKT, IKKE TO BETINGELSER TO STEDER.
   *
   * Reisen overlever et omlasting — den ligger i `t.jny` — men kartet og
   * posisjonssporet bygges opp på nytt. Å gjøre det mens noen står på
   * perrongen og leser skjermen er nettopp det «ro» forbyr. */
  it('bare uten reise i gang, og bare på tavla', () => {
    expect(trygtÅLasteInn({ jny: null, view: 'board' })).toBe(true);
    expect(trygtÅLasteInn({ jny: {}, view: 'board' })).toBe(false);
    expect(trygtÅLasteInn({ jny: null, view: 'track' })).toBe(false);
    expect(trygtÅLasteInn({ jny: {}, view: 'track' })).toBe(false);
  });

  it('og aldri på en skjerm du jobber i', () => {
    ['selected', 'settings', 'auto', 'leisure', 'saved', 'prefs']
      .forEach(v => expect(trygtÅLasteInn({ jny: null, view: v }), v).toBe(false));
  });

  it('tåler tull', () => {
    expect(() => trygtÅLasteInn(null)).not.toThrow();
    expect(trygtÅLasteInn(null)).toBe(false);
  });
});

describe('beskjeden når det ikke er trygt', () => {
  it('sier med ORD hva som er bak, ikke bare et symbol', () => {
    _nyVersjonKlar({ jny: {}, view: 'track' });
    const b = document.getElementById('update-banner');
    expect(b.style.display).not.toBe('none');
    // v1.162.0: et bart ⤢ ble rapportert som at knappen var borte.
    expect(b.textContent).toMatch(/versjon/i);
    expect(b.textContent.replace(/[^a-zæøå]/gi, '').length).toBeGreaterThan(10);
  });

  it('laster inn selv når det er trygt, og sier da ingenting', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    _nyVersjonKlar({ jny: null, view: 'board' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(document.getElementById('update-banner').style.display).toBe('none');
  });
});

describe('å oppdage at en ny finnes', () => {
  /* FØR-BILDET. Det fantes ingen lytter i det hele tatt. */
  it('reagerer når arbeideren melder en ny utgave', () => {
    const reg = fakeReg();
    // En kontroller finnes — altså kjører det alt en versjon her.
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
    _kobleOppdatering(reg, { jny: {}, view: 'track' });

    reg.fyr('updatefound');
    reg._ny.state = 'installed';
    reg._ny.fyr('statechange');

    expect(document.getElementById('update-banner').style.display).not.toBe('none');
  });

  /* SKILLET SOM BETYR NOE: `controller` finnes bare når en versjon ALT
   * kjører her. Uten den sjekken ville en førstegangsbruker fått beskjed om
   * å oppdatere noe hun nettopp hadde åpnet. */
  /* FØRSTE UTGAVE AV DENNE TESTEN VAR FEIL, og mutanten avslørte det.
   *
   * Den sjekket bare at BANNERET ikke kom. Men i den tilstanden er det
   * trygt å laste inn, så en manglende `controller`-sjekk ville gitt en
   * førstegangsbruker en OMLASTING midt i første åpning — verre enn
   * banneret, og helt usynlig for påstanden.
   *
   * Nå bindes det som faktisk gjelder: ved aller første installasjon skal
   * INGENTING skje. */
  it('gjør ingenting ved aller første installasjon', () => {
    const reg = fakeReg();
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('navigator', { serviceWorker: { controller: null } });
    _kobleOppdatering(reg, { jny: null, view: 'board' });

    reg.fyr('updatefound');
    reg._ny.state = 'installed';
    reg._ny.fyr('statechange');

    expect(document.getElementById('update-banner').style.display).toBe('none');
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('å se etter ved gjenopptakelse', () => {
  /* DETTE ER DET ENE SOM FÅR EN HJEMSKJERM-PWA TIL Å MERKE NOE.
   *
   * Registreringen skjedde bare på `load`, og en app som gjenopptas fra
   * minnet får aldri et `load`. Da spør den aldri om det finnes noe nytt. */
  it('spør når appen blir synlig igjen', async () => {
    const reg = fakeReg();
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
    _kobleOppdatering(reg, { jny: null, view: 'board' });

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.oppdateringer).toBe(1);
  });

  /* Og den maser ikke. Et raskt fanebytte fram og tilbake er ett ærend, ikke
   * fem — og `update()` er en nettverksrunde hver gang. */
  it('spør ikke på nytt før sperren har gått ut', async () => {
    const reg = fakeReg();
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
    _kobleOppdatering(reg, { jny: null, view: 'board' });
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });

    for (let i = 0; i < 5; i++) document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.oppdateringer).toBe(1);

    vi.advanceTimersByTime(OPPDATER_SPERRE_MS + 1000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.oppdateringer).toBe(2);
  });

  it('spør ikke mens appen er skjult', async () => {
    const reg = fakeReg();
    vi.stubGlobal('navigator', { serviceWorker: { controller: {} } });
    _kobleOppdatering(reg, { jny: null, view: 'board' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(reg.oppdateringer).toBe(0);
  });
});
