// Server-rendered HTML shell shared by every page. HUFRA keeps the frontend
// as progressively-enhanced server-rendered HTML + vanilla JS (no SPA bundler)
// while adding a full PWA Service Worker + Capacitor native bridge and
// IndexedDB offline queue so the exact same codebase powers both the fast
// public website and the Android/iOS mobile app.

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

export function renderLayout(bodyHtml: string, opts: LayoutOptions): string {
  const title = `${opts.title} | HUFRA - حفرة`
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(opts.description || 'حفرة - منصة مجتمعية لرصد حفريات الطرق في طرابلس الكبرى بالخرائط والصور')}">
<meta name="theme-color" content="#D97706">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/static/css/app.css">
${opts.withMap ? `<link href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" rel="stylesheet">` : ''}
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js" defer></script>
${opts.withMap ? `<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>` : ''}
${opts.extraHead || ''}
</head>
<body class="${opts.bodyClass || ''}">
<a href="#main-content" class="skip-link" data-i18n="skip_to_content">تخطي إلى المحتوى</a>
${renderHeader(opts.activeNav)}
<div id="offline-sync-banner" class="offline-sync-banner hidden" role="status" aria-live="polite">
  <div class="container flex justify-between items-center" style="gap:12px;flex-wrap:wrap;">
    <span id="offline-sync-text" data-i18n="offline_banner_offline">وضع عدم الاتصال</span>
    <button type="button" class="btn btn-primary" style="min-height:34px;padding:0 14px;font-size:0.85rem;" id="offline-sync-btn" data-i18n="offline_sync_now">مزامنة الآن</button>
  </div>
</div>
<main id="main-content">
${bodyHtml}
</main>
${renderFooter(opts.adminWhatsapp)}
${renderMobileBottomNav(opts.activeNav)}
<div class="toast-region" id="toast-region" aria-live="polite"></div>
<script src="/static/js/i18n.js"></script>
<script src="/static/js/theme.js"></script>
<script src="/static/js/native-bridge.js"></script>
<script src="/static/js/api.js"></script>
<script src="/static/js/offline-queue.js"></script>
<script src="/static/js/ui.js"></script>
${opts.extraScripts || ''}
<script>
  if (window.lucide) { window.lucide.createIcons(); }
  document.addEventListener('DOMContentLoaded', function () {
    if (window.HufraI18n) window.HufraI18n.translatePage(document);
    if (window.lucide) window.lucide.createIcons();
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    }
  });
</script>
</body>
</html>`
}

function navLink(href: string, key: string, label: string, active?: string) {
  const isActive = active === key
  return `<a href="${href}" data-i18n="${key}" ${isActive ? 'aria-current="page"' : ''}>${escapeHtml(label)}</a>`
}

function renderHeader(active?: string): string {
  return `
<header class="site-header">
  <div class="container site-header__inner">
    <a href="/" class="brand" aria-label="HUFRA home">
      <img src="/static/img/logo/hufra-icon.svg" alt="" width="36" height="36">
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
        <button type="button" class="btn btn-icon btn-secondary" id="header-notif-btn" aria-label="Notifications">
          <i data-lucide="bell" class="icon"></i>
          <span class="bell-badge hidden" id="header-notif-badge">0</span>
        </button>
        <div class="notif-drawer card hidden" id="header-notif-drawer">
          <div class="flex justify-between items-center mb-2">
            <strong data-i18n="notifications_title" style="font-size:0.95rem;">الإشعارات والتنبيهات</strong>
            <button type="button" class="btn btn-secondary" style="min-height:30px;padding:0 10px;font-size:0.78rem;" id="header-notif-read-all" data-i18n="notifications_mark_read">تحديد الكل كمقروء</button>
          </div>
          <div class="mb-2">
            <button type="button" class="btn btn-outline btn-block" style="min-height:36px;font-size:0.82rem;" id="header-push-toggle-btn" data-i18n="push_enable">تفعيل إشعارات التطبيق الفورية</button>
          </div>
          <div id="header-notif-list" class="notif-list"></div>
        </div>
      </div>
      <button type="button" class="btn btn-icon btn-secondary" id="lang-toggle" data-i18n-aria-label="language_toggle" title="Toggle language">
        <i data-lucide="languages" class="icon"></i>
      </button>
      <button type="button" class="btn btn-icon btn-secondary" id="theme-toggle" aria-label="Toggle theme">
        <i data-lucide="moon" class="icon"></i>
      </button>
      <button type="button" class="btn btn-icon btn-secondary" id="font-size-toggle" aria-label="Toggle text size">
        <i data-lucide="case-sensitive" class="icon"></i>
      </button>
      <button type="button" class="btn btn-icon btn-secondary mobile-nav-toggle" id="mobile-nav-toggle" aria-expanded="false" aria-controls="mobile-nav-panel" aria-label="Menu">
        <i data-lucide="menu" class="icon"></i>
      </button>
    </div>
  </div>
  <div class="mobile-nav-panel" id="mobile-nav-panel">
    ${navLink('/map', 'nav_map', 'الخريطة', active)}
    ${navLink('/report', 'nav_report', 'بلّغ عن حفرة', active)}
    ${navLink('/transparency', 'nav_transparency', 'الشفافية', active)}
    ${navLink('/trust', 'nav_trust', 'الأمان والخصوصية', active)}
    <span id="nav-auth-slot-mobile"></span>
  </div>
</header>`
}

function renderMobileBottomNav(active?: string): string {
  return `
<nav class="mobile-bottom-nav" aria-label="Mobile quick navigation">
  <a href="/" class="mobile-bottom-nav__item ${active === 'home' ? 'is-active' : ''}">
    <i data-lucide="home" class="icon"></i>
    <span data-i18n="nav_home">الرئيسية</span>
  </a>
  <a href="/map" class="mobile-bottom-nav__item ${active === 'map' ? 'is-active' : ''}">
    <i data-lucide="map" class="icon"></i>
    <span data-i18n="nav_map">الخريطة</span>
  </a>
  <a href="/report" class="mobile-bottom-nav__item mobile-bottom-nav__cta ${active === 'report' ? 'is-active' : ''}">
    <i data-lucide="plus-circle" class="icon"></i>
    <span data-i18n="nav_report">بلّغ</span>
  </a>
  <a href="/account" class="mobile-bottom-nav__item ${active === 'account' ? 'is-active' : ''}">
    <i data-lucide="user" class="icon"></i>
    <span data-i18n="nav_account">حسابي</span>
  </a>
  <a href="/admin" id="bottom-nav-admin" class="mobile-bottom-nav__item hidden ${active === 'admin' ? 'is-active' : ''}">
    <i data-lucide="shield-check" class="icon"></i>
    <span data-i18n="nav_admin">الإدارة</span>
  </a>
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
        <img src="/static/img/logo/hufra-icon.svg" alt="" width="28" height="28">
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

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
