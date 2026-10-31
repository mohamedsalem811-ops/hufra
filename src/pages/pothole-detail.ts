import { renderLayout, jsonForScript } from './layout'

export function renderPotholeDetailPage(id: number): string {
  const body = `
<div class="container page-narrow">
  <div class="page-head">
    <a href="/map" class="btn btn-icon btn-secondary back-btn" data-i18n-aria-label="nav_map" aria-label="Back">
      <i data-lucide="arrow-right" class="icon icon-flip"></i>
    </a>
    <h1 data-i18n="pothole_detail_title">تفاصيل البلاغ</h1>
  </div>
  <div id="pothole-detail-root">
    <div class="skeleton skeleton-map"></div>
    <div class="skeleton skeleton-title mt-4"></div>
    <div class="skeleton skeleton-sub mt-2"></div>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'تفاصيل البلاغ',
    activeNav: 'pothole-detail',
    withMap: true,
    extraScripts: `<script>window.__HUFRA_POTHOLE_ID__ = ${jsonForScript(id)};</script><script src="/static/js/pothole-detail.js"></script>`,
  })
}
