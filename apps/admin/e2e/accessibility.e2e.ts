import { expect, test } from '@playwright/test'

import { expectAccessible, expectNoSideScroll, signIn } from './helpers'

const PAGES: [string, string][] = [
  ['./', 'لوحة المتابعة'],
  ['./notifications', 'الإشعارات'],
  ['./reports', 'البلاغات'],
  ['./map', 'الخريطة'],
  ['./duplicates', 'البلاغات المكررة'],
  ['./campaigns', 'حملات الإصلاح'],
  ['./donations', 'مراجعة التبرعات'],
  ['./regions', 'المناطق'],
  ['./people', 'المشرفون والمتبرعون'],
  ['./partners', 'الشركاء'],
  ['./settings', 'الإعدادات وسجل التدقيق'],
]

test('the sign-in page is accessible', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'دخول المشرفين' })).toBeVisible()
  await expectAccessible(page)
})

test('every page is accessible in Arabic and English', async ({ page }) => {
  await signIn(page)
  for (const [path, title] of PAGES) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expectAccessible(page)
    await expectNoSideScroll(page)
  }
  await page.getByRole('button', { name: 'English · تغيير اللغة إلى الإنجليزية' }).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible()
  await expectAccessible(page)
})
