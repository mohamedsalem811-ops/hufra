// Shared Leaflet helpers for every page that shows a map (home preview, full
// map, report picker, pothole detail). Keeps tile URL, pin colours and pin
// shape in one place. Pin colours come from the CSS tokens (--pin-*), so
// light/dark themes and the design system stay the single source of truth.
(function (global) {
  'use strict';

  // Tiles go through our own edge-cached proxy (/tiles) so they are same-origin,
  // cached for a week and keep working with the strict CSP. In the bundled
  // native app the proxy lives on the API server, so prefix its base URL.
  function tileUrl() {
    var base = (global.HufraApi && global.HufraApi.getApiBase) ? global.HufraApi.getApiBase() : '';
    return (base || '') + '/tiles/{z}/{x}/{y}.png';
  }
  var TILE_ATTRIBUTION = '&copy; OpenStreetMap';
  var DEFAULT_CENTER = [32.85, 13.2]; // Greater Tripoli
  var DEFAULT_ZOOM = 11;

  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return (v && v.trim()) || fallback;
  }

  function pinColor(status) {
    var key = '--pin-' + String(status || 'reported').replace(/_/g, '-');
    return cssVar(key, '#D92D20');
  }

  function pinIcon(status, opts) {
    opts = opts || {};
    var color = pinColor(status);
    var size = opts.large ? 1.25 : 1;
    var w = Math.round(30 * size);
    var h = Math.round(38 * size);
    return global.L.divIcon({
      className: 'hufra-pin' + (opts.selected ? ' is-selected' : ''),
      html:
        '<svg width="' + w + '" height="' + h + '" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 22 13 22s13-12.4 13-22C28 6.8 22.2 1 15 1z" fill="' + color + '" stroke="#fff" stroke-width="1.6"/>' +
        '<circle cx="15" cy="14" r="5.5" fill="#fff"/>' +
        '</svg>',
      iconSize: [w, h],
      iconAnchor: [w / 2, h],
    });
  }

  function tileLayer(opts) {
    return global.L.tileLayer(tileUrl(), Object.assign({ maxZoom: 19, keepBuffer: 4, updateWhenIdle: false, attribution: TILE_ATTRIBUTION }, opts || {}));
  }

  function createMap(el, opts) {
    var map = global.L.map(el, Object.assign({ zoomControl: true, attributionControl: true }, opts || {}));
    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    tileLayer().addTo(map);
    return map;
  }

  // Leaflet measures its container on init; when it lives in a hidden/animated
  // container (sheet, stepper) call this once it is visible.
  function refresh(map) {
    if (map) setTimeout(function () { map.invalidateSize(); }, 60);
  }

  function mediaUrl(key) {
    if (!key) return '';
    var base = (global.HufraApi && global.HufraApi.mediaBase) ? global.HufraApi.mediaBase() : '';
    return base + '/media/' + key;
  }

  global.HufraMap = {
    DEFAULT_CENTER: DEFAULT_CENTER,
    DEFAULT_ZOOM: DEFAULT_ZOOM,
    pinColor: pinColor,
    pinIcon: pinIcon,
    tileLayer: tileLayer,
    createMap: createMap,
    refresh: refresh,
    mediaUrl: mediaUrl,
  };
})(window);
