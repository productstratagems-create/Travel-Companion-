/**
 * Været og stedene ble aldri SPURT om.
 *
 * Rapportert fra en ekte tur, med skjermbilde: «laster vær…» og «laster
 * steder…» sto for alltid på ankomstpanelet. 5G på, avgangstavla virket,
 * gangruta til et sted jeg skrev inn løste seg fint.
 *
 * FØRSTE HYPOTESE VAR FEIL, og den står her fordi den var god nok til å
 * virke sann: ingen av de to forespørslene har tidsavbrudd, og et løfte som
 * aldri faller til ro fyrer verken `.then` eller `.catch`. Det forklarte alt
 * — og det var ikke det som skjedde.
 *
 * DET SOM SKJEDDE:
 *
 *     _resolveArrivalLL().then(ll => {      // ingen .catch på kjeden
 *       _maybeInitArrMap();
 *       _addBikeMarkers(ll);                // ← kaster
 *       fetchWeather(…)                     // ← nås aldri
 *       fetchNearbyPlaces(…)                // ← nås aldri
 *     });
 *
 * `_addBikeMarkers` gjorde `L.layerGroup().addTo(_arrMap)` uten vakt, mens
 * søskenfunksjonen `_addPlacesMarkers` har hatt `if (!_arrMap) return;` hele
 * tiden. Og ankomstkartet bygges først når du er NÆR framme — `phase !==
 * 'riding'` eller fem minutter igjen. Går du på toget tidligere enn det,
 * altså det vanlige tilfellet, er kartet null og `addTo(null)` kaster.
 *
 * To søsken, ett med vakt og ett uten. Kodebasens signaturfeil, plantet i
 * v1.156.0 — utgivelsen som gjorde kartet lat, og flyttet byggingen bak en
 * terskel uten å flytte leseren bak den samme.
 *
 * Nettverket rakk aldri å bli spurt. Derfor trenger denne testen heller
 * ikke noe nett.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchWeather = vi.fn(async () => ({ temp: 7, icon: '☁️' }));
const fetchNearbyPlaces = vi.fn(async () => []);
const fetchBysykkel = vi.fn(async () => []);
const fetchScooters = vi.fn(async () => []);

vi.mock('../src/api/weather.js', async (orig) => ({
  ...(await orig()), fetchWeather: (...a) => fetchWeather(...a),
}));
vi.mock('../src/api/places.js', async (orig) => ({
  ...(await orig()), fetchNearbyPlaces: (...a) => fetchNearbyPlaces(...a),
}));
vi.mock('../src/api/bysykkel.js', () => ({ fetchBysykkel: (...a) => fetchBysykkel(...a) }));
vi.mock('../src/api/scooters.js', () => ({ fetchScooters: (...a) => fetchScooters(...a) }));

/* LEAFLET ER IKKE MOCKET, OG DET ER HELE POENGET.
 *
 * `L.layerGroup().addTo(null)` skal kaste akkurat som i nettleseren. En mock
 * som svelget det ville gjort denne fila grønn mot nettopp den koden den
 * finnes for å fange — og det er måleinstrumentet som tar feil, som denne
 * kodebasen har sett oftere enn koden. */

const { _arrivalSections } = await import('../src/views/track.js');

const LL = { lat: 59.911, lon: 10.75 };

beforeEach(() => {
  [fetchWeather, fetchNearbyPlaces, fetchBysykkel, fetchScooters].forEach(f => f.mockClear());
  document.body.innerHTML = '';
});

describe('fiksturen selv', () => {
  // Måleinstrumentet først: finnes ikke seksjonsstarteren, ville hele fila
  // vært grønn uten å ha prøvd noe.
  it('har noe å kalle', () => {
    expect(typeof _arrivalSections).toBe('function');
  });
});

