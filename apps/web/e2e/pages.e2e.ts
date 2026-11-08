import { expect, test } from '@playwright/test'

import { expectAccessible, expectNoSideScroll, watchErrors } from './helpers'

// Every page, in both languages: its heading, the language and direction,
// accessibility (axe), no sideways scrolling and no script errors.
const PAGES: [string, string, string][] = [
  ['/', 'طرقٌ أفضل تبدأ ببلاغ', 'Better roads start with a report'],
  ['/how', 'كيف يعمل حفرة', 'How HUFRA works'],
  ['/transparency', 'الشفافية', 'Transparency'],
  ['/contact', 'تواصل معنا', 'Contact us'],
  ['/privacy', 'سياسة الخصوصية', 'Privacy policy'],
  ['/terms', 'شروط الاستخدام', 'Terms of use'],
  ['/donation-rules', 'قواعد التبرع', 'Donation rules'],
  ['/delete-account', 'حذف الحساب', 'Delete your account'],
  ['/r/1', 'حفرة في شارع الجمهورية', 'Pothole on Al Jumhuriya St'],
  ['/donate/1', 'شارع الجمهورية', 'Al Jumhuriya St'],
  ['/donations', 'تبرعاتي', 'My donations'],
  ['/sign-in', 'تسجيل الدخول', 'Sign in'],
  ['/sign-up', 'إنشاء حساب', 'Create an account'],
]

for (const [path, ar, en] of PAGES) {
  test(`${path} in Arabic and English`, async ({ page }) => {
    const errors = watchErrors(page)
    for (const [prefix, lang, dir, title] of [['', 'ar', 'rtl', ar], ['/en', 'en', 'ltr', en]] as const) {
      await page.goto(`${prefix}${path === '/' && prefix ? '/' : path}`)
      await expect(page.locator('html')).toHaveAttribute('lang', lang)
      await expect(page.locator('html')).toHaveAttribute('dir', dir)
      await expect(page.getByRole('heading', { level: 1 })).toContainText(title)
      await page.waitForLoadState('networkidle')
      await expectAccessible(page)
      await expectNoSideScroll(page)
    }
    expect(errors).toEqual([])
  })
}

test('the 404 page', async ({ page }) => {
  const res = await page.goto('/no-such-page')
  expect(res?.status()).toBe(404)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expectAccessible(page)
})

test('a keyboard user can skip to the content', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'تخطَّ إلى المحتوى' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(page).toHaveURL(/#main$/)
})
