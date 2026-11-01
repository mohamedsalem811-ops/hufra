(function () {
  'use strict';

  function initLoginForm() {
    var form = document.getElementById('login-form');
    if (!form) return;
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('login-error');
      errorEl.classList.add('hidden');
      var payload = {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value,
      };
      try {
        var data = await window.HufraApi.post('/auth/login', payload);
        if (window.HufraApi.setTokens) {
          window.HufraApi.setTokens(data.access_token, data.refresh_token);
        } else {
          window.HufraApi.setAccessToken(data.access_token);
        }
        var redirect = new URLSearchParams(location.search).get('redirect');
        var dest = redirect || (data.user.role === 'admin' || data.user.role === 'super_admin' ? '/admin' : '/account');
        if (dest.charAt(0) !== '/' || dest.charAt(1) === '/') dest = '/account';
        window.HufraRouter ? window.HufraRouter.go(dest) : (location.href = dest);
      } catch (err) {
        errorEl.textContent = err.message || window.HufraI18n.t('error_generic');
        errorEl.classList.remove('hidden');
      }
    });
  }

  function initConsentCheck() {
    var consentInput = document.getElementById('reg-consent');
    if (!consentInput) return;
    var wrapper = consentInput.closest('.consent-check');
    if (!wrapper) return;
    var sync = function () {
      wrapper.classList.toggle('is-checked', consentInput.checked);
    };
    consentInput.addEventListener('change', sync);
    sync();
  }

  function initRegisterForm() {
    var form = document.getElementById('register-form');
    if (!form) return;
    initConsentCheck();
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var errorEl = document.getElementById('register-error');
      errorEl.classList.add('hidden');
      var consent = document.getElementById('reg-consent').checked;
      if (!consent) {
        errorEl.textContent = window.HufraI18n.t('required_field');
        errorEl.classList.remove('hidden');
        return;
      }
      var payload = {
        email: document.getElementById('reg-email').value,
        password: document.getElementById('reg-password').value,
        display_name: document.getElementById('reg-name').value || undefined,
        locale: window.HufraI18n.getLocale(),
        consent: true,
      };
      try {
        await window.HufraApi.post('/auth/register', payload);
        window.HufraRouter ? window.HufraRouter.go('/login') : (location.href = '/login');
      } catch (err) {
        errorEl.textContent = err.message || window.HufraI18n.t('error_generic');
        errorEl.classList.remove('hidden');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginForm();
    initRegisterForm();
  });
})();
