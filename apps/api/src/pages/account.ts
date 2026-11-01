import { renderLayout } from './layout'

export function renderAccountPage(): string {
  const body = `
<div class="container page-narrow">
  <h1 class="page-title" data-i18n="nav_account">حسابي</h1>

  <div class="card profile-card mb-4" id="account-info">
    <div class="skeleton skeleton-profile"></div>
  </div>

  <div class="card mb-4 push-only" id="push-settings-card">
    <h2 class="card-title" data-i18n="push_section_title">إشعارات الهاتف والتطبيق</h2>
    <p class="text-secondary small" data-i18n="push_section_desc">احصل على إشعار فوري على هاتفك عند التحقق من بلاغك أو إصلاح الحفرة.</p>
    <button type="button" class="btn btn-primary mt-2" id="account-push-toggle-btn" data-i18n="push_enable">تفعيل إشعارات التطبيق الفورية</button>
  </div>

  <div id="offline-reports-section" class="mb-4 hidden">
    <div class="flex justify-between items-center mb-2 wrap-gap">
      <h2 class="card-title" data-i18n="pending_reports_title">بلاغات محفوظة على الجهاز (بانتظار الإنترنت)</h2>
      <button type="button" class="btn btn-primary btn-sm" id="account-sync-offline-btn" data-i18n="offline_sync_now">مزامنة الآن</button>
    </div>
    <div id="offline-reports-list"></div>
  </div>

  <h2 class="section-heading" data-i18n="my_reports_title">بلاغاتي</h2>
  <div id="my-reports-list">
    <div class="skeleton skeleton-row"></div>
  </div>

  <div class="card mt-5">
    <h2 class="card-title" data-i18n="account_password_title">تغيير كلمة المرور</h2>
    <form id="change-password-form" class="mt-3" novalidate>
      <div class="field">
        <label for="cp-current" data-i18n="account_current_password">كلمة المرور الحالية</label>
        <input class="input" type="password" id="cp-current" autocomplete="current-password" required>
      </div>
      <div class="field">
        <label for="cp-new" data-i18n="account_new_password">كلمة المرور الجديدة</label>
        <input class="input" type="password" id="cp-new" autocomplete="new-password" minlength="8" required>
        <p class="hint" data-i18n="register_password_hint">كلمة المرور 8 أحرف على الأقل</p>
      </div>
      <button type="submit" class="btn btn-primary" id="cp-submit" data-i18n="account_change_password_btn">تحديث كلمة المرور</button>
    </form>
  </div>

  <div class="card mt-5">
    <h2 class="card-title" data-i18n="account_privacy_title">الخصوصية وإدارة البيانات</h2>
    <div class="flex gap-3 mt-3 wrap-gap">
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
