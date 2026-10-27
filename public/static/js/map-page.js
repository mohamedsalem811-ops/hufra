// Full interactive map: color-coded pins by status, clustering at zoom-out,
// filters (status/region/severity), toggleable "near me" geolocation search,
// and automatic marker popup opening on ?focus=ID deep links.
(function () {
  'use strict';

  var STATUS_COLORS = {
    reported: '#E53E3E',
    verified: '#2B6CB0',
    under_repair: '#F57C1F',
    fixed: '#2E9E5B',
  };

  var map;
  var clusterGroup;
  var markersById = {};
  var userLocation = null;

  function statusLabel(status) {
    return window.HufraI18n.t('status_' + status);
  }

  function buildDivIcon(status) {
    var color = STATUS_COLORS[status] || STATUS_COLORS.reported;
    return L.divIcon({
      className: 'hufra-pin',
      html:
        '<svg width="30" height="38" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M15 1C7.8 1 2 6.8 2 14c0 9.6 13 22 13 22s13-12.4 13-22C28 6.8 22.2 1 15 1z" fill="' + color + '" stroke="#fff" stroke-width="1.5"/>' +
        '<circle cx="15" cy="14" r="6" fill="#fff"/>' +
        '</svg>',
      iconSize: [30, 38],
      iconAnchor: [15, 38],
      popupAnchor: [0, -34],
    });
  }

  function popupHtml(pothole) {
    var locale = window.HufraI18n.getLocale();
    var t = window.HufraI18n.t;
    var regionName = locale === 'ar' ? pothole.region_name_ar : pothole.region_name_en;
    var street = locale === 'ar' ? (pothole.street_ar || pothole.street_en) : (pothole.street_en || pothole.street_ar);
    var description = locale === 'ar' ? pothole.description_ar : (pothole.description_en || pothole.description_ar);
    var thumb = pothole.cover_thumb_key ? '/media/' + pothole.cover_thumb_key : null;
    var upvotes = pothole.upvotes_count || 0;
    var html = '<div style="min-width:210px;">';
    if (thumb) {
      html += '<img src="' + thumb + '" alt="" style="width:100%; height:110px; object-fit:cover; border-radius:8px; margin-bottom:8px;" loading="lazy">';
    }
    html += '<div class="flex justify-between items-center" style="gap:6px;">';
    html += '<span class="badge badge-' + pothole.status + '">' + statusLabel(pothole.status) + '</span>';
    if (upvotes > 0) {
      html += '<span class="text-secondary" style="font-size:0.8rem;font-weight:600;">👍 ' + upvotes + '</span>';
    }
    html += '</div>';
    html += '<p style="margin:8px 0 2px; font-weight:700;">#' + pothole.id + ' · ' + escapeHtml(regionName || '') + '</p>';
    if (street) {
      html += '<p style="margin:0 0 4px; font-size:0.82rem; font-weight:600; color:var(--text-primary);">' + escapeHtml(street) + '</p>';
    }
    if (description) {
      html += '<p style="margin:0 0 8px; font-size:0.84rem; color:var(--text-secondary);">' + escapeHtml(description).slice(0, 120) + '</p>';
    }
    html += '<a href="/pothole/' + pothole.id + '" class="btn btn-primary" style="min-height:36px; padding:0 14px; font-size:0.85rem; color:#fff;">' + t('view_details') + '</a>';
    html += '</div>';
    return html;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initMap() {
    map = L.map('map-canvas', { zoomControl: true });
    map.setView([32.8500, 13.2000], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    clusterGroup = L.markerClusterGroup({ maxClusterRadius: 60, disableClusteringAtZoom: 17 });
    map.addLayer(clusterGroup);
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
      window.HufraUI.showToast(window.HufraI18n.t('error_generic'), 'error');
    }
  }

  function renderMarkers(potholes) {
    clusterGroup.clearLayers();
    markersById = {};
    potholes.forEach(function (pothole) {
      var marker = L.marker([pothole.lat, pothole.lng], { icon: buildDivIcon(pothole.status) });
      marker.bindPopup(popupHtml(pothole));
      clusterGroup.addLayer(marker);
      markersById[String(pothole.id)] = marker;
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

  function initNearMe() {
    var btn = document.getElementById('near-me-btn');
    btn.addEventListener('click', async function () {
      if (userLocation) {
        userLocation = null;
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
        loadPotholes();
        return;
      }
      btn.disabled = true;
      try {
        var coords = window.HufraBridge
          ? await window.HufraBridge.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000 })
          : await new Promise(function (resolve, reject) {
              if (!navigator.geolocation) return reject(new Error('No geolocation'));
              navigator.geolocation.getCurrentPosition(
                function (pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
                reject,
                { enableHighAccuracy: true, timeout: 10000 }
              );
            });
        userLocation = { lat: coords.lat, lng: coords.lng };
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
        map.setView([userLocation.lat, userLocation.lng], 14);
        await loadPotholes();
      } catch (err) {
        window.HufraUI.showToast(window.HufraI18n.t('report_location_error'), 'error');
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

  async function focusOnQueryParam() {
    var params = new URLSearchParams(location.search);
    var focusId = params.get('focus');
    if (!focusId) return;
    try {
      var data = await window.HufraApi.get('/potholes/' + focusId);
      map.setView([data.pothole.lat, data.pothole.lng], 17);
      var m = markersById[String(focusId)];
      if (m) {
        setTimeout(function () { m.openPopup(); }, 250);
      }
    } catch (e) { /* ignore */ }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    initMap();
    initFilters();
    initNearMe();
    loadRegionsFilter();
    await loadPotholes();
    focusOnQueryParam();
  });
})();
