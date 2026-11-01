import { renderLayout } from './layout'

export function renderHomePage(adminWhatsapp?: string): string {
  const body = `
<section class="section section-tight">
  <div class="container">
    <div class="hero">
      <img class="hero__mark" src="/static/img/logo/hufra-glyph.svg" alt="" aria-hidden="true">
      <h1 data-i18n="hero_title">كل حفرة تراها، يمكنك الإبلاغ عنها</h1>
      <p data-i18n="hero_subtitle">منصة مجتمعية مستقلة لرصد حفريات الطرق في طرابلس الكبرى، بالخرائط والصور، بشفافية كاملة.</p>
      <div class="hero__actions">
        <a href="/report" class="btn btn-primary btn-lg">
          <i data-lucide="camera" class="icon"></i>
          <span data-i18n="cta_report">بلّغ عن حفرة الآن</span>
        </a>
        <a href="/map" class="btn btn-outline btn-lg">
          <i data-lucide="map" class="icon"></i>
          <span data-i18n="cta_view_map">استعرض الخريطة</span>
        </a>
      </div>
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <div class="grid grid-4" id="home-counters">
      ${statCard('stat_total', 'file-text')}
      ${statCard('stat_in_progress', 'wrench')}
      ${statCard('stat_fixed', 'check-circle')}
      ${statCard('stat_avg_days', 'clock')}
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <div class="card home-map-card">
      <div id="home-map-preview" class="home-map-preview" aria-hidden="true"></div>
      <a href="/map" class="btn btn-primary map-cta">
        <i data-lucide="map-pin" class="icon"></i>
        <span data-i18n="cta_view_map">استعرض الخريطة</span>
      </a>
    </div>
  </div>
</section>

<section class="section section-tight hidden" id="home-in-progress-section">
  <div class="container">
    <h2 class="section-title" data-i18n="showcase_in_progress_title">حفريات قيد الإصلاح الآن</h2>
    <div class="grid grid-3 mt-3" id="home-in-progress-list"></div>
  </div>
</section>

<section class="section section-tight hidden" id="home-recent-fixed-section">
  <div class="container">
    <h2 class="section-title" data-i18n="showcase_fixed_title">حفريات تم إصلاحها (قبل وبعد)</h2>
    <div class="grid grid-3 mt-3" id="home-recent-fixed-list"></div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <h2 class="section-title" data-i18n="how_it_works">كيف تعمل المنصة</h2>
    <div class="grid grid-4 mt-3">
      ${step(1, 'map-pin', 'step1_title', 'step1_desc', 'حدد الموقع', 'افتح الخريطة أو اسمح للموقع الجغرافي بتحديد مكانك تلقائياً.')}
      ${step(2, 'camera', 'step2_title', 'step2_desc', 'صوّر الحفرة', 'التقط صورة أو صورتين من هاتفك مباشرة أو من المعرض.')}
      ${step(3, 'send', 'step3_title', 'step3_desc', 'أرسل البلاغ', 'أضف وصفاً قصيراً ودرجة الخطورة، ثم أرسل بدون الحاجة لحساب.')}
      ${step(4, 'activity', 'step4_title', 'step4_desc', 'تابع الحالة', 'راقب حالة بلاغك من "تم الإبلاغ" حتى "تم الإصلاح".')}
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <h2 class="section-title" data-i18n="regions_title">المناطق المشمولة في طرابلس الكبرى</h2>
    <div class="chip-row" id="home-regions-list">
      <div class="skeleton skeleton-chip"></div>
      <div class="skeleton skeleton-chip"></div>
      <div class="skeleton skeleton-chip"></div>
    </div>
  </div>
</section>

<section class="section section-tight">
  <div class="container">
    <h2 class="section-title" data-i18n="highlights_title">أبرز المساهمين</h2>
    <div class="grid grid-2" id="home-highlights">
      <div class="card highlight-card" id="home-top-donor">
        <span class="stat-icon"><i data-lucide="heart-handshake" class="icon"></i></span>
        <div class="text-secondary" data-i18n="top_donor_title">أكبر داعم</div>
        <div class="skeleton skeleton-line"></div>
      </div>
      <div class="card highlight-card" id="home-top-reporter">
        <span class="stat-icon"><i data-lucide="award" class="icon"></i></span>
        <div class="text-secondary" data-i18n="top_reporter_title">الأكثر مساهمة في البلاغات</div>
        <div class="skeleton skeleton-line"></div>
      </div>
    </div>
  </div>
</section>
`

  return renderLayout(body, {
    title: 'الرئيسية',
    activeNav: 'home',
    adminWhatsapp,
    withMap: true,
    extraScripts: `<script src="/static/js/home.js"></script>`,
  })
}

function statCard(labelKey: string, icon: string): string {
  return `
  <div class="card stat-card">
    <span class="stat-icon"><i data-lucide="${icon}" class="icon"></i></span>
    <div class="stat-num" data-counter="${labelKey}">-</div>
    <div class="stat-label" data-i18n="${labelKey}">${labelKey}</div>
  </div>`
}

function step(n: number, icon: string, titleKey: string, descKey: string, titleFallback: string, descFallback: string): string {
  return `
  <div class="card step-card">
    <span class="step-num">${n}</span>
    <h3 data-i18n="${titleKey}">${titleFallback}</h3>
    <p class="text-secondary" data-i18n="${descKey}">${descFallback}</p>
  </div>`
}
