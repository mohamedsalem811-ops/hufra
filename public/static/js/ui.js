// Shared header/footer interactivity: mobile nav (with outside-click & Escape
// close + icon swap), theme toggle, language toggle, font-size toggle,
// auth-aware nav slot, unified citizen/admin notification bell + push opt-in
// drawer, and offline queue status banner.
(function () {
  'use strict';

  var lastSeenNotificationId = Number(localStorage.getItem('hufra_last_notif_id') || 0);
  var notifPollTimer = null;

  function initMobileNav() {
    var toggle = document.getElementById('mobile-nav-toggle');
    var panel = document.getElementById('mobile-nav-panel');
    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.innerHTML = '<i data-lucide="' + (open ? 'x' : 'menu') + '" class="icon"></i>';
      if (window.lucide) window.lucide.createIcons();
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var nextOpen = !panel.classList.contains('is-open');
      setOpen(nextOpen);
    });

    document.addEventListener('click', function (e) {
      if (panel.classList.contains('is-open') && !panel.contains(e.target) && !toggle.contains(e.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) {
        setOpen(false);
      }
    });

    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        setOpen(false);
      }
    });
  }

  function initThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    function updateIcon() {
      var isDark = window.HufraTheme.getTheme() === 'dark';
      btn.innerHTML = '<i data-lucide="' + (isDark ? 'sun' : 'moon') + '" class="icon"></i>';
      if (window.lucide) window.lucide.createIcons();
    }
    updateIcon();
    btn.addEventListener('click', function () {
      window.HufraTheme.toggleTheme();
      updateIcon();
    });
  }

  function initFontSizeToggle() {
    var btn = document.getElementById('font-size-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      window.HufraTheme.cycleFontSize();
    });
  }

  function initLangToggle() {
    var btn = document.getElementById('lang-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var current = window.HufraI18n.getLocale();
      window.HufraI18n.setLocale(current === 'ar' ? 'en' : 'ar');
      location.reload();
    });
  }

  function renderAuthSlot(user) {
    var slots = [document.getElementById('nav-auth-slot'), document.getElementById('nav-auth-slot-mobile')];
    var t = window.HufraI18n.t;
    var isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

    var bottomAdminLink = document.getElementById('bottom-nav-admin');
    if (bottomAdminLink) {
      bottomAdminLink.classList.toggle('hidden', !isAdmin);
    }

    var headerNotifWrapper = document.getElementById('header-notif-wrapper');
    if (headerNotifWrapper) {
      headerNotifWrapper.classList.toggle('hidden', !user);
    }

    slots.forEach(function (slot, idx) {
      if (!slot) return;
      if (user) {
        var adminLink = isAdmin
          ? '<a href="/admin" data-i18n="nav_admin">' + t('nav_admin') + '</a>'
          : '';
        var logoutId = 'logout-link-' + idx;
        slot.innerHTML =
          adminLink +
          '<a href="/account" data-i18n="nav_account">' + t('nav_account') + '</a>' +
          '<a href="#" id="' + logoutId + '" data-i18n="nav_logout">' + t('nav_logout') + '</a>';
        var logoutLink = document.getElementById(logoutId);
        if (logoutLink) {
          logoutLink.addEventListener('click', async function (e) {
            e.preventDefault();
            if (window.HufraBridge) {
              await window.HufraBridge.unregisterPushNotifications().catch(function () {});
            }
            var rt = window.HufraApi.getRefreshToken && window.HufraApi.getRefreshToken();
            await window.HufraApi.post('/auth/logout', rt ? { refresh_token: rt } : {}).catch(function () {});
            window.HufraApi.setAccessToken(null);
            location.href = '/';
          });
        }
      } else {
        slot.innerHTML =
          '<a href="/login" data-i18n="nav_login">' + t('nav_login') + '</a>' +
          '<a href="/register" class="btn btn-primary" style="padding:0 16px;min-height:38px;color:#fff;" data-i18n="nav_register">' + t('nav_register') + '</a>';
      }
    });
  }

  async function refreshNotifications() {
    var badge = document.getElementById('header-notif-badge');
    var listEl = document.getElementById('header-notif-list');
    if (!badge || !listEl) return;

    try {
      var data = await window.HufraApi.get('/notifications');
      var unread = data.unread_count || 0;
      if (unread > 0) {
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }

      var results = data.results || [];
      var locale = window.HufraI18n.getLocale();
      var t = window.HufraI18n.t;

      if (results.length > 0) {
        var newest = results[0];
        if (newest.id > lastSeenNotificationId && !newest.read_at) {
          lastSeenNotificationId = newest.id;
          localStorage.setItem('hufra_last_notif_id', String(newest.id));
          try {
            var p = JSON.parse(newest.payload_json || '{}');
            var title = locale === 'en' ? (p.title_en || 'HUFRA') : (p.title_ar || 'حفرة');
            var body = locale === 'en' ? (p.body_en || '') : (p.body_ar || '');
            if (window.HufraBridge && body) {
              window.HufraBridge.showLocalNotification(title, body, p.url || '/');
            }
          } catch (e) {}
        }
      }

      if (!results.length) {
        listEl.innerHTML = '<div class="text-secondary text-center" style="padding:16px;font-size:0.9rem;">' + t('notifications_empty') + '</div>';
        return;
      }

      listEl.innerHTML = results.slice(0, 12).map(function (item) {
        var payload = {};
        try { payload = JSON.parse(item.payload_json || '{}'); } catch (e) {}
        var title = locale === 'en'
          ? (payload.title_en || (item.type === 'status_change' ? 'Report status updated' : 'New notification'))
          : (payload.title_ar || (item.type === 'status_change' ? 'تحديث حالة البلاغ' : 'إشعار جديد'));
        var body = locale === 'en'
          ? (payload.body_en || (payload.pothole_id ? 'Report #' + payload.pothole_id : ''))
          : (payload.body_ar || (payload.pothole_id ? 'بلاغ رقم #' + payload.pothole_id : ''));
        var url = payload.url || (payload.pothole_id ? '/pothole/' + payload.pothole_id : '#');
        var isUnread = !item.read_at;
        var timeStr = new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-LY' : 'en-GB');
        return '<a href="' + url + '" class="notif-item ' + (isUnread ? 'is-unread' : '') + '">' +
          '<div style="font-weight:600;font-size:0.9rem;">' + escapeHtml(title) + '</div>' +
          (body ? '<div class="text-secondary" style="font-size:0.83rem;margin-top:2px;">' + escapeHtml(body) + '</div>' : '') +
          '<div class="text-secondary" style="font-size:0.75rem;margin-top:4px;">' + escapeHtml(timeStr) + '</div>' +
        '</a>';
      }).join('');
    } catch (e) {}
  }

  function updatePushToggleButton() {
    var pushBtn = document.getElementById('header-push-toggle-btn');
    if (!pushBtn || !window.HufraBridge) return;
    var enabled = window.HufraBridge.isPushEnabled();
    var t = window.HufraI18n.t;
    pushBtn.textContent = enabled ? t('push_enabled') : t('push_enable');
    pushBtn.className = enabled ? 'btn btn-success btn-block' : 'btn btn-outline btn-block';
  }

  function initNotificationDrawer() {
    var btn = document.getElementById('header-notif-btn');
    var drawer = document.getElementById('header-notif-drawer');
    var markReadBtn = document.getElementById('header-notif-read-all');
    var pushBtn = document.getElementById('header-push-toggle-btn');
    if (!btn || !drawer) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var hidden = drawer.classList.toggle('hidden');
      if (!hidden) {
        updatePushToggleButton();
        refreshNotifications();
      }
    });

    document.addEventListener('click', function (e) {
      if (!drawer.classList.contains('hidden') && !drawer.contains(e.target) && !btn.contains(e.target)) {
        drawer.classList.add('hidden');
      }
    });

    if (markReadBtn) {
      markReadBtn.addEventListener('click', async function () {
        try {
          await window.HufraApi.post('/notifications/read-all');
          refreshNotifications();
        } catch (e) {}
      });
    }

    if (pushBtn && window.HufraBridge) {
      pushBtn.addEventListener('click', async function () {
        try {
          if (window.HufraBridge.isPushEnabled()) {
            await window.HufraBridge.unregisterPushNotifications();
            showToast(window.HufraI18n.t('push_disable'), 'info');
          } else {
            await window.HufraBridge.registerPushNotifications();
            showToast(window.HufraI18n.t('push_enabled'), 'success');
          }
          updatePushToggleButton();
        } catch (err) {
          showToast(err.message || window.HufraI18n.t('error_generic'), 'error');
        }
      });
    }
  }

  function initOfflineBanner() {
    var banner = document.getElementById('offline-sync-banner');
    var textEl = document.getElementById('offline-sync-text');
    var syncBtn = document.getElementById('offline-sync-btn');
    if (!banner || !window.HufraOfflineQueue) return;

    function renderBanner(summary) {
      var t = window.HufraI18n.t;
      if (summary.online && summary.total === 0) {
        banner.classList.add('hidden');
        return;
      }
      banner.classList.remove('hidden');
      if (!summary.online) {
        textEl.textContent = t('offline_banner_offline') + (summary.total > 0 ? ' (' + summary.total + ')' : '');
        syncBtn.classList.add('hidden');
      } else {
        textEl.textContent = t('offline_banner_pending') + ' ' + summary.total;
        syncBtn.classList.remove('hidden');
        syncBtn.disabled = summary.isSyncing;
        syncBtn.textContent = summary.isSyncing ? t('offline_syncing') : t('offline_sync_now');
      }
    }

    syncBtn.addEventListener('click', function () {
      window.HufraOfflineQueue.syncAll();
    });

    window.HufraOfflineQueue.onChange(renderBanner);
    window.HufraOfflineQueue.getQueueSummary().then(renderBanner);
  }

  async function loadCurrentUser() {
    try {
      var data = await window.HufraApi.get('/auth/me');
      renderAuthSlot(data.user);
      refreshNotifications();
      if (!notifPollTimer) {
        notifPollTimer = setInterval(refreshNotifications, 25000);
      }
      return data.user;
    } catch (e) {
      renderAuthSlot(null);
      return null;
    }
  }

  function showToast(message, type) {
    var region = document.getElementById('toast-region');
    if (!region) return;
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + (type || 'info');
    toast.textContent = message;
    region.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMobileNav();
    initThemeToggle();
    initFontSizeToggle();
    initLangToggle();
    initNotificationDrawer();
    initOfflineBanner();
    loadCurrentUser();
  });

  window.HufraUI = {
    showToast: showToast,
    loadCurrentUser: loadCurrentUser,
    refreshNotifications: refreshNotifications,
  };
})(window);
