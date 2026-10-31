// Server-rendered HTML shell shared by every page. HUFRA keeps the frontend
// as progressively-enhanced server-rendered HTML + vanilla JS (no SPA bundler).
// The exact same markup powers three surfaces:
//   1. the public website (responsive, top nav on desktop),
//   2. the installed PWA, and
//   3. the Capacitor iOS/Android app (html.is-app: tab bar only, no web chrome).
// Pages are also pre-rendered to static HTML by scripts/build-app.mjs so the
// native app can start offline from bundled assets.

// Build stamp injected by vite.config.ts (commit sha on Cloudflare, timestamp locally).
// Every first-party CSS/JS URL gets ?v=<stamp>, so each deploy has fresh URLs that
// can be cached for a year without ever serving stale files.
declare const __BUILD_ID__: string
const BUILD_ID = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'

function versionAssets(html: string): string {
  return html.replace(/\b(src|href)="(\/static\/(?:css|js)\/[^"?]+)"/g, `$1="$2?v=${BUILD_ID}"`)
}

export interface LayoutOptions {
  title: string
  description?: string
  activeNav?: string
  bodyClass?: string
  extraHead?: string
  extraScripts?: string
  adminWhatsapp?: string
  /** Load Leaflet + marker-clustering assets. Only pages with an interactive
   * map should set this, to keep every other page fast on slow connections. */
  withMap?: boolean
}

// Runs before first paint: theme, language/direction, text size and app mode
// are applied to <html> so there is no flash of the wrong theme or layout.
const EARLY_BOOT_SCRIPT = `(function(){try{
var d=document.documentElement,ls=window.localStorage;
var t=ls.getItem('hufra_theme')||((window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light');
d.setAttribute('data-theme',t);
var l=ls.getItem('hufra_locale')||'ar';d.setAttribute('lang',l);d.setAttribute('dir',l==='ar'?'rtl':'ltr');
var f=ls.getItem('hufra_font_size');if(f&&f!=='base')d.setAttribute('data-font-size',f);
var C=window.Capacitor,native=!!(C&&C.isNativePlatform&&C.isNativePlatform());
var standalone=!!(navigator.standalone||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches));
if(native||standalone)d.classList.add('is-app');
if(native){d.classList.add('is-native');d.classList.add('platform-'+(C.getPlatform?C.getPlatform():'native'));}
var m=document.getElementById('meta-theme-color');if(m)m.setAttribute('content',t==='dark'?'#15181C':'#FFFFFF');
}catch(e){}})();`

