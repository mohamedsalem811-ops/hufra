import { renderLayout } from './layout'

export function renderPotholeDetailPage(id: string): string {
  const body = `
<div class="container" style="max-width: 860px; padding-block: var(--space-5);">
  <div id="pothole-detail-root">
    <div class="skeleton" style="height:280px; border-radius: var(--radius-card);"></div>
    <div class="skeleton mt-4" style="height:40px; width:60%;"></div>
    <div class="skeleton mt-2" style="height:20px; width:40%;"></div>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'تفاصيل البلاغ',
    activeNav: 'pothole-detail',
    withMap: true,
    extraScripts: `<script>window.__HUFRA_POTHOLE_ID__ = ${JSON.stringify(id)};</script><script src="/static/js/pothole-detail.js"></script>`,
  })
}
