import { renderLayout } from './layout'

export function renderTransparencyPage(): string {
  const body = `
<div class="container" style="padding-block: var(--space-5);">
  <h1 class="section-title" data-i18n="transparency_title">صفحة الشفافية</h1>
  <p class="section-subtitle" data-i18n="hero_subtitle">منصة مجتمعية مستقلة لرصد حفريات الطرق في طرابلس الكبرى، بالخرائط والصور، بشفافية كاملة.</p>

  <div class="grid grid-4 mt-4" id="transparency-counters">
    <div class="card text-center"><div class="skeleton" style="height:32px;"></div></div>
    <div class="card text-center"><div class="skeleton" style="height:32px;"></div></div>
    <div class="card text-center"><div class="skeleton" style="height:32px;"></div></div>
    <div class="card text-center"><div class="skeleton" style="height:32px;"></div></div>
  </div>

  <h2 class="section-title mt-6" style="font-size:1.3rem;" data-i18n="regions_title">المناطق المشمولة في طرابلس الكبرى</h2>
  <div class="table-responsive card mt-3">
    <table id="region-breakdown-table">
      <thead>
        <tr>
          <th data-i18n="map_filter_region">المنطقة</th>
          <th data-i18n="stat_total">إجمالي البلاغات</th>
          <th data-i18n="stat_fixed">تم إصلاحها</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'الشفافية',
    activeNav: 'transparency',
    extraScripts: `<script src="/static/js/transparency.js"></script>`,
  })
}
