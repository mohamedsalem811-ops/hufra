import { renderLayout } from './layout'

export function renderReportPage(): string {
  const body = `
<div class="container" style="max-width: 720px; padding-block: var(--space-5);">
  <h1 class="section-title" data-i18n="report_pothole">بلّغ عن حفرة</h1>

  <div class="stepper" id="report-stepper">
    <div class="step is-active" data-step="1"><span data-i18n="report_step_location">الموقع</span></div>
    <div class="step" data-step="2"><span data-i18n="report_step_photos">الصور</span></div>
    <div class="step" data-step="3"><span data-i18n="report_step_details">التفاصيل</span></div>
    <div class="step" data-step="4"><span data-i18n="report_step_review">المراجعة والإرسال</span></div>
  </div>

  <form id="report-form" novalidate>
    <!-- Step 1: Location -->
    <section class="report-step" data-step="1">
      <div class="card">
        <p class="text-secondary mb-3" data-i18n="report_location_hint">اسحب الدبوس لتصحيح الموقع بدقة</p>
        <div id="report-map" style="height: 320px; border-radius: var(--radius-card); overflow:hidden;"></div>
        <button type="button" class="btn btn-secondary btn-block mt-3" id="locate-btn">
          <i data-lucide="locate-fixed" class="icon"></i>
          <span data-i18n="report_locate_button">حدد موقعي الحالي</span>
        </button>
        <p class="hint mt-2" id="location-status"></p>
      </div>
      <div class="flex justify-between mt-4">
        <span></span>
        <button type="button" class="btn btn-primary" data-action="next" data-i18n="next">التالي</button>
      </div>
    </section>

    <!-- Step 2: Photos -->
    <section class="report-step hidden" data-step="2">
      <div class="card">
        <p class="text-secondary mb-3" data-i18n="report_photos_hint">أضف من صورة إلى ثلاث صور للحفرة (الحد الأقصى 3)</p>
        <div class="grid grid-3" id="photo-slots">
          <label class="photo-slot" data-slot="0">
            <i data-lucide="camera" class="icon-xl"></i>
            <span data-i18n="report_take_photo" style="font-size:0.85rem;">التقاط صورة</span>
            <input type="file" accept="image/*" capture="environment" class="visually-hidden" data-input="0">
          </label>
        </div>
        <p class="hint mt-2" id="photo-status"></p>
      </div>
      <div class="flex justify-between mt-4">
        <button type="button" class="btn btn-secondary" data-action="back" data-i18n="back">رجوع</button>
        <button type="button" class="btn btn-primary" data-action="next" data-i18n="next">التالي</button>
      </div>
    </section>

    <!-- Step 3: Details -->
    <section class="report-step hidden" data-step="3">
      <div class="card">
        <div class="field">
          <div class="flex justify-between items-center mb-2" style="flex-wrap:wrap;gap:8px;">
            <label for="street_ar" style="margin:0;" data-i18n="report_street_ar">اسم الشارع أو أقرب معلم دال</label>
            <button type="button" class="btn btn-outline" style="min-height:34px;padding:0 12px;font-size:0.82rem;" id="autofill-street-btn">
              <i data-lucide="sparkles" class="icon" style="width:16px;height:16px;"></i>
              <span data-i18n="report_autofill_street">تعبئة تلقائية من موقع الدبوس</span>
            </button>
          </div>
          <input class="input" type="text" id="street_ar" name="street_ar" maxlength="200" data-i18n-placeholder="report_street_placeholder" placeholder="مثال: شارع الجمهورية قرب جزيرة الدهماني (أو اضغط تعبئة تلقائية)">
          <p class="hint" id="street-autofill-status" data-i18n="report_street_choice_hint">يمكنك كتابة اسم الشارع أو المعلم بنفسك، أو الضغط على "تعبئة تلقائية من موقع الدبوس".</p>
        </div>
        <div class="field">
          <label for="description_ar" data-i18n="report_description_ar">الوصف (عربي)</label>
          <textarea class="textarea" id="description_ar" name="description_ar" maxlength="1000"></textarea>
        </div>
        <div class="field">
          <label for="description_en" data-i18n="report_description_en">الوصف (إنجليزي) - اختياري</label>
          <textarea class="textarea" id="description_en" name="description_en" maxlength="1000"></textarea>
        </div>
        <div class="field">
          <label data-i18n="report_severity_label">درجة الخطورة</label>
          <div class="radio-group" role="radiogroup" id="severity-group">
            <label class="chip-option is-selected">
              <input type="radio" name="severity" value="minor" checked>
              <span class="severity-dot severity-minor"></span>
              <span data-i18n="severity_minor">خفيفة</span>
            </label>
            <label class="chip-option">
              <input type="radio" name="severity" value="medium">
              <span class="severity-dot severity-medium"></span>
              <span data-i18n="severity_medium">متوسطة</span>
            </label>
            <label class="chip-option">
              <input type="radio" name="severity" value="severe">
              <span class="severity-dot severity-severe"></span>
              <span data-i18n="severity_severe">خطيرة</span>
            </label>
          </div>
        </div>
        <div class="field">
          <label data-i18n="report_dimensions_label">الأبعاد التقريبية (اختياري)</label>
          <div class="grid grid-3">
            <input class="input" type="number" min="0" placeholder="الطول (سم)" id="length_cm" data-i18n-placeholder="report_length">
            <input class="input" type="number" min="0" placeholder="العرض (سم)" id="width_cm" data-i18n-placeholder="report_width">
            <input class="input" type="number" min="0" placeholder="العمق (سم)" id="depth_cm" data-i18n-placeholder="report_depth">
          </div>
        </div>
        <div class="field">
          <label for="reporter_contact" data-i18n="report_contact_label">رقم للتواصل (اختياري)</label>
          <input class="input" type="tel" id="reporter_contact" name="reporter_contact" maxlength="120">
        </div>
      </div>
      <div class="flex justify-between mt-4">
        <button type="button" class="btn btn-secondary" data-action="back" data-i18n="back">رجوع</button>
        <button type="button" class="btn btn-primary" data-action="next" data-i18n="next">التالي</button>
      </div>
    </section>

    <!-- Step 4: Review -->
    <section class="report-step hidden" data-step="4">
      <div class="card" id="review-summary"></div>
      <div class="flex justify-between mt-4">
        <button type="button" class="btn btn-secondary" data-action="back" data-i18n="back">رجوع</button>
        <button type="submit" class="btn btn-primary btn-lg" id="submit-report-btn">
          <span data-i18n="report_submit">إرسال البلاغ</span>
        </button>
      </div>
    </section>
  </form>

  <!-- Success panel -->
  <div class="card hidden" id="report-success-panel" style="text-align:center;">
    <i data-lucide="check-circle" class="icon-xl" style="color: var(--color-success); margin-inline:auto;"></i>
    <h2 class="mt-3" data-i18n="report_success_title">تم استلام بلاغك</h2>
    <p class="text-secondary" data-i18n="report_success_desc">شكراً لمساهمتك. سيقوم فريق المتابعة بمراجعة البلاغ قريباً.</p>
    <div class="status-tracker mt-5" id="success-status-tracker">
      <div class="stage is-current"><div class="dot"></div><div class="label" data-i18n="status_reported">تم الإبلاغ</div></div>
      <div class="stage"><div class="dot"></div><div class="label" data-i18n="status_verified">تم التحقق</div></div>
      <div class="stage"><div class="dot"></div><div class="label" data-i18n="status_under_repair">قيد الإصلاح</div></div>
      <div class="stage"><div class="dot"></div><div class="label" data-i18n="status_fixed">تم الإصلاح</div></div>
    </div>
    <div class="flex justify-between mt-5" style="flex-wrap:wrap; gap: var(--space-3);">
      <a href="#" class="btn btn-outline" id="track-report-link" data-i18n="report_success_track">تتبع حالة البلاغ</a>
      <button type="button" class="btn btn-primary" id="new-report-btn" data-i18n="report_success_new">إرسال بلاغ جديد</button>
    </div>
  </div>
</div>
`

  return renderLayout(body, {
    title: 'بلّغ عن حفرة',
    activeNav: 'report',
    withMap: true,
    extraScripts: `<script src="/static/js/image-compress.js"></script><script src="/static/js/report-form.js"></script>`,
  })
}
