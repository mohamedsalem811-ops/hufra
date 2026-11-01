(function () {
  'use strict';

  async function load() {
    try {
      var data = await window.HufraApi.get('/potholes/counters');
      var t = window.HufraI18n.t;
      var totals = data.totals || {};
      var inProgress = (totals.reported || 0) + (totals.verified || 0) + (totals.under_repair || 0);
      var counters = document.getElementById('transparency-counters');
      counters.innerHTML =
        card(t('stat_total'), totals.total || 0) +
        card(t('stat_in_progress'), inProgress) +
        card(t('stat_fixed'), totals.fixed || 0) +
        card(t('stat_avg_days'), data.avg_response_days ? Math.round(data.avg_response_days) : '-');

      var locale = window.HufraI18n.getLocale();
      var tbody = document.querySelector('#region-breakdown-table tbody');
      tbody.innerHTML = (data.by_region || []).map(function (region) {
        var name = locale === 'ar' ? region.name_ar : region.name_en;
        return '<tr><td>' + name + '</td><td>' + (region.total || 0) + '</td><td>' + (region.fixed || 0) + '</td></tr>';
      }).join('');
    } catch (e) {
      window.HufraUI.showToast(window.HufraI18n.t('error_generic'), 'error');
    }
  }

  function card(label, value) {
    return '<div class="card stat-card"><div class="stat-num">' + value + '</div><div class="stat-label">' + label + '</div></div>';
  }

  document.addEventListener('DOMContentLoaded', load);
})();