export function renderLayout(bodyHtml: string, opts: LayoutOptions): string {
  const title = `${opts.title} | HUFRA - حفرة`
  return versionAssets(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(opts.description || 'حفرة - منصة مجتمعية لرصد حفريات الطرق في طرابلس الكبرى بالخرائط والصور')}">
<meta name="theme-color" id="meta-theme-color" content="#FFFFFF">
<meta name="color-scheme" content="light dark">
<meta name="format-detection" content="telephone=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="حفرة">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/static/img/icons/apple-touch-icon.png">
<script data-boot>${EARLY_BOOT_SCRIPT}</script>
<link rel="stylesheet" href="/static/css/fonts.css">
<link rel="stylesheet" href="/static/css/tokens.css">
<link rel="stylesheet" href="/static/css/app.css">
${opts.withMap ? `<link rel="stylesheet" href="/static/vendor/leaflet/leaflet.css">
<link rel="stylesheet" href="/static/vendor/leaflet/MarkerCluster.css">
<link rel="stylesheet" href="/static/vendor/leaflet/MarkerCluster.Default.css">` : ''}
<script src="/static/js/icons.js" data-shared defer></script>
${opts.withMap ? `<script src="/static/vendor/leaflet/leaflet.js" data-shared></script>
<script src="/static/vendor/leaflet/leaflet.markercluster.js" data-shared></script>` : ''}
${opts.extraHead || ''}
</head>
<body class="${opts.bodyClass || ''}">
<a href="#main-content" class="skip-link" data-i18n="skip_to_content">تخطي إلى المحتوى</a>
${renderHeader(opts.activeNav)}
<div id="offline-sync-banner" class="offline-sync-banner hidden" role="status" aria-live="polite">
  <div class="container offline-banner__inner">
    <span id="offline-sync-text" data-i18n="offline_banner_offline">وضع عدم الاتصال</span>
    <button type="button" class="btn btn-primary" id="offline-sync-btn" data-i18n="offline_sync_now">مزامنة الآن</button>
  </div>
</div>
<main id="main-content">
${bodyHtml}
</main>
${renderFooter(opts.adminWhatsapp)}
${renderTabBar(opts.activeNav)}
<div class="toast-region" id="toast-region" aria-live="polite"></div>
<script src="/static/js/i18n.js" data-shared></script>
<script src="/static/js/theme.js" data-shared></script>
<script src="/static/js/native-bridge.js" data-shared></script>
<script src="/static/js/api.js" data-shared></script>
<script src="/static/js/offline-queue.js" data-shared></script>
<script src="/static/js/ui.js" data-shared></script>
<script src="/static/js/router.js" data-shared></script>
${opts.withMap ? '<script src="/static/js/map-common.js" data-shared></script>' : ''}
${opts.extraScripts || ''}
<script data-boot>
  document.addEventListener('DOMContentLoaded', function () {
    if (window.HufraI18n) window.HufraI18n.translatePage(document);
    if (window.lucide) window.lucide.createIcons();
    var C = window.Capacitor;
    var isNative = !!(C && C.isNativePlatform && C.isNativePlatform());
    if (!isNative && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  });
</script>
</body>
</html>`)
}

function navLink(href: string, key: string, label: string, active?: string, extraClass = '') {
  const isActive = active === key.replace(/^nav_/, '')
  return `<a href="${href}" class="${extraClass}" data-i18n="${key}" ${isActive ? 'aria-current="page"' : ''}>${escapeHtml(label)}</a>`
}

function prefSegment(pref: string, value: string, labelHtml: string, label: string): string {
  return `<button type="button" data-pref="${pref}" data-value="${value}" aria-pressed="false" aria-label="${escapeHtml(label)}">${labelHtml}</button>`
}

function renderHeader(active?: string): string {
  return `
<header class="site-header">
  <div class="container site-header__inner">
    <a href="/" class="brand" aria-label="HUFRA home">
      <img src="/static/img/logo/hufra-mark.svg" alt="" width="34" height="34">
      <span data-i18n="app_name">حفرة</span>
    </a>
    <nav class="main-nav" aria-label="Main navigation">
      ${navLink('/map', 'nav_map', 'الخريطة', active)}
      ${navLink('/report', 'nav_report', 'بلّغ عن حفرة', active)}
      ${navLink('/transparency', 'nav_transparency', 'الشفافية', active)}
      ${navLink('/trust', 'nav_trust', 'الأمان والخصوصية', active)}
      <span id="nav-auth-slot"></span>
    </nav>
    <div class="header-actions">
      <div class="bell-wrapper hidden" id="header-notif-wrapper">
        <button type="button" class="btn btn-icon btn-secondary" id="header-notif-btn" data-i18n-aria-label="notifications_title" aria-label="Notifications">
          <i data-lucide="bell" class="icon"></i>
          <span class="bell-badge hidden" id="header-notif-badge">0</span>
        </button>
        <div class="notif-drawer card hidden" id="header-notif-drawer">
          <div class="notif-head">
            <strong data-i18n="notifications_title">الإشعارات والتنبيهات</strong>
            <button type="button" class="btn btn-secondary btn-sm" id="header-notif-read-all" data-i18n="notifications_mark_read">تحديد الكل كمقروء</button>
          </div>
          <div class="mb-2 push-only">
            <button type="button" class="btn btn-outline btn-block btn-sm" id="header-push-toggle-btn" data-i18n="push_enable">تفعيل إشعارات التطبيق الفورية</button>
          </div>
          <div id="header-notif-list" class="notif-list"></div>
        </div>
      </div>
      <button type="button" class="btn btn-icon btn-secondary mobile-nav-toggle" id="mobile-nav-toggle" aria-expanded="false" aria-controls="mobile-nav-panel" data-i18n-aria-label="menu_title" aria-label="Menu">
        <i data-lucide="menu" class="icon"></i>
      </button>
    </div>
  </div>
</header>
<div class="sheet-backdrop" id="sheet-backdrop"></div>
<div class="mobile-nav-panel" id="mobile-nav-panel" role="dialog" aria-modal="true" data-i18n-aria-label="menu_title" aria-label="Menu">
  ${navLink('/map', 'nav_map', 'الخريطة', active, 'menu-link-primary')}
  ${navLink('/report', 'nav_report', 'بلّغ عن حفرة', active, 'menu-link-primary')}
  ${navLink('/transparency', 'nav_transparency', 'الشفافية', active, 'menu-link-primary')}
  ${navLink('/trust', 'nav_trust', 'الأمان والخصوصية', active, 'menu-link-primary')}
  <span id="nav-auth-slot-mobile"></span>
  <div class="prefs">
    <div class="pref-row">
      <span data-i18n="pref_language">اللغة</span>
      <div class="segmented" role="group" aria-label="Language">
        ${prefSegment('lang', 'ar', 'عربي', 'العربية')}
        ${prefSegment('lang', 'en', 'EN', 'English')}
      </div>
    </div>
    <div class="pref-row">
      <span data-i18n="pref_theme">المظهر</span>
      <div class="segmented" role="group" aria-label="Theme">
        ${prefSegment('theme', 'light', '<i data-lucide="sun" class="icon"></i>', 'Light')}
        ${prefSegment('theme', 'dark', '<i data-lucide="moon" class="icon"></i>', 'Dark')}
      </div>
    </div>
    <div class="pref-row">
      <span data-i18n="pref_text_size">حجم الخط</span>
      <div class="segmented" role="group" aria-label="Text size">
        ${prefSegment('font', 'base', 'A', 'Normal')}
        ${prefSegment('font', 'large', 'A+', 'Large')}
        ${prefSegment('font', 'xlarge', 'A++', 'Extra large')}
      </div>
    </div>
  </div>
</div>`
}

function tabItem(href: string, key: string, icon: string, label: string, isActive: boolean, extra = '', id = ''): string {
  return `
  <a href="${href}" ${id ? `id="${id}"` : ''} class="mobile-bottom-nav__item ${extra} ${isActive ? 'is-active' : ''}" ${isActive ? 'aria-current="page"' : ''}>
    <span class="icon-wrap"><i data-lucide="${icon}" class="icon"></i></span>
    <span data-i18n="${key}">${escapeHtml(label)}</span>
  </a>`
}

function renderTabBar(active?: string): string {
  return `
<nav class="mobile-bottom-nav" aria-label="Mobile quick navigation">
  ${tabItem('/', 'nav_home', 'house', 'الرئيسية', active === 'home')}
  ${tabItem('/map', 'nav_map', 'map', 'الخريطة', active === 'map')}
  ${tabItem('/report', 'nav_report_short', 'plus', 'بلّغ', active === 'report', 'mobile-bottom-nav__cta')}
  ${tabItem('/transparency', 'nav_transparency', 'activity', 'الشفافية', active === 'transparency')}
  ${tabItem('/account', 'nav_account', 'user', 'حسابي', active === 'account')}
</nav>`
}

function renderFooter(adminWhatsapp?: string): string {
  const whatsappBlock = adminWhatsapp
    ? `<a href="https://wa.me/${escapeHtml(adminWhatsapp)}" target="_blank" rel="noopener"><i data-lucide="message-circle" class="icon"></i> <span data-i18n="whatsapp_contact">تواصل عبر واتساب</span></a>`
    : ''
  return `
<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <div class="brand mb-2">
        <img src="/static/img/logo/hufra-mark.svg" alt="" width="28" height="28">
        <span data-i18n="app_name">حفرة</span>
      </div>
      <p class="text-secondary" data-i18n="hero_subtitle">منصة مجتمعية مستقلة لرصد حفريات الطرق في طرابلس الكبرى، بالخرائط والصور، بشفافية كاملة.</p>
    </div>
    <div>
      <h3 data-i18n="nav_about">عن المنصة</h3>
      <ul>
        <li><a href="/transparency" data-i18n="nav_transparency">الشفافية</a></li>
        <li><a href="/trust" data-i18n="nav_trust">الأمان والخصوصية</a></li>
        <li><a href="/map" data-i18n="nav_map">الخريطة</a></li>
      </ul>
    </div>
    <div>
      <h3 data-i18n="nav_report">بلّغ عن حفرة</h3>
      <ul>
        <li><a href="/report" data-i18n="cta_report">بلّغ عن حفرة الآن</a></li>
        ${whatsappBlock ? `<li>${whatsappBlock}</li>` : ''}
      </ul>
    </div>
  </div>
</footer>`
}

/**
 * Serialize a value for embedding inside an inline <script> element.
 * JSON.stringify alone is not safe there: a string containing "</script>"
 * closes the element and lets the rest run as HTML. Escaping <, > and & (plus
 * the U+2028/U+2029 line separators) keeps the output valid JSON/JS while
 * making it impossible to break out of the script context.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
