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

  function shot(key, cls, label) {
    if (!key) return '';
    return '<div class="ba-shot"><img src="' + window.HufraMap.mediaUrl(key) + '" alt="" loading="lazy">' +
      '<span class="ba-tag ' + cls + '">' + label + '</span></div>';
  }

  function showcaseCard(item, kind) {
    var locale = window.HufraI18n.getLocale();
    var t = window.HufraI18n.t;
    var regionName = locale === 'ar' ? item.region_name_ar : item.region_name_en;
    var street = locale === 'ar' ? (item.street_ar || item.street_en) : (item.street_en || item.street_ar);
    var shots = shot(item.before_thumb_key, 'ba-tag--before', t('stage_before'));
    if (kind === 'fixed') {
      shots += shot(item.after_thumb_key, 'ba-tag--after', t('stage_after'));
    } else {
      // Under repair: show the original report photo and, once crews upload it, the work-in-progress shot.
      shots += shot(item.during_thumb_key, 'ba-tag--during', t('stage_during'));
    }
    var badge = kind === 'fixed' ? 'badge-fixed' : 'badge-under_repair';
    var label = kind === 'fixed' ? t('status_fixed') : t('status_under_repair');
    return '<a href="/pothole/' + item.id + '" class="card card-hover card-link">' +
      '<div class="flex justify-between items-center mb-2">' +
        '<strong>#' + item.id + ' · ' + escapeHtml(regionName || '') + '</strong>' +
        '<span class="badge ' + badge + '">' + label + '</span>' +
      '</div>' +
      (street ? '<div class="text-secondary mb-2 small">' + escapeHtml(street) + '</div>' : '') +
      (shots ? '<div class="flex gap-2 mt-2">' + shots + '</div>' : '') +
    '</a>';
  }

  function fillShowcase(sectionId, listId, items, kind) {
    var section = document.getElementById(sectionId);
    var listEl = document.getElementById(listId);
    if (!section || !listEl) return;
    if (!items.length) {
      section.classList.add('hidden');
      listEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = items.map(function (item) { return showcaseCard(item, kind); }).join('');
    section.classList.remove('hidden');
  }

  // Homepage photo showcase: reports under repair + recently fixed (before / after).
  async function loadShowcase() {
    try {
      var data = await window.HufraApi.get('/potholes/showcase');
      fillShowcase('home-in-progress-section', 'home-in-progress-list', data.in_progress || [], 'in_progress');
      fillShowcase('home-recent-fixed-section', 'home-recent-fixed-list', data.fixed || [], 'fixed');
    } catch (e) {
      ['home-in-progress-section', 'home-recent-fixed-section'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
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
        return '<span class="chip-option chip-static">' + escapeHtml(name) + '</span>';
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
        skeleton.outerHTML = '<div class="highlight-name">' + escapeHtml(data.donor.name) + '</div>' +
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
        skeleton.outerHTML = '<div class="highlight-name">' + escapeHtml(data.reporter.name) + '</div>' +
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
    if (!el || !window.L || !window.HufraMap) return;
    var map = window.HufraMap.createMap(el, {
      zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false, keyboard: false,
    });
    map.setView(window.HufraMap.DEFAULT_CENTER, 10);
    map.on('click', function () {
      if (window.HufraRouter) window.HufraRouter.go('/map'); else location.href = '/map';
    });
    window.addEventListener('hufra:page-leave', function () { try { map.remove(); } catch (e) { /* gone */ } }, { once: true });
    window.HufraApi.get('/potholes?limit=60').then(function (data) {
      (data.results || []).forEach(function (p) {
        window.L.marker([p.lat, p.lng], { icon: window.HufraMap.pinIcon(p.status), interactive: false }).addTo(map);
      });
    }).catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadCounters();
    loadShowcase();
    loadRegions();
    initPreviewMap();
    loadTopDonor();
    loadTopReporter();
  });
})();
