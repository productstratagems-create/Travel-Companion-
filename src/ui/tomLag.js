/**
 * TØM ET LAG — MED LAPPENE (v1.218.196). Målt i proben: Auto-kartet hadde 100
 * merkelapper for 6 markører etter noen sekunder, de samme fire tekstene om
 * og om igjen. `clearLayers()` fjernet markørene, men de faste lappene ble
 * liggende i lapp-laget (leaflet-rotate flytter dem til et eget lag, og
 * fjerningen fant dem ikke). Hver tegning la igjen et nytt sett. Her lukkes
 * og fjernes lappen før markøren. Én regel for alle kart.
 */
export function tømLag(lag) {
  if (!lag) return;
  const fjernLapp = l => {
    const t = l && l.getTooltip && l.getTooltip();
    if (!t) return;
    if (l.closeTooltip) l.closeTooltip();
    const c = t.getElement ? t.getElement() : t._container;
    if (c && c.parentNode) c.parentNode.removeChild(c);
  };
  if (lag.eachLayer) lag.eachLayer(l => { fjernLapp(l); if (l.eachLayer) l.eachLayer(fjernLapp); });
  lag.clearLayers();
}
