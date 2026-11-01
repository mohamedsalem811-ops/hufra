// Page start-up: translate the server-rendered page, draw the icons and
// register the service worker. Kept as a file (not an inline script) so the
// Content-Security-Policy can forbid inline scripts: script-src 'self'.
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.HufraI18n) window.HufraI18n.translatePage(document);
    if (window.lucide) window.lucide.createIcons();
    var C = window.Capacitor;
    var isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
    if (!isNative && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  });
})();
