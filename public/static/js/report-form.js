// Report flow: 4-step wizard (location -> photos -> details -> review).
// Includes:
//   - User choice on street field: click "Auto-fill from map pin" (Nominatim
//     reverse-geocoding in Arabic/English) OR type street/landmark manually.
//   - Ultra-compact photo compression badge showing exact KB on each photo slot.
//   - Offline IndexedDB report queueing when offline or on flaky connections.
(function () {
  'use strict';

  var TRIPOLI_CENTER = [32.8872, 13.1913];
  var MAX_PHOTOS = 3;

  function makeUuid() {
    if (window.HufraBridge && window.HufraBridge.generateClientId) {
      return window.HufraBridge.generateClientId();
    }
    return 'rep-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  var state = {
    step: 1,
    lat: null,
    lng: null,
    clientReportUuid: makeUuid(),
    photos: [],
  };

  var map, marker;

  function initLocationMap() {
    state.lat = TRIPOLI_CENTER[0];
    state.lng = TRIPOLI_CENTER[1];
    if (typeof L === 'undefined') return;
    map = window.HufraMap.createMap('report-map', { zoomControl: true });
    map.setView(TRIPOLI_CENTER, 12);

    marker = L.marker(TRIPOLI_CENTER, { draggable: true, icon: window.HufraMap.pinIcon('reported', { large: true }) }).addTo(map);
    marker.on('dragend', function () {
      var pos = marker.getLatLng();
      state.lat = pos.lat;
      state.lng = pos.lng;
    });

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      state.lat = e.latlng.lat;
      state.lng = e.latlng.lng;
    });
  }

  async function locateMe() {
    var statusEl = document.getElementById('location-status');
    var btn = document.getElementById('locate-btn');
    btn.disabled = true;
    statusEl.textContent = window.HufraI18n.t('report_locating');

    try {
      var coords;
      if (window.HufraBridge && window.HufraBridge.getCurrentPosition) {
        coords = await window.HufraBridge.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
      } else {
        coords = await new Promise(function (resolve, reject) {
          if (!navigator.geolocation) return reject(new Error('No geolocation'));
          navigator.geolocation.getCurrentPosition(
            function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude }); },
            reject,
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }
      state.lat = coords.lat;
      state.lng = coords.lng;
      if (map && marker) {
        var latlng = [coords.lat, coords.lng];
        map.setView(latlng, 16);
        marker.setLatLng(latlng);
      }
      statusEl.textContent = coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5);
    } catch (err) {
      statusEl.textContent = window.HufraI18n.t('report_location_error');
    } finally {
      btn.disabled = false;
    }
  }

  // --- Optional Reverse-Geocoding Auto-Fill (User Choice) ------------------
  async function autofillStreetFromPin() {
    var btn = document.getElementById('autofill-street-btn');
    var input = document.getElementById('street_ar');
    var hint = document.getElementById('street-autofill-status');
    if (!btn || !input) return;

    var t = window.HufraI18n.t;
    var locale = window.HufraI18n.getLocale();
    btn.disabled = true;
    if (hint) hint.textContent = t('report_locating');

    try {
      var url =
        'https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=' +
        encodeURIComponent(state.lat) +
        '&lon=' +
        encodeURIComponent(state.lng) +
        '&accept-language=' +
        encodeURIComponent(locale === 'en' ? 'en,ar' : 'ar,en');

      var res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('Geocoder unavailable');
      var data = await res.json();
      var addr = data.address || {};
      var parts = [
        addr.road || addr.pedestrian || addr.RESIDENTIAL || data.name,
        addr.neighbourhood || addr.suburb || addr.quarter || addr.city_district || addr.town,
      ].filter(Boolean);

      var formatted = parts.length ? parts.join(' — ') : (data.display_name || '').split(',').slice(0, 2).join(' — ');
      if (formatted) {
        input.value = formatted.slice(0, 200);
        input.focus();
        if (hint) hint.textContent = t('report_autofill_success');
      } else {
        throw new Error('No street found');
      }
    } catch (e) {
      if (hint) hint.textContent = t('report_autofill_failed');
    } finally {
      btn.disabled = false;
    }
  }

  function renderPhotoSlots() {
    var container = document.getElementById('photo-slots');
    container.innerHTML = '';

    state.photos.forEach(function (photo, index) {
      var slot = document.createElement('div');
      slot.className = 'photo-slot';
      var img = document.createElement('img');
      img.src = photo.previewUrl;
      img.alt = '';

      if (photo.fullBytes) {
        var kbBadge = document.createElement('span');
        kbBadge.className = 'photo-kb';
        kbBadge.textContent = Math.max(1, Math.round(photo.fullBytes / 1024)) + ' KB';
        slot.appendChild(kbBadge);
      }

      var removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'remove-photo';
      removeBtn.setAttribute('aria-label', 'Remove photo');
      removeBtn.innerHTML = '<i data-lucide="x" class="icon icon-sm"></i>';
      removeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        URL.revokeObjectURL(photo.previewUrl);
        state.photos.splice(index, 1);
        renderPhotoSlots();
      });
      slot.appendChild(img);
      slot.appendChild(removeBtn);
      container.appendChild(slot);
    });

    if (state.photos.length < MAX_PHOTOS) {
      var label = document.createElement('label');
      label.className = 'photo-slot';
      var icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'camera');
      icon.className = 'icon-xl';
      var span = document.createElement('span');
      span.className = 'small';
      span.setAttribute('data-i18n', 'report_take_photo');
      span.textContent = window.HufraI18n.t('report_take_photo');
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.setAttribute('capture', 'environment');
      input.className = 'visually-hidden';
      input.addEventListener('change', handlePhotoSelected);

      if (window.HufraBridge && window.HufraBridge.isNativeApp()) {
        label.addEventListener('click', async function (ev) {
          ev.preventDefault();
          var nativeFile = await window.HufraBridge.capturePhotoNative().catch(function () { return null; });
          if (nativeFile) {
            await processPhotoFile(nativeFile);
          } else {
            input.click();
          }
        });
      }

      label.appendChild(icon);
      label.appendChild(span);
      label.appendChild(input);
      container.appendChild(label);
    }

    if (window.lucide) window.lucide.createIcons();
  }

  async function processPhotoFile(file) {
    var statusEl = document.getElementById('photo-status');
    statusEl.textContent = window.HufraI18n.t('report_compressing');
    try {
      var compressed = await window.HufraImageCompress.compressImage(file);
      var previewUrl = URL.createObjectURL(compressed.full);
      state.photos.push({
        full: compressed.full,
        thumb: compressed.thumb,
        width: compressed.width,
        height: compressed.height,
        originalBytes: compressed.originalBytes,
        fullBytes: compressed.fullBytes,
        previewUrl: previewUrl,
      });
      var savedPct = compressed.originalBytes > 0
        ? Math.max(0, Math.round((1 - compressed.fullBytes / compressed.originalBytes) * 100))
        : 0;
      statusEl.textContent =
        Math.round((compressed.fullBytes || 0) / 1024) +
        ' KB' +
        (savedPct > 0 ? ' (-' + savedPct + '%)' : '');
    } catch (err) {
      statusEl.textContent = window.HufraI18n.t('error_generic');
    }
    renderPhotoSlots();
  }

  async function handlePhotoSelected(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    await processPhotoFile(file);
  }

  function goToStep(step) {
    document.querySelectorAll('.report-step').forEach(function (section) {
      section.classList.toggle('hidden', Number(section.getAttribute('data-step')) !== step);
    });
    document.querySelectorAll('#report-stepper .step').forEach(function (el) {
      var s = Number(el.getAttribute('data-step'));
      el.classList.remove('is-active', 'is-done');
      if (s === step) el.classList.add('is-active');
      else if (s < step) el.classList.add('is-done');
    });
    state.step = step;
    if (window.HufraUI) window.HufraUI.haptic('selection');
    if (step === 1 && map) {
      setTimeout(function () { map.invalidateSize(); }, 50);
    }
    if (step === 4) renderReviewSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderReviewSummary() {
    var t = window.HufraI18n.t;
    var severity = document.querySelector('input[name="severity"]:checked').value;
    var streetEl = document.getElementById('street_ar');
    var streetAr = streetEl ? streetEl.value.trim() : '';
    var descAr = document.getElementById('description_ar').value.trim();
    var container = document.getElementById('review-summary');
    container.innerHTML =
      '<p><strong>' + t('report_step_location') + ':</strong> ' + state.lat.toFixed(5) + ', ' + state.lng.toFixed(5) + '</p>' +
      (streetAr ? '<p><strong>' + t('report_street_ar') + ':</strong> ' + escapeHtml(streetAr) + '</p>' : '') +
      '<p><strong>' + t('report_step_photos') + ':</strong> ' + state.photos.length + '</p>' +
      '<p><strong>' + t('report_severity_label') + ':</strong> ' + t('severity_' + severity) + '</p>' +
      (descAr ? '<p><strong>' + t('report_description_ar') + ':</strong> ' + escapeHtml(descAr) + '</p>' : '');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initStepNav() {
    document.querySelectorAll('[data-action="next"]').forEach(function (btn) {
      btn.addEventListener('click', function () { goToStep(state.step + 1); });
    });
    document.querySelectorAll('[data-action="back"]').forEach(function (btn) {
      btn.addEventListener('click', function () { goToStep(state.step - 1); });
    });
  }

  function initSeverityChips() {
    document.querySelectorAll('#severity-group input[type="radio"]').forEach(function (input) {
      input.addEventListener('change', function () {
        document.querySelectorAll('#severity-group .chip-option').forEach(function (chip) {
          chip.classList.toggle('is-selected', chip.querySelector('input').checked);
        });
      });
    });
  }

  function showSuccessPanel(potholeId, isOfflineSaved) {
    var t = window.HufraI18n.t;
    document.getElementById('report-form').classList.add('hidden');
    document.getElementById('report-stepper').classList.add('hidden');
    var headEl = document.getElementById('report-head');
    if (headEl) headEl.classList.add('hidden');
    if (window.HufraUI) window.HufraUI.haptic('success');
    var successPanel = document.getElementById('report-success-panel');
    successPanel.classList.remove('hidden');

    var titleEl = successPanel.querySelector('[data-i18n="report_success_title"]');
    var descEl = successPanel.querySelector('[data-i18n="report_success_desc"]');
    var trackLink = document.getElementById('track-report-link');

    if (isOfflineSaved) {
      if (titleEl) titleEl.textContent = t('offline_saved_title');
      if (descEl) descEl.textContent = t('offline_saved_desc');
      if (trackLink) {
        trackLink.href = '/account';
        trackLink.textContent = t('nav_account');
      }
    } else {
      if (titleEl) titleEl.textContent = t('report_success_title');
      if (descEl) descEl.textContent = t('report_success_desc');
      if (trackLink) {
        trackLink.href = '/pothole/' + potholeId;
        trackLink.textContent = t('report_success_track');
      }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitReport(e) {
    e.preventDefault();
    var submitBtn = document.getElementById('submit-report-btn');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = window.HufraI18n.t('report_submitting');

    var streetEl = document.getElementById('street_ar');
    var streetVal = streetEl ? streetEl.value.trim() : '';

    var payload = {
      lat: state.lat,
      lng: state.lng,
      severity: document.querySelector('input[name="severity"]:checked').value,
      street_ar: streetVal,
      street_en: streetVal,
      description_ar: document.getElementById('description_ar').value,
      description_en: document.getElementById('description_en').value,
      reporter_contact: document.getElementById('reporter_contact').value || undefined,
      client_report_uuid: state.clientReportUuid,
    };
    var length = document.getElementById('length_cm').value;
    var width = document.getElementById('width_cm').value;
    var depth = document.getElementById('depth_cm').value;
    if (length) payload.length_cm = Number(length);
    if (width) payload.width_cm = Number(width);
    if (depth) payload.depth_cm = Number(depth);

    try {
      if (navigator.onLine === false && window.HufraOfflineQueue) {
        await window.HufraOfflineQueue.enqueueReport(payload, state.photos);
        showSuccessPanel(null, true);
        return;
      }

      var result = await window.HufraApi.post('/potholes', payload);
      var potholeId = result.id;

      for (var i = 0; i < state.photos.length; i++) {
        var photo = state.photos[i];
        var ext = photo.full && photo.full.type === 'image/jpeg' ? 'jpg' : 'webp';
        var formData = new FormData();
        formData.append('full', photo.full, 'photo.' + ext);
        formData.append('thumb', photo.thumb, 'thumb.' + ext);
        formData.append('stage', 'report');
        formData.append('width_px', String(photo.width));
        formData.append('height_px', String(photo.height));
        await window.HufraApi.postForm('/photos/' + potholeId, formData);
      }

      showSuccessPanel(potholeId, false);
    } catch (err) {
      if (window.HufraOfflineQueue && window.HufraOfflineQueue.isNetworkError(err)) {
        try {
          await window.HufraOfflineQueue.enqueueReport(payload, state.photos);
          showSuccessPanel(null, true);
          return;
        } catch (queueErr) { /* fallthrough */ }
      }
      window.HufraUI.showToast(err.message || window.HufraI18n.t('error_generic'), 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = window.HufraI18n.t('report_submit');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLocationMap();
    initStepNav();
    initSeverityChips();
    renderPhotoSlots();
    var headBack = document.getElementById('report-back-btn');
    if (headBack) {
      headBack.addEventListener('click', function (e) {
        if (state.step > 1) { e.preventDefault(); goToStep(state.step - 1); }
      });
    }
    document.getElementById('locate-btn').addEventListener('click', locateMe);
    var autofillBtn = document.getElementById('autofill-street-btn');
    if (autofillBtn) {
      autofillBtn.addEventListener('click', autofillStreetFromPin);
    }
    document.getElementById('report-form').addEventListener('submit', submitReport);
    document.getElementById('new-report-btn').addEventListener('click', function () { location.reload(); });
  });
})();