describe('uten ankomstkart — det vanlige tilfellet', () => {
  /* FØR-BILDET.
   *
   * Dette er reisen din: du går på toget med mer enn fem minutter igjen, så
   * ankomstkartet er ikke bygget. Mot dagens kode kaster `_addBikeMarkers`,
   * og ingen av de to hentingene skjer. */
  it('spør likevel om været', async () => {
    await _arrivalSections(LL, { kart: null });
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(fetchWeather).toHaveBeenCalledWith(LL.lat, LL.lon);
  });

  it('spør likevel om stedene', async () => {
    await _arrivalSections(LL, { kart: null });
    expect(fetchNearbyPlaces).toHaveBeenCalledTimes(1);
    expect(fetchNearbyPlaces.mock.calls[0][0]).toBe(LL.lat);
    expect(fetchNearbyPlaces.mock.calls[0][1]).toBe(LL.lon);
  });

  /* Og syklene hentes FORTSATT — det er bare laget på kartet som må vente.
   * Mobilitetslista under panelet leses uten kart, så å hoppe over hele
   * funksjonen ville vært å kaste en evne for å rette en feil. */
  it('henter fortsatt sykler og sparkesykler, bare uten å tegne dem', async () => {
    await _arrivalSections(LL, { kart: null });
    expect(fetchBysykkel).toHaveBeenCalledTimes(1);
    expect(fetchScooters).toHaveBeenCalledTimes(1);
  });

  it('kaster ikke', async () => {
    await expect(_arrivalSections(LL, { kart: null })).resolves.not.toThrow();
  });
});

describe('med ankomstkart — når du er nær framme', () => {
  /** Nok av Leaflet til at `addTo` lykkes, og ikke mer. */
  const kart = () => ({ addLayer: vi.fn(), removeLayer: vi.fn(), hasLayer: () => false });

  it('spør om alt, som før', async () => {
    await _arrivalSections(LL, { kart: kart() });
    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(fetchNearbyPlaces).toHaveBeenCalledTimes(1);
    expect(fetchBysykkel).toHaveBeenCalledTimes(1);
  });
});

describe('uten koordinater', () => {
  /* Den ene grenen som ALT var ærlig: uten et sted å spørre om, sier været
   * «vær utilgjengelig». Men stedene ble bare hoppet over, og sto igjen på
   * «laster …» — samme stillhet, bare et annet sted i koden. */
  it('spør ikke om noe, og sier fra om begge', async () => {
    const dom = await _arrivalSections(null, { kart: null });
    expect(fetchWeather).not.toHaveBeenCalled();
    expect(fetchNearbyPlaces).not.toHaveBeenCalled();
    expect(dom && dom.vær).toBe('feilet');
    expect(dom && dom.steder).toBe('feilet');
  });
});

/* ── OG DEN ANDRE HALVDELEN: EN AVVIST FORESPØRSEL ───────────────────────
 *
 * `places.js` tar seg bryet med å skille en feil fra et tomt svar — den
 * kaster «all place sources failed» når begge kildene er borte. Kallestedet
 * hadde `.catch(() => {})`, helt tomt, og kastet skillet.
 *
 * Selv når nettverket SVARTE med en feil, sto det altså «laster steder…»
 * for alltid. Det er en annen feil enn den over, og den ville overlevd
 * rettelsen av vakten.
 */
describe('når tjenesten svarer med en feil', () => {
  it('sier fra om stedene framfor å laste i evig tid', async () => {
    fetchNearbyPlaces.mockRejectedValueOnce(new Error('all place sources failed'));
    const dom = await _arrivalSections(LL, { kart: null });
    expect(dom.steder).toBe('feilet');
  });

  it('sier fra om været', async () => {
    fetchWeather.mockRejectedValueOnce(new Error('503'));
    const dom = await _arrivalSections(LL, { kart: null });
    expect(dom['vær']).toBe('feilet');
  });

  // Og den ene feiler ikke den andre: været skal komme selv om stedene ryker.
  it('lar den ene stå selv om den andre ryker', async () => {
    fetchNearbyPlaces.mockRejectedValueOnce(new Error('nede'));
    const dom = await _arrivalSections(LL, { kart: null });
    expect(dom.steder).toBe('feilet');
    expect(dom['vær']).toBe('ok');
  });
});
