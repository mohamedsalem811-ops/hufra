(function () {
  'use strict';

  function statusBadge(status) {
    return '<span class="badge badge-' + status + '">' + window.HufraI18n.t('status_' + status) + '</span>';
  }

  async function loadAccount() {
    try {
      var data = await window.HufraApi.get('/auth/me');
      var t = window.HufraI18n.t;
      var user = data.user;
      document.getElementById('account-info').innerHTML =
        '<p><strong>' + t('login_email') + ':</strong> ' + escapeHtml(user.email) + '</p>' +
        '<p><strong>' + t('your_code') + ':</strong> ' + escapeHtml(user.code) + '</p>' +
        '<p><strong>Role:</strong> ' + escapeHtml(user.role) + '</p>';
    } catch (e) {
      if (navigator.onLine === false) return;
      location.href = '/login?redirect=/account';
    }
  }

  async function loadPendingOfflineReports() {
    var section = document.getElementById('offline-reports-section');
    var listEl = document.getElementById('offline-reports-list');
    var syncBtn = document.getElementById('account-sync-offline-btn');
    if (!section || !listEl || !window.HufraOfflineQueue) return;

    var pending = await window.HufraOfflineQueue.listPendingReports();
    if (!pending.length) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    var t = window.HufraI18n.t;
    var locale = window.HufraI18n.getLocale();
    listEl.innerHTML = pending.map(function (item) {
      var date = new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-LY' : 'en-GB');
      var sev = item.payload && item.payload.severity ? t('severity_' + item.payload.severity) : '';
      var photosCount = (item.photos && item.photos.length) || 0;
      return '<div class="card mb-2" style="border-inline-start: 4px solid var(--color-warning);">' +
        '<div class="flex justify-between items-center">' +
          '<strong>' + escapeHtml(sev) + ' (' + photosCount + ' ' + t('report_step_photos') + ')</strong>' +
          '<span class="badge" style="background:#FDECD9;color:#C7620F;">Offline Queue</span>' +
        '</div>' +
        '<div class="text-secondary mt-1" style="font-size:0.85rem;">' + escapeHtml(date) + '</div>' +
      '</div>';
    }).join('');

    if (syncBtn && !syncBtn._bound) {
      syncBtn._bound = true;
      syncBtn.addEventListener('click', async function () {
        syncBtn.disabled = true;
        await window.HufraOfflineQueue.syncAll();
        syncBtn.disabled = false;
        await loadPendingOfflineReports();
        await loadMyReports();
      });
    }
  }

  async function loadMyReports() {
    var container = document.getElementById('my-reports-list');
    try {
      var data = await window.HufraApi.get('/potholes/mine/list');
      var locale = window.HufraI18n.getLocale();
      if (!data.results.length) {
        container.innerHTML = '<div class="empty-state"><i data-lucide="inbox" class="icon-xl"></i><p>' + window.HufraI18n.t('empty_no_results') + '</p></div>';
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      container.innerHTML = data.results.map(function (report) {
        var regionName = locale === 'ar' ? report.region_name_ar : report.region_name_en;
        var date = new Date(report.created_at).toLocaleDateString(locale === 'ar' ? 'ar-LY' : 'en-GB');
        return '<a href="/pothole/' + report.id + '" class="card card-hover mb-3" style="display:block;">' +
          '<div class="flex justify-between items-center">' +
            '<strong>' + escapeHtml(regionName || '') + '</strong>' + statusBadge(report.status) +
          '</div>' +
          '<div class="text-secondary mt-1" style="font-size:0.85rem;">' + escapeHtml(date) + '</div>' +
        '</a>';
      }).join('');
    } catch (e) {
      container.innerHTML = '';
    }
  }

  function initPushPreferences() {
    var btn = document.getElementById('account-push-toggle-btn');
    if (!btn || !window.HufraBridge) return;

    function syncLabel() {
      var enabled = window.HufraBridge.isPushEnabled();
      var t = window.HufraI18n.t;
      btn.textContent = enabled ? t('push_enabled') : t('push_enable');
      btn.className = enabled ? 'btn btn-success' : 'btn btn-primary';
    }
    syncLabel();

    btn.addEventListener('click', async function () {
      btn.disabled = true;
      try {
        if (window.HufraBridge.isPushEnabled()) {
          await window.HufraBridge.unregisterPushNotifications();
          window.HufraUI.showToast(window.HufraI18n.t('push_disable'), 'info');
        } else {
          await window.HufraBridge.registerPushNotifications();
          window.HufraUI.showToast(window.HufraI18n.t('push_enabled'), 'success');
        }
        syncLabel();
      } catch (err) {
        window.HufraUI.showToast(err.message || window.HufraI18n.t('error_generic'), 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  function initPrivacyActions() {
    document.getElementById('export-data-btn').addEventListener('click', async function () {
      try {
        var data = await window.HufraApi.get('/auth/me/export');
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'hufra-my-data.json';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        window.HufraUI.showToast(window.HufraI18n.t('error_generic'), 'error');
      }
    });

    document.getElementById('delete-account-btn').addEventListener('click', async function () {
      if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
      try {
        await window.HufraApi.post('/auth/me/delete');
        window.HufraApi.setAccessToken(null);
        location.href = '/';
      } catch (e) {
        window.HufraUI.showToast(window.HufraI18n.t('error_generic'), 'error');
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadAccount();
    loadPendingOfflineReports();
    loadMyReports();
    initPushPreferences();
    initPrivacyActions();
    if (window.HufraOfflineQueue) {
      window.HufraOfflineQueue.onChange(function () {
        loadPendingOfflineReports();
      });
    }
  });
})();
