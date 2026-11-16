/**
 * ANKOMSTEN PÅ REISEN, som ett tall (v1.218.69). Rapportert: stripa sa
 * «ANK 09:19», kortet og hodet sa ingen tid. Stripa formaterte `arrival.clk`;
 * kortet krevde `Number.isFinite(arrival.time)` — og Entur sender tiden som
 * ISO-tekst. To lesere av samme faktum, uenige. Nå leser begge herfra.
 * Ren.
 */
export function ankomstMs(jny) {
  const t = jny && jny.arrival && jny.arrival.time;
  if (t == null) return null;
  const ms = typeof t === 'number' ? t : Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}
