import { renderLayout } from './layout'

export function renderAdminPage(): string {
  const body = `
<div class="container page-narrow page-wide" id="admin-root">
  <div class="flex justify-between items-center mb-4 wrap-gap">
    <h1 class="page-title page-title--flush" data-i18n="admin_dashboard">لوحة الإدارة</h1>
    <button type="button" class="btn btn-icon btn-secondary bell-wrapper" id="notif-bell" aria-label="Notifications">
      <i data-lucide="bell" class="icon"></i>
      <span class="bell-badge hidden" id="notif-count">0</span>
    </button>
  </div>

  <div class="admin-tabs" role="tablist">
    <button type="button" class="admin-tab-btn" role="tab" data-tab="reports" data-i18n="admin_reports_queue">طابور البلاغات</button>
    <button type="button" class="admin-tab-btn" role="tab" data-tab="duplicates" data-i18n="admin_duplicates">بلاغات مكررة محتملة</button>
    <button type="button" class="admin-tab-btn" role="tab" data-tab="analytics" data-i18n="admin_analytics">التحليلات</button>
    <button type="button" class="admin-tab-btn" role="tab" data-tab="regions" data-i18n="admin_regions">إدارة المناطق</button>
    <button type="button" class="admin-tab-btn" role="tab" data-tab="donors" data-i18n="admin_donors">إدارة الداعمين</button>
    <button type="button" class="admin-tab-btn hidden" role="tab" data-tab="admins" id="admins-tab-btn" data-i18n="admin_manage_admins">إدارة المشرفين</button>
    <button type="button" class="admin-tab-btn hidden" role="tab" data-tab="audit" id="audit-tab-btn" data-i18n="admin_audit_log">سجل التدقيق</button>
  </div>

  <div id="admin-tab-reports" class="admin-tab">
    <div id="reports-status-filter" class="flex gap-2 mb-3 wrap-gap">
      <button type="button" class="chip-option is-selected" data-status="" data-i18n="map_filter_all">الكل</button>
      <button type="button" class="chip-option" data-status="reported" data-i18n="status_reported">تم الإبلاغ</button>
      <button type="button" class="chip-option" data-status="verified" data-i18n="status_verified">تم التحقق</button>
      <button type="button" class="chip-option" data-status="under_repair" data-i18n="status_under_repair">قيد الإصلاح</button>
      <button type="button" class="chip-option" data-status="fixed" data-i18n="status_fixed">تم الإصلاح</button>
      <button type="button" class="chip-option" id="admin-field-near-btn">
        <i data-lucide="locate-fixed" class="icon"></i>
        <span data-i18n="admin_field_gps_sort">الأقرب لموقعي (عمل ميداني)</span>
      </button>
      <button type="button" class="chip-option" id="admin-export-csv-btn">
        <i data-lucide="download" class="icon"></i>
        <span data-i18n="admin_export_csv">تصدير أوامر عمل (CSV)</span>
      </button>
    </div>
    <div id="reports-list"><div class="skeleton skeleton-h80"></div></div>
  </div>

  <div id="admin-tab-duplicates" class="admin-tab hidden">
    <div id="duplicates-list"><div class="skeleton skeleton-h80"></div></div>
  </div>

  <div id="admin-tab-analytics" class="admin-tab hidden">
    <div class="grid grid-2" id="analytics-content"><div class="skeleton skeleton-h200"></div></div>
  </div>

  <div id="admin-tab-regions" class="admin-tab hidden">
    <div class="card mb-4">
      <h3 data-i18n="admin_regions">إدارة المناطق</h3>
      <form id="region-form" class="grid grid-2 mt-3">
        <input class="input" placeholder="slug (e.g. ain-zara)" id="region-slug" required>
        <input class="input" placeholder="الاسم بالعربية" id="region-name-ar" required>
        <input class="input" placeholder="Name (English)" id="region-name-en" required>
        <input class="input" placeholder="Center lat" type="number" step="any" id="region-lat" required>
        <input class="input" placeholder="Center lng" type="number" step="any" id="region-lng" required>
        <button type="submit" class="btn btn-primary" data-i18n="save">حفظ</button>
      </form>
    </div>
    <div id="regions-table" class="table-responsive card"><div class="skeleton skeleton-h80"></div></div>
  </div>

  <div id="admin-tab-donors" class="admin-tab hidden">
    <div class="card mb-4">
      <h3 data-i18n="admin_donors">إدارة الداعمين</h3>
      <p class="text-secondary" data-i18n="admin_donors_hint">لا توجد بوابة دفع - سجّل هنا الداعمين الذين تبرعوا خارج المنصة (تحويل بنكي، نقداً، إلخ) بالدينار الليبي.</p>
      <form id="donor-form" class="grid grid-3 mt-3">
        <input class="input" placeholder="الاسم / Name" id="donor-name" required>
        <input class="input" placeholder="المبلغ (د.ل) / Amount (LYD)" type="number" step="any" min="0" id="donor-amount" required>
        <input class="input" placeholder="ملاحظة (اختياري) / Note" id="donor-note">
        <button type="submit" class="btn btn-primary" data-i18n="save">حفظ</button>
      </form>
    </div>
    <div id="donors-table" class="table-responsive card"><div class="skeleton skeleton-h80"></div></div>
  </div>

  <div id="admin-tab-admins" class="admin-tab hidden">
    <div class="card mb-4">
      <h3 data-i18n="admin_manage_admins">إدارة المشرفين</h3>
      <form id="promote-admin-form" class="grid grid-3 mt-3">
        <input class="input" type="email" placeholder="user@example.com" id="promote-email" required>
        <select class="select" id="promote-role">
          <option value="admin">admin (مشرف بلدية / ميداني)</option>
          <option value="super_admin">super_admin (مسؤول عام)</option>
        </select>
        <button type="submit" class="btn btn-primary" data-i18n="admin_promote_btn">ترقية الحساب</button>
      </form>
    </div>
    <div id="admins-table" class="table-responsive card"><div class="skeleton skeleton-h80"></div></div>
  </div>

  <div id="admin-tab-audit" class="admin-tab hidden">
    <div id="audit-list" class="table-responsive card"><div class="skeleton skeleton-h80"></div></div>
  </div>
</div>

<!-- Report review modal -->
<div id="report-modal" class="modal-overlay hidden">
  <div class="card modal-card" id="report-modal-content"></div>
</div>
`

  return renderLayout(body, {
    title: 'لوحة الإدارة',
    activeNav: 'admin',
    bodyClass: 'hide-tabbar',
    withMap: false,
    extraScripts: `<script src="/static/js/image-compress.js"></script><script src="/static/js/admin.js"></script>`,
  })
}
