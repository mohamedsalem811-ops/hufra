// Homepage interactivity: live counters + small non-interactive map preview
// + Recently Fixed in Tripoli (Before & After) showcase + region chip list.
(function () {
  'use strict';

  async function loadCounters() {
    try {
      var data = await window.HufraApi.get('/potholes/counters');
      var totals = data.totals || {};
      var inProgress = (totals.reported || 0) + (totals.verified || 0) + (totals.under_repair || 0);
      setCounter('stat_total', totals.total || 0);
      setCounter('stat_in_progress', inProgress);
      setCounter('stat_fixed', totals.fixed || 0);
      setCounter('stat_avg_days', data.avg_response_days ? Math.round(data.avg_response_days) : '-');
    } catch (e) {}
  }

  function setCounter(key, value) {
    var el = document.querySelector('[data-counter="' + key + '"]');
    if (el) el.textContent = value;
  }

  async function loadRecentFixed() {
    var section = document.getElementById('home-recent-fixed-section');
    var listEl = document.getElementById('home-recent-fixed-list');
    if (!section || !listEl) return;
    try {
      var data = await window.HufraApi.get('/potholes/recent-fixed');
      var items = data.results || [];
      if (!items.length) {
        section.classList.add('hidden');
        return;
      }
      section.classList.remove('hidden');
      var locale = window.HufraI18n.getLocale();
      var t = window.HufraI18n.t;
      listEl.innerHTML = items.map(function (item) {
        var regionName = locale === 'ar' ? item.region_name_ar : item.region_name_en;
        var street = locale === 'ar' ? (item.street_ar || item.street_en) : (item.street_en || item.street_ar);
        var beforeImg = item.before_thumb_key
          ? '<div style="flex:1;position:relative;"><img src="/media/' + item.before_thumb_key + '" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;"><span style="position:absolute;bottom:4px;inset-inline-start:4px;background:rgba(0,0,0,0.65);color:#fff;font-size:0.7rem;padding:2px 6px;border-radius:4px;">' + t('stage_before') + '</span></div>'
          : '';
        var afterImg = item.after_thumb_key
          ? '<div style="flex:1;position:relative;"><img src="/media/' + item.after_thumb_key + '" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;"><span style="position:absolute;bottom:4px;inset-inline-start:4px;background:rgba(36,123,71,0.88);color:#fff;font-size:0.7rem;padding:2px 6px;border-radius:4px;">' + t('stage_after') + '</span></div>'
          : '';
        return '<a href="/pothole/' + item.id + '" class="card card-hover" style="display:block;color:inherit;text-decoration:none;">' +
          '<div class="flex justify-between items-center mb-2">' +
            '<strong>#' + item.id + ' · ' + escapeHtml(regionName || '') + '</strong>' +
            '<span class="badge badge-fixed">' + t('status_fixed') + '</span>' +
          '</div>' +
          (street ? '<div class="text-secondary mb-2" style="font-size:0.85rem;">' + escapeHtml(street) + '</div>' : '') +
          ((beforeImg || afterImg) ? '<div class="flex gap-2 mt-2">' + beforeImg + afterImg + '</div>' : '') +
        '</a>';
      }).join('');
    } catch (e) {
      section.classList.add('hidden');
    }
  }

  async function loadRegions() {
    var container = document.getElementById('home-regions-list');
    if (!container) return;
    try {
      var data = await window.HufraApi.get('/regions');
      var locale = window.HufraI18n.getLocale();
      container.innerHTML = data.results.map(function (region) {
        var name = locale === 'ar' ? region.name_ar : region.name_en;
        return '<span class="chip-option" style="cursor:default;">' + escapeHtml(name) + '</span>';
      }).join('');
    } catch (e) {
      container.innerHTML = '';
    }
  }

  async function loadTopDonor() {
    var container = document.getElementById('home-top-donor');
    if (!container) return;
    var t = window.HufraI18n.t;
    try {
      var data = await window.HufraApi.get('/donors/top');
      var skeleton = container.querySelector('.skeleton');
      if (data.donor) {
        var amount = Math.round(data.donor.amount_lyd).toLocaleString(window.HufraI18n.getLocale() === 'ar' ? 'ar-LY' : 'en-GB');
        skeleton.outerHTML = '<div class="mt-2" style="font-size:1.4rem; font-weight:700;">' + escapeHtml(data.donor.name) + '</div>' +
          '<div class="text-secondary mt-1">' + amount + ' ' + t('currency_lyd') + '</div>';
      } else {
        skeleton.outerHTML = '<div class="text-secondary mt-2">' + t('empty_no_results') + '</div>';
      }
    } catch (e) {
      var skeletonEl = container.querySelector('.skeleton');
      if (skeletonEl) skeletonEl.outerHTML = '<div class="text-secondary mt-2">' + t('empty_no_results') + '</div>';
    }
  }

  async function loadTopReporter() {
    var container = document.getElementById('home-top-reporter');
    if (!container) return;
    var t = window.HufraI18n.t;
    try {
      var data = await window.HufraApi.get('/potholes/top-reporter');
      var skeleton = container.querySelector('.skeleton');
      if (data.reporter) {
        skeleton.outerHTML = '<div class="mt-2" style="font-size:1.4rem; font-weight:700;">' + escapeHtml(data.reporter.name) + '</div>' +
          '<div class="text-secondary mt-1">' + data.reporter.report_count + ' ' + t('reports_count_suffix') + '</div>';
      } else {
        skeleton.outerHTML = '<div class="text-secondary mt-2">' + t('empty_no_results') + '</div>';
      }
    } catch (e) {
      var skeletonEl = container.querySelector('.skeleton');
      if (skeletonEl) skeletonEl.outerHTML = '<div class="text-secondary mt-2">' + t('empty_no_results') + '</div>';
    }
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initPreviewMap() {
    var el = document.getElementById('home-map-preview');
    if (!el || !window.L) return;
    var map = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false });
    map.setView([32.8500, 13.2000], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map);
    map.on('click', function () { location.href = '/map'; });
    el.style.cursor = 'pointer';
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadCounters();
    loadRecentFixed();
    loadRegions();
    initPreviewMap();
    loadTopDonor();
    loadTopReporter();
  });
})();
