import { renderLayout } from './layout'

export function renderAccountPage(): string {
  const body = `
<div class="container" style="max-width: 720px; padding-block: var(--space-5);">
  <h1 class="section-title" data-i18n="nav_account">حسابي</h1>
  <div class="card mb-4" id="account-info">
    <div class="skeleton" style="height:80px;"></div>
  </div>

  <div class="card mb-4" id="push-settings-card">
    <h2 style="font-size:1.1rem;margin-top:0;" data-i18n="push_section_title">إشعارات الهاتف والتطبيق</h2>
    <p class="text-secondary" style="font-size:0.9rem;" data-i18n="push_section_desc">احصل على إشعار فوري على هاتفك عند التحقق من بلاغك أو إصلاح الحفرة.</p>
    <button type="button" class="btn btn-primary mt-2" id="account-push-toggle-btn" data-i18n="push_enable">تفعيل إشعارات التطبيق الفورية</button>
  </div>

  <div id="offline-reports-section" class="mb-4 hidden">
    <div class="flex justify-between items-center mb-2" style="flex-wrap:wrap;gap:8px;">
      <h2 style="font-size:1.1rem;margin:0;" data-i18n="pending_reports_title">بلاغات محفوظة على الجهاز (بانتظار الإنترنت)</h2>
      <button type="button" class="btn btn-primary" style="min-height:36px;padding:0 14px;font-size:0.85rem;" id="account-sync-offline-btn" data-i18n="offline_sync_now">مزامنة الآن</button>
    </div>
    <div id="offline-reports-list"></div>
  </div>

  <h2 class="mt-5 mb-3" style="font-size:1.2rem;" data-i18n="nav_report">بلّغ عن حفرة</h2>
  <div id="my-reports-list">
    <div class="skeleton" style="height:80px; border-radius: var(--radius-card);"></div>
  </div>

  <div class="card mt-5">
    <h2 style="font-size:1.1rem;" data-i18n="account_privacy_title">الخصوصية وإدارة البيانات</h2>
    <div class="flex gap-3 mt-3" style="flex-wrap:wrap;">
      <button type="button" class="btn btn-secondary" id="export-data-btn">
        <i data-lucide="download" class="icon"></i>
        <span data-i18n="account_export_btn">تصدير بياناتي (JSON)</span>
      </button>
      <button type="button" class="btn btn-danger" id="delete-account-btn">
        <i data-lucide="trash-2" class="icon"></i>
        <span data-i18n="account_delete_btn">حذف حسابي نهائياً</span>
      </button>
    </div>
  </div>
</div>
`
  return renderLayout(body, {
    title: 'حسابي',
    activeNav: 'account',
    extraScripts: `<script src="/static/js/account.js"></script>`,
  })
}
