import { renderLayout } from './layout'

export function renderMapPage(): string {
  const body = `
<div class="map-page">
  <div class="map-toolbar" role="search">
    <label class="visually-hidden" for="filter-status" data-i18n="map_filter_status">الحالة</label>
    <select id="filter-status" class="select" style="width:auto; min-width:140px;">
      <option value="" data-i18n="map_filter_all">الكل</option>
      <option value="reported" data-i18n="status_reported">تم الإبلاغ</option>
      <option value="verified" data-i18n="status_verified">تم التحقق</option>
      <option value="under_repair" data-i18n="status_under_repair">قيد الإصلاح</option>
      <option value="fixed" data-i18n="status_fixed">تم الإصلاح</option>
    </select>

    <label class="visually-hidden" for="filter-region" data-i18n="map_filter_region">المنطقة</label>
    <select id="filter-region" class="select" style="width:auto; min-width:140px;">
      <option value="" data-i18n="map_filter_all">الكل</option>
    </select>

    <label class="visually-hidden" for="filter-severity" data-i18n="map_filter_severity">درجة الخطورة</label>
    <select id="filter-severity" class="select" style="width:auto; min-width:140px;">
      <option value="" data-i18n="map_filter_all">الكل</option>
      <option value="minor" data-i18n="severity_minor">خفيفة</option>
      <option value="medium" data-i18n="severity_medium">متوسطة</option>
      <option value="severe" data-i18n="severity_severe">خطيرة</option>
    </select>

    <button type="button" class="btn btn-secondary" id="near-me-btn">
      <i data-lucide="locate-fixed" class="icon"></i>
      <span data-i18n="map_near_me">قريب مني</span>
    </button>
  </div>

  <div class="map-area">
    <div id="map-canvas" role="application" aria-label="Interactive pothole map"></div>
    <div class="map-legend">
      <strong data-i18n="map_legend_title">دليل الألوان</strong>
      <ul class="mt-2">
        <li><span class="badge badge-reported" data-i18n="status_reported">تم الإبلاغ</span></li>
        <li><span class="badge badge-verified" data-i18n="status_verified">تم التحقق</span></li>
        <li><span class="badge badge-under_repair" data-i18n="status_under_repair">قيد الإصلاح</span></li>
        <li><span class="badge badge-fixed" data-i18n="status_fixed">تم الإصلاح</span></li>
      </ul>
    </div>
    <a href="/report" class="btn btn-primary fab">
      <i data-lucide="plus" class="icon"></i>
      <span data-i18n="report_pothole">بلّغ عن حفرة</span>
    </a>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'الخريطة',
    activeNav: 'map',
    withMap: true,
    bodyClass: 'no-footer-space',
    extraScripts: `<script src="/static/js/map-page.js"></script>`,
  })
}
