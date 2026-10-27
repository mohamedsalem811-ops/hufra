import { renderLayout } from './layout'

export function renderHomePage(adminWhatsapp?: string): string {
  const body = `
<section class="section" style="padding-top: var(--space-5); padding-bottom: 0;">
  <div class="container">
    <div class="hero-banner" role="img" aria-label="HUFRA - حفرة"></div>
  </div>
</section>

<section class="section" style="padding-top: var(--space-6);">
  <div class="container">
    <div class="grid grid-2" style="align-items:center; gap: var(--space-6);">
      <div>
        <h1 class="section-title" style="font-size: 2.1rem;" data-i18n="hero_title">كل حفرة تراها، يمكنك الإبلاغ عنها</h1>
        <p class="section-subtitle" data-i18n="hero_subtitle">منصة مجتمعية مستقلة لرصد حفريات الطرق في طرابلس الكبرى، بالخرائط والصور، بشفافية كاملة.</p>
        <div class="flex gap-3" style="flex-wrap:wrap;">
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
      <div class="card" style="padding:0; overflow:hidden; min-height:280px;">
        <div id="home-map-preview" style="width:100%; height:280px;" aria-hidden="true"></div>
      </div>
    </div>
  </div>
</section>

<section class="section" style="background: var(--bg-surface); padding-block: var(--space-6);">
  <div class="container">
    <div class="grid grid-4" id="home-counters">
      ${counterSkeleton('stat_total', 'file-text')}
      ${counterSkeleton('stat_in_progress', 'wrench')}
      ${counterSkeleton('stat_fixed', 'check-circle')}
      ${counterSkeleton('stat_avg_days', 'clock')}
    </div>
  </div>
</section>

<section class="section hidden" id="home-recent-fixed-section" style="padding-bottom: 0;">
  <div class="container">
    <h2 class="section-title" data-i18n="recent_fixed_title">حفريات تم إصلاحها مؤخراً (قبل وبعد)</h2>
    <div class="grid grid-3 mt-4" id="home-recent-fixed-list"></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <h2 class="section-title" data-i18n="how_it_works">كيف تعمل المنصة</h2>
    <div class="grid grid-4 mt-4">
      ${howItWorksStep('map-pin', 'step1_title', 'step1_desc', 'حدد الموقع', 'افتح الخريطة أو اسمح للموقع الجغرافي بتحديد مكانك تلقائياً.')}
      ${howItWorksStep('camera', 'step2_title', 'step2_desc', 'صوّر الحفرة', 'التقط صورة أو صورتين من هاتفك مباشرة أو من المعرض.')}
      ${howItWorksStep('send', 'step3_title', 'step3_desc', 'أرسل البلاغ', 'أضف وصفاً قصيراً ودرجة الخطورة، ثم أرسل بدون الحاجة لحساب.')}
      ${howItWorksStep('activity', 'step4_title', 'step4_desc', 'تابع الحالة', 'راقب حالة بلاغك من "تم الإبلاغ" حتى "تم الإصلاح".')}
    </div>
  </div>
</section>

<section class="section" style="background: var(--bg-surface);">
  <div class="container">
    <h2 class="section-title" data-i18n="regions_title">المناطق المشمولة في طرابلس الكبرى</h2>
    <div class="flex gap-2" id="home-regions-list" style="flex-wrap:wrap;">
      <div class="skeleton" style="width:120px; height:36px; border-radius:999px;"></div>
      <div class="skeleton" style="width:100px; height:36px; border-radius:999px;"></div>
      <div class="skeleton" style="width:140px; height:36px; border-radius:999px;"></div>
    </div>
  </div>
</section>

<section class="section" style="padding-block: var(--space-6);">
  <div class="container">
    <h2 class="section-title" data-i18n="highlights_title">أبرز المساهمين</h2>
    <div class="grid grid-2" id="home-highlights">
      <div class="card text-center" id="home-top-donor">
        <i data-lucide="heart-handshake" class="icon-xl" style="color: var(--color-primary); margin-inline:auto;"></i>
        <div class="text-secondary mt-2" data-i18n="top_donor_title">أكبر داعم</div>
        <div class="skeleton mt-2" style="height:28px; width:60%; margin-inline:auto; border-radius:6px;"></div>
      </div>
      <div class="card text-center" id="home-top-reporter">
        <i data-lucide="award" class="icon-xl" style="color: var(--color-primary); margin-inline:auto;"></i>
        <div class="text-secondary mt-2" data-i18n="top_reporter_title">الأكثر مساهمة في البلاغات</div>
        <div class="skeleton mt-2" style="height:28px; width:60%; margin-inline:auto; border-radius:6px;"></div>
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

function counterSkeleton(labelKey: string, icon: string): string {
  return `
  <div class="card text-center">
    <i data-lucide="${icon}" class="icon-xl" style="color: var(--color-primary); margin-inline:auto;"></i>
    <div class="mt-2" style="font-size:1.8rem; font-weight:700;" data-counter="${labelKey}">-</div>
    <div class="text-secondary" data-i18n="${labelKey}">${labelKey}</div>
  </div>`
}

function howItWorksStep(icon: string, titleKey: string, descKey: string, titleFallback: string, descFallback: string): string {
  return `
  <div class="card card-hover">
    <div style="width:52px; height:52px; border-radius:14px; background: var(--color-primary-light); display:flex; align-items:center; justify-content:center; margin-bottom: var(--space-3);">
      <i data-lucide="${icon}" class="icon-lg" style="color: var(--color-primary-dark);"></i>
    </div>
    <h3 data-i18n="${titleKey}">${titleFallback}</h3>
    <p class="text-secondary" data-i18n="${descKey}">${descFallback}</p>
  </div>`
}
