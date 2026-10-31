// Shared shell interactivity: menu sheet, language/theme/text-size preferences,
// auth-aware nav slot, unified citizen/admin notification bell + push opt-in
// drawer, and offline queue status banner.
(function () {
  'use strict';

  var lastSeenNotificationId = Number(localStorage.getItem('hufra_last_notif_id') || 0);
  var notifPollTimer = null;

  function haptic(kind) {
    if (window.HufraBridge && window.HufraBridge.haptic) window.HufraBridge.haptic(kind);
  }

  // Menu: bottom sheet on phones, dropdown on desktop. Closes on backdrop,
  // outside click, Escape, or following a link.
  function initMenu() {
    var toggle = document.getElementById('mobile-nav-toggle');
    var panel = document.getElementById('mobile-nav-panel');
    var backdrop = document.getElementById('sheet-backdrop');
    if (!toggle || !panel) return;

    function setOpen(open) {
      panel.classList.toggle('is-open', open);
      if (backdrop) backdrop.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.innerHTML = '<i data-lucide="' + (open ? 'x' : 'menu') + '" class="icon"></i>';
      if (window.lucide) window.lucide.createIcons(toggle);
      if (open) haptic('light');
    }

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOpen(!panel.classList.contains('is-open'));
    });
    if (backdrop) backdrop.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('is-open') && !panel.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) { setOpen(false); toggle.focus(); }
    });
    panel.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    window.HufraUI.closeMenu = function () { setOpen(false); };
  }

  // Language / theme / text-size segmented controls inside the menu.
  function initPrefs() {
    var buttons = document.querySelectorAll('button[data-pref]');
    if (!buttons.length) return;

    function current(pref) {
      if (pref === 'lang') return window.HufraI18n.getLocale();
      if (pref === 'theme') return window.HufraTheme.getTheme();
      return window.HufraTheme.getFontSize();
    }
    function sync() {
      buttons.forEach(function (b) {
        b.setAttribute('aria-pressed', current(b.getAttribute('data-pref')) === b.getAttribute('data-value') ? 'true' : 'false');
      });
    }
    buttons.forEach(function (b) {
      b.addEventListener('click', function () {
        var pref = b.getAttribute('data-pref');
        var value = b.getAttribute('data-value');
        if (current(pref) === value) return;
        haptic('selection');
        if (pref === 'lang') {
          window.HufraI18n.setLocale(value);
          location.reload();
          return;
        }
        if (pref === 'theme') window.HufraTheme.setTheme(value);
        else window.HufraTheme.setFontSize(value);
        sync();
      });
    });
    sync();
  }

  function renderAuthSlot(user) {
    var slots = [document.getElementById('nav-auth-slot'), document.getElementById('nav-auth-slot-mobile')];
    var t = window.HufraI18n.t;
    var isAdmin = user && (user.role === 'admin' || user.role === 'super_admin');

    var headerNotifWrapper = document.getElementById('header-notif-wrapper');
    if (headerNotifWrapper) headerNotifWrapper.classList.toggle('hidden', !user);

    slots.forEach(function (slot, idx) {
      if (!slot) return;
      var isMobile = idx === 1;
      var cls = isMobile ? 'menu-link-primary' : '';
      if (user) {
        var logoutId = 'logout-link-' + idx;
        slot.innerHTML =
          (isAdmin ? '<a href="/admin" class="' + cls + '" data-i18n="nav_admin">' + t('nav_admin') + '</a>' : '') +
          '<a href="/account" class="' + cls + '" data-i18n="nav_account">' + t('nav_account') + '</a>' +
          '<a href="#" id="' + logoutId + '" class="' + cls + '" data-i18n="nav_logout">' + t('nav_logout') + '</a>';
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
          '<a href="/login" class="' + cls + '" data-i18n="nav_login">' + t('nav_login') + '</a>' +
          '<a href="/register" class="' + (isMobile ? 'menu-link-primary menu-link-cta' : 'btn btn-primary btn-sm') + '" data-i18n="nav_register">' + t('nav_register') + '</a>';
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
        listEl.innerHTML = '<div class="text-secondary text-center notif-empty">' + t('notifications_empty') + '</div>';
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
          '<div class="notif-title">' + escapeHtml(title) + '</div>' +
          (body ? '<div class="text-secondary notif-body">' + escapeHtml(body) + '</div>' : '') +
          '<div class="text-secondary notif-time">' + escapeHtml(timeStr) + '</div>' +
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
    pushBtn.className = enabled ? 'btn btn-success btn-block btn-sm' : 'btn btn-outline btn-block btn-sm';
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
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    region.appendChild(toast);
    haptic(type === 'error' ? 'error' : type === 'success' ? 'success' : 'light');
    setTimeout(function () {
      toast.classList.add('is-leaving');
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  }

  // Promise-based confirmation dialog (replaces window.confirm, which is
  // blocked/ugly inside WKWebView). Resolves true on confirm, false otherwise.
  function confirmDialog(message, opts) {
    opts = opts || {};
    var t = window.HufraI18n.t;
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'modal-overlay confirm-overlay';
      overlay.innerHTML =
        '<div class="card modal-card confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg">' +
          '<h2 class="card-title" id="confirm-title"></h2>' +
          '<p id="confirm-msg" class="confirm-msg"></p>' +
          '<div class="confirm-actions">' +
            '<button type="button" class="btn btn-secondary" data-confirm="no"></button>' +
            '<button type="button" class="btn ' + (opts.danger === false ? 'btn-primary' : 'btn-danger') + '" data-confirm="yes"></button>' +
          '</div>' +
        '</div>';
      overlay.querySelector('#confirm-title').textContent = opts.title || t('confirm_delete_title');
      overlay.querySelector('#confirm-msg').textContent = message;
      overlay.querySelector('[data-confirm="no"]').textContent = opts.cancelLabel || t('cancel');
      overlay.querySelector('[data-confirm="yes"]').textContent = opts.confirmLabel || t('confirm_yes_delete');
      var previous = document.activeElement;
      function done(result) {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (previous && previous.focus) { try { previous.focus(); } catch (e) {} }
        resolve(result);
      }
      function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); done(false); } }
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) return done(false);
        var btn = e.target.closest('[data-confirm]');
        if (btn) done(btn.getAttribute('data-confirm') === 'yes');
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(overlay);
      haptic('warning');
      overlay.querySelector('[data-confirm="no"]').focus();
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initMenu();
    initPrefs();
    initNotificationDrawer();
    initOfflineBanner();
    loadCurrentUser();
  });

  window.HufraUI = {
    closeMenu: function () {},
    haptic: haptic,
    showToast: showToast,
    confirm: confirmDialog,
    loadCurrentUser: loadCurrentUser,
    refreshNotifications: refreshNotifications,
  };
})(window);
