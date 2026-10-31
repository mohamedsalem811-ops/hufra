import { renderLayout } from './layout'

export function renderLoginPage(): string {
  const body = `
<div class="container auth-wrap">
  <div class="auth-brand"><img src="/static/img/logo/hufra-mark.svg" alt="" width="64" height="64"></div>
  <div class="card">
    <h1 class="mb-4" data-i18n="nav_login">تسجيل الدخول</h1>
    <form id="login-form" novalidate>
      <div class="field">
        <label for="email" data-i18n="login_email">البريد الإلكتروني</label>
        <input class="input" type="email" id="email" name="email" required autocomplete="email">
      </div>
      <div class="field">
        <label for="password" data-i18n="login_password">كلمة المرور</label>
        <input class="input" type="password" id="password" name="password" required autocomplete="current-password">
      </div>
      <p class="error hidden" id="login-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block btn-lg mt-2" data-i18n="login_submit">دخول</button>
    </form>
    <p class="text-center mt-4 text-secondary">
      <span data-i18n="login_no_account">ليس لديك حساب؟</span>
      <a href="/register" data-i18n="nav_register">إنشاء حساب</a>
    </p>
  </div>
</div>
`
  return renderLayout(body, {
    title: 'تسجيل الدخول',
    bodyClass: 'hide-tabbar',
    extraScripts: `<script src="/static/js/auth-pages.js"></script>`,
  })
}

export function renderRegisterPage(): string {
  const body = `
<div class="container auth-wrap">
  <div class="auth-brand"><img src="/static/img/logo/hufra-mark.svg" alt="" width="64" height="64"></div>
  <div class="card">
    <h1 class="mb-4" data-i18n="register_title">إنشاء حساب جديد</h1>
    <form id="register-form" novalidate>
      <div class="field">
        <label for="reg-email" data-i18n="login_email">البريد الإلكتروني</label>
        <input class="input" type="email" id="reg-email" name="email" required autocomplete="email">
      </div>
      <div class="field">
        <label for="reg-password" data-i18n="login_password">كلمة المرور</label>
        <input class="input" type="password" id="reg-password" name="password" required minlength="8" autocomplete="new-password">
        <p class="hint" data-i18n="register_password_hint">8 أحرف على الأقل</p>
      </div>
      <div class="field">
        <label for="reg-name" data-i18n="register_display_name">الاسم (اختياري)</label>
        <input class="input" type="text" id="reg-name" name="display_name" maxlength="80">
      </div>
      <div class="field">
        <label class="consent-check" for="reg-consent">
          <input type="checkbox" id="reg-consent" required>
          <span data-i18n-html="register_consent_html">أوافق على <a href="/trust" target="_blank" rel="noopener">سياسة الخصوصية وشروط الاستخدام</a></span>
        </label>
      </div>
      <p class="error hidden" id="register-error" role="alert"></p>
      <button type="submit" class="btn btn-primary btn-block btn-lg mt-5" data-i18n="register_submit">إنشاء الحساب</button>
    </form>
    <p class="text-center mt-4 text-secondary">
      <span data-i18n="register_have_account">لديك حساب؟</span>
      <a href="/login" data-i18n="nav_login">تسجيل الدخول</a>
    </p>
  </div>
</div>
`
  return renderLayout(body, {
    title: 'إنشاء حساب',
    bodyClass: 'hide-tabbar',
    extraScripts: `<script src="/static/js/auth-pages.js"></script>`,
  })
}
