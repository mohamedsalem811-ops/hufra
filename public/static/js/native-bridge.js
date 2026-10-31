// Unified Native + Web Bridge for HUFRA (PWA + Capacitor).
(function (global) {
  'use strict';

  var PUSH_TOKEN_STORAGE_KEY = 'hufra_push_token';
  var PUSH_ENABLED_STORAGE_KEY = 'hufra_push_enabled';

  function isNativeApp() {
    return Boolean(
      global.Capacitor &&
      typeof global.Capacitor.isNativePlatform === 'function' &&
      global.Capacitor.isNativePlatform()
    );
  }

  function getPlatform() {
    if (isNativeApp() && typeof global.Capacitor.getPlatform === 'function') {
      var p = global.Capacitor.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
    return 'web';
  }

  function getPlugins() {
    return (global.Capacitor && global.Capacitor.Plugins) || {};
  }

  async function getCurrentPosition(options) {
    options = options || { enableHighAccuracy: true, timeout: 12000 };
    var plugins = getPlugins();
    if (isNativeApp() && plugins.Geolocation) {
      var perm = await plugins.Geolocation.checkPermissions().catch(function () { return null; });
      if (!perm || perm.location !== 'granted') {
        await plugins.Geolocation.requestPermissions().catch(function () { return null; });
      }
      var pos = await plugins.Geolocation.getCurrentPosition(options);
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      };
    }

    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        return reject(new Error('Geolocation not supported'));
      }
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        function (err) {
          reject(err);
        },
        options
      );
    });
  }

  async function capturePhotoNative() {
    var plugins = getPlugins();
    if (!isNativeApp() || !plugins.Camera) {
      return null;
    }
    var photo = await plugins.Camera.getPhoto({
      quality: 85,
      allowEditing: false,
      resultType: 'uri',
      source: 'PROMPT',
    });
    if (!photo || !photo.webPath) return null;
    var res = await fetch(photo.webPath);
    var blob = await res.blob();
    return new File([blob], 'capture.' + (photo.format || 'jpeg'), {
      type: blob.type || 'image/jpeg',
    });
  }

  function isPushEnabled() {
    return localStorage.getItem(PUSH_ENABLED_STORAGE_KEY) === '1';
  }

  function getStoredPushToken() {
    return localStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  }

  async function registerPushNotifications() {
    var locale = (global.HufraI18n && global.HufraI18n.getLocale()) || 'ar';
    var plugins = getPlugins();

    if (isNativeApp() && plugins.PushNotifications) {
      var permStatus = await plugins.PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await plugins.PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        throw new Error(locale === 'ar' ? 'لم يتم منح إذن الإشعارات' : 'Push permission denied');
      }

      return new Promise(function (resolve, reject) {
        var resolved = false;
        plugins.PushNotifications.addListener('registration', async function (tokenObj) {
          if (resolved) return;
          resolved = true;
          var rawToken = tokenObj && tokenObj.value ? tokenObj.value : '';
          try {
            await global.HufraApi.post('/notifications/push-token', {
              platform: getPlatform(),
              token: rawToken,
              locale: locale,
            });
            localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, rawToken);
            localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, '1');
            resolve({ platform: getPlatform(), token: rawToken });
          } catch (e) {
            reject(e);
          }
        });

        plugins.PushNotifications.addListener('registrationError', function (err) {
          if (resolved) return;
          resolved = true;
          reject(new Error((err && err.error) || 'Native push registration failed'));
        });

        plugins.PushNotifications.addListener('pushNotificationReceived', function (notification) {
          if (global.HufraUI && global.HufraUI.showToast) {
            global.HufraUI.showToast(
              (notification.title ? notification.title + ': ' : '') + (notification.body || ''),
              'info'
            );
          }
          if (global.HufraUI && global.HufraUI.refreshNotifications) {
            global.HufraUI.refreshNotifications();
          }
        });

        plugins.PushNotifications.addListener('pushNotificationActionPerformed', function (action) {
          var targetUrl =
            action &&
            action.notification &&
            action.notification.data &&
            action.notification.data.url;
          if (targetUrl) {
            if (window.HufraRouter) window.HufraRouter.go(targetUrl); else location.href = targetUrl;
          }
        });

        plugins.PushNotifications.register();
      });
    }

    if (!('Notification' in global)) {
      throw new Error(locale === 'ar' ? 'المتصفح لا يدعم الإشعارات' : 'Notifications not supported in this browser');
    }

    var permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new Error(locale === 'ar' ? 'تم رفض إذن الإشعارات' : 'Notification permission not granted');
    }

    var existingToken = getStoredPushToken();
    var webToken = existingToken || ('web-' + generateClientId());
    var endpointJson = null;

    if ('serviceWorker' in navigator) {
      try {
        var reg = await navigator.serviceWorker.ready;
        if (reg && reg.pushManager) {
          var sub = await reg.pushManager.getSubscription();
          if (sub) {
            endpointJson = JSON.stringify(sub.toJSON());
            if (sub.endpoint) webToken = sub.endpoint;
          }
        }
      } catch (e) {}
    }

    await global.HufraApi.post('/notifications/push-token', {
      platform: 'web',
      token: webToken,
      endpoint_json: endpointJson || undefined,
      locale: locale,
    });

    localStorage.setItem(PUSH_TOKEN_STORAGE_KEY, webToken);
    localStorage.setItem(PUSH_ENABLED_STORAGE_KEY, '1');
    return { platform: 'web', token: webToken };
  }

  async function unregisterPushNotifications() {
    var token = getStoredPushToken();
    try {
      await global.HufraApi.del('/notifications/push-token', token ? { token: token } : undefined);
    } catch (e) {}
    localStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
    localStorage.removeItem(PUSH_ENABLED_STORAGE_KEY);
  }

  async function showLocalNotification(title, body, url) {
    if (!isPushEnabled()) return;
    if ('serviceWorker' in navigator && 'Notification' in global && Notification.permission === 'granted') {
      try {
        var reg = await navigator.serviceWorker.getRegistration();
        if (reg && typeof reg.showNotification === 'function') {
          await reg.showNotification(title, {
            body: body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            data: { url: url || '/' },
          });
          return;
        }
      } catch (e) {}
    }
    if ('Notification' in global && Notification.permission === 'granted') {
      try {
        var n = new Notification(title, { body: body, icon: '/favicon.svg' });
        n.onclick = function () {
          window.focus();
          if (url) { if (window.HufraRouter) window.HufraRouter.go(url); else location.href = url; }
        };
      } catch (e) {}
    }
  }

  function generateClientId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  // Light tactile feedback on native; silently no-ops on the web.
  function haptic(kind) {
    var h = getPlugins().Haptics;
    if (!isNativeApp() || !h) return;
    try {
      if (kind === 'selection') h.selectionChanged();
      else if (kind === 'success' || kind === 'error' || kind === 'warning') h.notification({ type: kind.toUpperCase() });
      else h.impact({ style: kind === 'heavy' ? 'HEAVY' : kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
    } catch (e) {}
  }

  // Keep the status bar legible against the current theme (dark content on
  // light surface, light content on dark surface).
  function syncStatusBar() {
    var sb = getPlugins().StatusBar;
    if (!isNativeApp() || !sb) return;
    var dark = global.HufraTheme && global.HufraTheme.getTheme() === 'dark';
    try {
      sb.setStyle({ style: dark ? 'DARK' : 'LIGHT' });
      if (getPlatform() === 'android') sb.setBackgroundColor({ color: dark ? '#15181C' : '#FFFFFF' });
    } catch (e) {}
  }

  function initNativeChrome() {
    if (!isNativeApp()) return;
    syncStatusBar();
    if (global.HufraTheme && global.HufraTheme.onChange) global.HufraTheme.onChange(syncStatusBar);
    var app = getPlugins().App;
    if (app && app.addListener) {
      // Hardware/gesture back: close menu first, then navigate back, else exit (Android).
      app.addListener('backButton', function () {
        var panel = document.getElementById('mobile-nav-panel');
        if (panel && panel.classList.contains('is-open') && global.HufraUI) { global.HufraUI.closeMenu(); return; }
        if (global.history.length > 1) global.history.back();
        else if (app.exitApp) app.exitApp();
      });
    }
    var splash = getPlugins().SplashScreen;
    if (splash && splash.hide) splash.hide().catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', initNativeChrome);

  global.HufraBridge = {
    haptic: haptic,
    isNativeApp: isNativeApp,
    getPlatform: getPlatform,
    getCurrentPosition: getCurrentPosition,
    capturePhotoNative: capturePhotoNative,
    isPushEnabled: isPushEnabled,
    getStoredPushToken: getStoredPushToken,
    registerPushNotifications: registerPushNotifications,
    unregisterPushNotifications: unregisterPushNotifications,
    showLocalNotification: showLocalNotification,
    generateClientId: generateClientId,
  };
})(window);
