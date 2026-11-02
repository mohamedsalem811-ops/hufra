// Donation pages (plan 6.9): the campaign, the bank-transfer steps, the proof
// upload and "My donations". Standalone pages in the brand's Civic Clarity
// style (packages/brand, copied to /static/brand), Arabic first. All content
// is filled in by /static/js/donate.js from the API; no inline scripts (CSP).

import { escapeHtml, versionAssets } from './layout'

export type DonatePageKind = 'campaign' | 'mine' | 'donation'

export function renderDonatePage(kind: DonatePageKind, id: number | null, whatsapp?: string): string {
  const title = kind === 'mine' ? 'تبرعاتي' : 'تبرّع لإصلاح حفرة'
  const wa = whatsapp ? whatsapp.replace(/[^\d+]/g, '') : ''
  return versionAssets(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(title)} | حفرة HUFRA</title>
<meta name="description" content="تبرّع لإصلاح حفرة بعينها في طرابلس، وتابع أين ذهب مالك.">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="${kind === 'campaign' ? 'index' : 'noindex'}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/static/brand/tokens.css">
<link rel="stylesheet" href="/static/css/donate.css">
<script src="/static/js/donate.js" defer></script>
</head>
<body>
<header class="top">
  <a class="brand" href="/" aria-label="حفرة HUFRA">
    <img class="logo logo-light" src="/static/brand/logo/lockup-horizontal-colour.svg" alt="" width="128" height="32">
    <img class="logo logo-dark" src="/static/brand/logo/lockup-horizontal-colour-on-dark.svg" alt="" width="128" height="32">
  </a>
  <nav class="top-actions">
    <a class="link" href="/donations" data-i18n="nav.mine">تبرعاتي</a>
    <button type="button" class="lang" id="lang-toggle" lang="en">English</button>
  </nav>
</header>
<main id="app" class="page" data-page="${kind}" data-id="${id ?? ''}" data-whatsapp="${escapeHtml(wa)}" aria-live="polite">
  <p class="loading" data-i18n="loading">نحمّل…</p>
</main>
<noscript><p class="page">هذه الصفحة تحتاج JavaScript. / This page needs JavaScript.</p></noscript>
<footer class="foot"><a href="/trust" data-i18n="foot.privacy">الأمان والخصوصية</a></footer>
</body>
</html>`)
}
