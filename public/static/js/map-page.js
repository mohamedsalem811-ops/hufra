// Full interactive map: colour-coded pins by status, clustering at zoom-out,
// filters (status/region/severity), toggleable "near me" search, a bottom
// sheet preview when a pin is tapped (native-feeling, replaces Leaflet
// popups) and automatic selection on ?focus=ID deep links.
(function () {
  'use strict';

  var map;
  var clusterGroup;
  var markersById = {};
  var potholesById = {};
  var selectedId = null;
  var userLocation = null;
  var userMarker = null;

  function t(k) { return window.HufraI18n.t(k); }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function sheetHtml(p) {
    var locale = window.HufraI18n.getLocale();
    var regionName = locale === 'ar' ? p.region_name_ar : p.region_name_en;
    var street = locale === 'ar' ? (p.street_ar || p.street_en) : (p.street_en || p.street_ar);
    var description = locale === 'ar' ? p.description_ar : (p.description_en || p.description_ar);
    var upvotes = p.upvotes_count || 0;
    var thumb = p.cover_thumb_key
      ? '<img class="pothole-sheet__thumb" src="' + window.HufraMap.mediaUrl(p.cover_thumb_key) + '" alt="" loading="lazy">'
      : '<div class="pothole-sheet__thumb pothole-sheet__thumb--empty"><i data-lucide="image-off" class="icon"></i></div>';
    return '<div class="pothole-sheet__row">' + thumb +
      '<div class="pothole-sheet__info">' +
        '<div class="flex items-center gap-2">' +
          '<span class="badge badge-' + p.status + '">' + t('status_' + p.status) + '</span>' +
          (upvotes > 0 ? '<span class="text-secondary small"><i data-lucide="thumbs-up" class="icon icon-xs"></i> ' + upvotes + '</span>' : '') +
        '</div>' +
        '<div class="pothole-sheet__title">#' + p.id + ' · ' + escapeHtml(regionName || '') + '</div>' +
        (street ? '<div class="small">' + escapeHtml(street) + '</div>' : '') +
        (description ? '<div class="text-secondary small pothole-sheet__desc">' + escapeHtml(description).slice(0, 110) + '</div>' : '') +
      '</div></div>' +
      '<a href="/pothole/' + p.id + '" class="btn btn-primary btn-block mt-3">' + t('view_details') + '</a>';
  }

  function openSheet(id) {
    var p = potholesById[String(id)];
    if (!p) return;
    deselect();
    selectedId = String(id);
    var m = markersById[selectedId];
    if (m) m.setIcon(window.HufraMap.pinIcon(p.status, { selected: true, large: true }));
    var body = document.getElementById('pothole-sheet-body');
    body.innerHTML = sheetHtml(p);
    if (window.lucide) window.lucide.createIcons(body);
    document.getElementById('pothole-sheet').classList.add('is-open');
    document.getElementById('map-fab').classList.add('hidden');
    window.HufraUI.haptic('light');
  }

  function deselect() {
    if (selectedId && markersById[selectedId] && potholesById[selectedId]) {
      markersById[selectedId].setIcon(window.HufraMap.pinIcon(potholesById[selectedId].status));
    }
    selectedId = null;
  }

  function closeSheet() {
    deselect();
    document.getElementById('pothole-sheet').classList.remove('is-open');
    document.getElementById('map-fab').classList.remove('hidden');
  }

  function initMap() {
    map = window.HufraMap.createMap('map-canvas', { zoomControl: true });
    clusterGroup = L.markerClusterGroup({ maxClusterRadius: 60, disableClusteringAtZoom: 17 });
    map.addLayer(clusterGroup);
    map.on('click', closeSheet);
    document.getElementById('pothole-sheet-close').addEventListener('click', closeSheet);
  }

  function buildQuery() {
    var params = new URLSearchParams();
    var status = document.getElementById('filter-status').value;
    var region = document.getElementById('filter-region').value;
    var severity = document.getElementById('filter-severity').value;
    if (status) params.set('status', status);
    if (region) params.set('region_id', region);
    if (severity) params.set('severity', severity);
    if (userLocation) {
      params.set('near_lat', userLocation.lat);
      params.set('near_lng', userLocation.lng);
      params.set('radius_m', 5000);
    }
    params.set('limit', 500);
    return params.toString();
  }

  async function loadPotholes() {
    try {
      var data = await window.HufraApi.get('/potholes?' + buildQuery());
      renderMarkers(data.results || []);
    } catch (e) {
      window.HufraUI.showToast(t('error_generic'), 'error');
    }
  }

  function renderMarkers(potholes) {
    closeSheet();
    clusterGroup.clearLayers();
    markersById = {};
    potholesById = {};
    potholes.forEach(function (p) {
      var marker = L.marker([p.lat, p.lng], { icon: window.HufraMap.pinIcon(p.status), keyboard: true, title: '#' + p.id });
      marker.on('click', function (e) {
        if (e.originalEvent) L.DomEvent.stopPropagation(e);
        openSheet(p.id);
      });
      clusterGroup.addLayer(marker);
      markersById[String(p.id)] = marker;
      potholesById[String(p.id)] = p;
    });
  }

  function refreshPins() {
    Object.keys(markersById).forEach(function (id) {
      var p = potholesById[id];
      markersById[id].setIcon(window.HufraMap.pinIcon(p.status, { selected: id === selectedId, large: id === selectedId }));
    });
  }

  async function loadRegionsFilter() {
    try {
      var data = await window.HufraApi.get('/regions');
      var select = document.getElementById('filter-region');
      var locale = window.HufraI18n.getLocale();
      data.results.forEach(function (region) {
        var opt = document.createElement('option');
        opt.value = region.id;
        opt.textContent = locale === 'ar' ? region.name_ar : region.name_en;
        select.appendChild(opt);
      });
    } catch (e) { /* ignore */ }
  }

  function setNearMeActive(btn, active) {
    btn.classList.toggle('btn-primary', active);
    btn.classList.toggle('btn-secondary', !active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function showUserDot() {
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.circleMarker([userLocation.lat, userLocation.lng], {
      radius: 8, weight: 3, color: '#fff', fillColor: window.HufraMap.pinColor('verified'), fillOpacity: 1,
    }).addTo(map);
  }

  function initNearMe() {
    var btn = document.getElementById('near-me-btn');
    btn.addEventListener('click', async function () {
      if (userLocation) {
        userLocation = null;
        if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
        setNearMeActive(btn, false);
        loadPotholes();
        return;
      }
      btn.disabled = true;
      try {
        var coords = await window.HufraBridge.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 });
        userLocation = { lat: coords.lat, lng: coords.lng };
        setNearMeActive(btn, true);
        showUserDot();
        map.setView([userLocation.lat, userLocation.lng], 14);
        await loadPotholes();
      } catch (err) {
        window.HufraUI.showToast(t('report_location_error'), 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initFilters() {
    ['filter-status', 'filter-region', 'filter-severity'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', loadPotholes);
    });
  }

  function initLegend() {
    var legend = document.getElementById('map-legend');
    var toggle = document.getElementById('map-legend-toggle');
    toggle.addEventListener('click', function () {
      var collapsed = legend.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  async function focusOnQueryParam() {
    var focusId = new URLSearchParams(location.search).get('focus');
    if (!focusId) return;
    try {
      var data = await window.HufraApi.get('/potholes/' + focusId);
      map.setView([data.pothole.lat, data.pothole.lng], 17);
      if (!potholesById[String(focusId)]) {
        potholesById[String(focusId)] = data.pothole;
        var m = L.marker([data.pothole.lat, data.pothole.lng], { icon: window.HufraMap.pinIcon(data.pothole.status) });
        m.on('click', function () { openSheet(focusId); });
        clusterGroup.addLayer(m);
        markersById[String(focusId)] = m;
      }
      setTimeout(function () { openSheet(focusId); }, 250);
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initMap();
    initFilters();
    initNearMe();
    initLegend();
    loadRegionsFilter();
    window.HufraTheme.onChange(refreshPins);
    await loadPotholes();
    focusOnQueryParam();
  });
})();
